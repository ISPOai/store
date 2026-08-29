// Command-core behavior under the in-memory ports: every durable use case
// the exposed commands wrap, driven exactly as `binding.run` drives it.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyTimelinePatch,
  createComposition,
  importMediaIntoComposition,
  inspectCompositionTimeline,
  requestExport,
  type CommandPorts,
  type ExportJobStarterArgs,
} from './handlers.ts'
import type { DialogPort, EntitiesPort, EntityRow, FilesPort } from '../sdk-port.ts'

interface StoreEntity {
  type: string
  id: string
  version: number
  data: unknown
}

class MemoryEntities implements EntitiesPort {
  public readonly rows: StoreEntity[] = []
  private nextId = 1

  public find<T>(type: string, id: string): T | undefined {
    const row = this.rows.find((candidate) => candidate.type === type && candidate.id === id)
    // SAFETY: rows are inserted by the generic methods below with the same
    // T they were handed; this read is generic erasure, not coercion.
    return row === undefined ? undefined : (row.data as T)
  }

  public async create<T>(type: string, data: T): Promise<EntityRow<T>> {
    const row: StoreEntity = { type, id: `c${this.nextId++}`, version: 1, data }
    this.rows.push(row)
    return { id: row.id, version: row.version, data }
  }

  public async get<T>(type: string, id: string): Promise<EntityRow<T>> {
    const row = this.rows.find((candidate) => candidate.type === type && candidate.id === id)
    if (!row) throw new Error('not found')
    // SAFETY: erasure-only bridge, same as create/update below.
    return { id: row.id, version: row.version, data: row.data as T }
  }

  public async query<T>(type: string): Promise<{ records: EntityRow<T>[]; cursor: null }> {
    const records: EntityRow<T>[] = []
    for (const row of this.rows) {
      if (row.type !== type) continue
      // SAFETY: same erasure-only bridge as get<T> above.
      records.push({ id: row.id, version: row.version, data: row.data as T })
    }
    return { records, cursor: null }
  }

  public async update<T>(
    type: string,
    id: string,
    patch: Partial<T>,
    options?: { expectedVersion?: number },
  ): Promise<EntityRow<T>> {
    const row = this.rows.find((candidate) => candidate.type === type && candidate.id === id)
    if (!row) throw new Error('not found')
    if (options?.expectedVersion !== undefined && options.expectedVersion !== row.version) {
      throw new Error('version conflict')
    }
    // SAFETY: merged within T's shape (create<T> payload + Partial<T> patch).
    row.data = { ...(row.data as T), ...patch }
    row.version += 1
    // SAFETY: erasure-only bridge.
    return { id: row.id, version: row.version, data: row.data as T }
  }

  public async delete(): Promise<undefined> {
    return undefined
  }
}

class MemoryFiles implements FilesPort {
  public async pick(): Promise<null> {
    return null
  }

  public async save(): Promise<null> {
    return null
  }
}

class MemoryDialog implements DialogPort {
  public async saveAs(): Promise<{ saved: boolean }> {
    return { saved: false }
  }
}

interface TestPorts {
  readonly sdk: CommandPorts
  readonly entities: MemoryEntities
}

function ports(): TestPorts {
  const entities = new MemoryEntities()
  return {
    sdk: {
      projectId: 'proj_test',
      entities,
      files: new MemoryFiles(),
      dialog: new MemoryDialog(),
    },
    entities,
  }
}

test('create-composition creates the project and its active composition', async () => {
  const { sdk, entities } = ports()
  const result = await createComposition(sdk, { title: 'Teaser', width: 1280, height: 720, fps: 24 })
  const project = entities.find<{ title: string; activeCompositionId: string | null }>('video.project', result.projectId)
  if (project === undefined) throw new Error('project row missing')
  assert.equal(project.title, 'Teaser')
  assert.equal(project.activeCompositionId, result.compositionId)
  const composition = entities.find<{ title: string; revision: number }>('video.composition', result.compositionId)
  if (composition === undefined) throw new Error('composition row missing')
  assert.equal(composition.revision, 0)
})

test('inspect-timeline addresses clips by scene/child path', async () => {
  const { sdk, entities } = ports()
  const created = await createComposition(sdk, { title: 'T' })
  const assetRow = await entities.create('video.asset', {
    name: 'intro.mp4',
    mimeType: 'video/mp4',
    kind: 'video',
    url: 'assets://asset_intro',
    sizeBytes: 10,
  })
  await importMediaIntoComposition(sdk, { compositionId: created.compositionId, assetId: assetRow.id, startSeconds: 2 })
  const inspected = await inspectCompositionTimeline(sdk, { compositionId: created.compositionId })
  assert.equal(inspected.revision, 1)
  const clipRow = inspected.rows.find((row) => row.tag === 'video')
  assert.ok(clipRow, `expected a video clip row, got ${JSON.stringify(inspected.rows)}`)
  assert.deepEqual(clipRow.path, [0, 0])
  assert.equal(clipRow.start, 2)
  assert.equal(clipRow.name, 'intro')
})

