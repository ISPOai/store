// The application controller: owns the services, the active editor session,
// and the accessors the UI renders. Components receive this object (accessors
// ride inside the object — see the solid readiness fixture for why function
// props must not ride bare under the automatic JSX runtime).
//
// Durable-state-first workflows reuse the exposed command bindings' `.run()`
// paths (new composition → create-composition, Files export → export-video);
// live-session workflows (powerbox import, inspector edits) keep the session
// path for undo history and first-paint feedback, sharing the same pure clip
// builders the commands use.
import { createSignal } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'
import { FrameRate, type FontSource } from '@diffusionstudio/runtime'
import { EditorSession, type SessionSaveState } from '../editor/session.ts'
import { clampMove, clampTrim, snapToFrame, type TimelineLayout, type TimelineRow } from '../editor/timeline-model.ts'
import { runExport, type ExportPhase } from '../editor/export.ts'
import { offPlatformDelivery } from '../editor/export-delivery.ts'
import { probeMedia } from '../editor/session-library.ts'
import {
  sessionAssetLibrary,
  registerSessionFont,
  sessionFontSources,
} from '../editor/engine-singletons.ts'
import { ExportJobService } from '../domain/export-jobs.ts'
import { clipNodeForAsset, textClipNode } from '../domain/clip-nodes.ts'
import type { CompositionDocument, ExportFormat, StageSpec } from '../domain/schema.ts'
import {
  capabilityRows,
  playbackCapabilities,
  probeExportCapabilities,
  type CapabilityProbeRow,
  type ExportCapabilities,
} from '../capabilities/probes.ts'
import { ProjectService, type ProjectRow } from '../domain/projects.ts'
import { CompositionService } from '../domain/compositions.ts'
import { MediaAssetService, type AssetRow } from '../domain/media-assets.ts'
import { AssetFolderService, type AssetFolderRow } from '../domain/asset-folders.ts'
import { createCompositionCommand, exportVideoCommand } from '../commands/index.ts'
import {
  cancelExportRun,
  exportPhase,
  exportStatusText,
  onExportPhase,
  publishExportPhase,
  setExportCancelHandle,
} from './export-status.ts'
import type { HistoryState } from '../domain/history.ts'
import type { SdkPort } from '../sdk-port.ts'

export type Screen = 'projects' | 'editor'
export type ExportDestination = 'files' | 'computer'

export interface ToastMessage {
  readonly text: string
  readonly tone: 'info' | 'error'
}

const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080
const DEFAULT_FPS = 30
const TEXT_PLACEHOLDER = 'Title'
const EMPTY_LAYOUT: TimelineLayout = { rows: [], duration: 1 }
const BOOT_RETRY_DELAY_MS = 1500

interface ActiveEditor {
  readonly projectId: string
  readonly compositionId: string
  readonly stage: StageSpec
  readonly session: EditorSession
}

export class AppController {
  private readonly projects: ProjectService
  private readonly compositions: CompositionService
  private readonly media: MediaAssetService
  private readonly folders: AssetFolderService
  private readonly jobs: ExportJobService

  private readonly readScreen: Accessor<Screen>
  private readonly writeScreen: Setter<Screen>
  private readonly readProjectRows: Accessor<readonly ProjectRow[]>
  private readonly writeProjectRows: Setter<readonly ProjectRow[]>
  private readonly readLoading: Accessor<boolean>
  private readonly writeLoading: Setter<boolean>
  private readonly readToast: Accessor<ToastMessage | null>
  private readonly writeToast: Setter<ToastMessage | null>
  private readonly readImporting: Accessor<boolean>
  private readonly writeImporting: Setter<boolean>
  private readonly readExportCaps: Accessor<ExportCapabilities | null>
  private readonly writeExportCaps: Setter<ExportCapabilities | null>
  private readonly readSelectedRow: Accessor<TimelineRow | null>
  private readonly writeSelectedRow: Setter<TimelineRow | null>
  private readonly readPlaybackProbes: Accessor<readonly CapabilityProbeRow[]>
  private readonly writePlaybackProbes: Setter<readonly CapabilityProbeRow[]>
  private readonly readEditor: Accessor<ActiveEditor | null>
  private readonly writeEditor: Setter<ActiveEditor | null>
  private readonly readLibraryAssets: Accessor<readonly AssetRow[]>
  private readonly writeLibraryAssets: Setter<readonly AssetRow[]>
  private readonly readFolders: Accessor<readonly AssetFolderRow[]>
  private readonly writeFolders: Setter<readonly AssetFolderRow[]>
  private readonly readActiveFolder: Accessor<string | null>
  private readonly writeActiveFolder: Setter<string | null>

