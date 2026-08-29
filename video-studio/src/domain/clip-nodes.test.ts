import test from 'node:test'
import assert from 'node:assert/strict'
import {
  audioClipNode,
  clipNameForAsset,
  clipNodeForAsset,
  imageClipNode,
  insertClipIntoDocument,
  sceneNode,
  textClipNode,
  videoClipNode,
} from './clip-nodes.ts'
import { emptyCompositionDocument } from './compositions.ts'
import { parseCompositionDocument } from './schema.ts'

const STAGE = { width: 1920, height: 1080, background: '#161616' }

test('clip builders spell closed authored nodes', () => {
  const scene = sceneNode({ name: 'Scene 1', width: 1920, height: 1080 })
  assert.equal(scene.tag, 'scene')
  assert.equal(scene.props['width'], 1920)
  const video = videoClipNode({ name: 'v', src: 'assets://a', width: 640, height: 360, start: 2 })
  assert.equal(video.tag, 'video')
  assert.equal(video.props['src'], 'assets://a')
  assert.equal(video.props['start'], 2)
  const image = imageClipNode({ name: 'i', src: 'assets://b', width: 10, height: 10, start: 0 })
  assert.equal(image.tag, 'image')
  const audio = audioClipNode({ name: 'a', src: 'assets://c', start: 1 })
  assert.equal(audio.tag, 'audio')
  const text = textClipNode({ name: 't', x: 0, y: 0, fontSize: 48, color: '#FFFFFF', text: 'Hi', start: 0 })
  assert.equal(text.tag, 'text')
  assert.equal(text.text, 'Hi')
})

test('clipNameForAsset strips only the final extension', () => {
  assert.equal(clipNameForAsset('clip.mp4'), 'clip')
  assert.equal(clipNameForAsset('archive.tar.gz'), 'archive.tar')
  assert.equal(clipNameForAsset('.hidden'), '.hidden')
})

test('clipNodeForAsset sizes media from the probe, falling back to the stage', () => {
  const video = clipNodeForAsset(
    { kind: 'video', name: 'clip.mp4', url: 'assets://a' },
    STAGE,
    3,
    { width: 640, height: 360 },
  )
  assert.ok(video)
  assert.equal(video.tag, 'video')
  assert.equal(video.props['width'], 640)
  assert.equal(video.props['start'], 3)

  const unprobed = clipNodeForAsset({ kind: 'image', name: 'x.png', url: 'assets://b' }, STAGE, 0)
  assert.ok(unprobed)
  assert.equal(unprobed.props['width'], STAGE.width)

  const audio = clipNodeForAsset({ kind: 'audio', name: 's.wav', url: 'assets://c' }, STAGE, -5)
  assert.ok(audio)
  assert.equal(audio.props['start'], 0)

  assert.equal(clipNodeForAsset({ kind: 'other', name: 'x.txt', url: 'assets://d' }, STAGE, 0), null)
})

test('insertClipIntoDocument creates the first scene when the document has none', () => {
  const empty = emptyCompositionDocument(1280, 720)
  const clip = clipNodeForAsset({ kind: 'audio', name: 's.wav', url: 'assets://c' }, empty.stage, 0)
  assert.ok(clip)
  const { document, clipPath } = insertClipIntoDocument(empty, clip)
  assert.deepEqual(clipPath, [0, 0])
  assert.equal(document.scenes.length, 1)
  assert.equal(document.scenes[0]?.tag, 'scene')
  assert.equal(document.scenes[0]?.children.length, 1)
  // The input document is untouched.
  assert.equal(empty.scenes.length, 0)
})

test('insertClipIntoDocument appends to the existing first scene', () => {
  const base = parseCompositionDocument({
    schemaVersion: 1,
    stage: { width: 1920, height: 1080 },
    scenes: [
      {
        tag: 'scene',
        props: { name: 'Scene 1', x: -960, y: -540, width: 1920, height: 1080, fill: '#000000' },
        children: [
          { tag: 'audio', props: { src: 'assets://b', start: 0, end: 2 }, children: [] },
        ],
      },
    ],
  })
  const clip = clipNodeForAsset({ kind: 'image', name: 'x.png', url: 'assets://z' }, base.stage, 1)
  assert.ok(clip)
  const { document, clipPath } = insertClipIntoDocument(base, clip)
  assert.deepEqual(clipPath, [0, 1])
  assert.equal(document.scenes[0]?.children.length, 2)
  assert.equal(document.scenes[0]?.children[1]?.tag, 'image')
  // Second scenes are never the insert target.
  assert.equal(base.scenes[0]?.children.length, 1)
})
