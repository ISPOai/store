// Asset folder service — durable `video.asset-folder` records grouping the
// imported-media library. Folder membership lives in the folder record (an
// ordered id list), so `video.asset` rows stay immutable after import and
// every folder mutation is an optimistic-versioned update.
import { DomainParseError, parseAssetFolderRecord, type AssetFolderRecord, type JsonValue } from './schema.ts'
import type { EntitiesPort } from '../sdk-port.ts'

export const ASSET_FOLDER_TYPE = 'video.asset-folder'

export interface AssetFolderRow {
  readonly id: string
  readonly version: number
  readonly data: AssetFolderRecord
}

export class AssetFolderService {
  private readonly entities: EntitiesPort

  public constructor(entities: EntitiesPort) {
    this.entities = entities
  }

  public async list(): Promise<AssetFolderRow[]> {
    const page = await this.entities.query<JsonValue>(ASSET_FOLDER_TYPE, {
      orderBy: { field: 'order', direction: 'asc' },
      limit: 200,
    })
    return page.records.flatMap((row) => {
      try {
        return [{ id: row.id, version: row.version, data: parseAssetFolderRecord(row.data) }]
      } catch (error) {
        if (error instanceof DomainParseError) return []
        throw error
      }
    })
  }

  public async create(name: string): Promise<AssetFolderRow> {
    const trimmed = name.trim()
    if (trimmed === '') throw new DomainParseError('a folder name cannot be empty')
    const data: AssetFolderRecord = { name: trimmed, order: Date.now(), assetIds: [] }
    const row = await this.entities.create<AssetFolderRecord>(ASSET_FOLDER_TYPE, data)
    return { id: row.id, version: row.version, data }
  }

  public async rename(id: string, version: number, name: string): Promise<AssetFolderRow> {
    const trimmed = name.trim()
    if (trimmed === '') throw new DomainParseError('a folder name cannot be empty')
    const row = await this.entities.update<AssetFolderRecord>(
      ASSET_FOLDER_TYPE,
      id,
      { name: trimmed },
      { expectedVersion: version },
    )
    return { id: row.id, version: row.version, data: row.data }
  }

  /** Adds one asset id to a folder (idempotent), under the read version. */
  public async addAsset(id: string, version: number, assetId: string): Promise<AssetFolderRow> {
    const current = await this.get(id)
    if (current.data.assetIds.includes(assetId)) return current
    const row = await this.entities.update<AssetFolderRecord>(
      ASSET_FOLDER_TYPE,
      id,
      { assetIds: [...current.data.assetIds, assetId] },
      { expectedVersion: version },
    )
    return { id: row.id, version: row.version, data: row.data }
  }

  public async remove(id: string): Promise<void> {
    await this.entities.delete(ASSET_FOLDER_TYPE, id)
  }

  private async get(id: string): Promise<AssetFolderRow> {
    const row = await this.entities.get<JsonValue>(ASSET_FOLDER_TYPE, id)
    return { id: row.id, version: row.version, data: parseAssetFolderRecord(row.data) }
  }
}
