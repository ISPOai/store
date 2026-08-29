import test from 'node:test'
import assert from 'node:assert/strict'
import {
  capabilityRows,
  playbackCapabilities,
  probeExportCapabilities,
  type ProbeEnv,
} from './probes.ts'

class FakeOfflineAudioContext {
  public readonly audioWorklet = { addModule: async (_url: string) => undefined }
}

class FakeConstructor {
  // PresentConstructor needs a constructible with no arguments.
}

const SUPPORTS_EVERYTHING: ProbeEnv = {
  SharedArrayBuffer: FakeConstructor,
  VideoEncoder: { isConfigSupported: async () => ({ supported: true }) },
  AudioEncoder: { isConfigSupported: async () => ({ supported: true }) },
  VideoDecoder: FakeConstructor,
  AudioDecoder: FakeConstructor,
  OfflineAudioContext: FakeOfflineAudioContext,
  AudioContext: FakeConstructor,
}

/** A fresh fully-supporting env each call, so override spreads stay local. */
function env(): ProbeEnv {
  return { ...SUPPORTS_EVERYTHING }
}

const fakeCanvas = () => ({ getContext: () => ({}) })

test('a full capability set reports export supported with no blocker', async () => {
  const caps = await probeExportCapabilities(env(), fakeCanvas)
  assert.equal(caps.supported, true)
  assert.equal(caps.blocker, null)
  assert.equal(caps.videoEncoder, true)
})

test('missing shared array buffer reports the isolation blocker', async () => {
  const caps = await probeExportCapabilities({ ...env(), SharedArrayBuffer: undefined }, fakeCanvas)
  assert.equal(caps.supported, false)
  assert.ok(caps.blocker?.includes('cross-origin isolated'))
})

test('missing video encoding reports an encoder blocker', async () => {
  const caps = await probeExportCapabilities({ ...env(), VideoEncoder: undefined }, fakeCanvas)
  assert.equal(caps.supported, false)
  assert.ok(caps.blocker?.includes('encode video'))
})

test('an encoder that declines the probe config is unsupported', async () => {
  const caps = await probeExportCapabilities(
    { ...env(), VideoEncoder: { isConfigSupported: async () => ({ supported: false }) } },
    fakeCanvas,
  )
  assert.equal(caps.videoEncoder, false)
})

test('capability rows are truthful one-to-one probes', async () => {
  const caps = await probeExportCapabilities({ ...env(), AudioEncoder: undefined }, fakeCanvas)
  const rows = capabilityRows(caps)
  const audio = rows.find((row) => row.id === 'audio-encoder')
  assert.equal(audio?.supported, false)
  assert.equal(audio?.value, 'unsupported')
})

test('playback probes report decoders separately from encoders', () => {
  const rows = playbackCapabilities(env())
  assert.equal(rows.find((row) => row.id === 'video-decoder')?.supported, true)
  const bare = playbackCapabilities({})
  assert.equal(bare.find((row) => row.id === 'video-decoder')?.supported, false)
})
