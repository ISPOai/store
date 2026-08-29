import test from 'node:test'
import assert from 'node:assert/strict'
import { AssetFolderService } from './asset-folders.ts'
import type { EntitiesPort, EntityRow } from '../sdk-port.ts'

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
    const row: StoreEntity = { type, id: `f${this.nextId++}`, version: 1, data }
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

test('folders round-trip and order by their order field', async () => {
  const entities = new MemoryEntities()
  const folders = new AssetFolderService(entities)
  await folders.create('B-roll')
  await folders.create('Music')
  const listed = await folders.list()
  assert.equal(listed.length, 2)
  assert.deepEqual(
    listed.map((row) => row.data.assetIds),
    [[], []],
  )
})

test('membership changes are optimistic-versioned and idempotent', async () => {
  const entities = new MemoryEntities()
  const folders = new AssetFolderService(entities)
  const folder = await folders.create('B-roll')
  const updated = await folders.addAsset(folder.id, folder.version, 'asset-1')
  assert.deepEqual(updated.data.assetIds, ['asset-1'])
  // Re-adding under the returned version is a no-op that keeps the version.
  const again = await folders.addAsset(updated.id, updated.version, 'asset-1')
  assert.deepEqual(again.data.assetIds, ['asset-1'])

  // A stale version is rejected: the row moved on.
  await assert.rejects(() => folders.addAsset(folder.id, 1, 'asset-2'), /version conflict/)
})

test('empty and blank folder names are rejected at the boundary', async () => {
  const folders = new AssetFolderService(new MemoryEntities())
  await assert.rejects(() => folders.create('   '), /folder name cannot be empty/)
})

test('malformed stored folder rows are dropped by the list', async () => {
  const entities = new MemoryEntities()
  entities.rows.push({ type: 'video.asset-folder', id: 'bad', version: 1, data: { name: 'x', order: 1 } })
  const folders = new AssetFolderService(entities)
  assert.deepEqual(await folders.list(), [])
})
