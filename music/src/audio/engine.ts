// Two-clock sequencer engine.
//
// Audio clock: a tight setTimeout (~25ms) walks the next ~100ms of steps
// and schedules every active hit on the audio graph using AudioContext.currentTime.
// Web Audio scheduling is sample-accurate, so timing stays rock solid even
// when the JS event loop is busy.
//
// UI clock: a separate requestAnimationFrame loop (in the UI) reads
// currentStep() to drive the playhead highlight. UI jitter doesn't affect audio.

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

function peakOf(buf: Float32Array): number {
  let peak = 0
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i] ?? 0)
    if (a > peak) peak = a
  }
  return peak
}

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.1
const TC_SMOOTH = 0.05
const TC_FAST = 0.01

// Time-domain window for the transport scope. 2048 samples ≈ 46ms at 44.1kHz —
// roughly two 16th notes at house tempo, enough to see kick transients breathe.
export const WAVEFORM_SAMPLES = 2048

// Meter taps use a smaller window: 1024 samples ≈ 23ms, just over one display
// frame at 60fps so peaks between frames aren't missed.
const METER_SAMPLES = 1024

export type MeterLevels = {
  kick: number
  snare: number
  hat: number
  bass: number
  master: number
}

// LFO depth ranges per destination — full amount (1.0) hits these peaks
// before the energy multiplier scales them up further.
const LFO_RANGE_CUTOFF = 2000
const LFO_RANGE_VOLUME = 0.5
const LFO_RANGE_PAN = 1

type TrackNodes = {
  filter: BiquadFilterNode
  sidechain: GainNode
  panner: StereoPannerNode
  trackGain: GainNode
  reverbSend: GainNode
  delaySend: GainNode
  lfo: OscillatorNode
  lfoAmount: GainNode
  lfoDest: LfoDest | null
  meter: AnalyserNode
}

