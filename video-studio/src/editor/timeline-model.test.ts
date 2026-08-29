import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLayout,
  clampMove,
  clampTrim,
  formatTimecode,
  kindFromTag,
  MIN_CLIP_SECONDS,
  secondsToPx,
  snapToFrame,
  type TimelineRow,
} from './timeline-model.ts'

function row(overrides: Partial<TimelineRow> = {}): TimelineRow {
  return {
    key: 1,
    name: 'Clip',
    kind: 'video',
    depth: 0,
    start: 2,
    end: 6,
    muted: false,
    ...overrides,
  }
}

test('layout duration spans scene rows with a floor of one second', () => {
  const layout = buildLayout([row({ kind: 'scene', start: 0, end: 12 })])
  assert.equal(layout.duration, 12)
  assert.equal(buildLayout([]).duration, 1)
})

test('pixel conversion round-trips', () => {
  assert.equal(secondsToPx(2, 90), 180)
  assert.equal(pxToSeconds(180, 90), 2)
})

function pxToSeconds(px: number, pxPerSecond: number): number {
  return px / pxPerSecond
}

test('moves clamp to the timeline floor', () => {
  const move = clampMove(row(), -10)
  assert.equal(move.start, 0)
})

test('moves cannot push a clip past its own end', () => {
  const move = clampMove(row(), 100)
  assert.ok(move.start <= 6 - MIN_CLIP_SECONDS + 1e-9)
})

test('trims keep a minimal clip length', () => {
  const start = clampTrim(row(), 'start', 5.99)
  assert.ok(start.end - start.start >= MIN_CLIP_SECONDS - 1e-9)
  const end = clampTrim(row(), 'end', 0)
  assert.ok(end.end - end.start >= MIN_CLIP_SECONDS - 1e-9)
  assert.ok(end.start >= 0)
})

test('snap rounds to whole frames', () => {
  assert.equal(snapToFrame(1.017, 30), 31 / 30)
  assert.equal(snapToFrame(1.9, 30), 57 / 30)
})

test('timecode formats minutes, seconds, and frames', () => {
  assert.equal(formatTimecode(0, 30), '00:00.00')
  assert.equal(formatTimecode(65.5, 30), '01:05.15')
  assert.equal(formatTimecode(-3, 30), '00:00.00')
})

test('kinds map from engine tags', () => {
  assert.equal(kindFromTag('scene'), 'scene')
  assert.equal(kindFromTag('solidPaint'), 'other')
  assert.equal(kindFromTag('#text'), 'other')
})
