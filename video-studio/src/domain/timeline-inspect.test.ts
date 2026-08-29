import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectTimeline, resolveNode } from './timeline-inspect.ts'
import { parseCompositionDocument } from './schema.ts'

function doc() {
  return parseCompositionDocument({
    schemaVersion: 1,
    stage: { width: 1920, height: 1080 },
    scenes: [
      {
        tag: 'scene',
        props: { name: 'Scene 1', x: -960, y: -540, width: 1920, height: 1080, fill: '#000000' },
        children: [
          { tag: 'video', props: { src: 'assets://a', x: 0, y: 0, width: 100, height: 100, start: 0, end: 4 }, children: [] },
          {
            tag: 'group',
            props: { x: 0, y: 0 },
            children: [
              { tag: 'text', props: { x: 0, y: 0, fontSize: 12, color: '#fff', start: 1 }, text: 'Hi', children: [] },
            ],
          },
        ],
      },
    ],
  })
}

test('inspect flattens scenes and children with stable paths', () => {
  const rows = inspectTimeline(doc())
  assert.deepEqual(
    rows.map((row) => row.path),
    [[0], [0, 0], [0, 1], [0, 1, 0]],
  )
  assert.deepEqual(
    rows.map((row) => row.tag),
    ['scene', 'video', 'group', 'text'],
  )
})

test('inspect reports timing when authored and null otherwise', () => {
  const rows = inspectTimeline(doc())
  assert.equal(rows[1]?.start, 0)
  assert.equal(rows[1]?.end, 4)
  assert.equal(rows[2]?.start, null)
  assert.equal(rows[3]?.name, null)
})

test('resolve walks the same addressing as inspect', () => {
  const parsed = doc()
  const found = resolveNode(parsed.scenes, [0, 1, 0])
  assert.equal(found?.node.tag, 'text')
  const empty = resolveNode(parsed.scenes, [])
  assert.equal(empty, null)
  assert.equal(resolveNode(parsed.scenes, [0, 9]), null)
})
