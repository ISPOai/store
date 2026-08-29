// Composition service — durable scene documents over the `video.composition`
// entity type. Documents are migrated to the current schema version once at
// this ingress, and saves are optimistic on two axes: the caller-supplied
// expected revision (the app-level document revision) and the entity row
// version, so a store that moved on since the read rejects the save instead
// of being overwritten.
import {
  DomainParseError,
  parseCompositionRecord,
  type AuthoredNode,
  type WritableAuthoredProps,
  type CompositionDocument,
  type CompositionRecord,
  type JsonValue,
} from './schema.ts'
import { isCompositionPayload, migrateCompositionDocument } from './migrations.ts'
import type { EntitiesPort } from '../sdk-port.ts'

export const COMPOSITION_TYPE = 'video.composition'

export interface CompositionRow {
  readonly id: string
  readonly version: number
  readonly data: CompositionRecord
}

/**
 * Parses one stored `video.composition` row: the document is migrated to the
 * current schema version once here, then the whole record (title, revision,
 * migrated document) is validated by the closed schema.
 */
export function parseCompositionRow(raw: JsonValue): CompositionRecord {
  if (!isCompositionPayload(raw)) throw new DomainParseError('video.composition must be an object')
  const migrated = migrateCompositionDocument(raw['document'])
  return parseCompositionRecord({ ...raw, document: migrated.raw })
}

export function emptyCompositionDocument(width: number, height: number): CompositionDocument {
  return {
    schemaVersion: 1,
    stage: { width, height, background: '#161616' },
    scenes: [],
  }
}

export interface ClipTimingPatch {
  /** Scene/child indices addressing one clip; empty addresses nothing. */
  readonly path: readonly number[]
  readonly start?: number
  readonly end?: number
}

/**
 * Applies timing patches to a composition document, returning a new
 * document. Unaddressed paths are skipped; nothing is mutated.
 */
export function patchClipTimings(
  document: CompositionDocument,
  patches: readonly ClipTimingPatch[],
): CompositionDocument {
  const scenes = document.scenes.map((scene, index) => patchNode(scene, patches, [index]))
  return { ...document, scenes }
}

function patchNode(
  node: AuthoredNode,
  patches: readonly ClipTimingPatch[],
  path: readonly number[],
): AuthoredNode {
  const hit = patches.find((patch) => samePath(patch.path, path))
  if (hit === undefined) {
    const children = node.children.map((child, index) => patchNode(child, patches, [...path, index]))
    return { ...node, children }
  }
  const props: WritableAuthoredProps = { ...node.props }
  if (hit.start !== undefined) props['start'] = Math.max(0, hit.start)
  if (hit.end !== undefined) props['end'] = Math.max(0, hit.end)
  const children = node.children.map((child, index) => patchNode(child, patches, [...path, index]))
  return { ...node, props, children }
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export class CompositionService {
  private readonly entities: EntitiesPort

  public constructor(entities: EntitiesPort) {
    this.entities = entities
  }

  public async create(title: string, document: CompositionDocument): Promise<CompositionRow> {
    if (title.trim() === '') throw new DomainParseError('a composition title cannot be empty')
    const data: CompositionRecord = { title: title.trim(), revision: 0, document }
    const row = await this.entities.create<CompositionRecord>(COMPOSITION_TYPE, data)
    return { id: row.id, version: row.version, data }
  }

  public async load(id: string): Promise<CompositionRow> {
    const row = await this.entities.get<JsonValue>(COMPOSITION_TYPE, id)
    return { id: row.id, version: row.version, data: parseCompositionRow(row.data) }
  }

  /**
   * Persists `document`. `expectedRevision` is the revision the editor last
   * read; the update writes `expectedRevision + 1`. When `expectedRowVersion`
   * is supplied it also rides the entity store's own optimistic-version
   * check, so a row that changed under any other writer rejects the save.
   */
  public async save(
    id: string,
    expectedRevision: number,
    document: CompositionDocument,
    options?: { expectedRowVersion?: number },
  ): Promise<CompositionRow> {
    const row = await this.entities.update<CompositionRecord>(
      COMPOSITION_TYPE,
      id,
      { document, revision: expectedRevision + 1 },
      options?.expectedRowVersion === undefined ? undefined : { expectedVersion: options.expectedRowVersion },
    )
    return { id: row.id, version: row.version, data: row.data }
  }

  public async rename(id: string, title: string): Promise<CompositionRow> {
    if (title.trim() === '') throw new DomainParseError('a composition title cannot be empty')
    const row = await this.entities.update<CompositionRecord>(COMPOSITION_TYPE, id, { title: title.trim() })
    return { id: row.id, version: row.version, data: row.data }
  }

  public async remove(id: string): Promise<void> {
    await this.entities.delete(COMPOSITION_TYPE, id)
  }
}
