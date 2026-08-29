// The headless core of every typed command: pure functions over the entity
// and files ports. `src/commands/index.ts` wraps each one in a literal
// `commands.define` envelope; this module stays free of SDK, engine, and DOM
// imports so the durable behavior is drivable under `node --test`.
import { ProjectService, type ProjectRow } from '../domain/projects.ts'
import {
  CompositionService,
  emptyCompositionDocument,
  patchClipTimings,
  type ClipTimingPatch,
} from '../domain/compositions.ts'
import { parseAssetRecord, type AssetRecord, type CompositionDocument, type ExportFormat, type JsonValue } from '../domain/schema.ts'
import { ExportJobService, type ExportJobRow } from '../domain/export-jobs.ts'
import { clipNodeForAsset, insertClipIntoDocument } from '../domain/clip-nodes.ts'
import { inspectTimeline } from '../domain/timeline-inspect.ts'
import { ASSET_TYPE } from '../domain/media-assets.ts'
import type { DialogPort, EntitiesPort, FilesPort } from '../sdk-port.ts'

export interface CommandPorts {
  readonly projectId: string
  readonly entities: EntitiesPort
  readonly files: FilesPort
  readonly dialog: DialogPort
}

/** The wire form of one inspect-timeline result row. */
export interface InspectRowJson {
  path: number[]
  tag: string
  name?: string
  start?: number
  end?: number
}

function services(ports: CommandPorts) {
  return {
    projects: new ProjectService(ports.entities),
    compositions: new CompositionService(ports.entities),
    jobs: new ExportJobService(ports.entities),
  }
}

export interface CreateCompositionResult {
  readonly projectId: string
  readonly projectVersion: number
  readonly compositionId: string
}

export async function createComposition(
  ports: CommandPorts,
  input: { title: string; width?: number; height?: number; fps?: number },
): Promise<CreateCompositionResult> {
  const { projects, compositions } = services(ports)
  const width = input.width ?? 1920
  const height = input.height ?? 1080
  const project = await projects.create({
    title: input.title,
    width,
    height,
    fps: input.fps ?? 30,
  })
  const composition = await compositions.create(input.title, emptyCompositionDocument(width, height))
  const updated = await projects.setActiveComposition(project.id, project.version, composition.id)
  return { projectId: project.id, projectVersion: updated.version, compositionId: composition.id }
}

export interface InspectTimelineResult {
  readonly revision: number
  readonly rows: InspectRowJson[]
}

export async function inspectCompositionTimeline(
  ports: CommandPorts,
  input: { compositionId: string },
): Promise<InspectTimelineResult> {
  const { compositions } = services(ports)
  const composition = await compositions.load(input.compositionId)
  return {
    revision: composition.data.revision,
    rows: inspectTimeline(composition.data.document).map((row) => {
      const item: InspectRowJson = {
        path: [...row.path],
        tag: row.tag,
      }
      if (row.name !== null) item['name'] = row.name
      if (row.start !== null) item['start'] = row.start
      if (row.end !== null) item['end'] = row.end
      return item
    }),
  }
}

export interface ApplyTimelinePatchResult {
  readonly revision: number
  readonly rowVersion: number
}

export async function applyTimelinePatch(
  ports: CommandPorts,
  input: { compositionId: string; patches: readonly ClipTimingPatch[] },
): Promise<ApplyTimelinePatchResult> {
  const { compositions } = services(ports)
  const composition = await compositions.load(input.compositionId)
  const next = patchClipTimings(composition.data.document, input.patches)
  const saved = await compositions.save(composition.id, composition.data.revision, next, {
    expectedRowVersion: composition.version,
  })
  return { revision: saved.data.revision, rowVersion: saved.version }
}

export interface ImportMediaResult {
  readonly revision: number
  readonly rowVersion: number
  readonly clipPath: readonly number[]
}

/**
 * Places one persisted `video.asset` on the composition timeline (the first
 * scene, created when the document has none). Headless: no picker, no
 * probing — the clip starts at stage size when its media has no probe, and
 * the document's revision/row guards reject a concurrent writer.
 */
export async function importMediaIntoComposition(
  ports: CommandPorts,
  input: { compositionId: string; assetId: string; startSeconds?: number },
): Promise<ImportMediaResult> {
  const assetRow = await ports.entities.get<JsonValue>(ASSET_TYPE, input.assetId)
  const asset: AssetRecord = parseAssetRecord(assetRow.data)
  const compositions = new CompositionService(ports.entities)
  const composition = await compositions.load(input.compositionId)
  const clip = clipNodeForAsset(
    asset,
    composition.data.document.stage,
    input.startSeconds ?? 0,
  )
  if (clip === null) {
    throw new Error(`a ${asset.kind} asset cannot be placed on the timeline`)
  }
  const inserted = insertClipIntoDocument(composition.data.document, clip)
  const saved = await compositions.save(composition.id, composition.data.revision, inserted.document, {
    expectedRowVersion: composition.version,
  })
  return { revision: saved.data.revision, rowVersion: saved.version, clipPath: inserted.clipPath }
}

export type ExportRequestState = 'pending' | 'failed'

export interface ExportJobStarterArgs {
  readonly job: ExportJobRow
  readonly document: CompositionDocument
  readonly format: ExportFormat
  readonly fps: number
  readonly projectId: string
}

export interface RequestExportResult {
  readonly jobId: string
  readonly state: ExportRequestState
  readonly blocker: string | null
}

/**
 * Creates the durable `video.export-job` and hands it to the injected
 * starter (the engine-side runner), reporting the immediate state: pending
 * while the run proceeds, failed when this frame truthfully cannot encode.
 * The job record — not this result — is the durable progress trail.
 */
export async function requestExport(
  ports: CommandPorts,
  input: { compositionId: string; format: ExportFormat },
  deps: {
    probeSupported: () => Promise<{ supported: boolean; blocker: string | null }>
    start: (args: ExportJobStarterArgs) => void
  },
): Promise<RequestExportResult> {
  const { compositions, projects, jobs } = services(ports)
  const composition = await compositions.load(input.compositionId)
  const caps = await deps.probeSupported()
  const job = await jobs.create(input.compositionId, input.format)
  if (!caps.supported) {
    const blocker = caps.blocker ?? 'this frame cannot encode video'
    await jobs.markFailed(job.id, blocker)
    return { jobId: job.id, state: 'failed', blocker }
  }
  const project: ProjectRow | null = await projects.findByComposition(input.compositionId)
  deps.start({
    job,
    document: composition.data.document,
    format: input.format,
    fps: project?.data.fps ?? 30,
    projectId: ports.projectId,
  })
  return { jobId: job.id, state: 'pending', blocker: null }
}
