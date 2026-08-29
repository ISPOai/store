// Export job service — durable `video.export-job` records tracking one
// local-browser export from request to a Files destination.
import { parseExportJobRecord, type ExportFormat, type ExportJobRecord, type JsonValue } from './schema.ts'
import type { EntitiesPort } from '../sdk-port.ts'

export const EXPORT_JOB_TYPE = 'video.export-job'

export interface ExportJobRow {
  readonly id: string
  readonly version: number
  readonly data: ExportJobRecord
}

export interface ExportJobResultInput {
  /**
   * The Files library path for Files-destination exports, or null when the
   * bytes went off-platform through the OS save dialog (which never exposes
   * an OS path back).
   */
  readonly path: string | null
  /** The Files entity id when the destination is Files; null otherwise. */
  readonly publicId: string | null
}

export class ExportJobService {
  private readonly entities: EntitiesPort

  public constructor(entities: EntitiesPort) {
    this.entities = entities
  }

  public async create(compositionId: string, format: ExportFormat): Promise<ExportJobRow> {
    const data: ExportJobRecord = {
      format,
      state: 'pending',
      progress: 0,
      compositionId,
      resultPath: null,
      resultPublicId: null,
      error: null,
    }
    const row = await this.entities.create(EXPORT_JOB_TYPE, data)
    return { id: row.id, version: row.version, data }
  }

  public async markRunning(id: string): Promise<ExportJobRow> {
    const row = await this.entities.update<ExportJobRecord>(EXPORT_JOB_TYPE, id, {
      state: 'running',
      progress: 0,
    })
    return { id: row.id, version: row.version, data: row.data }
  }

  public async markProgress(id: string, progress: number): Promise<void> {
    const clamped = Math.min(1, Math.max(0, progress))
    await this.entities.update<ExportJobRecord>(EXPORT_JOB_TYPE, id, { progress: clamped })
  }

  public async markSucceeded(id: string, result: ExportJobResultInput): Promise<ExportJobRow> {
    const row = await this.entities.update<ExportJobRecord>(EXPORT_JOB_TYPE, id, {
      state: 'succeeded',
      progress: 1,
      resultPath: result.path,
      resultPublicId: result.publicId,
      error: null,
    })
    return { id: row.id, version: row.version, data: row.data }
  }

  public async markFailed(id: string, error: string): Promise<ExportJobRow> {
    const row = await this.entities.update<ExportJobRecord>(EXPORT_JOB_TYPE, id, {
      state: 'failed',
      error: error.slice(0, 400),
    })
    return { id: row.id, version: row.version, data: row.data }
  }

  public async markCanceled(id: string): Promise<ExportJobRow> {
    const row = await this.entities.update<ExportJobRecord>(EXPORT_JOB_TYPE, id, {
      state: 'canceled',
    })
    return { id: row.id, version: row.version, data: row.data }
  }
}
