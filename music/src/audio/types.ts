// Shared contract between the audio engine (engine.ts, voices.ts) and the UI
// (sequencer.tsx). This file defines the v2 signal-chain shape: per-track
// filter, kick-triggered sidechain, one tempo-synced LFO per track, shared
// reverb + delay sends, a global Energy macro, swing, and a pitched
// scale-locked bass track.

export type TrackId = "kick" | "snare" | "hat" | "bass"

// ─── Signal-chain primitives ───────────────────────────────────────────────

export type FilterType = "lowpass" | "highpass" | "bandpass"

// One LFO per track, one destination at a time. The bass track omits "pan"
// (mono sub — pan has nothing musical to do).
export type LfoDest = "cutoff" | "volume" | "pan"

// Tempo-synced LFO rates. Resolved against the current BPM at apply time.
export type LfoRate = "1" | "1/2" | "1/4" | "1/8" | "1/16" | "1/8T"

export const LFO_RATES: LfoRate[] = ["1", "1/2", "1/4", "1/8", "1/16", "1/8T"]

// Convert a tempo-synced rate to LFO frequency in Hz at a given BPM.
// A "1" rate = one full LFO cycle per bar (4 beats).
export function lfoRateToHz(rate: LfoRate, bpm: number): number {
  const beatsPerSecond = bpm / 60
  const cyclesPerBeat: Record<LfoRate, number> = {
    "1": 0.25,    // 1 cycle / 4 beats
    "1/2": 0.5,   // 1 cycle / 2 beats
    "1/4": 1,     // 1 cycle / beat
    "1/8": 2,
    "1/16": 4,
    "1/8T": 3,    // triplet eighths: 3 cycles / beat
  }
  return cyclesPerBeat[rate] * beatsPerSecond
}

// Tempo-synced delay times (in beats).
export type DelayTime = "1/8" | "1/4" | "1/4D" | "1/2"

export const DELAY_BEATS: Record<DelayTime, number> = {
  "1/8": 0.5,
  "1/4": 1,
  "1/4D": 1.5, // dotted quarter
  "1/2": 2,
}

// ─── Scale + bass ───────────────────────────────────────────────────────────

export type ScaleMode = "minor" | "major" | "dorian" | "phrygian" | "mixolydian"

// Scale intervals as semitone offsets from the tonic (one octave).
export const SCALE_INTERVALS: Record<ScaleMode, number[]> = {
  minor:      [0, 2, 3, 5, 7, 8, 10],
  major:      [0, 2, 4, 5, 7, 9, 11],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
}

// Note names for the tonic picker (chromatic, sharps).
export const NOTE_NAMES = [
  "C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B",
] as const

// Snap a chromatic semitone offset to the nearest in-scale degree.
// Used by the bass-row drag interaction so the user can't pick a wrong note.
export function snapToScale(semitone: number, mode: ScaleMode): number {
  const intervals = SCALE_INTERVALS[mode]
  const octave = Math.floor(semitone / 12)
  const within = ((semitone % 12) + 12) % 12
  let best = intervals[0] ?? 0
  let bestDist = 99
  for (const iv of intervals) {
    const d = Math.abs(iv - within)
    if (d < bestDist) {
      bestDist = d
      best = iv
    }
  }
  return octave * 12 + best
}

// Label a semitone offset as a scale degree (1, ♭3, 5, ♭7, …).
// Handles octave wrapping by displaying just the degree-within-octave.
export function degreeLabel(semitone: number, mode: ScaleMode): string {
  const within = ((semitone % 12) + 12) % 12
  const intervals = SCALE_INTERVALS[mode]
  const degreeIndex = intervals.indexOf(within)
  if (degreeIndex >= 0) {
    return `${degreeIndex + 1}`
  }
  // Off-scale (shouldn't happen with scale lock, but render defensively):
  // find nearest scale degree and prefix with ♭ or ♯.
  const nearestBelow = [...intervals].reverse().find((iv) => iv < within)
  if (nearestBelow != null) {
    const idx = intervals.indexOf(nearestBelow) + 1
    return `♯${idx}`
  }
  return "?"
}

// Convert a bass step (semitone offset from tonic) to a frequency in Hz.
// The base octave is the bass-friendly low register: tonic at MIDI 36 (C2-ish)
// when the tonic is C. The tonic semitone shifts the whole thing.
export function bassStepToHz(semitone: number, tonicSemitone: number): number {
  const baseMidi = 36 + tonicSemitone + semitone // 36 = C2
  return 440 * Math.pow(2, (baseMidi - 69) / 12)
}

// ─── Step shapes ────────────────────────────────────────────────────────────

export type DrumStep = boolean

export type BassStep = {
  on: boolean
  // Chromatic semitone offset from the current tonic. 0 = root, 12 = octave up,
  // -12 = octave down. Always in-scale when set via the UI (scale lock).
  degree: number
}