test('apply-timeline-patch moves timing and bumps the revision', async () => {
  const { sdk, entities } = ports()
  const created = await createComposition(sdk, { title: 'T' })
  const assetRow = await entities.create('video.asset', {
    name: 'a.mp3',
    mimeType: 'audio/mpeg',
    kind: 'audio',
    url: 'assets://asset_a',
    sizeBytes: 1,
  })
  await importMediaIntoComposition(sdk, { compositionId: created.compositionId, assetId: assetRow.id })
  const patched = await applyTimelinePatch(sdk, {
    compositionId: created.compositionId,
    patches: [{ path: [0, 0], start: 5, end: 9 }],
  })
  assert.equal(patched.revision, 2)
  const inspected = await inspectCompositionTimeline(sdk, { compositionId: created.compositionId })
  const clip = inspected.rows.find((row) => row.tag === 'audio')
  assert.ok(clip)
  assert.equal(clip.start, 5)
  assert.equal(clip.end, 9)
})

test('import-media rejects unknown assets and non-media kinds, and re-reads fresh state', async () => {
  const { sdk, entities } = ports()
  const created = await createComposition(sdk, { title: 'T' })

  await assert.rejects(
    () => importMediaIntoComposition(sdk, { compositionId: created.compositionId, assetId: 'missing' }),
    /not found/,
  )

  const other = await entities.create('video.asset', {
    name: 'note.txt',
    mimeType: 'text/plain',
    kind: 'other',
    url: 'assets://asset_note',
    sizeBytes: 1,
  })
  await assert.rejects(
    () => importMediaIntoComposition(sdk, { compositionId: created.compositionId, assetId: other.id }),
    /cannot be placed on the timeline/,
  )

  const audio = await entities.create('video.asset', {
    name: 'a.wav',
    mimeType: 'audio/wav',
    kind: 'audio',
    url: 'assets://asset_w',
    sizeBytes: 1,
  })
  const first = await importMediaIntoComposition(sdk, { compositionId: created.compositionId, assetId: audio.id })
  assert.equal(first.clipPath.length, 2)

  // Even after another writer moved the row on, the command re-reads fresh
  // state instead of replaying a stale window (the conflict path itself is
  // covered by the service-level optimistic-version tests).
  const row = entities.rows.find((candidate) => candidate.id === created.compositionId)
  assert.ok(row)
  row.version += 7
  const second = await importMediaIntoComposition(sdk, { compositionId: created.compositionId, assetId: audio.id })
  assert.deepEqual(second.clipPath, [0, 1])
  const inspected = await inspectCompositionTimeline(sdk, { compositionId: created.compositionId })
  assert.equal(inspected.rows.filter((candidate) => candidate.tag === 'audio').length, 2)
})

test('export-video creates a pending job and hands it to the runner with the project fps', async () => {
  const { sdk, entities } = ports()
  const created = await createComposition(sdk, { title: 'T', fps: 24 })
  const started: ExportJobStarterArgs[] = []
  const result = await requestExport(
    sdk,
    { compositionId: created.compositionId, format: 'webm' },
    {
      probeSupported: async () => ({ supported: true, blocker: null }),
      start: (args) => started.push(args),
    },
  )
  assert.equal(result.state, 'pending')
  assert.equal(started.length, 1)
  assert.equal(started[0]?.fps, 24)
  assert.equal(started[0]?.format, 'webm')
  assert.equal(started[0]?.job.data.state, 'pending')
  const job = entities.find<{ state: string; compositionId: string }>('video.export-job', result.jobId)
  if (job === undefined) throw new Error('job row missing')
  assert.equal(job.state, 'pending')
  assert.equal(job.compositionId, created.compositionId)
})

test('export-video fails its job truthfully when the frame cannot encode', async () => {
  const { sdk, entities } = ports()
  const created = await createComposition(sdk, { title: 'T' })
  const started: ExportJobStarterArgs[] = []
  const result = await requestExport(
    sdk,
    { compositionId: created.compositionId, format: 'mp4' },
    {
      probeSupported: async () => ({
        supported: false,
        blocker: 'This host frame is not cross-origin isolated.',
      }),
      start: (args) => started.push(args),
    },
  )
  assert.equal(result.state, 'failed')
  assert.ok(result.blocker?.includes('cross-origin isolated'))
  assert.equal(started.length, 0)
  const job = entities.find<{ state: string; error: string | null }>('video.export-job', result.jobId)
  if (job === undefined) throw new Error('job row missing')
  assert.equal(job.state, 'failed')
  assert.ok(job.error?.includes('cross-origin isolated'))
})

test('export-video refuses a composition that does not exist', async () => {
  const { sdk, entities } = ports()
  await assert.rejects(
    () =>
      requestExport(
        sdk,
        { compositionId: 'ghost', format: 'mp4' },
        { probeSupported: async () => ({ supported: true, blocker: null }), start: () => undefined },
      ),
    /not found/,
  )
  // No job row was created for the failed request.
  assert.equal(entities.rows.filter((row) => row.type === 'video.export-job').length, 0)
})
