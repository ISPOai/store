import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DomainParseError,
  assetKindForMime,
  numericPropBounds,
  parseAssetFolderRecord,
  parseAssetRecord,
  parseCompositionDocument,
  parseCompositionRecord,
  parseExportJobRecord,
  parseProjectRecord,
  type JsonValue,
} from './schema.ts'

/** A test-authored node, kept as an alias so it stays payload-shaped. */
type TestNode = {
  tag: string
  props: Record<string, JsonValue>
  text?: string
  children: TestNode[]
}

function validScene(): TestNode {
  return {
    tag: 'scene',
    props: { name: 'Scene 1', x: -960, y: -540, width: 1920, height: 1080, fill: '#000000' },
    children: [],
  }
}

test('a minimal composition document parses', () => {
  const doc = parseCompositionDocument({
    schemaVersion: 1,
    stage: { width: 1920, height: 1080 },
    scenes: [validScene()],
  })
  assert.equal(doc.schemaVersion, 1)
  assert.equal(doc.stage.width, 1920)
  assert.equal(doc.scenes.length, 1)
  assert.equal(doc.stage.background, '#161616')
})

test('a clip with timing parses and defaults are stamped', () => {
  const scene = validScene()
  scene.children.push({
    tag: 'video',
    props: { src: 'assets://asset_abc', x: 0, y: 0, width: 1920, height: 1080, start: 2, end: 6 },
    children: [],
  })
  const doc = parseCompositionDocument({ schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [scene] })
  const clip = doc.scenes[0]?.children[0]
  assert.ok(clip)
  assert.equal(clip?.tag, 'video')
  assert.equal(clip?.props['start'], 2)
  assert.equal(clip?.props['end'], 6)
})

test('unknown tags are rejected', () => {
  assert.throws(
    () => parseCompositionDocument({ schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [{ tag: 'shader', props: {}, children: [] }] }),
    DomainParseError,
  )
})

test('unknown props are rejected', () => {
  const scene = validScene()
  scene.props['malicious'] = 'x'
  assert.throws(
    () => parseCompositionDocument({ schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [scene] }),
    DomainParseError,
  )
})

test('function and null prop values are rejected', () => {
  const scene = validScene()
  scene.props['width'] = null
  assert.throws(
    () => parseCompositionDocument({ schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [scene] }),
    DomainParseError,
  )
})

test('out-of-range numbers are rejected', () => {
  const scene = validScene()
  scene.props['width'] = 99999
  assert.throws(
    () => parseCompositionDocument({ schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [scene] }),
    DomainParseError,
  )
})

test('numeric prop bounds mirror the parser vocabulary', () => {
  assert.deepEqual(numericPropBounds('rect', 'width'), { min: 0, max: 7680 })
  assert.deepEqual(numericPropBounds('scene', 'width'), { min: 16, max: 7680 })
  // Timing props resolve on clip tags through the same fallback the parser uses.
  assert.deepEqual(numericPropBounds('video', 'start'), { min: 0, max: 43200 })
  assert.deepEqual(numericPropBounds('audio', 'volume'), { min: -60, max: 6 })
  // Non-clip tags never carry timing props, unknown tags and non-numeric
  // props resolve to null, and the clip-only vocabulary is honored per tag.
  assert.equal(numericPropBounds('scene', 'start'), null)
  assert.equal(numericPropBounds('other', 'x'), null)
  assert.equal(numericPropBounds('rect', 'fill'), null)
  assert.equal(numericPropBounds('group', 'width'), null)
  assert.equal(numericPropBounds('nope', 'x'), null)
})

test('values clamped to the numeric bounds always parse back', () => {
  const scene = validScene()
  const bounds = numericPropBounds('scene', 'width')
  assert.notEqual(bounds, null)
  if (bounds === null) return
  for (const typed of [-1e9, bounds.min, bounds.max, 1e9]) {
    const clamped = Math.min(bounds.max, Math.max(bounds.min, typed))
    scene.props['width'] = clamped
    const parsed = parseCompositionDocument({
      schemaVersion: 1,
      stage: { width: 1920, height: 1080 },
      scenes: [scene],
    })
    assert.equal(parsed.scenes[0]?.props['width'], clamped)
  }
  // The unclamped extremes themselves stay outside the vocabulary.
  scene.props['width'] = 1e9
  assert.throws(
    () => parseCompositionDocument({ schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [scene] }),
    DomainParseError,
  )
})