  private readonly stopPhaseListener: () => void
  private readonly sdk: SdkPort

  public constructor(sdk: SdkPort) {
    this.sdk = sdk
    ;[this.readScreen, this.writeScreen] = createSignal<Screen>('projects')
    ;[this.readProjectRows, this.writeProjectRows] = createSignal<readonly ProjectRow[]>([])
    ;[this.readLoading, this.writeLoading] = createSignal(false)
    ;[this.readToast, this.writeToast] = createSignal<ToastMessage | null>(null)
    ;[this.readImporting, this.writeImporting] = createSignal(false)
    ;[this.readExportCaps, this.writeExportCaps] = createSignal<ExportCapabilities | null>(null)
    ;[this.readSelectedRow, this.writeSelectedRow] = createSignal<TimelineRow | null>(null)
    ;[this.readPlaybackProbes, this.writePlaybackProbes] = createSignal<readonly CapabilityProbeRow[]>([])
    ;[this.readEditor, this.writeEditor] = createSignal<ActiveEditor | null>(null)
    ;[this.readLibraryAssets, this.writeLibraryAssets] = createSignal<readonly AssetRow[]>([])
    ;[this.readFolders, this.writeFolders] = createSignal<readonly AssetFolderRow[]>([])
    ;[this.readActiveFolder, this.writeActiveFolder] = createSignal<string | null>(null)

    this.projects = new ProjectService(sdk.entities)
    this.compositions = new CompositionService(sdk.entities)
    this.media = new MediaAssetService(sdk.entities, sdk.files)
    this.folders = new AssetFolderService(sdk.entities)
    this.jobs = new ExportJobService(sdk.entities)

    this.stopPhaseListener = onExportPhase((phase) => this.onExportPhaseChanged(phase))
  }

  // ── Boot ───────────────────────────────────────────────────────────────

  /**
   * Loads the durable startup state. Resolves true only once the entity
   * store has proven readable (the initial project list query succeeded,
   * with one retry); the caller holds `projectCommands.ready()` until then.
   */
  public async boot(): Promise<boolean> {
    this.writePlaybackProbes(playbackCapabilities())
    let loaded = await this.refreshProjects()
    if (!loaded) {
      await new Promise((resolve) => setTimeout(resolve, BOOT_RETRY_DELAY_MS))
      loaded = await this.refreshProjects()
    }
    const caps = await probeExportCapabilities()
    this.writeExportCaps(caps)
    return loaded
  }

  public registerFonts(sources: readonly FontSource[]): void {
    for (const source of sources) registerSessionFont(source)
  }

  private async refreshProjects(): Promise<boolean> {
    this.writeLoading(true)
    try {
      this.writeProjectRows(await this.projects.list())
      return true
    } catch (error) {
      this.reportFailure('reading projects', error instanceof Error ? error.message : String(error))
      return false
    } finally {
      this.writeLoading(false)
    }
  }

  private reportFailure(what: string, message: string): void {
    this.writeToast({ text: `${what} failed: ${message}`, tone: 'error' })
  }

  // ── Stage accessors for the UI ─────────────────────────────────────────

  public readonly screen = (): Screen => this.readScreen()

  public readonly projectsList = (): readonly ProjectRow[] => this.readProjectRows()

