// The editor session: one mounted composition document, its engine loop,
// and the reactivity the UI renders from. The session is the only owner of
// engine singletons (canvas surface, audio context, library, fonts) and the
// only place that mutates the live document — every mutation funnels through
// `commit`, which snapshots the document into history, refreshes timeline
// rows, and schedules the debounced autosave.
import { createSignal, type Accessor, type Setter } from 'solid-js'
import {
  assetSystem,
  AudioEngine,
  ChildOf,
  Computed,
  Fonts,
  FrameRate,
  Host,
  Library,
  motionSystem,
  Muted,
  Name,
  Playback,
  renderSystem,
  RenderSurface,
  Root,
  setActive,
  store as worldStore,
  Time,
  transformSystem,
  playbackSystem,
  type FontSource,
} from '@diffusionstudio/runtime'
import type { AssetLibrary } from '@diffusionstudio/assets'
import type { Entity, World } from 'koota'
import {
  activeScene,
  insertChild,
  mountDocument,
  readDocument,
  removeEntityTree,
  sceneNode,
  setPlayhead,
  togglePlayback,
  writeProp,
  writeText,
} from './document-codec.ts'
import { appendFontSources } from './engine-singletons.ts'
import { buildLayout, kindFromTag, type TimelineLayout, type TimelineRow } from './timeline-model.ts'
import { DocumentHistory, type HistoryState } from '../domain/history.ts'
import type {
  AuthoredNode,
  AuthoredPropValue,
  CompositionDocument,
  StageSpec,
  WritableAuthoredProps,
} from '../domain/schema.ts'
import type { AuthoredProps } from '../domain/schema.ts'
import type { CompositionService } from '../domain/compositions.ts'

export interface SessionSaveState {
  readonly status: 'idle' | 'saving' | 'saved' | 'error'
  readonly revision: number
}

export interface SessionDeps {
  readonly library: AssetLibrary
  readonly fontSources: readonly FontSource[]
  readonly compositions: CompositionService
  readonly compositionId: string
  readonly initialRevision: number
  /** The entity row version the composition row was read at. */
  readonly initialRowVersion: number
  readonly stage: StageSpec
  readonly fps: number
  readonly projectId: string
}

const AUTOSAVE_DELAY_MS = 800

interface SignalPair<T> {
  readonly read: Accessor<T>
  readonly write: Setter<T>
}

function signal<T>(initial: T): SignalPair<T> {
  const [read, write] = createSignal(initial)
  return { read, write }
}

export class EditorSession {
  private mounted: ReturnType<typeof mountDocument>
  private readonly history: DocumentHistory<CompositionDocument>

  private rafId: number | null = null
  private lastTimestamp: number | null = null
  private canvas: HTMLCanvasElement | null = null
  private audioContext: AudioContext | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private rowVersion: number
  private disposed = false

  private readonly playheadSignal = signal(0)
  private readonly playingSignal = signal(false)
  private readonly layoutSignal = signal<TimelineLayout>(buildLayout([]))
  private readonly selectionSignal = signal<Entity | null>(null)
  private readonly rowEntities = new Map<number, Entity>()
  private readonly historySignal = signal<HistoryState<CompositionDocument>>({
    present: { schemaVersion: 1, stage: { width: 1920, height: 1080, background: '#161616' }, scenes: [] },
    canUndo: false,
    canRedo: false,
  })
  private readonly saveSignal = signal<SessionSaveState>({ status: 'idle', revision: 0 })

  private readonly deps: SessionDeps

  public constructor(deps: SessionDeps, initial: CompositionDocument) {
    this.deps = deps
    this.rowVersion = deps.initialRowVersion
    this.mounted = mountDocument(initial, deps.projectId)
    this.history = new DocumentHistory(initial)
    this.historySignal.write(this.history.state())
    this.saveSignal.write({ status: 'idle', revision: deps.initialRevision })
    this.attachEngineSingletons(deps.library, deps.fontSources, deps.fps)
    this.refreshLayout()
  }