test('unsupported schema versions are rejected', () => {
  assert.throws(
    () => parseCompositionDocument({ schemaVersion: 2, stage: { width: 1920, height: 1080 }, scenes: [] }),
    DomainParseError,
  )
})

test('deep nesting beyond the limit is rejected', () => {
  let node: TestNode = {
    tag: 'group',
    props: { x: 0, y: 0 },
    children: [],
  }
  for (let i = 0; i < 30; i += 1) {
    const parent: TestNode = { tag: 'group', props: { x: 0, y: 0 }, children: [node] }
    node = parent
  }
  assert.throws(
    () => parseCompositionDocument({ schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [node] }),
    DomainParseError,
  )
})

test('text is only valid on text elements', () => {
  const scene = validScene()
  scene.children.push({ tag: 'rect', props: { x: 0, y: 0, width: 10, height: 10 }, text: 'hi', children: [] })
  assert.throws(
    () => parseCompositionDocument({ schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [scene] }),
    DomainParseError,
  )
})

test('a required prop missing from a clip is rejected', () => {
  const scene = validScene()
  scene.children.push({ tag: 'audio', props: {}, children: [] })
  assert.throws(
    () => parseCompositionDocument({ schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [scene] }),
    DomainParseError,
  )
})

test('project rows parse and null composition ids survive', () => {
  const row = parseProjectRecord({
    title: 'One',
    width: 1280,
    height: 720,
    fps: 24,
    order: 5,
    activeCompositionId: null,
  })
  assert.equal(row.activeCompositionId, null)
  assert.equal(row.fps, 24)
  assert.throws(() => parseProjectRecord({ title: '', width: 1280, height: 720, fps: 24, order: 5 }), DomainParseError)
})

test('composition records parse their inner document', () => {
  const row = parseCompositionRecord({
    title: 'Draft',
    revision: 3,
    document: { schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [validScene()] },
  })
  assert.equal(row.revision, 3)
  assert.equal(row.document.scenes.length, 1)
  assert.throws(() => parseCompositionRecord({ title: 'x', revision: -1, document: { schemaVersion: 1, stage: { width: 1920, height: 1080 }, scenes: [] } }), DomainParseError)
})

test('asset rows parse and classify kinds by mime', () => {
  const row = parseAssetRecord({ name: 'a.mp4', mimeType: 'video/mp4', kind: 'video', url: 'assets://asset_1', sizeBytes: 10 })
  assert.equal(row.kind, 'video')
  assert.equal(assetKindForMime('audio/ogg'), 'audio')
  assert.equal(assetKindForMime('image/png'), 'image')
  assert.equal(assetKindForMime('text/plain'), 'other')
  assert.throws(() => parseAssetRecord({ name: 'a', mimeType: 'video/mp4', kind: 'fonts', url: 'assets://x' }), DomainParseError)
})

test('export job rows parse state and clamp fields', () => {
  const row = parseExportJobRecord({ format: 'webm', state: 'running', progress: 0.5, compositionId: 'c1' })
  assert.equal(row.format, 'webm')
  assert.equal(row.state, 'running')
  assert.equal(row.resultPath, null)
  assert.throws(() => parseExportJobRecord({ format: 'mov', state: 'running', progress: 0.5, compositionId: 'c1' }), DomainParseError)
  assert.throws(() => parseExportJobRecord({ format: 'mp4', state: 'exploded', progress: 0.5, compositionId: 'c1' }), DomainParseError)
})

test('asset folder rows parse name, order, and bounded membership lists', () => {
  const row = parseAssetFolderRecord({ name: 'B-roll', order: 12, assetIds: ['a1', 'a2'] })
  assert.equal(row.name, 'B-roll')
  assert.equal(row.order, 12)
  assert.deepEqual(row.assetIds, ['a1', 'a2'])
  assert.throws(() => parseAssetFolderRecord({ name: '', order: 1, assetIds: [] }), DomainParseError)
  assert.throws(() => parseAssetFolderRecord({ name: 'x', order: -1, assetIds: [] }), DomainParseError)
  assert.throws(() => parseAssetFolderRecord({ name: 'x', order: 1, assetIds: 'a1' }), DomainParseError)
  assert.throws(
    () => parseAssetFolderRecord({ name: 'x', order: 1, assetIds: ['', ''] }),
    DomainParseError,
  )
})

test('an asset folder cannot claim more than 500 members', () => {
  const assetIds = Array.from({ length: 501 }, () => 'a')
  assert.throws(
    () => parseAssetFolderRecord({ name: 'x', order: 1, assetIds }),
    /exceeds 500/,
  )
})