  public readonly isLoading = (): boolean => this.readLoading()

  public readonly message = (): ToastMessage | null => this.readToast()

  public readonly isImporting = (): boolean => this.readImporting()

  public readonly exportCapabilities = (): ExportCapabilities | null => this.readExportCaps()

  public readonly exportCapabilityRows = (): readonly CapabilityProbeRow[] => {
    const caps = this.readExportCaps()
    return caps === null ? [] : capabilityRows(caps)
  }

  public readonly playbackCapabilityRows = (): readonly CapabilityProbeRow[] => this.readPlaybackProbes()

  public readonly exportState = (): ExportPhase => exportPhase()

  public readonly exportStatusText = (): string => exportStatusText()

  public readonly rows = (): TimelineLayout => this.readEditor()?.session.rows() ?? EMPTY_LAYOUT

  public readonly playhead = (): number => this.readEditor()?.session.playhead() ?? 0

  public readonly isPlaying = (): boolean => this.readEditor()?.session.isPlaying() ?? false

  public readonly selection = (): TimelineRow | null => this.readSelectedRow()

  /** A bounded label for the selected clip, or null (assistant context). */
  public readonly selectionLabel = (): string | null => this.readSelectedRow()?.name ?? null

  public readonly activeProjectTitle = (): string | null => {
    const editor = this.readEditor()
    if (editor === null) return null
    const row = this.readProjectRows().find((candidate) => candidate.id === editor.projectId)
    return row?.data.title ?? null
  }

  public readonly activeStage = (): { width: number; height: number; fps: number } | null => {
    const editor = this.readEditor()
    if (!editor) return null
    return {
      width: editor.stage.width,
      height: editor.stage.height,
      fps: editor.session.world.get(FrameRate)?.value ?? DEFAULT_FPS,
    }
  }

  public readonly undoRedo = (): HistoryState<CompositionDocument> =>
    this.readEditor()?.session.undoRedo() ?? {
      present: this.emptyDocument(),
      canUndo: false,
      canRedo: false,
    }

  public readonly saveState = (): SessionSaveState =>
    this.readEditor()?.session.saveState() ?? { status: 'idle', revision: 0 }

  public readonly fps = (): number => this.readEditor()?.session.world.get(FrameRate)?.value ?? DEFAULT_FPS

  // ── Library accessors ──────────────────────────────────────────────────

  public readonly libraryAssets = (): readonly AssetRow[] => this.readLibraryAssets()

  public readonly libraryFolders = (): readonly AssetFolderRow[] => this.readFolders()

  public readonly activeFolderId = (): string | null => this.readActiveFolder()

  /** The assets the library panel shows under the current folder filter. */
  public readonly visibleLibraryAssets = (): readonly AssetRow[] => {
    const assets = this.readLibraryAssets()
    const folderId = this.readActiveFolder()
    if (folderId === null) return assets
    const folder = this.readFolders().find((candidate) => candidate.id === folderId)
    if (!folder) return assets
    return assets.filter((asset) => folder.data.assetIds.includes(asset.id))
  }

  public dismissToast(): void {
    this.writeToast(null)
  }

