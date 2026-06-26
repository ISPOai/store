// MP3 encoder for offline-rendered audio — the lossy counterpart to wav.ts.
//
// The browser has no native MP3 encoder, so this wraps the vendored pure-JS
// LAME port (src/lib/lamejs.js). It takes the float AudioBuffer from
// render.ts, converts to 16-bit PCM, and feeds it to lamejs frame-by-frame.

import { Mp3Encoder } from "@/lib/lamejs"

// MP3 (MPEG-1 Layer III) frames carry exactly 1152 PCM samples per channel.
const MP3_FRAME_SAMPLES = 1152

export type Mp3Bitrate = 128 | 192 | 320

// Float [-1, 1] → Int16Array. The master limiter guarantees the input is in
// range, so no extra clipping is needed beyond the int16 boundary.
function toInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

export function encodeMp3(buffer: AudioBuffer, kbps: Mp3Bitrate = 192): Uint8Array {
  const channels = buffer.numberOfChannels >= 2 ? 2 : 1
  const sampleRate = buffer.sampleRate
  const encoder = new Mp3Encoder(channels, sampleRate, kbps)

  const left = toInt16(buffer.getChannelData(0))
  // Mono: lamejs ignores the right arg when constructed with 1 channel.
  const right = channels === 2 ? toInt16(buffer.getChannelData(1)) : left

  const chunks: Uint8Array[] = []
  let total = 0
  const push = (frame: Int8Array) => {
    if (frame.length === 0) return
    // encodeBuffer returns a view over an internal reused buffer — copy it.
    // Copying Int8Array → Uint8Array preserves the raw bytes (e.g. -1 → 255).
    const copy = new Uint8Array(frame)
    chunks.push(copy)
    total += copy.length
  }

  for (let i = 0; i < left.length; i += MP3_FRAME_SAMPLES) {
    const l = left.subarray(i, i + MP3_FRAME_SAMPLES)
    const r = right.subarray(i, i + MP3_FRAME_SAMPLES)
    push(channels === 2 ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l))
  }
  push(encoder.flush())

  // Concatenate frames into one contiguous MP3 byte stream.
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