export type Pattern = {
  kick: DrumStep[]
  snare: DrumStep[]
  hat: DrumStep[]
  bass: BassStep[]
}

// ─── Per-track config ──────────────────────────────────────────────────────

export type FilterConfig = {
  type: FilterType
  cutoff: number       // Hz, 20..20000
  resonance: number    // Q, 0.5..20
}

export type SidechainConfig = {
  on: boolean
  depth: number        // 0..1 — 1 = full classic-house duck (~-12 dB)
}

export type LfoConfig = {
  rate: LfoRate
  dest: LfoDest
  amount: number       // 0..1 — engine maps to the right scale per destination
}

export type SendsConfig = {
  reverb: number       // 0..1
  delay: number        // 0..1
}

export type TrackConfig = {
  volume: number       // 0..1
  mute: boolean
  filter: FilterConfig
  sidechain: SidechainConfig
  lfo: LfoConfig
  sends: SendsConfig
}

// ─── Top-level engine state ────────────────────────────────────────────────

export type Key = {
  tonic: number        // 0..11 (0 = C, 1 = C♯, ...)
  mode: ScaleMode
}

export type EngineState = {
  bpm: number
  swing: number        // 0.5 = straight; 0.5..0.75 typical (56% = 0.56)
  steps: number        // 32 in v2
  masterGain: number   // 0..1
  energy: number       // 0..1 — Energy macro
  key: Key
  pattern: Pattern
  tracks: Record<TrackId, TrackConfig>
}

// ─── Defaults ───────────────────────────────────────────────────────────────

// Per the spec's "curated defaults" — a user touching nothing hears something
// clean and producible; sidechain is the classic house pump shape; sends start
// at zero so nothing washes out by default.

export const DEFAULT_FILTER: FilterConfig = {
  type: "lowpass",
  cutoff: 20000,       // wide open = functionally bypass until touched
  resonance: 1,
}

export const DEFAULT_SIDECHAIN: SidechainConfig = {
  on: false,
  depth: 1,            // when toggled on, default to full classic-house depth
}

export const DEFAULT_LFO: LfoConfig = {
  rate: "1/4",
  dest: "cutoff",
  amount: 0,           // off until enabled
}

export const DEFAULT_SENDS: SendsConfig = {
  reverb: 0,
  delay: 0,
}

export function defaultTrackConfig(id: TrackId): TrackConfig {
  const volumes: Record<TrackId, number> = { kick: 0.9, snare: 0.7, hat: 0.5, bass: 0.7 }
  return {
    volume: volumes[id],
    mute: false,
    filter: { ...DEFAULT_FILTER },
    sidechain: { ...DEFAULT_SIDECHAIN },
    lfo: { ...DEFAULT_LFO },
    sends: { ...DEFAULT_SENDS },
  }
}

// ─── Sidechain envelope shape ──────────────────────────────────────────────

// Classic house pump: at the kick onset, the gain drops to (1 - depth*0.75)
// instantaneously, then exponentially recovers toward 1 with this time
// constant. depth=1 → drops to 0.25 (≈ -12 dB), recovers in ~150 ms.
export const SIDECHAIN_RELEASE_TC = 0.05  // setTargetAtTime time constant; ~3*tc ≈ 150 ms recovery
export const SIDECHAIN_MAX_DUCK = 0.75    // depth=1 → multiply gain by (1 - 0.75) = 0.25

// ─── Energy macro mapping ──────────────────────────────────────────────────

// Energy is weighted toward the top half — the build-up drama lives in 0.7..1.0.
// energyCurve maps [0..1] linearly first, then biases via x^p where p<1 lifts
// the lower range so small twists feel responsive without taking over the mix.
export function energyCurve(energy: number): number {
  const clamped = Math.max(0, Math.min(1, energy))
  return Math.pow(clamped, 0.6)
}

// Energy's three destinations, all scaled by energyCurve(energy):
//   1. Filter cutoff floor: lifts each track's effective minimum cutoff so a
//      filtered-down track opens up as energy rises.
//   2. Reverb send multiplier: increases the wet share at high energy.
//   3. LFO depth multiplier: deepens modulation as energy climbs.
// The engine reads these via the helpers below.

export function energyFilterFloorHz(energy: number): number {
  // 200 Hz at energy=0, up to ~8 kHz at energy=1. Acts as a floor: the
  // effective cutoff is max(track.filter.cutoff, this floor).
  return 200 + energyCurve(energy) * 7800
}

export function energyReverbMultiplier(energy: number): number {
  // 1.0 at energy=0 (sends pass through unchanged), up to 1.8 at energy=1.
  return 1 + energyCurve(energy) * 0.8
}

export function energyLfoMultiplier(energy: number): number {
  // 1.0 at energy=0, up to 1.5 at energy=1.
  return 1 + energyCurve(energy) * 0.5
}