  public get world(): World {
    return this.mounted.world
  }

  // ── Engine singletons ──────────────────────────────────────────────────

  private attachEngineSingletons(library: AssetLibrary, fonts: readonly FontSource[], fps: number): void {
    this.mounted.world.set(Library, library)
    this.mounted.world.set(FrameRate, { value: fps })
    const registered = this.mounted.world.get(Fonts)?.list
    if (registered) appendFontSources(registered, fonts)
    if (this.canvas) {
      this.mounted.world.set(RenderSurface, {
        canvas: this.canvas,
        ctx: this.canvas.getContext('2d'),
        resolution: window.devicePixelRatio || 1,
      })
    }
    if (this.audioContext) this.mounted.world.set(AudioEngine, { context: this.audioContext })
  }

  public attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.mounted.world.set(RenderSurface, {
      canvas,
      ctx: canvas.getContext('2d'),
      resolution: window.devicePixelRatio || 1,
    })
    this.resizeToCanvas()
    this.runSystems()
  }

  private resizeToCanvas(): void {
    if (!this.canvas) return
    const parent = this.canvas.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(rect.width * dpr))
    const height = Math.max(1, Math.round(rect.height * dpr))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    this.canvas.style.width = `${rect.width}px`
    this.canvas.style.height = `${rect.height}px`
    this.mounted.world.set(RenderSurface, { resolution: dpr })
  }

  /** The audio output, created on the first user gesture that plays. */
  public ensureAudioContext(): AudioContext | null {
    if (this.audioContext) return this.audioContext
    if (globalThis.AudioContext === undefined) return null
    this.audioContext = new AudioContext({ latencyHint: 'playback' })
    this.mounted.world.set(AudioEngine, { context: this.audioContext })
    return this.audioContext
  }

  // ── The loop ───────────────────────────────────────────────────────────

  private runSystems(): void {
    assetSystem(this.mounted.world)
    playbackSystem(this.mounted.world)
    motionSystem(this.mounted.world)
    transformSystem(this.mounted.world)
    renderSystem(this.mounted.world)
  }

  private readonly loop = (timestamp: number): void => {
    if (this.disposed) return
    const delta = this.lastTimestamp === null ? 0 : timestamp - this.lastTimestamp
    this.lastTimestamp = timestamp
    this.mounted.world.set(Time, { now: timestamp, delta })
    this.runSystems()
    this.syncPlayhead()
    this.rafId = requestAnimationFrame(this.loop)
  }

  public start(): void {
    if (this.rafId !== null || this.disposed) return
    this.lastTimestamp = null
    this.rafId = requestAnimationFrame(this.loop)
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private syncPlayhead(): void {
    const scene = activeScene(this.mounted.world)
    if (!scene) return
    const computed = worldStore(this.mounted.world, Computed)
    this.playheadSignal.write(computed.localTimeInSeconds[scene.id()] ?? 0)
    this.playingSignal.write(scene.get(Playback)?.playing ?? false)
  }

  // ── Transport ──────────────────────────────────────────────────────────

  public playOrPause(): void {
    const scene = activeScene(this.mounted.world)
    if (!scene) return
    const context = this.ensureAudioContext()
    if (context && context.state === 'suspended') void context.resume()
    togglePlayback(this.mounted.world, scene)
    this.runSystems()
    this.syncPlayhead()
  }

  public pause(): void {
    const scene = activeScene(this.mounted.world)
    if (!scene) return
    if (scene.get(Playback)?.playing) this.playOrPause()
  }

  public scrub(seconds: number): void {
    const scene = activeScene(this.mounted.world)
    if (!scene) return
    const fps = this.mounted.world.get(FrameRate)?.value ?? 30
    setPlayhead(this.mounted.world, scene, Math.max(0, Math.round(seconds * fps)))
    this.runSystems()
    this.syncPlayhead()
  }

  public resize(): void {
    this.resizeToCanvas()
    this.runSystems()
  }

  // ── Reading state for the UI ───────────────────────────────────────────

  public readonly playhead = (): number => this.playheadSignal.read()

  public readonly isPlaying = (): boolean => this.playingSignal.read()

  public readonly rows = (): TimelineLayout => this.layoutSignal.read()

  public readonly selected = (): Entity | null => this.selectionSignal.read()

  public readonly undoRedo = (): HistoryState<CompositionDocument> => this.historySignal.read()

  public readonly saveState = (): SessionSaveState => this.saveSignal.read()

  /** One row's authored props, for the inspector (primitive values only). */
  public authoredPropsOf(key: number): AuthoredProps {
    const entity = this.entityOf(key)
    if (entity === null) return {}
    const node = entity.get(Host)
    if (!node) return {}
    const out: WritableAuthoredProps = {}
    for (const [name, value] of Object.entries(node.props)) {
      const primitive =
        Object(value) !== value && (String(value) === value || Number.isFinite(value) || Boolean(value) === value)
      if (!primitive) continue
      // SAFETY: `primitive` above proved `value` is a string, a finite
      // number, or a boolean — exactly AuthoredPropValue.
      out[name] = value as AuthoredPropValue
    }
    return out
  }

  /** A text row's current content, for the inspector. */
  public authoredTextOf(key: number): string {
    const entity = this.entityOf(key)
    if (entity === null) return ''
    const node = entity.get(Host)
    if (!node) return ''
    return node.children
      .filter((child) => this.mounted.document.isTextNode(child))
      .map((child) => {
        const text = child.element
        return text instanceof Text ? text.data : ''
      })
      .join('')
  }

  /** The engine entity a timeline row's key names, or null when stale. */
  public entityOf(key: number): Entity | null {
    return this.rowEntities.get(key) ?? null
  }

  public refreshLayout(): void {
    this.runSystems()
    this.rowEntities.clear()
    const rows: TimelineRow[] = []
    const root = this.mounted.world.get(Root)
    if (root) this.collectRows(root, 0, rows)
    this.layoutSignal.write(buildLayout(rows))
  }

  private collectRows(entity: Entity, depth: number, out: TimelineRow[]): void {
    const computed = worldStore(this.mounted.world, Computed)
    const fps = this.mounted.world.get(FrameRate)?.value ?? 30
    for (const child of this.mounted.world.query(ChildOf(entity))) {
      const node = child.get(Host)
      const tag = node?.tag ?? ''
      const kind = kindFromTag(tag)
      if (kind !== 'other' && node?.native) {
        const entityId = child.id()
        this.rowEntities.set(entityId, child)
        out.push({
          key: entityId,
          name: child.get(Name)?.value || tag,
          kind,
          depth,
          start: (computed.start[entityId] ?? 0) / fps,
          end: (computed.end[entityId] ?? 0) / fps,
          muted: child.has(Muted),
        })
      }
      if (kind === 'scene' || kind === 'group' || kind === 'sequence') {
        this.collectRows(child, depth + 1, out)
      }
    }
  }

  public select(entity: Entity | null): void {
    this.selectionSignal.write(entity)
  }

  public currentDocument(): CompositionDocument {
    return readDocument(this.mounted.world, this.deps.stage)
  }

  // ── Mutations ──────────────────────────────────────────────────────────

  /**
   * Applies one mutation batch: run the mutation, snapshot the resulting
   * document into history, refresh rows, and schedule the autosave.
   */
  public apply(mutate: () => void): void {
    mutate()
    this.commit()
  }

  public commit(): void {
    this.historySignal.write(this.history.commit(this.currentDocument()))
    this.refreshLayout()
    this.scheduleSave()
  }

  /** Inserts a clip into the target scene and selects it. */
  public insertClip(node: AuthoredNode): Entity | null {
    const parent = this.targetScene()
    if (!parent) return null
    const entity = insertChild(this.mounted.document, this.mounted.world, parent, node)
    this.commit()
    this.selectionSignal.write(entity)
    return entity
  }

  /** The scene new clips land in, creating one when the document has none. */
  public targetScene(): Entity | null {
    const existing = activeScene(this.mounted.world)
    if (existing) return existing
    return this.createScene('Scene 1')
  }

  public createScene(name: string): Entity | null {
    const root = this.mounted.world.get(Root)
    if (!root) return null
    const entity = insertChild(
      this.mounted.document,
      this.mounted.world,
      root,
      sceneNode({ name, width: this.deps.stage.width, height: this.deps.stage.height }),
    )
    setActive(this.mounted.world, entity)
    this.commit()
    return entity
  }

  public removeSelected(): void {
    const target = this.selectionSignal.read()
    if (!target) return
    removeEntityTree(this.mounted.document, target)
    this.selectionSignal.write(null)
    this.commit()
  }

  public setProp(key: number, name: string, value: string | number | boolean | undefined): void {
    const entity = this.entityOf(key)
    if (entity === null) return
    writeProp(this.mounted.document, entity, name, value)
    this.commit()
  }

  /** Replaces a text clip's content. */
  public setText(entity: Entity, text: string): void {
    writeText(this.mounted.document, entity, text)
    this.commit()
  }

  /** Replaces a text clip's content by the current selection (inspector). */
  public setTextOfSelection(text: string): void {
    const target = this.selectionSignal.read()
    if (target) this.setText(target, text)
  }

  public setTiming(key: number, edge: 'start' | 'end', seconds: number): void {
    const entity = this.entityOf(key)
    if (entity === null) return
    writeProp(this.mounted.document, entity, edge, Math.max(0, seconds))
    this.commit()
  }

  /**
   * A drag-in-progress write: updates the live document without recording a
   * history step or scheduling a save — the gesture's single commit happens
   * in `commitInteraction` when the pointer is released.
   */
  public previewTiming(key: number, edge: 'start' | 'end', seconds: number): void {
    const entity = this.entityOf(key)
    if (entity === null) return
    writeProp(this.mounted.document, entity, edge, Math.max(0, seconds))
    this.refreshLayout()
  }

  /** Finishes a previewed interaction: one history step, one autosave. */
  public commitInteraction(): void {
    this.commit()
  }

  // ── History ────────────────────────────────────────────────────────────

  public undo(): void {
    this.restore(this.history.undo())
  }

  public redo(): void {
    this.restore(this.history.redo())
  }

  private restore(state: HistoryState<CompositionDocument>): void {
    if (state.present === this.currentDocument()) {
      this.historySignal.write(state)
      return
    }
    this.pause()
    this.mounted.dispose()
    this.mounted = mountDocument(state.present, this.deps.projectId)
    this.attachEngineSingletons(this.deps.library, this.deps.fontSources, this.deps.fps)
    this.selectionSignal.write(null)
    this.historySignal.write(state)
    this.refreshLayout()
    this.scheduleSave()
  }

  // ── Persistence ────────────────────────────────────────────────────────

  private scheduleSave(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.flush(), AUTOSAVE_DELAY_MS)
  }

  public async flush(): Promise<void> {
    if (this.disposed) return
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const state = this.saveSignal.read()
    if (state.status === 'saving') return
    this.saveSignal.write({ ...state, status: 'saving' })
    try {
      const row = await this.deps.compositions.save(
        this.deps.compositionId,
        state.revision,
        this.currentDocument(),
        { expectedRowVersion: this.rowVersion },
      )
      this.rowVersion = row.version
      this.saveSignal.write({ status: 'saved', revision: row.data.revision })
    } catch (error) {
      this.saveSignal.write({ status: 'error', revision: state.revision })
      throw error
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /** Host lifecycle: the project is about to sleep. */
  public sleep(): void {
    this.pause()
    this.stop()
    if (this.audioContext && this.audioContext.state === 'running') void this.audioContext.suspend()
  }

  /** Host lifecycle: the project woke. */
  public wake(): void {
    this.start()
  }

  public dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
    this.mounted.dispose()
    if (this.audioContext) void this.audioContext.close()
    this.audioContext = null
    this.canvas = null
  }
}
