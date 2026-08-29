// Media asset service — durable `video.asset` records.
//
// Media bytes never enter this app's durable state: a powerbox pick hands
// over a host-minted controlled reference URL, the `video.asset` row stores
// exactly that opaque reference (plus display metadata), and the engine
// resolves the reference through the same host origin at decode time.
import {
  assetKindForMime,
  DomainParseError,
  parseAssetRecord,
  type AssetRecord,
  type JsonValue,
} from './schema.ts'
import type { EntitiesPort, FilesPort, PowerboxPick } from '../sdk-port.ts'

export const ASSET_TYPE = 'video.asset'

export interface AssetRow {
  readonly id: string
  readonly version: number
  readonly data: AssetRecord
}

export function isControlledMediaUrl(url: string): boolean {
  return url.startsWith('assets://') || url.startsWith('/') || url.startsWith('data:')
}

export class MediaAssetService {
  private readonly entities: EntitiesPort
  private readonly files: FilesPort

  public constructor(entities: EntitiesPort, files: FilesPort) {
    this.entities = entities
    this.files = files
  }

  /** Opens the powerbox for image/audio/video objects; `null` on cancel. */
  public async pickMedia(): Promise<PowerboxPick[] | null> {
    const picks = await this.files.pick({
      accept: ['image/', 'video/', 'audio/'],
      multiple: true,
    })
    if (picks === null) return null
    return Array.isArray(picks) ? picks : [picks]
  }

  /**
   * Takes one pick into durable state. The pick's URL is the durable
   * reference; nothing else about the pick is retained.
   */
  public async adopt(pick: PowerboxPick): Promise<AssetRow> {
    if (pick.url === undefined || !isControlledMediaUrl(pick.url)) {
      throw new DomainParseError('the picker returned no controlled media reference for this object')
    }
    const kind = assetKindForMime(pick.mimeType)
    const data = parseAssetRecord({
      name: pick.name,
      mimeType: pick.mimeType,
      kind,
      url: pick.url,
      sizeBytes: pick.size,
    })
    const row = await this.entities.create<AssetRecord>(ASSET_TYPE, data)
    return { id: row.id, version: row.version, data }
  }

  /** Lists persisted assets. */
  public async list(): Promise<AssetRow[]> {
    const page = await this.entities.query<JsonValue>(ASSET_TYPE, { limit: 500 })
    return page.records.flatMap((row) => {
      try {
        return [{ id: row.id, version: row.version, data: parseAssetRecord(row.data) }]
      } catch (error) {
        if (error instanceof DomainParseError) return []
        throw error
      }
    })
  }

  public async remove(id: string): Promise<void> {
    await this.entities.delete(ASSET_TYPE, id)
  }
}
