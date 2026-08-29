import test from 'node:test'
import assert from 'node:assert/strict'
import { ProjectService } from './projects.ts'
import { CompositionService, emptyCompositionDocument } from './compositions.ts'
import { MediaAssetService, isControlledMediaUrl } from './media-assets.ts'
import { ExportJobService } from './export-jobs.ts'
import type { EntitiesPort, EntityRow, FilesPort, PowerboxPick } from '../sdk-port.ts'

interface StoreEntity {
  type: string
  id: string
  version: number
  data: unknown
}

class MemoryEntities implements EntitiesPort {
  public rows: StoreEntity[] = []
  private nextId = 1

  public async create<T>(type: string, data: T): Promise<EntityRow<T>> {
    const row: StoreEntity = { type, id: `e${this.nextId++}`, version: 1, data }
    this.rows.push(row)
    return { id: row.id, version: row.version, data }
  }

  public async get<T>(type: string, id: string): Promise<EntityRow<T>> {
    const row = this.rows.find((candidate) => candidate.type === type && candidate.id === id)
    if (!row) throw new Error('not found')
    // SAFETY: this fake stores exactly the T that create<T> or update<T>
    // received for the row, so the read is generic erasure, not coercion.
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
    // SAFETY: the stored payload came from create<T> for the same T, and the
    // patch is Partial<T>; the merge stays within T's shape.
    const merged = { ...(row.data as T), ...patch }
    row.data = merged
    row.version += 1
    // SAFETY: same erasure-only bridge as get<T> above.
    return { id: row.id, version: row.version, data: row.data as T }
  }

  public async delete(type: string, id: string): Promise<undefined> {
    this.rows = this.rows.filter((row) => !(row.type === type && row.id === id))
    return undefined
  }
}

class MemoryFiles implements FilesPort {
  public lastSave: { name: string; bytes: number } | null = null
  public picks: PowerboxPick[] | null = null

  public async pick(): Promise<PowerboxPick | PowerboxPick[] | null> {
    return this.picks
  }

  public async save(args: {
    content: string | Uint8Array
    name?: string
    accept?: string[]
  }): Promise<{ path: string } | null> {
    const bytes = args.content instanceof Uint8Array ? args.content.byteLength : args.content.length
    this.lastSave = { name: args.name ?? 'unnamed', bytes }
    return { path: `/Files/Video Studio/${args.name ?? 'unnamed'}` }
  }
}

test('the project service round-trips rows through the entity port', async () => {
  const entities = new MemoryEntities()
  const projects = new ProjectService(entities)
  const created = await projects.create({ title: 'First', width: 1280, height: 720, fps: 24 })
  assert.equal(created.data.title, 'First')
  const listed = await projects.list()
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.id, created.id)
})

test('bad stored rows are dropped by the list, not thrown', async () => {
  const entities = new MemoryEntities()
  entities.rows.push({ type: 'video.project', id: 'bad', version: 1, data: { title: '' } })
  const projects = new ProjectService(entities)
  assert.deepEqual(await projects.list(), [])
})

test('composition saves advance the revision', async () => {
  const entities = new MemoryEntities()
  const compositions = new CompositionService(entities)
  const created = await compositions.create('Draft', emptyCompositionDocument(1920, 1080))
  const saved = await compositions.save(created.id, 0, emptyCompositionDocument(640, 360))
  assert.equal(saved.data.revision, 1)
  assert.equal(saved.data.document.stage.width, 640)
})

test('a composition save under a stale row version is rejected, edits stay in memory', async () => {
  const entities = new MemoryEntities()
  const compositions = new CompositionService(entities)
  const created = await compositions.create('Draft', emptyCompositionDocument(1920, 1080))
  const row = entities.rows.find((candidate) => candidate.id === created.id)
  assert.ok(row)
  // Another writer moved the row on after this editor read it.
  row.version += 3
  const nextDocument = emptyCompositionDocument(640, 360)
  await assert.rejects(
    () => compositions.save(created.id, created.data.revision, nextDocument, { expectedRowVersion: 1 }),
    /version conflict/,
  )
  // The durable document is untouched; the caller's document is preserved.
  const reloaded = await compositions.load(created.id)
  assert.equal(reloaded.data.revision, 0)
  assert.equal(reloaded.data.document.stage.width, 1920)
  assert.equal(nextDocument.stage.width, 640)
})

test('the media service adopts picks with controlled references only', async () => {
  const entities = new MemoryEntities()
  const files = new MemoryFiles()
  const media = new MediaAssetService(entities, files)
  const row = await media.adopt({
    url: 'assets://asset_deadbeef',
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    size: 42,
    kind: 'video',
  })
  assert.equal(row.data.kind, 'video')
  assert.equal(row.data.url, 'assets://asset_deadbeef')
  const listed = await media.list()
  assert.equal(listed.length, 1)
  await assert.rejects(
    () =>
      media.adopt({
        url: 'https://example.com/evil.mp4',
        name: 'evil.mp4',
        mimeType: 'video/mp4',
        size: 1,
        kind: 'video',
      }),
  )
})

test('pick cancellation resolves to null and adopts nothing', async () => {
  const entities = new MemoryEntities()
  const files = new MemoryFiles()
  files.picks = null
  const media = new MediaAssetService(entities, files)
  assert.equal(await media.pickMedia(), null)
  assert.deepEqual(await media.list(), [])
})

test('the export job service walks its state machine', async () => {
  const entities = new MemoryEntities()
  const jobs = new ExportJobService(entities)
  const job = await jobs.create('comp-1', 'mp4')
  assert.equal(job.data.state, 'pending')
  await jobs.markRunning(job.id)
  await jobs.markProgress(job.id, 0.25)
  const done = await jobs.markSucceeded(job.id, { path: '/Files/x.mp4', publicId: 'pub' })
  assert.equal(done.data.state, 'succeeded')
  assert.equal(done.data.progress, 1)
  assert.equal(done.data.resultPath, '/Files/x.mp4')
  const failed = await jobs.markFailed(job.id, 'boom')
  assert.equal(failed.data.error, 'boom')
})

test('controlled reference classification', () => {
  assert.equal(isControlledMediaUrl('assets://asset_1'), true)
  assert.equal(isControlledMediaUrl('data:audio/wav;base64,xx'), true)
  assert.equal(isControlledMediaUrl('https://cdn.example.com/a.mp4'), false)
})
