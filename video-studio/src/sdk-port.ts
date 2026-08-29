// The narrow structural port this app consumes of the framework-free
// `@ispo/sdk` core. Domain services take this interface instead of the SDK
// module so the durable-state logic is drivable and testable without a host,
// while `main.tsx` binds the real SDK (the port is a structural subset —
// no re-implementation, no second protocol).
import type { EntityApi, EntityQuery, PowerboxItemKind, PowerboxPickResult } from '@ispo/sdk'
import type { AssetKind, CompositionRecord, ExportJobRecord, ProjectRecord } from './domain/schema.ts'

export interface EntityRow<T> {
  readonly id: string
  readonly data: T
  readonly version: number
}

export interface EntityPage<T> {
  readonly records: EntityRow<T>[]
  readonly cursor: string | null
}

export interface EntitiesPort {
  create<T>(type: string, data: T): Promise<EntityRow<T>>
  get<T>(type: string, id: string): Promise<EntityRow<T>>
  query<T>(type: string, query?: EntityQuery): Promise<EntityPage<T>>
  update<T>(
    type: string,
    id: string,
    patch: Partial<T>,
    options?: { expectedVersion?: number },
  ): Promise<EntityRow<T>>
  delete(type: string, id: string): Promise<EntityRow<unknown> | void>
}

export type PickKind = PowerboxItemKind

export interface PowerboxPick {
  readonly url?: string
  readonly name: string
  readonly mimeType: string
  readonly size: number
  readonly kind: PickKind
}

/** What a powerbox save hands back: where the file landed in Files. */
export interface FilesSaveResult {
  readonly path: string
  readonly publicId?: string
}

export interface FilesPort {
  pick(args?: { accept?: string[]; multiple?: boolean }): Promise<PowerboxPick | PowerboxPick[] | null>
  save(args: { content: string | Uint8Array; name?: string; accept?: string[] }): Promise<FilesSaveResult | null>
}

/** The OS save dialog port: explicit off-platform export, display names only. */
export interface DialogPort {
  saveAs(args: {
    data: Uint8Array
    defaultName: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<{ saved: boolean }>
}

export interface SdkPort {
  readonly entities: EntitiesPort
  readonly files: FilesPort
  readonly dialog: DialogPort
}

export type {
  AssetKind,
  CompositionRecord,
  EntityApi,
  EntityQuery,
  ExportJobRecord,
  PowerboxItemKind,
  PowerboxPickResult,
  ProjectRecord,
}
