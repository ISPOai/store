import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAssistantBrief, safeBriefText } from './assistant-brief.ts'

test('the projects-screen brief carries no selection or stage', () => {
  const brief = buildAssistantBrief({
    screen: 'projects',
    projectTitle: null,
    stage: null,
    clipCount: 0,
    selectionLabel: null,
    saveStatus: 'idle',
    exportStatus: 'export idle',
  })
  assert.equal(brief.title, 'Video Studio')
  assert.equal(brief.summary, 'Browsing saved compositions')
  assert.deepEqual(brief.breadcrumbs, ['Video Studio'])
  assert.equal(brief.selection, undefined)
  assert.equal(brief.status, 'save idle · export idle')
})

test('the editor brief names the project, geometry, clip count, and selection', () => {
  const brief = buildAssistantBrief({
    screen: 'editor',
    projectTitle: 'Launch teaser',
    stage: { width: 1920, height: 1080, fps: 30 },
    clipCount: 3,
    selectionLabel: 'intro.mp4',
    saveStatus: 'saving',
    exportStatus: 'exporting 42%',
  })
  assert.ok(brief.summary?.includes('Launch teaser'))
  assert.ok(brief.summary?.includes('3 clips'))
  assert.deepEqual(brief.breadcrumbs, ['Video Studio', 'Launch teaser'])
  assert.equal(brief.selection, 'intro.mp4')
  assert.equal(brief.status, 'save saving · exporting 42%')
})

test('no URL, path, credential shape, or control character survives the brief', () => {
  const hostile = 'see https://evil.example/x?token=abc123 and assets://asset_1\nnext'
  const safe = safeBriefText(hostile)
  assert.ok(!safe.includes('https://'))
  assert.ok(!safe.includes('assets://'))
  assert.ok(!safe.includes('token='))
  assert.ok(!safe.includes('\n'))

  const brief = buildAssistantBrief({
    screen: 'editor',
    projectTitle: 'https://tracker.example/payload',
    stage: { width: 640, height: 360, fps: 24 },
    clipCount: 1,
    selectionLabel: 'file:///Users/name/secret.mov',
    saveStatus: 'saved',
    exportStatus: 'export saved to Files',
  })
  const serialized = JSON.stringify(brief)
  assert.ok(!serialized.includes('://'), `brief leaked a URL-shaped value: ${serialized}`)
  assert.ok(!serialized.includes('/Users'), `brief leaked a path: ${serialized}`)
})

test('every brief field is clamped to its budget', () => {
  const long = 'a'.repeat(500)
  const safe = safeBriefText(long)
  assert.equal(safe.length, 200)
  const brief = buildAssistantBrief({
    screen: 'editor',
    projectTitle: long,
    stage: { width: 1920, height: 1080, fps: 30 },
    clipCount: 2,
    selectionLabel: long,
    saveStatus: 'error',
    exportStatus: 'export failed',
  })
  assert.ok((brief.summary?.length ?? 0) <= 200)
  assert.ok((brief.selection?.length ?? 0) <= 80)
  assert.ok((brief.breadcrumbs?.[1]?.length ?? 0) <= 80)
})
