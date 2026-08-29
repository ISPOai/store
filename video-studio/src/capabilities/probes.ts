// Truthful capability probing for the export path. Every value reported to
// the user is the real state of THIS iframe environment — nothing assumed,
// nothing faked — and an unsupported capability never blocks editing; it
// only reports why export is unavailable here.

export interface CapabilityProbeRow {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly supported: boolean
  readonly note: string | null
}

export interface ExportCapabilities {
  readonly sharedArrayBuffer: boolean
  readonly videoEncoder: boolean
  readonly audioEncoder: boolean
  readonly offlineAudioContext: boolean
  readonly audioWorklet: boolean
  readonly canvas2d: boolean
  readonly supported: boolean
  readonly blocker: string | null
}

/** The config shape handed to a WebCodecs encoder support probe. */
export interface VideoEncoderProbeConfig {
  readonly codec: string
  readonly width: number
  readonly height: number
}

export interface AudioEncoderProbeConfig {
  readonly codec: string
  readonly sampleRate: number
  readonly numberOfChannels: number
}

/** The answer a WebCodecs support probe gives. */
export interface EncoderSupportAnswer {
  readonly supported?: boolean
}

export interface WorkletScope {
  readonly audioWorklet?: { addModule(url: string): Promise<void> }
}

export type OfflineAudioContextProbe = new (
  channels: number,
  length: number,
  sampleRate: number,
) => WorkletScope

/** A constructor whose mere presence marks the API available. */
export type PresentConstructor = abstract new (...args: never[]) => object

/** The environment seam probes read; the real frame supplies `globalThis`. */
export interface ProbeEnv {
  readonly SharedArrayBuffer?: PresentConstructor | undefined
  readonly VideoEncoder?:
    | { isConfigSupported?(config: VideoEncoderProbeConfig): Promise<EncoderSupportAnswer> }
    | undefined
  readonly AudioEncoder?:
    | { isConfigSupported?(config: AudioEncoderProbeConfig): Promise<EncoderSupportAnswer> }
    | undefined
  readonly VideoDecoder?: PresentConstructor | undefined
  readonly AudioDecoder?: PresentConstructor | undefined
  readonly OfflineAudioContext?: OfflineAudioContextProbe | undefined
  readonly AudioContext?: PresentConstructor | undefined
}

export interface ProbedCanvas {
  getContext(type: '2d'): object | null
}

export type CanvasFactory = () => ProbedCanvas

export async function probeExportCapabilities(
  env: ProbeEnv = globalThis,
  newCanvas: CanvasFactory = () => document.createElement('canvas'),
): Promise<ExportCapabilities> {
  const sharedArrayBuffer = env.SharedArrayBuffer !== undefined
  const offlineAudioContext = env.OfflineAudioContext !== undefined
  const audioContextPresent = env.AudioContext !== undefined
  const canvas2d = probeCanvas(newCanvas)

  let videoEncoder = false
  if (env.VideoEncoder?.isConfigSupported !== undefined) {
    const answer = await env.VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 16, height: 16 })
    videoEncoder = answer.supported === true
  }
  let audioEncoder = false
  if (env.AudioEncoder?.isConfigSupported !== undefined) {
    const answer = await env.AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2 })
    audioEncoder = answer.supported === true
  }

  const audioWorklet = audioContextPresent && offlineAudioContext ? probeAudioWorklet(env) : false
  const rows = [sharedArrayBuffer, videoEncoder, audioEncoder, offlineAudioContext, audioWorklet, canvas2d]
  const supported = rows.every(Boolean)

  let blocker: string | null = null
  if (!supported) {
    if (!sharedArrayBuffer) {
      blocker = 'This host frame is not cross-origin isolated, so the encoder runtime (SharedArrayBuffer and WebCodecs) is unavailable.'
    } else if (!videoEncoder) {
      blocker = 'This browser cannot encode video (VideoDecoder/VideoEncoder unsupported or not configured).'
    } else if (!audioEncoder) {
      blocker = 'This browser cannot encode audio in the requested codec.'
    } else {
      blocker = 'A required browser media API is unavailable in this frame.'
    }
  }

  return {
    sharedArrayBuffer,
    videoEncoder,
    audioEncoder,
    offlineAudioContext,
    audioWorklet,
    canvas2d,
    supported,
    blocker,
  }
}

function probeCanvas(newCanvas: CanvasFactory): boolean {
  try {
    return newCanvas().getContext('2d') !== null
  } catch {
    return false
  }
}

function probeAudioWorklet(env: ProbeEnv): boolean {
  const offline = env.OfflineAudioContext
  if (offline === undefined) return false
  try {
    const context = new offline(2, 128, 48_000)
    return context.audioWorklet?.addModule !== undefined
  } catch {
    return false
  }
}

export function capabilityRows(caps: ExportCapabilities): readonly CapabilityProbeRow[] {
  const row = (id: string, label: string, ok: boolean): CapabilityProbeRow => ({
    id,
    label,
    value: ok ? 'supported' : 'unsupported',
    supported: ok,
    note: null,
  })
  return [
    row('shared-array-buffer', 'SharedArrayBuffer', caps.sharedArrayBuffer),
    row('video-encoder', 'WebCodecs VideoEncoder', caps.videoEncoder),
    row('audio-encoder', 'WebCodecs AudioEncoder', caps.audioEncoder),
    row('offline-audio', 'OfflineAudioContext', caps.offlineAudioContext),
    row('audio-worklet', 'AudioWorklet', caps.audioWorklet),
    row('canvas-2d', 'Canvas 2D', caps.canvas2d),
  ]
}

export function playbackCapabilities(env: ProbeEnv = globalThis): readonly CapabilityProbeRow[] {
  const row = (id: string, label: string, present: boolean, note: string | null): CapabilityProbeRow => ({
    id,
    label,
    value: present ? 'supported' : 'unsupported',
    supported: present,
    note,
  })
  return [
    row('video-decoder', 'WebCodecs VideoDecoder', env.VideoDecoder !== undefined, 'Video playback needs WebCodecs decoding.'),
    row('audio-decoder', 'WebCodecs AudioDecoder', env.AudioDecoder !== undefined, 'Audio playback needs WebCodecs decoding.'),
    row('audio-context', 'AudioContext', env.AudioContext !== undefined, null),
  ]
}
