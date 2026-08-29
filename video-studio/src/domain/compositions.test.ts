import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyCompositionDocument, patchClipTimings } from './compositions.ts'
import { parseCompositionDocument } from './schema.ts'

function docWithClips() {
  return parseCompositionDocument({
    schemaVersion: 1,
    stage: { width: 1920, height: 1080 },
    scenes: [
      {
        tag: 'scene',
        props: { name: 'Scene 1', x: -960, y: -540, width: 1920, height: 1080, fill: '#000000' },
        children: [
          { tag: 'video', props: { src: 'assets://a', x: 0, y: 0, width: 100, height: 100, start: 0, end: 4 }, children: [] },
          { tag: 'audio', props: { src: 'assets://b', start: 4, end: 8 }, children: [] },
        ],
      },
    ],
  })
}

test('an empty document carries the stage and no scenes', () => {
  const doc = emptyCompositionDocument(1280, 720)
  assert.equal(doc.stage.width, 1280)
  assert.equal(doc.stage.height, 720)
  assert.equal(doc.scenes.length, 0)
})

test('a timing patch rewrites the addressed clip only', () => {
  const doc = docWithClips()
  const next = patchClipTimings(doc, [{ path: [0, 1], start: 5, end: 9 }])
  const audio = next.scenes[0]?.children[1]
  const video = next.scenes[0]?.children[0]
  if (!audio || !video) throw new Error('expected two clips')
  assert.equal(audio.props['start'], 5)
  assert.equal(audio.props['end'], 9)
  assert.equal(video.props['start'], 0)
  assert.equal(video.props['end'], 4)
})

test('patching does not mutate the source document', () => {
  const doc = docWithClips()
  patchClipTimings(doc, [{ path: [0, 0], start: 100 }])
  assert.equal(doc.scenes[0]?.children[0]?.props['start'], 0)
})

test('unaddressed paths are skipped without error', () => {
  const doc = docWithClips()
  const next = patchClipTimings(doc, [{ path: [9, 9], start: 1 }, { path: [], start: 1 }])
  assert.deepEqual(next.scenes[0]?.children[0]?.props['start'], 0)
})

test('negative timings clamp to zero', () => {
  const doc = docWithClips()
  const next = patchClipTimings(doc, [{ path: [0, 0], start: -5 }])
  assert.equal(next.scenes[0]?.children[0]?.props['start'], 0)
})

test('single-edge patches keep the other edge', () => {
  const doc = docWithClips()
  const next = patchClipTimings(doc, [{ path: [0, 0], end: 12 }])
  assert.equal(next.scenes[0]?.children[0]?.props['end'], 12)
  assert.equal(next.scenes[0]?.children[0]?.props['start'], 0)
})