export class SequencerEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private analyser: AnalyserNode | null = null
  private reverb: ConvolverNode | null = null
  private delay: DelayNode | null = null
  private delayFeedback: GainNode | null = null
  private tracks: Map<TrackId, TrackNodes> = new Map()
  private meterScratch: Float32Array<ArrayBuffer> | null = null
  private masterScratch: Float32Array<ArrayBuffer> | null = null
  private timerId: number | null = null
  private nextStepTime = 0
  private stepIndex = 0
  private state: EngineState
  private playing = false

  constructor(initial: EngineState) {
    this.state = initial
  }

  setState(next: EngineState) {
    const prev = this.state
    this.state = next
    if (!this.ctx) return
    const now = this.ctx.currentTime

    this.master?.gain.setTargetAtTime(next.masterGain, now, TC_FAST)

    if (next.bpm !== prev.bpm && this.delay) {
      const seconds = (DELAY_BEATS["1/4D"] * 60) / next.bpm
      this.delay.delayTime.setTargetAtTime(seconds, now, TC_FAST)
    }

    for (const id of TRACK_IDS) {
      this.applyTrackConfig(id, next.tracks[id], next.bpm, next.energy, now)
    }
  }

  private applyTrackConfig(
    id: TrackId,
    cfg: TrackConfig,
    bpm: number,
    energy: number,
    now: number,
  ) {
    const nodes = this.tracks.get(id)
    if (!nodes) return

    nodes.filter.type = cfg.filter.type
    const floor = energyFilterFloorHz(energy)
    const effCutoff = Math.max(cfg.filter.cutoff, floor)
    nodes.filter.frequency.setTargetAtTime(effCutoff, now, TC_SMOOTH)
    nodes.filter.Q.setTargetAtTime(cfg.filter.resonance, now, TC_SMOOTH)

    const vol = cfg.mute ? 0 : cfg.volume
    nodes.trackGain.gain.setTargetAtTime(vol, now, TC_FAST)

    const revGain = cfg.sends.reverb * energyReverbMultiplier(energy)
    nodes.reverbSend.gain.setTargetAtTime(revGain, now, TC_SMOOTH)
    nodes.delaySend.gain.setTargetAtTime(cfg.sends.delay, now, TC_SMOOTH)

    nodes.lfo.frequency.setTargetAtTime(lfoRateToHz(cfg.lfo.rate, bpm), now, TC_FAST)

    const wantDest: LfoDest | null =
      id === "bass" && cfg.lfo.dest === "pan" ? null : cfg.lfo.dest
    if (wantDest !== nodes.lfoDest) {
      try { nodes.lfoAmount.disconnect() } catch {}
      if (wantDest === "cutoff") nodes.lfoAmount.connect(nodes.filter.frequency)
      else if (wantDest === "volume") nodes.lfoAmount.connect(nodes.trackGain.gain)
      else if (wantDest === "pan") nodes.lfoAmount.connect(nodes.panner.pan)
      nodes.lfoDest = wantDest
    }

    const range =
      wantDest === "cutoff" ? LFO_RANGE_CUTOFF
        : wantDest === "volume" ? LFO_RANGE_VOLUME
        : wantDest === "pan" ? LFO_RANGE_PAN
        : 0
    const amt = wantDest ? cfg.lfo.amount * range * energyLfoMultiplier(energy) : 0
    nodes.lfoAmount.gain.setTargetAtTime(amt, now, TC_SMOOTH)
  }

  private ensureContext() {
    if (this.ctx) return
    const ctx = new AudioContext()
    this.ctx = ctx

    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -1
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.001
    this.limiter.release.value = 0.05
    this.limiter.connect(ctx.destination)

    // Scope tap on the limiter output: the analyser sees exactly the signal
    // that reaches the speakers (post master gain, post limiting).
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = WAVEFORM_SAMPLES
    this.limiter.connect(this.analyser)

    this.master = ctx.createGain()
    this.master.gain.value = this.state.masterGain
    this.master.connect(this.limiter)

    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.buildReverbIR(ctx, 2.0)
    this.reverb.connect(this.master)

    this.delay = ctx.createDelay(2.0)
    this.delay.delayTime.value = (DELAY_BEATS["1/4D"] * 60) / this.state.bpm
    this.delayFeedback = ctx.createGain()
    this.delayFeedback.gain.value = 0.35
    this.delay.connect(this.delayFeedback)
    this.delayFeedback.connect(this.delay)
    this.delay.connect(this.master)

    for (const id of TRACK_IDS) {
      const cfg = this.state.tracks[id]
      const filter = ctx.createBiquadFilter()
      filter.type = cfg.filter.type
      filter.frequency.value = Math.max(cfg.filter.cutoff, energyFilterFloorHz(this.state.energy))
      filter.Q.value = cfg.filter.resonance

      const sidechain = ctx.createGain()
      sidechain.gain.value = 1

      const panner = ctx.createStereoPanner()
      panner.pan.value = 0

      const trackGain = ctx.createGain()
      trackGain.gain.value = cfg.mute ? 0 : cfg.volume

      const reverbSend = ctx.createGain()
      reverbSend.gain.value = cfg.sends.reverb * energyReverbMultiplier(this.state.energy)
      const delaySend = ctx.createGain()
      delaySend.gain.value = cfg.sends.delay

      filter.connect(sidechain)
      sidechain.connect(panner)
      panner.connect(trackGain)
      trackGain.connect(this.master)
      trackGain.connect(reverbSend).connect(this.reverb)
      trackGain.connect(delaySend).connect(this.delay)

      const lfo = ctx.createOscillator()
      lfo.type = "sine"
      lfo.frequency.value = lfoRateToHz(cfg.lfo.rate, this.state.bpm)
      const lfoAmount = ctx.createGain()
      lfoAmount.gain.value = 0
      lfo.connect(lfoAmount)
      lfo.start()

      // Meter tap on the channel output: post-volume/mute, so the mixer
      // meters show what the track contributes (sidechain pump included).
      const meter = ctx.createAnalyser()
      meter.fftSize = METER_SAMPLES
      trackGain.connect(meter)

      const nodes: TrackNodes = {
        filter, sidechain, panner, trackGain, reverbSend, delaySend,
        lfo, lfoAmount, lfoDest: null, meter,
      }
      this.tracks.set(id, nodes)

      // Initial LFO routing + depth.
      this.applyTrackConfig(id, cfg, this.state.bpm, this.state.energy, ctx.currentTime)
    }
  }

  // Procedural reverb IR: stereo white noise with exponential decay.
  private buildReverbIR(ctx: AudioContext, seconds: number): AudioBuffer {
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

  async start() {
    this.ensureContext()
    if (!this.ctx) return
    if (this.ctx.state === "suspended") await this.ctx.resume()
    this.playing = true
    this.stepIndex = 0
    this.nextStepTime = this.ctx.currentTime + 0.05
    this.tick()
  }

  stop() {
    this.playing = false
    if (this.timerId != null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
    this.stepIndex = 0
  }

  currentStep(): number {
    return this.playing ? this.stepIndex : -1
  }

  // Fills `out` (length WAVEFORM_SAMPLES) with the master output waveform.
  // Returns false until the AudioContext exists (before the first play/audition).
  getWaveform(out: Float32Array<ArrayBuffer>): boolean {
    if (!this.analyser) return false
    this.analyser.getFloatTimeDomainData(out)
    return true
  }

  sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100
  }

  // Peak level (0..1) per channel plus master, or null before the
  // AudioContext exists. Called once per animation frame by the mix bus.
  meterLevels(): MeterLevels | null {
    if (!this.analyser) return null
    if (!this.meterScratch) this.meterScratch = new Float32Array(METER_SAMPLES)
    if (!this.masterScratch) this.masterScratch = new Float32Array(WAVEFORM_SAMPLES)
    const levels: MeterLevels = { kick: 0, snare: 0, hat: 0, bass: 0, master: 0 }
    for (const id of TRACK_IDS) {
      const nodes = this.tracks.get(id)
      if (!nodes) continue
      nodes.meter.getFloatTimeDomainData(this.meterScratch)
      levels[id] = peakOf(this.meterScratch)
    }
    this.analyser.getFloatTimeDomainData(this.masterScratch)
    levels.master = peakOf(this.masterScratch)
    return levels
  }

  triggerNow(trackId: TrackId, degree: number = 0) {
    this.ensureContext()
    if (!this.ctx) return
    if (this.ctx.state === "suspended") this.ctx.resume()
    const nodes = this.tracks.get(trackId)
    if (!nodes) return
    const t = this.ctx.currentTime + 0.01
    this.fireVoice(trackId, nodes, t, degree)
  }

  private fireVoice(id: TrackId, nodes: TrackNodes, time: number, degree: number = 0) {
    if (!this.ctx) return
    if (id === "bass") {
      const freq = bassStepToHz(degree, this.state.key.tonic)
      bass(this.ctx, nodes.filter, time, freq)
    } else if (id === "kick") {
      kick(this.ctx, nodes.filter, time)
    } else if (id === "snare") {
      snare(this.ctx, nodes.filter, time)
    } else if (id === "hat") {
      hat(this.ctx, nodes.filter, time)
    }
  }

  private tick = () => {
    if (!this.playing || !this.ctx) return
    const secondsPerStep = 60 / this.state.bpm / 4
    while (this.nextStepTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
      // Swing pushes odd 16ths later without shifting the underlying grid walker.
      const isOdd = (this.stepIndex % 2) === 1
      const swingOffset = isOdd ? (this.state.swing - 0.5) * 2 * secondsPerStep * 0.5 : 0
      this.scheduleStep(this.stepIndex, this.nextStepTime + swingOffset)
      this.nextStepTime += secondsPerStep
      this.stepIndex = (this.stepIndex + 1) % this.state.steps
    }
    this.timerId = window.setTimeout(this.tick, LOOKAHEAD_MS)
  }

  private scheduleStep(step: number, time: number) {
    if (!this.ctx) return
    for (const id of TRACK_IDS) {
      const cfg = this.state.tracks[id]
      if (cfg.mute) continue
      const nodes = this.tracks.get(id)
      if (!nodes) continue

      let fired = false
      if (id === "bass") {
        const bs = this.state.pattern.bass[step]
        if (bs?.on) {
          const freq = bassStepToHz(bs.degree, this.state.key.tonic)
          bass(this.ctx, nodes.filter, time, freq)
          fired = true
        }
      } else {
        const on = this.state.pattern[id]?.[step]
        if (on) {
          if (id === "kick") kick(this.ctx, nodes.filter, time)
          else if (id === "snare") snare(this.ctx, nodes.filter, time)
          else if (id === "hat") hat(this.ctx, nodes.filter, time)
          fired = true
        }
      }

      if (fired && id === "kick") {
        this.scheduleDuck(time)
      }
    }
  }

  private scheduleDuck(time: number) {
    for (const id of TRACK_IDS) {
      if (id === "kick") continue
      const cfg = this.state.tracks[id]
      if (!cfg.sidechain.on) continue
      const nodes = this.tracks.get(id)
      if (!nodes) continue
      const duckTo = 1 - cfg.sidechain.depth * SIDECHAIN_MAX_DUCK
      nodes.sidechain.gain.setValueAtTime(duckTo, time)
      nodes.sidechain.gain.setTargetAtTime(1, time + 0.001, SIDECHAIN_RELEASE_TC)
    }
  }
}
