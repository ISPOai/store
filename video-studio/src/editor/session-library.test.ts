import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionLibrary } from './session-library.ts'

test('the session library resolves a host-controlled asset through its fetch port', async () => {
  const reference = 'assets://asset_0123456789abcdef0123456789abcdef'
  const fetched: string[] = []
  const library = createSessionLibrary((source) => {
    fetched.push(source)
    return Promise.resolve(new File(['{}'], 'captions.json', { type: 'application/json' }))
  })

  const asset = await library.resolve(reference)

  assert.equal(asset.type, 'TRANSCRIPT')
  assert.deepEqual(fetched, [reference])
})
