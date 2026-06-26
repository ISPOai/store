// Synth voices for the multi-track sequencer.
//
// Each voice is a pure function: given an AudioContext, a destination node,
// and a precise start time (in seconds, on the audio clock), it creates the
// oscillators / noise / envelopes needed to produce one hit and schedules
// them. Nodes are created fresh per hit and disposed by the audio graph
// when they finish — no shared state.
//
// The destination is a per-track gain node (so the UI can mute / change
// volume by setting destination.gain without touching the voice code).

import type { TrackId } from "./types"
export type { TrackId } from "./types"

export type DrumVoice = (ctx: AudioContext, dest: AudioNode, time: number) => void
export type BassVoice = (ctx: AudioContext, dest: AudioNode, time: number, frequency: number) => void

// Helper: a one-shot gain envelope (attack 0 -> peak, then exponential
// decay to ~0). Returns the gain node so the caller can route oscillators
// through it.
export function envelope(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, time)
  g.gain.linearRampToValueAtTime(peak, time + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay)
  g.connect(dest)
  return g
}

// Helper: a short burst of white noise routed through the given destination.
// Useful for snare/hat/clap bodies.
export function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  duration: number,
): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(dest)
  src.start(time)
  src.stop(time + duration)
  return src
}

export const kick: DrumVoice = (ctx, dest, time) => {
  const osc = ctx.createOscillator()
  osc.type = "sine"
  osc.frequency.setValueAtTime(120, time)
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.12)
  const g = envelope(ctx, dest, time, 1.0, 0.002, 0.35)
  osc.connect(g)
  osc.start(time)
  osc.stop(time + 0.4)
}

export const snare: DrumVoice = (ctx, dest, time) => {
  const noiseGain = envelope(ctx, dest, time, 0.6, 0.001, 0.18)
  noiseBurst(ctx, noiseGain, time, 0.2)
  const toneOsc = ctx.createOscillator()
  toneOsc.type = "triangle"
  toneOsc.frequency.setValueAtTime(180, time)
  const toneGain = envelope(ctx, dest, time, 0.5, 0.001, 0.12)
  toneOsc.connect(toneGain)
  toneOsc.start(time)
  toneOsc.stop(time + 0.15)
}

export const hat: DrumVoice = (ctx, dest, time) => {
  const hp = ctx.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = 7000
  const g = envelope(ctx, dest, time, 0.4, 0.001, 0.05)
  hp.connect(g)
  noiseBurst(ctx, hp, time, 0.06)
}

export const bass: BassVoice = (ctx, dest, time, frequency) => {
  const osc = ctx.createOscillator()
  osc.type = "sawtooth"
  osc.frequency.setValueAtTime(frequency, time)
  const lp = ctx.createBiquadFilter()
  lp.type = "lowpass"
  // Sweep relative to the note so brightness tracks pitch.
  lp.frequency.setValueAtTime(frequency * 12, time)
  lp.frequency.exponentialRampToValueAtTime(frequency * 2, time + 0.3)
  const g = envelope(ctx, dest, time, 0.6, 0.005, 0.32)
  osc.connect(lp).connect(g)
  osc.start(time)
  osc.stop(time + 0.4)
}

export type TrackMeta =
  | { id: "kick" | "snare" | "hat"; label: string; voice: DrumVoice; color: string }
  | { id: "bass"; label: string; voice: BassVoice; color: string }

export const TRACKS: TrackMeta[] = [
  { id: "kick",  label: "Kick",  voice: kick,  color: "var(--chart-1)" },
  { id: "snare", label: "Snare", voice: snare, color: "var(--chart-2)" },
  { id: "hat",   label: "Hat",   voice: hat,   color: "var(--chart-3)" },
  { id: "bass",  label: "Bass",  voice: bass,  color: "var(--chart-4)" },
]

export const TRACK_IDS: TrackId[] = ["kick", "snare", "hat", "bass"]
