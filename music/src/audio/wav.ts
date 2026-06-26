// WAV encoder for offline-rendered audio.
//
// Web Audio's OfflineAudioContext hands back an AudioBuffer of raw float
// samples — there is no built-in "save to file". This module turns that
// buffer into a 16-bit PCM WAV byte stream (RIFF/WAVE), the universal
// lossless container every DAW imports. No external dependencies.
//
// 16-bit PCM is the export target on purpose: the master chain ends in a
// brick-wall limiter (threshold -1 dB), so the signal is guaranteed to sit
// inside [-1, 1] and 16-bit quantization is transparent for a sketch bounce.

// Clamp a float sample to [-1, 1] and convert to a signed 16-bit integer.
// Negative and positive full-scale use different divisors because int16 is
// asymmetric (range -32768..32767).
function floatToInt16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample))
  return s < 0 ? s * 0x8000 : s * 0x7fff
}

export function encodeWavPCM16(buffer: AudioBuffer): Uint8Array {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataBytes = numFrames * blockAlign
  const headerBytes = 44
  const out = new ArrayBuffer(headerBytes + dataBytes)
  const view = new DataView(out)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  // ── RIFF header ──
  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataBytes, true) // file size minus the first 8 bytes
  writeString(8, "WAVE")

  // ── fmt subchunk (PCM) ──
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)            // subchunk size for PCM
  view.setUint16(20, 1, true)             // audio format 1 = PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)      // bits per sample

  // ── data subchunk ──
  writeString(36, "data")
  view.setUint32(40, dataBytes, true)

  // Interleave channels frame-by-frame: L R L R … (or just L for mono).
  const channels: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch))

  let offset = headerBytes
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      view.setInt16(offset, floatToInt16(channels[ch][frame]), true)
      offset += bytesPerSample
    }
  }

  return new Uint8Array(out)
}
