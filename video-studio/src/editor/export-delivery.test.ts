// Delivery-level export behavior: destination outcomes map to the durable
// job states, cancel is honest, failures are recorded without touching the
// composition, and the off-platform dialog path never records a path. These
// run in Node because delivery is pure ports — the encoder itself is
// exercised in the host-frame harness.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deliverExport, filesDelivery, offPlatformDelivery, exportFileName } from './export-delivery.ts'
import { ExportJobService } from '../domain/export-jobs.ts'
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
    const row: StoreEntity = { type, id: `j${this.nextId++}`, version: 1, data }
    this.rows.push(row)
    return { id: row.id, version: row.version, data }
  }

  public async get<T>(type: string, id: string): Promise<EntityRow<T>> {
    const row = this.rows.find((candidate) => candidate.type === type && candidate.id === id)
    if (!row) throw new Error('not found')
    // SAFETY: erasure-only bridge, same as create/update below.
    return { id: row.id, version: row.version, data: row.data as T }
  }

  public async query<T>(): Promise<{ records: EntityRow<T>[]; cursor: null }> {
    return { records: [], cursor: null }
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

class FakeFiles implements FilesPort {
  public answer: { path: string; publicId?: string } | null | Error = { path: '/Files/Video Studio/out.mp4', publicId: 'pub_1' }
  public saves = 0

  public async pick(): Promise<null> {
    return null
  }

  public async save(args: { content: string | Uint8Array; name?: string; accept?: string[] }): Promise<{ path: string; publicId?: string } | null> {
    assert.ok(args.name === exportFileName('mp4') || args.name === exportFileName('webm'))
    this.saves += 1
    if (this.answer instanceof Error) throw this.answer
    return this.answer
  }
}

class FakeDialog implements DialogPort {
  public answer: { saved: boolean } | Error = { saved: true }
  public asks = 0

  public async saveAs(args: { data: Uint8Array; defaultName: string }): Promise<{ saved: boolean }> {
    this.asks += 1
    assert.ok(args.data.byteLength > 0)
    assert.ok(args.defaultName.endsWith('.mp4') || args.defaultName.endsWith('.webm'))
    if (this.answer instanceof Error) throw this.answer
    return this.answer
  }
}

const BYTES = new Uint8Array([1, 2, 3, 4])

test('file names carry the format, not user data', () => {
  assert.equal(exportFileName('mp4'), 'video-studio-export.mp4')
  assert.equal(exportFileName('webm'), 'video-studio-export.webm')
})

test('a Files delivery success records the Files identity on the job', async () => {
  const entities = new MemoryEntities()
  const jobs = new ExportJobService(entities)
  const files = new FakeFiles()
  const job = await jobs.create('comp-1', 'mp4')
  const outcome = await deliverExport({ jobs, deliver: filesDelivery(files) }, job.id, BYTES, 'mp4')
  assert.equal(outcome.kind, 'delivered')
  const stored = entities.find<{ state: string; resultPath: string | null; resultPublicId: string | null }>('video.export-job', job.id)
  if (stored === undefined) throw new Error('job row missing')
  assert.equal(stored.state, 'succeeded')
  assert.equal(stored.resultPath, '/Files/Video Studio/out.mp4')
  assert.equal(stored.resultPublicId, 'pub_1')
})

test('a canceled Files save cancels the job and preserves the composition', async () => {
  const entities = new MemoryEntities()
  const jobs = new ExportJobService(entities)
  const files = new FakeFiles()
  files.answer = null
  const job = await jobs.create('comp-1', 'webm')
  const outcome = await deliverExport({ jobs, deliver: filesDelivery(files) }, job.id, BYTES, 'webm')
  assert.deepEqual(outcome, { kind: 'canceled', displayName: null })
  const stored = entities.find<{ state: string; error: string | null }>('video.export-job', job.id)
  if (stored === undefined) throw new Error('job row missing')
  assert.equal(stored.state, 'canceled')
  assert.equal(stored.error, null)
  // No composition row was written by delivery — only the job row exists.
  assert.equal(entities.rows.length, 1)
})

test('a save transport failure marks the job failed with the bounded message', async () => {
  const entities = new MemoryEntities()
  const jobs = new ExportJobService(entities)
  const files = new FakeFiles()
  files.answer = new Error('transport died')
  const job = await jobs.create('comp-1', 'mp4')
  const outcome = await deliverExport({ jobs, deliver: filesDelivery(files) }, job.id, BYTES, 'mp4')
  assert.equal(outcome.kind, 'failed')
  const stored = entities.find<{ state: string; error: string | null }>('video.export-job', job.id)
  if (stored === undefined) throw new Error('job row missing')
  assert.equal(stored.state, 'failed')
  assert.equal(stored.error, 'transport died')
})

test('off-platform delivery records success without any path', async () => {
  const entities = new MemoryEntities()
  const jobs = new ExportJobService(entities)
  const dialog = new FakeDialog()
  const job = await jobs.create('comp-1', 'mp4')
  const outcome = await deliverExport({ jobs, deliver: offPlatformDelivery(dialog) }, job.id, BYTES, 'mp4')
  assert.deepEqual(outcome, { kind: 'delivered', resultPath: null, resultPublicId: null })
  assert.equal(dialog.asks, 1)
  const stored = entities.find<{ state: string; resultPath: string | null }>('video.export-job', job.id)
  if (stored === undefined) throw new Error('job row missing')
  assert.equal(stored.state, 'succeeded')
  assert.equal(stored.resultPath, null)
})

test('declining the OS save dialog cancels, and its failure fails the job', async () => {
  const entities = new MemoryEntities()
  const jobs = new ExportJobService(entities)

  const declined = new FakeDialog()
  declined.answer = { saved: false }
  const jobA = await jobs.create('comp-1', 'webm')
  const canceled = await deliverExport({ jobs, deliver: offPlatformDelivery(declined) }, jobA.id, BYTES, 'webm')
  assert.equal(canceled.kind, 'canceled')

  const broken = new FakeDialog()
  broken.answer = new Error('dialog crashed')
  const jobB = await jobs.create('comp-1', 'webm')
  const failed = await deliverExport({ jobs, deliver: offPlatformDelivery(broken) }, jobB.id, BYTES, 'webm')
  assert.equal(failed.kind, 'failed')
})
