// Explicit composition-document migrations, applied once at ingress.
//
// A document read back from durable state carries the schema version of the
// app revision that wrote it. When a future app revision raises
// COMPOSITION_DOCUMENT_VERSION, older documents are upgraded step by step
// through the table below before validation; documents from a NEWER revision
// are rejected rather than guessed at. The table is currently empty — version
// 1 is the only shipped version — so the pipeline is pure pass-through today;
// it exists so the next widening is an additive table entry, not a new
// boundary path.
import {
  DomainParseError,
  isJsonNumber,
  parseCompositionDocument,
  type CompositionDocument,
  type EntityPayload,
} from './schema.ts'

export const COMPOSITION_DOCUMENT_VERSION = 1

/** The object carrier every composition payload moves through this module as. */
export type CompositionPayload = { readonly [key: string]: EntityPayload }

export interface CompositionMigrationStep {
  /** The document version this step upgrades FROM (it writes `from + 1`). */
  readonly from: number
  /** Pure transform over the pre-validation payload. */
  readonly apply: (payload: CompositionPayload) => CompositionPayload
}

/** Ordered upgrades; step N-1 must exist before any step N can run. */
export const COMPOSITION_MIGRATIONS: readonly CompositionMigrationStep[] = []

/** An object payload is proved by identity, narrowing for property reads. */
export function isCompositionPayload(value: EntityPayload): value is CompositionPayload {
  return value !== undefined && value !== null && Object(value) === value && !Array.isArray(value)
}

/** A positive integer proved by the schema's own number proof plus range. */
function isPositiveInteger(value: EntityPayload): value is number {
  return isJsonNumber(value) && Number.isInteger(value) && value >= 1
}

export interface MigratedComposition {
  /** The migrated, still-unvalidated payload (ready to re-parse). */
  readonly raw: CompositionPayload
  /** The migrated payload validated into the closed domain document. */
  readonly document: CompositionDocument
}

/**
 * Runs the migration pipeline over an arbitrary composition payload, then
 * validates the result against the closed document schema. Throws
 * DomainParseError for unknown/newer versions, a missing step, or a payload
 * that still does not parse after migration.
 */
export function migrateCompositionDocument(
  raw: EntityPayload,
  currentVersion: number = COMPOSITION_DOCUMENT_VERSION,
  steps: readonly CompositionMigrationStep[] = COMPOSITION_MIGRATIONS,
): MigratedComposition {
  if (!isCompositionPayload(raw)) {
    throw new DomainParseError('composition document must be an object')
  }
  const declared = declaredVersion(raw)
  if (declared > currentVersion) {
    throw new DomainParseError(
      `composition document schema version ${declared} is newer than this app supports (${currentVersion})`,
    )
  }
  const migrated = runMigrationSteps(steps, raw, declared, currentVersion)
  return { raw: migrated, document: parseCompositionDocument(migrated) }
}

/**
 * The step pipeline, exported for its own tests: applies each step whose
 * `from` is at or above the declared version, in order, until the payload
 * reaches `toVersion`. A gap in the table is an error, never a skipped
 * version.
 */
export function runMigrationSteps(
  steps: readonly CompositionMigrationStep[],
  payload: CompositionPayload,
  fromVersion: number,
  toVersion: number,
): CompositionPayload {
  let current: CompositionPayload = payload
  let version = fromVersion
  while (version < toVersion) {
    const step = steps.find((candidate) => candidate.from === version)
    if (step === undefined) {
      throw new DomainParseError(
        `no migration step upgrades composition document schema version ${version}`,
      )
    }
    current = step.apply(current)
    if (!isCompositionPayload(current)) {
      throw new DomainParseError(`the migration from version ${version} produced a non-object document`)
    }
    version += 1
  }
  if (declaredVersion(current) !== toVersion) {
    throw new DomainParseError(
      `the migration pipeline must stamp schema version ${toVersion}`,
    )
  }
  return current
}

function declaredVersion(payload: CompositionPayload): number {
  const declared = payload['schemaVersion']
  if (isPositiveInteger(declared)) return declared
  throw new DomainParseError('composition document schemaVersion must be a positive integer')
}
