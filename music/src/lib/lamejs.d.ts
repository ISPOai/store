// Minimal types for the vendored lamejs (src/lib/lamejs.js). Only the surface
// src/audio/mp3.ts uses is declared.

export declare class Mp3Encoder {
  /** @param channels 1 (mono) or 2 (stereo). @param kbps e.g. 128, 192, 320. */
  constructor(channels: number, sampleRate: number, kbps: number)
  /** Encode one block of 16-bit PCM. Returns MP3 bytes (may be empty). The
   *  returned view aliases an internal reused buffer — copy it before the next
   *  call. */
  encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array
  /** Flush the final partial frame. */
  flush(): Int8Array
}

export declare const WavHeader: unknown
declare const lamejs: { Mp3Encoder: typeof Mp3Encoder }
export default lamejs
