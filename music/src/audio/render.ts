// Offline (faster-than-realtime) renderer for the "export track" feature.
//
// WHY a second audio path: the live SequencerEngine drives sound with a
// wall-clock setTimeout scheduler (see engine.ts). That is inherently tied to
// real time — it can only ever produce N seconds of audio in N seconds. To
// bounce a file we instead rebuild the SAME signal graph on an
// OfflineAudioContext, schedule every step up front against its timeline, and
// let the browser render the whole thing as fast as the CPU allows.
//
// This file deliberately MIRRORS the graph topology and step scheduling in
// engine.ts. If you change the signal chain there (node order, sidechain
// shape, energy mapping, swing math), update it here too so the export
// matches what the user hears during playback. Energy is captured as a static
// snapshot of state.energy — the export is a bounce of the current mix, not a
// performance recording.

import { kick, snare, hat, bass, TRACK_IDS } from "./voices"
import {
  type EngineState,
  type TrackId,
  type TrackConfig,
  type LfoDest,
  bassStepToHz,
  lfoRateToHz,
  energyFilterFloorHz,
  energyReverbMultiplier,
  energyLfoMultiplier,
  SIDECHAIN_RELEASE_TC,
  SIDECHAIN_MAX_DUCK,
  DELAY_BEATS,
} from "./types"

// CD-quality stereo. Stereo because the per-track panner and the procedural
// reverb IR are both 2-channel.
const RENDER_SAMPLE_RATE = 44100
const RENDER_CHANNELS = 2

// Mirrors of the fixed values baked into engine.ts's graph.
const REVERB_SECONDS = 2.0
const DELAY_FEEDBACK = 0.35

// LFO depth ranges per destination — identical to engine.ts.
const LFO_RANGE_CUTOFF = 2000
const LFO_RANGE_VOLUME = 0.5
const LFO_RANGE_PAN = 1

// ─────────────────────────────────────────────────────────────────────────
// TAIL HANDLING  ← this is the decision point I'd like you to own (see notes
// in the chat). A bounce that stops dead at exactly `lengthSeconds` chops the
// last hit's decay and swallows any reverb/delay still ringing — it clicks and
// sounds amputated. So we render a little PAST the musical content, then the
// caller keeps the full buffer.
//
// computeTailSeconds decides HOW MUCH extra time to render. The placeholder
// below is intentionally dumb: a flat 2s every time, even for a dry mix with
// no sends (wasted silence) or a patch whose only voice decays in 0.4s.
//
// TODO(you): make this adapt to the actual mix. Things worth weighing:
//   • Is ANY track sending to reverb or delay? If every send is 0, the only
//     thing ringing is the voice decay (~0.4s) — a long tail is pure silence.
//   • The reverb IR is REVERB_SECONDS long; the delay echoes decay by
//     DELAY_FEEDBACK each repeat (0.35 → effectively gone after ~4 repeats),
//     and one delay repeat is DELAY_BEATS["1/4D"] * 60 / bpm seconds.
//   • Energy raises reverb send (energyReverbMultiplier), so a high-energy
//     mix rings longer.
// Return the number of extra seconds to render after the music ends.
export function computeTailSeconds(state: EngineState): number {
  // Placeholder — safe but wasteful. Replace with mix-aware logic.
  return REVERB_SECONDS
}
// ─────────────────────────────────────────────────────────────────────────

type TrackNodes = {
  filter: BiquadFilterNode
  sidechain: GainNode
  panner: StereoPannerNode
  trackGain: GainNode
  reverbSend: GainNode
  delaySend: GainNode
}

