// Project service — named, versioned persistence over the `video.project`
// entity type. Every row read back from the store is parsed at this
// boundary; the rest of the app only ever sees the domain type.
import { DomainParseError, parseProjectRecord, type JsonValue, type ProjectRecord } from './schema.ts'
import type { EntitiesPort, EntityRow } from '../sdk-port.ts'

export const PROJECT_TYPE = 'video.project'

export interface ProjectRow {
  readonly id: string
  readonly version: number
  readonly data: ProjectRecord
}

export class ProjectService {
  private readonly entities: EntitiesPort

  public constructor(entities: EntitiesPort) {
    this.entities = entities
  }

  public async list(): Promise<ProjectRow[]> {
    const page = await this.entities.query<JsonValue>(PROJECT_TYPE, {
      orderBy: { field: 'order', direction: 'desc' },
      limit: 200,
    })
    return page.records.flatMap((row) => {
      try {
        return [{ id: row.id, version: row.version, data: parseProjectRecord(row.data) }]
      } catch (error) {
        if (error instanceof DomainParseError) return []
        throw error
      }
    })
  }

  /** The project whose active composition is `compositionId`, if any. */
  public async findByComposition(compositionId: string): Promise<ProjectRow | null> {
    const page = await this.entities.query<JsonValue>(PROJECT_TYPE, {
      where: { activeCompositionId: { eq: compositionId } },
      limit: 5,
    })
    for (const row of page.records) {
      try {
        const data = parseProjectRecord(row.data)
        if (data.activeCompositionId === compositionId) return { id: row.id, version: row.version, data }
      } catch {
        // Skip rows that do not parse; a malformed project must not hide a
        // well-formed one behind it.
      }
    }
    const listed = await this.list()
    return listed.find((row) => row.data.activeCompositionId === compositionId) ?? null
  }

  public async create(input: { title: string; width: number; height: number; fps: number }): Promise<ProjectRow> {
    if (input.title.trim() === '') throw new DomainParseError('a project title cannot be empty')
    const data: ProjectRecord = {
      title: input.title.trim(),
      width: input.width,
      height: input.height,
      fps: input.fps,
      order: Date.now(),
      activeCompositionId: null,
    }
    const row = await this.entities.create<ProjectRecord>(PROJECT_TYPE, data)
    return { id: row.id, version: row.version, data }
  }

  public async setActiveComposition(id: string, version: number, compositionId: string | null): Promise<ProjectRow> {
    const row = await this.entities.update<ProjectRecord>(
      PROJECT_TYPE,
      id,
      { activeCompositionId: compositionId },
      { expectedVersion: version },
    )
    return { id: row.id, version: row.version, data: row.data }
  }

  public async rename(id: string, version: number, title: string): Promise<ProjectRow> {
    if (title.trim() === '') throw new DomainParseError('a project title cannot be empty')
    const row = await this.entities.update<ProjectRecord>(
      PROJECT_TYPE,
      id,
      { title: title.trim() },
      { expectedVersion: version },
    )
    return { id: row.id, version: row.version, data: row.data }
  }

  public async remove(id: string): Promise<void> {
    await this.entities.delete(PROJECT_TYPE, id)
  }
}

export type { EntityRow }
