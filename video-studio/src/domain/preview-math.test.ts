import test from 'node:test'
import assert from 'node:assert/strict'
import { PREVIEW_MAX_WIDTH, previewFrameAt, previewSize } from './preview-math.ts'

test('frames snap like the playhead: rounded, never negative', () => {
  assert.equal(previewFrameAt(30, 1.016), 30)
  assert.equal(previewFrameAt(30, 0), 0)
  assert.equal(previewFrameAt(30, -4), 0)
  assert.equal(previewFrameAt(24, 2.5), 60)
})

test('preview size never upscales and preserves aspect ratio', () => {
  assert.deepEqual(previewSize({ width: 1920, height: 1080 }, PREVIEW_MAX_WIDTH), { width: 640, height: 360 })
  assert.deepEqual(previewSize({ width: 320, height: 240 }, PREVIEW_MAX_WIDTH), { width: 320, height: 240 })
  assert.deepEqual(previewSize({ width: 4096, height: 2160 }, 512), { width: 512, height: 270 })
})

test('degenerate stages still produce a drawable surface', () => {
  const size = previewSize({ width: 0, height: 0 }, PREVIEW_MAX_WIDTH)
  assert.ok(size.width >= 1)
  assert.ok(size.height >= 1)
})