  private emptyDocument(): CompositionDocument {
    return {
      schemaVersion: 1,
      stage: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, background: '#161616' },
      scenes: [],
    }
  }

  // ── Project list actions ───────────────────────────────────────────────

  /** New composition through the same exposed command the host dispatches. */
  public async newProject(): Promise<void> {
    try {
      const result = await createCompositionCommand.run({ title: 'Untitled composition' })
      const compositionRef = result.refs.find((ref) => ref.type === 'video.composition')
      const projectRef = result.refs.find((ref) => ref.type === 'video.project')
      if (!compositionRef || !projectRef) throw new Error('the create command returned no composition')
      await this.refreshProjects()
      await this.openEditor(projectRef.id)
    } catch (error) {
      this.reportFailure('creating a composition', error instanceof Error ? error.message : String(error))
    }
  }

  public async openProject(projectId: string): Promise<void> {
    try {
      await this.openEditor(projectId)
    } catch (error) {
      this.reportFailure('opening the composition', error instanceof Error ? error.message : String(error))
    }
  }

  private async openEditor(projectId: string): Promise<void> {
    const known = this.readProjectRows().find((candidate) => candidate.id === projectId)
    const project = known ?? (await this.projects.list()).find((candidate) => candidate.id === projectId)
    if (!project) throw new Error('the project no longer exists')

    const compositionId = project.data.activeCompositionId
    if (compositionId === null) throw new Error('the project has no composition yet')
    const composition = await this.compositions.load(compositionId)

    const session = new EditorSession(
      {
        library: sessionAssetLibrary(),
        fontSources: sessionFontSources(),
        compositions: this.compositions,
        compositionId,
        initialRevision: composition.data.revision,
        initialRowVersion: composition.version,
        stage: composition.data.document.stage,
        fps: project.data.fps,
        projectId,
      },
      composition.data.document,
    )
    this.writeEditor({ projectId, compositionId, stage: composition.data.document.stage, session })
    this.writeSelectedRow(null)
    this.writeScreen('editor')
    session.start()
    void this.refreshLibrary()
  }

  public async closeEditor(): Promise<void> {
    const editor = this.readEditor()
    if (editor) {
      try {
        await editor.session.flush()
      } catch {
        // The save failure is already reflected in the session save state;
        // closing keeps the user's intent.
      }
      editor.session.dispose()
    }
    this.writeEditor(null)
    this.writeSelectedRow(null)
    this.writeScreen('projects')
    void this.refreshProjects()
  }

  private async refreshLibrary(): Promise<void> {
    try {
      const [assets, folders] = await Promise.all([this.media.list(), this.folders.list()])
      this.writeLibraryAssets(assets)
      this.writeFolders(folders)
    } catch (error) {
      this.reportFailure('reading the media library', error instanceof Error ? error.message : String(error))
    }
  }

  // ── Editor actions ─────────────────────────────────────────────────────

  public attachCanvas(canvas: HTMLCanvasElement): void {
    this.readEditor()?.session.attachCanvas(canvas)
  }

  public resize(): void {
    this.readEditor()?.session.resize()
  }

  public playOrPause(): void {
    this.readEditor()?.session.playOrPause()
  }

  public scrub(seconds: number): void {
    this.readEditor()?.session.scrub(seconds)
  }

  public selectRow(row: TimelineRow | null): void {
    this.writeSelectedRow(row)
    const session = this.readEditor()?.session
    if (!session) return
    const entity = row === null ? null : session.entityOf(row.key)
    session.select(entity)
  }

  public removeSelected(): void {
    this.readEditor()?.session.removeSelected()
    this.writeSelectedRow(null)
  }

  public undo(): void {
    this.readEditor()?.session.undo()
    this.writeSelectedRow(null)
  }

  public redo(): void {
    this.readEditor()?.session.redo()
    this.writeSelectedRow(null)
  }

  public async importMedia(): Promise<void> {
    const editor = this.readEditor()
    if (!editor || this.readImporting()) return
    const session = editor.session
    this.writeImporting(true)
    try {
      const picks = await this.media.pickMedia()
      if (picks === null) return
      const folderId = this.readActiveFolder()
      let folder: AssetFolderRow | null =
        folderId === null ? null : this.readFolders().find((candidate) => candidate.id === folderId) ?? null
      for (const pick of picks) {
        const asset = await this.media.adopt(pick)
        if (folder) {
          try {
            folder = await this.folders.addAsset(folder.id, folder.version, asset.id)
          } catch {
            // Folder membership is organizational; a conflict stops further
            // assignment without failing the import itself.
            folder = null
          }
        }
        if (pick.url === undefined) continue
        const probe = await probeMedia(sessionAssetLibrary(), pick.url)
        const clip = clipNodeForAsset(asset.data, editor.stage, session.playhead(), probe)
        if (clip) session.insertClip(clip)
      }
      await this.refreshLibrary()
    } catch (error) {
      this.reportFailure('importing media', error instanceof Error ? error.message : String(error))
    } finally {
      this.writeImporting(false)
    }
  }

  /** Re-inserts one persisted library asset at the playhead (live session). */
  public async insertAssetFromLibrary(assetId: string): Promise<void> {
    const editor = this.readEditor()
    if (!editor) return
    const asset = this.readLibraryAssets().find((candidate) => candidate.id === assetId)
    if (!asset) return
    try {
      const probe = await probeMedia(sessionAssetLibrary(), asset.data.url)
      const clip = clipNodeForAsset(asset.data, editor.stage, editor.session.playhead(), probe)
      if (clip) editor.session.insertClip(clip)
    } catch (error) {
      this.reportFailure('placing the media', error instanceof Error ? error.message : String(error))
    }
  }

  public async createFolder(title: string): Promise<void> {
    try {
      await this.folders.create(title)
      await this.refreshLibrary()
    } catch (error) {
      this.reportFailure('creating the folder', error instanceof Error ? error.message : String(error))
    }
  }

  public setActiveFolder(folderId: string | null): void {
    this.writeActiveFolder(folderId)
  }

  public addText(): void {
    const editor = this.readEditor()
    if (!editor) return
    editor.session.insertClip(
      textClipNode({
        name: 'Title',
        x: Math.round(-editor.stage.width / 2) + 80,
        y: -90,
        fontSize: 96,
        color: '#FFFFFF',
        text: TEXT_PLACEHOLDER,
        start: editor.session.playhead(),
      }),
    )
  }

  public moveClip(row: TimelineRow, nextStartSeconds: number): void {
    const editor = this.readEditor()
    if (!editor) return
    const snapped = snapToFrame(nextStartSeconds, this.fps())
    const { start } = clampMove(row, snapped)
    editor.session.setTiming(row.key, 'start', start)
  }

  /** Drag-in-progress move: live preview, no history step until release. */
  public moveClipPreview(row: TimelineRow, nextStartSeconds: number): void {
    const editor = this.readEditor()
    if (!editor) return
    const snapped = snapToFrame(nextStartSeconds, this.fps())
    const { start } = clampMove(row, snapped)
    editor.session.previewTiming(row.key, 'start', start)
  }

  public trimClipPreview(row: TimelineRow, edge: 'start' | 'end', nextValueSeconds: number): void {
    const editor = this.readEditor()
    if (!editor) return
    const snapped = snapToFrame(nextValueSeconds, this.fps())
    const timing = clampTrim(row, edge, snapped)
    editor.session.previewTiming(row.key, 'start', timing.start)
    editor.session.previewTiming(row.key, 'end', timing.end)
  }

  /** Records one history step for a finished drag gesture. */
  public finishInteraction(): void {
    this.readEditor()?.session.commitInteraction()
  }

  public trimClip(row: TimelineRow, edge: 'start' | 'end', nextValueSeconds: number): void {
    const editor = this.readEditor()
    if (!editor) return
    const snapped = snapToFrame(nextValueSeconds, this.fps())
    const timing = clampTrim(row, edge, snapped)
    editor.session.setTiming(row.key, 'start', timing.start)
    editor.session.setTiming(row.key, 'end', timing.end)
  }

  public setProp(row: TimelineRow, name: string, value: string | number | boolean | undefined): void {
    this.readEditor()?.session.setProp(row.key, name, value)
  }

  public selectedProps(): Record<string, string | number | boolean> {
    const editor = this.readEditor()
    const row = this.readSelectedRow()
    if (!editor || !row) return {}
    return editor.session.authoredPropsOf(row.key)
  }

  public selectedText(): string {
    const editor = this.readEditor()
    const row = this.readSelectedRow()
    if (!editor || !row) return ''
    return editor.session.authoredTextOf(row.key)
  }

  /** An inspector field commit, applied to the current selection. */
  public setPropFromField(name: string, value: string | number | boolean): void {
    const editor = this.readEditor()
    const row = this.readSelectedRow()
    if (!editor || !row) return
    const previous = editor.session.authoredPropsOf(row.key)[name]
    try {
      editor.session.setProp(row.key, name, value)
    } catch (error) {
      // The engine may already hold the rejected value; restore the prior
      // prop so the live document stays inside the persisted vocabulary and
      // history and autosave keep running. The commit that threw never
      // reached history, so only the restore records a step.
      editor.session.setProp(row.key, name, previous)
      this.reportFailure('updating the field', error instanceof Error ? error.message : String(error))
    }
  }

  /** The inspector's text-area commit, applied to the current selection. */
  public setTextFromField(text: string): void {
    const editor = this.readEditor()
    const row = this.readSelectedRow()
    if (!editor || !row) return
    const previous = editor.session.authoredTextOf(row.key)
    try {
      editor.session.setTextOfSelection(text)
    } catch (error) {
      editor.session.setTextOfSelection(previous)
      this.reportFailure('updating the text', error instanceof Error ? error.message : String(error))
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────

  /**
   * Starts one export. Pending edits flush to durable state first — the
   * command path encodes the saved document — and a flush failure aborts
   * with the session's edits preserved. `files` destinations reuse the
   * exposed export-video command; `computer` is the explicit off-platform
   * path through the OS save dialog.
   */
  public async startExport(format: ExportFormat, destination: ExportDestination = 'files'): Promise<void> {
    const editor = this.readEditor()
    const phase = exportPhase()
    if (!editor || phase.kind === 'encoding' || phase.kind === 'saving') return
    try {
      await editor.session.flush()
    } catch (error) {
      this.reportFailure('saving before the export', error instanceof Error ? error.message : String(error))
      return
    }
    if (destination === 'computer') {
      await this.startOffPlatformExport(editor, format)
      return
    }
    try {
      const result = await exportVideoCommand.run({ compositionId: editor.compositionId, format })
      if (result.state === 'failed') return // the phase store carries the blocker
    } catch (error) {
      this.reportFailure('starting the export', error instanceof Error ? error.message : String(error))
    }
  }

  private async startOffPlatformExport(editor: ActiveEditor, format: ExportFormat): Promise<void> {
    const caps = this.readExportCaps()
    if (caps === null || !caps.supported) return
    try {
      const job = await this.jobs.create(editor.compositionId, format)
      editor.session.pause()
      void runExport(
        {
          library: sessionAssetLibrary(),
          fontSources: sessionFontSources(),
          jobs: this.jobs,
          files: this.sdk.files,
          fps: this.fps(),
          projectId: editor.projectId,
          deliver: offPlatformDelivery(this.sdk.files),
          destination: 'computer',
        },
        editor.session.currentDocument(),
        format,
        job.id,
        publishExportPhase,
      ).then((handle) => setExportCancelHandle(handle.cancel))
    } catch (error) {
      this.reportFailure('starting the export', error instanceof Error ? error.message : String(error))
    }
  }

  public cancelExport(): void {
    cancelExportRun()
  }

  private onExportPhaseChanged(phase: ExportPhase): void {
    const editor = this.readEditor()
    if (!editor) return
    if (phase.kind === 'encoding' || phase.kind === 'saving') {
      editor.session.pause()
      return
    }
    if (phase.kind === 'succeeded' || phase.kind === 'failed' || phase.kind === 'canceled') {
      editor.session.start()
    }
  }

  // ── Host lifecycle ─────────────────────────────────────────────────────

  public sleep(): void {
    this.readEditor()?.session.sleep()
  }

  public wake(): void {
    this.readEditor()?.session.wake()
  }

  public dispose(): void {
    this.stopPhaseListener()
    this.readEditor()?.session.dispose()
    this.writeEditor(null)
    cancelExportRun()
  }
}
