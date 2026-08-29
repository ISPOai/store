import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPOSITION_DOCUMENT_VERSION,
  COMPOSITION_MIGRATIONS,
  isCompositionPayload,
  migrateCompositionDocument,
  runMigrationSteps,
  type CompositionMigrationStep,
} from './migrations.ts'
import { DomainParseError } from './schema.ts'
import { emptyCompositionDocument } from './compositions.ts'

function validV1Payload() {
  return {
    schemaVersion: 1,
    stage: { width: 1920, height: 1080, background: '#161616' },
    scenes: [],
  }
}

test('the shipped migration table is empty at version 1', () => {
  assert.equal(COMPOSITION_DOCUMENT_VERSION, 1)
  assert.deepEqual(COMPOSITION_MIGRATIONS, [])
})

test('a current-version document migrates as pure pass-through', () => {
  const payload = validV1Payload()
  const migrated = migrateCompositionDocument(payload)
  assert.deepEqual(migrated.document, emptyCompositionDocument(1920, 1080))
  assert.deepEqual(migrated.raw, payload)
  // The input payload object is not mutated.
  assert.deepEqual(payload, validV1Payload())
})

test('a document from a newer app revision is rejected, never downgraded', () => {
  const future = { ...validV1Payload(), schemaVersion: COMPOSITION_DOCUMENT_VERSION + 1 }
  assert.throws(() => migrateCompositionDocument(future), DomainParseError)
})

test('an older document with no registered step is an explicit error', () => {
  const older = { ...validV1Payload(), schemaVersion: 1 }
  const steps: readonly CompositionMigrationStep[] = []
  assert.throws(
    () => runMigrationSteps(steps, older, 1, 2),
    /no migration step upgrades composition document schema version 1/,
  )
})

test('registered steps run in order and must stamp the target version', () => {
  const calls: number[] = []
  const steps: readonly CompositionMigrationStep[] = [
    {
      from: 1,
      apply: (payload) => {
        calls.push(1)
        const stage = payload['stage']
        if (!isCompositionPayload(stage)) {
          throw new Error('test double expected a stage object')
        }
        return { ...payload, schemaVersion: 2, stage: { ...stage, background: '#0A0A0A' } }
      },
    },
    {
      from: 2,
      apply: (payload) => {
        calls.push(2)
        return { ...payload, schemaVersion: 3 }
      },
    },
  ]
  const migrated = runMigrationSteps(steps, { ...validV1Payload(), schemaVersion: 1 }, 1, 3)
  assert.deepEqual(calls, [1, 2])
  assert.deepEqual(migrated['schemaVersion'], 3)
  assert.deepEqual(migrated['stage'], { width: 1920, height: 1080, background: '#0A0A0A' })

  // A step that forgets to stamp the new version is rejected by the pipeline.
  const badSteps: readonly CompositionMigrationStep[] = [
    {
      from: 1,
      // Deliberately forgets to stamp the new version.
      apply: (payload) => ({ ...payload }),
    },
  ]
  assert.throws(
    () => runMigrationSteps(badSteps, validV1Payload(), 1, 2),
    /must stamp schema version/,
  )
})

test('a non-object payload is rejected at the version check', () => {
  assert.throws(() => migrateCompositionDocument('nope'), DomainParseError)
  assert.throws(() => migrateCompositionDocument({ stage: {} }), DomainParseError)
  assert.throws(() => migrateCompositionDocument({ ...validV1Payload(), schemaVersion: 0 }), DomainParseError)
})