// Build the full signal graph on an offline context, with every AudioParam set
// to its static value for the current state + energy snapshot. Returns the
// per-track node map the scheduler fires voices into.
function buildGraph(ctx: OfflineAudioContext, state: EngineState): Map<TrackId, TrackNodes> {
  const energy = state.energy

  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -1
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.05
  limiter.connect(ctx.destination)

  const master = ctx.createGain()
  master.gain.value = state.masterGain
  master.connect(limiter)

  const reverb = ctx.createConvolver()
  reverb.buffer = buildReverbIR(ctx, REVERB_SECONDS)
  reverb.connect(master)

  const delay = ctx.createDelay(2.0)
  delay.delayTime.value = (DELAY_BEATS["1/4D"] * 60) / state.bpm
  const delayFeedback = ctx.createGain()
  delayFeedback.gain.value = DELAY_FEEDBACK
  delay.connect(delayFeedback)
  delayFeedback.connect(delay)
  delay.connect(master)

  const tracks = new Map<TrackId, TrackNodes>()

  for (const id of TRACK_IDS) {
    const cfg: TrackConfig = state.tracks[id]

    const filter = ctx.createBiquadFilter()
    filter.type = cfg.filter.type
    filter.frequency.value = Math.max(cfg.filter.cutoff, energyFilterFloorHz(energy))
    filter.Q.value = cfg.filter.resonance

    const sidechain = ctx.createGain()
    sidechain.gain.value = 1

    const panner = ctx.createStereoPanner()
    panner.pan.value = 0

    const trackGain = ctx.createGain()
    trackGain.gain.value = cfg.mute ? 0 : cfg.volume

    const reverbSend = ctx.createGain()
    reverbSend.gain.value = cfg.sends.reverb * energyReverbMultiplier(energy)
    const delaySend = ctx.createGain()
    delaySend.gain.value = cfg.sends.delay

    filter.connect(sidechain)
    sidechain.connect(panner)
    panner.connect(trackGain)
    trackGain.connect(master)
    trackGain.connect(reverbSend).connect(reverb)
    trackGain.connect(delaySend).connect(delay)

    // One tempo-synced LFO per track, routed to a single destination param.
    const wantDest: LfoDest | null =
      id === "bass" && cfg.lfo.dest === "pan" ? null : cfg.lfo.dest
    const range =
      wantDest === "cutoff" ? LFO_RANGE_CUTOFF
        : wantDest === "volume" ? LFO_RANGE_VOLUME
          : wantDest === "pan" ? LFO_RANGE_PAN
            : 0
    if (wantDest && range > 0) {
      const lfo = ctx.createOscillator()
      lfo.type = "sine"
      lfo.frequency.value = lfoRateToHz(cfg.lfo.rate, state.bpm)
      const lfoAmount = ctx.createGain()
      lfoAmount.gain.value = cfg.lfo.amount * range * energyLfoMultiplier(energy)
      lfo.connect(lfoAmount)
      if (wantDest === "cutoff") lfoAmount.connect(filter.frequency)
      else if (wantDest === "volume") lfoAmount.connect(trackGain.gain)
      else if (wantDest === "pan") lfoAmount.connect(panner.pan)
      lfo.start(0)
    }

    tracks.set(id, { filter, sidechain, panner, trackGain, reverbSend, delaySend })
  }

  return tracks
}

// Procedural reverb IR — identical recipe to engine.ts: stereo white noise
// with an exponential (^2) decay envelope.
function buildReverbIR(ctx: OfflineAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const t = i / length
      const env = Math.pow(1 - t, 2)
      data[i] = (Math.random() * 2 - 1) * env
    }
  }
  return buf
}

// Schedule every step that starts before `lengthSeconds`, looping the fixed
// pattern as many times as needed. Mirrors engine.ts tick/scheduleStep/
// scheduleDuck, but unrolled across the whole timeline instead of a rolling
// lookahead window.
function scheduleSteps(
  ctx: OfflineAudioContext,
  tracks: Map<TrackId, TrackNodes>,
  state: EngineState,
  lengthSeconds: number,
) {
  const secondsPerStep = 60 / state.bpm / 4 // one 16th note
  const patternSteps = state.steps

  for (let i = 0; i * secondsPerStep < lengthSeconds; i++) {
    const step = i % patternSteps
    // Swing pushes odd 16ths later, same as the live engine.
    const isOdd = i % 2 === 1
    const swingOffset = isOdd ? (state.swing - 0.5) * 2 * secondsPerStep * 0.5 : 0
    const time = i * secondsPerStep + swingOffset

    for (const id of TRACK_IDS) {
      const cfg = state.tracks[id]
      if (cfg.mute) continue
      const nodes = tracks.get(id)
      if (!nodes) continue

      let fired = false
      if (id === "bass") {
        const bs = state.pattern.bass[step]
        if (bs?.on) {
          bass(ctx, nodes.filter, time, bassStepToHz(bs.degree, state.key.tonic))
          fired = true
        }
      } else {
        if (state.pattern[id]?.[step]) {
          if (id === "kick") kick(ctx, nodes.filter, time)
          else if (id === "snare") snare(ctx, nodes.filter, time)
          else if (id === "hat") hat(ctx, nodes.filter, time)
          fired = true
        }
      }

      if (fired && id === "kick") scheduleDuck(tracks, state, time)
    }
  }
}

function scheduleDuck(
  tracks: Map<TrackId, TrackNodes>,
  state: EngineState,
  time: number,
) {
  for (const id of TRACK_IDS) {
    if (id === "kick") continue
    const cfg = state.tracks[id]
    if (!cfg.sidechain.on) continue
    const nodes = tracks.get(id)
    if (!nodes) continue
    const duckTo = 1 - cfg.sidechain.depth * SIDECHAIN_MAX_DUCK
    nodes.sidechain.gain.setValueAtTime(duckTo, time)
    nodes.sidechain.gain.setTargetAtTime(1, time + 0.001, SIDECHAIN_RELEASE_TC)
  }
}

// Render `lengthSeconds` of musical content (plus a decay tail) to an
// AudioBuffer. The caller encodes it (see wav.ts) and saves it.
export async function renderTrack(
  state: EngineState,
  lengthSeconds: number,
): Promise<AudioBuffer> {
  const tail = Math.max(0, computeTailSeconds(state))
  const totalSeconds = lengthSeconds + tail
  const frameCount = Math.ceil(totalSeconds * RENDER_SAMPLE_RATE)

  const ctx = new OfflineAudioContext(RENDER_CHANNELS, frameCount, RENDER_SAMPLE_RATE)
  const tracks = buildGraph(ctx, state)
  scheduleSteps(ctx, tracks, state, lengthSeconds)

  return ctx.startRendering()
}
