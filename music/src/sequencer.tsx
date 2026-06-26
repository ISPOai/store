import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react"
import {
  Play,
  Square,
  Volume2,
  VolumeX,
  Trash2,
  Repeat,
  Flame,
  Download,
  Loader2,
  Check,
  Copy,
  FolderPlus,
} from "lucide-react"
import { shared, ui } from "@ispo/sdk"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Scrubber } from "@/components/ui/scrubber"
import { cn } from "@/lib/utils"
import { SequencerEngine, WAVEFORM_SAMPLES } from "@/audio/engine"
import { renderTrack } from "@/audio/render"
import { encodeWavPCM16 } from "@/audio/wav"
import { encodeMp3, type Mp3Bitrate } from "@/audio/mp3"
import { publishToFiles } from "@/lib/publish-to-files"
import {
  LFO_RATES,
  NOTE_NAMES,
  defaultTrackConfig,
  degreeLabel,
  snapToScale,
  type BassStep,
  type EngineState,
  type FilterType,
  type Key,
  type LfoDest,
  type LfoRate,
  type Pattern,
  type ScaleMode,
  type TrackConfig,
  type TrackId,
} from "@/audio/types"

// ─── Grid geometry ────────────────────────────────────────────────────────
// One "page" = 4×4 = 16 steps. The matrix keeps that shape across all step
// counts; pages simply stack to cover the sequence length. This is the core
// invariant the redesign preserves: pad size never tracks step count.
const STEPS_PER_PAGE = 16
const PAGE_COLS = 4
const PAGE_ROWS = 4

const DRAG_PX_PER_SEMITONE = 8
const BASS_RANGE_MIN = -12
const BASS_RANGE_MAX = 12
const KICK_PULSE_MS = 150

// Dark ink that stays legible on every track tint (used for bass degree labels
// printed on a colored cell).
const ON_CELL_INK = "var(--fd-on-cell)"

// Step count options exposed in the transport bar. Picked to map cleanly onto
// the page model: 8/16 are ½/1 page, 24/32 are 1.5/2 pages, 64 is 4 pages.
const STEP_COUNTS = [8, 16, 24, 32, 64] as const
type StepCount = (typeof STEP_COUNTS)[number]

const DEFAULT_STEP_COUNT: StepCount = 32

type TrackMeta = {
  id: TrackId
  label: string
  color: string
}

const TRACKS: TrackMeta[] = [
  { id: "kick", label: "Kick", color: "var(--chart-1)" },
  { id: "snare", label: "Snare", color: "var(--chart-2)" },
  { id: "hat", label: "Hat", color: "var(--chart-3)" },
  { id: "bass", label: "Bass", color: "var(--chart-4)" },
]

const MODES: ScaleMode[] = ["minor", "major", "dorian", "phrygian", "mixolydian"]

function emptyDrumRow(steps: number): boolean[] {
  return Array(steps).fill(false)
}

function emptyBassRow(steps: number): BassStep[] {
  return Array.from({ length: steps }, () => ({ on: false, degree: 0 }))
}

function emptyPattern(steps: number): Pattern {
  return {
    kick: emptyDrumRow(steps),
    snare: emptyDrumRow(steps),
    hat: emptyDrumRow(steps),
    bass: emptyBassRow(steps),
  }
}

// Resize a drum row to a new length, preserving existing content.
function resizeDrumRow(row: boolean[], newLen: number): boolean[] {
  if (row.length === newLen) return row
  if (row.length < newLen) {
    return [...row, ...Array<boolean>(newLen - row.length).fill(false)]
  }
  return row.slice(0, newLen)
}

function resizeBassRow(row: BassStep[], newLen: number): BassStep[] {
  if (row.length === newLen) return row
  if (row.length < newLen) {
    return [
      ...row,
      ...Array.from({ length: newLen - row.length }, () => ({ on: false, degree: 0 })),
    ]
  }
  return row.slice(0, newLen)
}

// "Alors on danse" (Stromae) preset at 32 steps — D minor, ~119 BPM, French-
// house pump. See the devlog for the full breakdown. Other step counts reuse
// the same 32-step pattern, truncated or padded as needed by the resize
// helpers above, so switching lengths never destroys user data.
function stromaePattern(steps: number): Pattern {
  const p = emptyPattern(steps)
  const twoBar = Math.min(steps, 32)

  // Four-on-the-floor kick.
  for (let i = 0; i < twoBar; i += 4) p.kick[i] = true

  // Backbeat on 2 & 4 for the first one-and-a-half bars; the final beat of
  // bar 2 (step 28) flowers into a 16th-note roll (29, 30, 31).
  for (const i of [4, 12, 20, 28, 29, 30, 31]) {
    if (i < steps) p.snare[i] = true
  }

  // Off-beat 8ths.
  for (const i of [2, 6, 10, 14, 18, 22, 26, 30]) {
    if (i < steps) p.hat[i] = true
  }

  // Chord progression Dm → B♭ → F → C, one chord per half-bar.
  const D = 0
  const Bb = -4
  const F = 3
  const C = -2
  const chords: Array<[number, number]> = [
    [0, D], [2, D], [4, D], [6, D],
    [8, Bb], [10, Bb], [12, Bb], [14, Bb],
    [16, F], [18, F], [20, F], [22, F],
    [24, C], [26, C], [28, C], [30, C],
  ]
  for (const [step, degree] of chords) {
    if (step < steps) p.bass[step] = { on: true, degree }
  }

  return p
}

function defaultState(): EngineState {
  const kick = defaultTrackConfig("kick")
  const snare = defaultTrackConfig("snare")
  const hat = defaultTrackConfig("hat")
  const bass = defaultTrackConfig("bass")

  snare.sidechain = { on: true, depth: 0.55 }
  snare.sends = { reverb: 0.4, delay: 0 }

  hat.sidechain = { on: true, depth: 0.75 }
  hat.sends = { reverb: 0.1, delay: 0.15 }

  bass.sidechain = { on: true, depth: 1 }
  bass.filter = { type: "lowpass", cutoff: 3500, resonance: 1.5 }
  bass.sends = { reverb: 0.1, delay: 0 }

  return {
    bpm: 119,
    swing: 0.5,
    steps: DEFAULT_STEP_COUNT,
    masterGain: 0.8,
    energy: 0.35,
    key: { tonic: 2, mode: "minor" },
    pattern: stromaePattern(DEFAULT_STEP_COUNT),
    tracks: { kick, snare, hat, bass },
  }
}

// Log-mapping for cutoff so the knob feels natural across 20..20000 Hz.
function cutoffFromNorm(norm: number): number {
  const minLog = Math.log(20)
  const maxLog = Math.log(20000)
  return Math.exp(minLog + (maxLog - minLog) * norm)
}

function normFromCutoff(hz: number): number {
  const minLog = Math.log(20)
  const maxLog = Math.log(20000)
  return (Math.log(hz) - minLog) / (maxLog - minLog)
}

function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}k`
  return `${Math.round(hz)}`
}

function lfoDestsFor(trackId: TrackId): LfoDest[] {
  return trackId === "bass" ? ["cutoff", "volume"] : ["cutoff", "volume", "pan"]
}

const FILTER_TYPES: { value: string; label: string }[] = [
  { value: "lowpass", label: "LP" },
  { value: "highpass", label: "HP" },
  { value: "bandpass", label: "BP" },
]

// ─── Main component ───────────────────────────────────────────────────────

export function Sequencer() {
  const [state, setState] = useState<EngineState>(defaultState)
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(-1)
  const [duckPulse, setDuckPulse] = useState<Record<TrackId, number>>({
    kick: 0,
    snare: 0,
    hat: 0,
    bass: 0,
  })

  // View-only state. Step count lives in the engine state because the
  // scheduler wraps modulo state.steps; focused track + current page are pure
  // UI concerns so they stay outside.
  const [focusedTrackId, setFocusedTrackId] = useState<TrackId>("kick")
  const [currentPage, setCurrentPage] = useState(0)

  const engineRef = useRef<SequencerEngine | null>(null)
  const lastStepRef = useRef(-1)
  const stateRef = useRef(state)
  stateRef.current = state

  if (!engineRef.current) engineRef.current = new SequencerEngine(state)
  const engine = engineRef.current

  useEffect(() => {
    engineRef.current?.setState(state)
  }, [state])

  useEffect(() => {
    if (!playing) {
      setPlayhead(-1)
      lastStepRef.current = -1
      return
    }
    let raf = 0
    const loop = () => {
      const step = engineRef.current?.currentStep() ?? -1
      setPlayhead(step)
      if (step !== lastStepRef.current) {
        lastStepRef.current = step
        const s = stateRef.current
        if (step >= 0 && s.pattern.kick[step] && !s.tracks.kick.mute) {
          const now = performance.now()
          setDuckPulse((prev) => {
            const next = { ...prev }
            for (const t of TRACKS) {
              if (t.id === "kick") continue
              if (s.tracks[t.id].sidechain.on) next[t.id] = now
            }
            return next
          })
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const togglePlay = useCallback(async () => {
    if (!engineRef.current) return
    if (playing) {
      engineRef.current.stop()
      setPlaying(false)
    } else {
      await engineRef.current.start()
      setPlaying(true)
    }
  }, [playing])

  const updateTrack = useCallback(
    (trackId: TrackId, updater: (cfg: TrackConfig) => TrackConfig) => {
      setState((s) => ({
        ...s,
        tracks: { ...s.tracks, [trackId]: updater(s.tracks[trackId]) },
      }))
    },
    [],
  )

  const toggleDrumStep = useCallback(
    (trackId: "kick" | "snare" | "hat", step: number) => {
      setState((s) => {
        if (step >= s.steps) return s
        const row = s.pattern[trackId].slice()
        row[step] = !row[step]
        const turningOn = row[step]
        const next = { ...s, pattern: { ...s.pattern, [trackId]: row } }
        if (turningOn) engineRef.current?.triggerNow(trackId)
        return next
      })
    },
    [],
  )

  const setBassStep = useCallback(
    (step: number, value: BassStep, audition: boolean) => {
      setState((s) => {
        if (step >= s.steps) return s
        const row = s.pattern.bass.slice()
        row[step] = value
        if (audition && value.on) engineRef.current?.triggerNow("bass", value.degree)
        return { ...s, pattern: { ...s.pattern, bass: row } }
      })
    },
    [],
  )

  const clearAll = useCallback(() => {
    setState((s) => ({ ...s, pattern: emptyPattern(s.steps) }))
  }, [])

  const clearTrack = useCallback((id: TrackId) => {
    setState((s) => {
      const cleared: Pattern = {
        ...s.pattern,
        kick: s.pattern.kick.slice(),
        snare: s.pattern.snare.slice(),
        hat: s.pattern.hat.slice(),
        bass: s.pattern.bass.slice(),
      }
      if (id === "bass") {
        cleared.bass = cleared.bass.map(() => ({ on: false, degree: 0 }))
      } else {
        cleared[id] = cleared[id].map(() => false)
      }
      return { ...s, pattern: cleared }
    })
  }, [])

  const setStepCount = useCallback((next: number) => {
    setState((s) => {
      if (s.steps === next) return s
      return {
        ...s,
        steps: next,
        pattern: {
          kick: resizeDrumRow(s.pattern.kick, next),
          snare: resizeDrumRow(s.pattern.snare, next),
          hat: resizeDrumRow(s.pattern.hat, next),
          bass: resizeBassRow(s.pattern.bass, next),
        },
      }
    })
    setCurrentPage(0)
  }, [])

  const totalPages = Math.max(1, Math.ceil(state.steps / STEPS_PER_PAGE))
  const focusedMeta: TrackMeta =
    TRACKS.find((t) => t.id === focusedTrackId) ?? (TRACKS[0] as TrackMeta)
  const focusedConfig = state.tracks[focusedTrackId]

  // Global keyboard shortcuts. Skip when an editable element owns the focus so
  // the BPM input / step-count export length still accept text. Modifier-less
  // keymaps so the user can hit them one-handed.
  useEffect(() => {
    const stepKeyToCount: Record<string, number> = {
      "8": 8,
      "6": 16,
      "4": 24,
      "3": 32,
      "2": 64,
    }
    const trackKeyToId: Record<string, TrackId> = {
      "1": "kick",
      "2": "snare",
      "3": "hat",
      "4": "bass",
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return
        if (target.getAttribute("role") === "slider") return
      }
      if (event.key === " ") {
        event.preventDefault()
        void togglePlay()
        return
      }
      if (event.key === "Escape") return
      const step = stepKeyToCount[event.key]
      if (step != null) {
        event.preventDefault()
        setStepCount(step)
        return
      }
      const trackId = trackKeyToId[event.key]
      if (trackId != null) {
        event.preventDefault()
        setFocusedTrackId(trackId)
        setCurrentPage(0)
        return
      }
      if (event.key === "[" || event.key === "PageUp") {
        event.preventDefault()
        setCurrentPage((p) => Math.max(0, p - 1))
        return
      }
      if (event.key === "]" || event.key === "PageDown") {
        event.preventDefault()
        setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
        return
      }
      if (event.key === "a" || event.key === "A") {
        event.preventDefault()
        engineRef.current?.triggerNow(focusedTrackId)
        return
      }
      if (event.key === "m" || event.key === "M") {
        event.preventDefault()
        updateTrack(focusedTrackId, (c) => ({ ...c, muted: !c.muted }))
        return
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (event.shiftKey) {
          event.preventDefault()
          clearAll()
        } else {
          event.preventDefault()
          clearTrack(focusedTrackId)
        }
        return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [togglePlay, setStepCount, focusedTrackId, totalPages, updateTrack, clearAll, clearTrack])

  return (
    <div className="fd-app flex h-screen w-full flex-col gap-3 overflow-hidden p-3 text-[var(--fd-ink)]">
      <TransportBar
        engine={engine}
        state={state}
        playing={playing}
        focusedTrack={focusedMeta}
        onTogglePlay={togglePlay}
        onClear={clearAll}
        onBpm={(bpm) => setState((s) => ({ ...s, bpm }))}
        onSwing={(swing) => setState((s) => ({ ...s, swing }))}
        onMaster={(masterGain) => setState((s) => ({ ...s, masterGain }))}
        onKey={(key) => setState((s) => ({ ...s, key }))}
        onStepCount={setStepCount}
        onAuditionFocus={() => engineRef.current?.triggerNow(focusedTrackId)}
      />

      <VoiceEditor
        meta={focusedMeta}
        config={focusedConfig}
        energy={state.energy}
        onEnergy={(energy) => setState((s) => ({ ...s, energy }))}
        onConfigChange={(updater) => updateTrack(focusedTrackId, updater)}
        onAudition={() => engineRef.current?.triggerNow(focusedTrackId)}
        onClearTrack={() => clearTrack(focusedTrackId)}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_440px]">
        <PatternSequencer
          pattern={state.pattern}
          tracks={state.tracks}
          keyState={state.key}
          stepCount={state.steps}
          currentPage={currentPage}
          totalPages={totalPages}
          playhead={playhead}
          focusedTrackId={focusedTrackId}
          onPageChange={setCurrentPage}
          onFocusTrack={(id) => setFocusedTrackId(id)}
          onToggleDrumStep={toggleDrumStep}
          onSetBassStep={setBassStep}
          onAudition={(id) => engineRef.current?.triggerNow(id)}
        />

        <MixBus
          engine={engine}
          state={state}
          focusedTrackId={focusedTrackId}
          onFocusTrack={setFocusedTrackId}
          onTrackChange={updateTrack}
          onMaster={(masterGain) => setState((s) => ({ ...s, masterGain }))}
          onAudition={(id) => engineRef.current?.triggerNow(id)}
        />
      </div>

      <footer className="fd-panel flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--fd-muted)]">
        <span className="text-[var(--fd-dim)]">FD-8 Web Audio Instrument</span>
        <span className="hidden sm:inline">All synthesis, no samples</span>
        <span className="ml-auto hidden text-[var(--fd-dim)] md:inline">Shortcuts</span>
        <Kbd>Space</Kbd>play
        <Kbd>1</Kbd>-<Kbd>4</Kbd>track
        <Kbd>[</Kbd>/<Kbd>]</Kbd>page
        <Kbd>A</Kbd>audition
        <Kbd>Del</Kbd>clear
      </footer>
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-[16px] items-center justify-center rounded border border-[var(--fd-border)] bg-[var(--fd-control)] px-1 font-mono text-[9px] font-semibold text-[var(--fd-ink)]">
      {children}
    </kbd>
  )
}

// ─── Transport ─────────────────────────────────────────────────────────────

type TransportBarProps = {
  engine: SequencerEngine
  state: EngineState
  playing: boolean
  focusedTrack: TrackMeta
  onTogglePlay: () => void
  onClear: () => void
  onBpm: (bpm: number) => void
  onSwing: (swing: number) => void
  onMaster: (g: number) => void
  onKey: (key: Key) => void
  onStepCount: (n: number) => void
  onAuditionFocus: () => void
}

function TransportBar({
  engine,
  state,
  playing,
  focusedTrack,
  onTogglePlay,
  onClear,
  onBpm,
  onSwing,
  onMaster,
  onKey,
  onStepCount,
  onAuditionFocus,
}: TransportBarProps) {
  const swingPct = Math.round(((state.swing - 0.5) / 0.25) * 100)
  const masterPct = Math.round(state.masterGain * 100)

  return (
    <div className="fd-panel shrink-0 px-5 py-4">
      <div className="grid items-center gap-4 xl:grid-cols-[280px_360px_minmax(280px,1fr)_340px]">
        <div className="flex min-w-0 items-center gap-5">
          <div className="min-w-[118px]">
            <div className="font-mono text-[32px] leading-none tracking-[0.05em] text-[var(--fd-amber)] [text-shadow:var(--fd-glow-text)]">
              FD-8
            </div>
            <div className="mt-1 grid gap-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--fd-muted)]">
              <span>Flight Deck</span>
              <span>Groove Station</span>
            </div>
          </div>

          <div aria-hidden className="h-16 w-px bg-[var(--fd-border)]" />

          <button
          type="button"
          onClick={onTogglePlay}
            className={cn(
              "fd-button flex h-[58px] w-[78px] items-center justify-center",
              playing && "fd-button-primary",
            )}
            aria-label={playing ? "Stop playback" : "Start playback"}
        >
            {playing ? <Square className="size-5" /> : <Play className="ml-0.5 size-6 fill-current" />}
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-4">
          <HardwareKnob
            label="Tempo"
            value={state.bpm}
            min={60}
            max={180}
            step={1}
            display={String(state.bpm)}
            onChange={onBpm}
            size="sm"
          />

          <HardwareKnob
            label="Swing"
            value={state.swing}
            min={0.5}
            max={0.75}
            step={0.01}
            display={`${swingPct}%`}
            onChange={onSwing}
            size="sm"
          />

          <div className="min-w-[112px]">
            <div className="fd-micro-label mb-1 text-center">Tempo BPM</div>
            <div className="fd-digital flex h-[52px] items-center justify-center px-5 font-mono text-[28px] leading-none tracking-[0.08em]">
              {state.bpm}
            </div>
          </div>

          <HardwareKnob
            label="Master"
            value={state.masterGain}
            min={0}
            max={1}
            step={0.01}
            display={`${masterPct}%`}
            onChange={onMaster}
            size="sm"
            icon={<Volume2 className="size-3" />}
          />
        </div>

        <div className="min-w-0 self-stretch">
          <ActivityScope engine={engine} />
        </div>

        <div className="flex min-w-0 flex-wrap items-end justify-end gap-3">
          <div className="flex flex-col gap-1">
            <Label>Track</Label>
            <button
              type="button"
              onClick={onAuditionFocus}
              className="fd-button fd-button-active flex h-8 min-w-[96px] items-center justify-center gap-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ ["--track-color" as string]: focusedTrack.color }}
            >
              <span className="size-2 rounded-full" style={{ background: focusedTrack.color }} />
              {focusedTrack.label}
            </button>
          </div>

          <ScalePicker keyState={state.key} onChange={onKey} />
          <StepCountSelector value={state.steps} onChange={onStepCount} />

          <div className="flex items-center gap-2">
            <ExportControl state={state} />
            <button
              type="button"
              onClick={onClear}
              className="fd-button flex h-8 items-center gap-1.5 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
              title="Clear all steps"
            >
              <Trash2 className="size-3.5" />
              CLR TRK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

type HardwareKnobProps = {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  display?: string
  onChange: (value: number) => void
  color?: string
  size?: "sm" | "md"
  icon?: ReactNode
  disabled?: boolean
  resetTo?: number
}

function clampRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function snapStep(value: number, min: number, step: number): number {
  if (step <= 0) return value
  return min + Math.round((value - min) / step) * step
}

function HardwareKnob({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  display,
  onChange,
  color = "var(--fd-amber)",
  size = "md",
  icon,
  disabled,
  resetTo,
}: HardwareKnobProps) {
  const dragRef = useRef<{ pointerId: number; startY: number; startNorm: number } | null>(null)
  const [active, setActive] = useState(false)
  const norm = max === min ? 0 : clampRange((value - min) / (max - min), 0, 1)
  const displayValue = display ?? String(Math.round(norm * 100))
  const emitNorm = useCallback(
    (nextNorm: number) => {
      const raw = min + clampRange(nextNorm, 0, 1) * (max - min)
      const snapped = snapStep(raw, min, step)
      onChange(clampRange(snapped, min, max))
    },
    [max, min, onChange, step],
  )

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startNorm: norm }
      setActive(true)
    },
    [disabled, norm],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const delta = (drag.startY - event.clientY) / 110
      emitNorm(drag.startNorm + delta)
    },
    [emitNorm],
  )

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setActive(false)
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const small = step > 0 ? step : (max - min) / 100
      const large = small * 10
      const map: Record<string, number> = {
        ArrowUp: small,
        ArrowRight: small,
        ArrowDown: -small,
        ArrowLeft: -small,
        PageUp: large,
        PageDown: -large,
      }
      if (event.key === "Home") {
        event.preventDefault()
        onChange(min)
        return
      }
      if (event.key === "End") {
        event.preventDefault()
        onChange(max)
        return
      }
      const delta = map[event.key]
      if (delta != null) {
        event.preventDefault()
        onChange(clampRange(snapStep(value + delta, min, step), min, max))
      }
    },
    [max, min, onChange, step, value],
  )

  return (
    <div className={cn("flex flex-col items-center gap-1.5", disabled && "opacity-45")}>
      <div className="fd-micro-label flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={displayValue}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => resetTo != null && onChange(resetTo)}
        className={cn(
          "fd-knob cursor-ns-resize touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fd-amber)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fd-bg)]",
          size === "sm" && "fd-knob-small",
          active && "brightness-125",
        )}
        style={{
          ["--knob-color" as string]: color,
          ["--knob-progress" as string]: `${norm * 270}deg`,
          ["--knob-angle" as string]: `${-135 + norm * 270}deg`,
        }}
      />
      <div className="font-mono text-[11px] leading-none text-[var(--fd-amber)] [text-shadow:var(--fd-glow-readout)]">
        {displayValue}
      </div>
    </div>
  )
}

// Live scrolling oscillogram of the master output. Each frame the canvas
// slides left and the newest analyser samples are drawn as min/max columns at
// the right edge, so "now" is always the right side and the groove's shape —
// kick spikes, bass body, hat ticks — stays readable as it streams past.
// All canvas work happens in device pixels (identity transform).
function ActivityScope({ engine }: { engine: SequencerEngine }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas?.getContext("2d")
    if (!canvas || !g) return

    const buf = new Float32Array(WAVEFORM_SAMPLES)
    let raf = 0
    let lastTs = 0
    let colCarry = 0
    let grad: CanvasGradient | null = null
    let colorKey = ""

    // Visual-only vertical gain (a scope's volts/div): drum tails and bass
    // sit well below the limiter ceiling and would hug the center line at 1:1.
    const GAIN = 1.6
    // Scroll speed in CSS px/s — ~120 keeps roughly two bars visible at
    // house tempo in the transport slot.
    const SPEED = 120

    const cssColor = (name: string, fallback: string) => {
      const value = getComputedStyle(canvas).getPropertyValue(name).trim()
      return value || fallback
    }

    const drawBaseline = (pw: number, mid: number, dpr: number, color: string) => {
      g.strokeStyle = color
      g.lineWidth = Math.max(1, dpr)
      g.beginPath()
      g.moveTo(0, mid)
      g.lineTo(pw, mid)
      g.stroke()
    }

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw)
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (!w || !h) return
      const pw = Math.round(w * dpr)
      const ph = Math.round(h * dpr)
      const mid = ph / 2
      const amp = mid - 4 * dpr
      const lineDim = cssColor("--fd-scope-line-dim", "currentColor")
      const lineHot = cssColor("--fd-scope-line-hot", "currentColor")
      const line = cssColor("--fd-scope-line", "currentColor")
      const glow = cssColor("--fd-scope-glow", "transparent")
      const nextColorKey = `${lineDim}|${lineHot}|${line}|${glow}`

      if (canvas.width !== pw || canvas.height !== ph || colorKey !== nextColorKey) {
        colorKey = nextColorKey
        canvas.width = pw
        canvas.height = ph
        // Hot core, dimmer extremes — gives the trace vertical depth.
        grad = g.createLinearGradient(0, 0, 0, ph)
        grad.addColorStop(0, lineDim)
        grad.addColorStop(0.5, lineHot)
        grad.addColorStop(1, lineDim)
        // Resizing wipes the bitmap; seed a baseline so the scope never
        // shows an empty box while history refills.
        drawBaseline(pw, mid, dpr, lineDim)
      }

      // Wall-clock delta drives both scroll distance and how many analyser
      // samples count as "new"; clamp so a background tab doesn't warp time.
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0
      lastTs = ts
      if (!dt) return

      colCarry += dt * SPEED * dpr
      const cols = Math.floor(colCarry)
      if (!cols) return
      colCarry -= cols

      const live = engine.getWaveform(buf)
      const fresh = live
        ? Math.min(WAVEFORM_SAMPLES, Math.max(cols, Math.round(dt * engine.sampleRate())))
        : 0

      // Slide history left. drawImage snapshots the source bitmap first, so
      // blitting a canvas onto itself is safe. "copy" replaces the whole
      // surface (source-over would stack old frames into a smear) and leaves
      // the vacated right strip transparent.
      g.globalCompositeOperation = "copy"
      g.drawImage(canvas, -cols, 0)
      g.globalCompositeOperation = "source-over"

      g.lineWidth = Math.max(1, 1.2 * dpr)
      g.lineCap = "round"
      g.strokeStyle = grad ?? line
      g.shadowColor = glow
      g.shadowBlur = 4 * dpr
      for (let c = 0; c < cols; c++) {
        // Each new column condenses its slice of the freshest samples
        // (tail of the analyser window) to a min/max envelope.
        let lo = 0
        let hi = 0
        if (fresh) {
          const base = WAVEFORM_SAMPLES - fresh
          const from = base + Math.floor((c / cols) * fresh)
          const to = Math.max(base + Math.floor(((c + 1) / cols) * fresh), from + 1)
          for (let i = from; i < to; i++) {
            const v = buf[i] ?? 0
            if (v < lo) lo = v
            if (v > hi) hi = v
          }
        }
        const x = pw - cols + c + 0.5
        const y1 = mid - clampRange(hi * GAIN, -1, 1) * amp
        const y2 = mid - clampRange(lo * GAIN, -1, 1) * amp
        g.beginPath()
        g.moveTo(x, y1)
        // Silence still leaves a visible hairline dot instead of a gap.
        g.lineTo(x, Math.max(y2, y1 + 1))
        g.stroke()
      }
      g.shadowBlur = 0
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  return (
    <div className="fd-scope relative h-full min-h-[72px] min-w-[260px] overflow-hidden">
      <canvas ref={canvasRef} aria-hidden className="h-full w-full" />
    </div>
  )
}

function Divider() {
  return <div aria-hidden className="h-8 w-px shrink-0 bg-border" />
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="fd-micro-label">
      {children}
    </span>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="fd-micro-label text-[var(--fd-dim)]">
      {children}
    </span>
  )
}

function ScalePicker({ keyState, onChange }: { keyState: Key; onChange: (k: Key) => void }) {
  const tonicLabel = NOTE_NAMES[keyState.tonic]
  return (
    <div className="flex flex-col gap-1">
      <Label>Key</Label>
      <div className="flex items-center gap-1">
        <Select
          value={String(keyState.tonic)}
          onValueChange={(v) => onChange({ ...keyState, tonic: Number(v) })}
        >
          <SelectTrigger className="fd-select-trigger h-7 w-[54px] px-2 font-mono text-xs">
            <SelectValue>{tonicLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {NOTE_NAMES.map((name, i) => (
              <SelectItem key={name} value={String(i)} className="text-xs">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={keyState.mode}
          onValueChange={(v) => onChange({ ...keyState, mode: v as ScaleMode })}
        >
          <SelectTrigger className="fd-select-trigger h-7 w-[96px] px-2 font-mono text-xs capitalize">
            <SelectValue>{keyState.mode}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MODES.map((m) => (
              <SelectItem key={m} value={m} className="text-xs capitalize">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function StepCountSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>Steps</Label>
      <div
        role="radiogroup"
        aria-label="Sequence length"
        className="inline-flex h-7 overflow-hidden rounded-md border border-[var(--fd-border)] bg-[var(--fd-control)]"
      >
        {STEP_COUNTS.map((n, i) => {
          const selected = n === value
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(n)}
              className={cn(
                "min-w-[34px] px-2 font-mono text-[11px] font-semibold tabular-nums transition-colors",
                i > 0 && "border-l border-[var(--fd-border)]",
                selected
                  ? "bg-[var(--fd-amber)] text-[var(--fd-on-accent)]"
                  : "text-[var(--fd-muted)] hover:bg-[var(--fd-control-strong)] hover:text-[var(--fd-ink)]",
              )}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type VoiceEditorProps = {
  meta: TrackMeta
  config: TrackConfig
  energy: number
  onEnergy: (value: number) => void
  onConfigChange: (updater: (cfg: TrackConfig) => TrackConfig) => void
  onAudition: () => void
  onClearTrack: () => void
}

function VoiceEditor({
  meta,
  config,
  energy,
  onEnergy,
  onConfigChange,
  onAudition,
  onClearTrack,
}: VoiceEditorProps) {
  const cutoffNorm = normFromCutoff(config.filter.cutoff)
  const cutoffDisplay = formatHz(config.filter.cutoff)
  const resDisplay = config.filter.resonance.toFixed(1)
  const scDisabled = meta.id === "kick"
  const scOn = config.sidechain.on && !scDisabled
  const duckPct = Math.round(config.sidechain.depth * 100)
  const volPct = Math.round(config.volume * 100)
  const lfoPct = Math.round(config.lfo.amount * 100)
  const revPct = Math.round(config.sends.reverb * 100)
  const dlyPct = Math.round(config.sends.delay * 100)
  const energyPct = Math.round(energy * 100)
  const dests = lfoDestsFor(meta.id)

  return (
    <section className="fd-panel shrink-0 p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="fd-section-label">Voice Edit</span>
        <span
          className="rounded-md border px-4 py-1 font-mono text-[12px] font-black uppercase tracking-[0.16em]"
          style={{
            borderColor: meta.color,
            color: meta.color,
            boxShadow: `0 0 14px color-mix(in srgb, ${meta.color} 28%, transparent)`,
          }}
        >
          {meta.label}
        </span>
        <span className="ml-auto fd-micro-label">Subtractive engine · Fixed chain · Kick ducking</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.05fr_1.35fr_1.1fr_1.05fr_1.05fr]">
        <RackModule title="Voice">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onAudition}
              className="fd-button flex h-9 flex-1 items-center justify-center gap-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
            >
              <Play className="size-3.5" />
              Aud
            </button>
            <button
              type="button"
              onClick={() => onConfigChange((c) => ({ ...c, mute: !c.mute }))}
              className={cn(
                "fd-button flex h-9 w-11 items-center justify-center",
                config.mute && "fd-button-active",
              )}
              style={{ ["--track-color" as string]: meta.color }}
              aria-label={config.mute ? `Unmute ${meta.label}` : `Mute ${meta.label}`}
              aria-pressed={config.mute}
            >
              {config.mute ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <button
              type="button"
              onClick={onClearTrack}
              className="fd-button flex h-9 w-11 items-center justify-center hover:text-[var(--destructive)]"
              aria-label={`Clear ${meta.label} pattern`}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-around">
            <HardwareKnob
              label="Volume"
              value={config.volume}
              display={`${volPct}%`}
              onChange={(volume) => onConfigChange((c) => ({ ...c, volume }))}
              color={meta.color}
              resetTo={defaultTrackConfig(meta.id).volume}
            />
          </div>
        </RackModule>

        <RackModule title="Filter">
          <div className="mb-3 flex items-center gap-2">
            <Segmented
              options={FILTER_TYPES}
              value={config.filter.type}
              onChange={(type) =>
                onConfigChange((c) => ({
                  ...c,
                  filter: { ...c.filter, type: type as FilterType },
                }))
              }
              ariaPrefix="Filter"
            />
          </div>
          <div className="flex items-center justify-around gap-4">
            <HardwareKnob
              label="Cutoff"
              value={cutoffNorm}
              display={cutoffDisplay}
              onChange={(n) =>
                onConfigChange((c) => ({
                  ...c,
                  filter: { ...c.filter, cutoff: cutoffFromNorm(n) },
                }))
              }
              color={meta.color}
              resetTo={normFromCutoff(defaultTrackConfig(meta.id).filter.cutoff)}
            />
            <HardwareKnob
              label="Reso"
              value={config.filter.resonance}
              min={0.5}
              max={20}
              step={0.1}
              display={resDisplay}
              onChange={(resonance) =>
                onConfigChange((c) => ({ ...c, filter: { ...c.filter, resonance } }))
              }
              color="var(--fd-amber)"
              resetTo={1}
            />
          </div>
        </RackModule>

        <RackModule title="Amp / Pump">
          <div className="mb-3 flex items-center justify-between">
            <span className="fd-micro-label">Sidechain</span>
            <button
              type="button"
              disabled={scDisabled}
              onClick={() =>
                onConfigChange((c) => ({
                  ...c,
                  sidechain: { ...c.sidechain, on: !scOn },
                }))
              }
              className={cn(
                "fd-button min-w-[58px] px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-35",
                scOn && "fd-button-active",
              )}
              style={{ ["--track-color" as string]: meta.color }}
              aria-pressed={scOn}
            >
              {scOn ? "On" : "Off"}
            </button>
          </div>
          <div className="flex items-center justify-around">
            <HardwareKnob
              label="Duck"
              value={config.sidechain.depth}
              display={`${duckPct}%`}
              onChange={(depth) =>
                onConfigChange((c) => ({ ...c, sidechain: { ...c.sidechain, depth } }))
              }
              color={meta.color}
              disabled={!scOn}
              resetTo={1}
            />
          </div>
        </RackModule>

        <RackModule title="LFO">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <LfoRateSelect
              value={config.lfo.rate}
              onChange={(rate) => onConfigChange((c) => ({ ...c, lfo: { ...c.lfo, rate } }))}
            />
            <LfoDestSelect
              value={config.lfo.dest}
              onChange={(dest) => onConfigChange((c) => ({ ...c, lfo: { ...c.lfo, dest } }))}
              options={dests}
            />
          </div>
          <div className="flex items-center justify-around">
            <HardwareKnob
              label="Depth"
              value={config.lfo.amount}
              display={`${lfoPct}%`}
              onChange={(amount) => onConfigChange((c) => ({ ...c, lfo: { ...c.lfo, amount } }))}
              color={meta.color}
              resetTo={0}
            />
          </div>
        </RackModule>

        <RackModule title="Sends / Energy">
          <div className="grid grid-cols-3 gap-2">
            <HardwareKnob
              label="Rev"
              value={config.sends.reverb}
              display={`${revPct}%`}
              onChange={(reverb) =>
                onConfigChange((c) => ({ ...c, sends: { ...c.sends, reverb } }))
              }
              color={meta.color}
              size="sm"
              resetTo={0}
            />
            <HardwareKnob
              label="Dly"
              value={config.sends.delay}
              display={`${dlyPct}%`}
              onChange={(delay) =>
                onConfigChange((c) => ({ ...c, sends: { ...c.sends, delay } }))
              }
              color={meta.color}
              size="sm"
              resetTo={0}
            />
            <HardwareKnob
              label="Energy"
              value={energy}
              display={`${energyPct}`}
              onChange={onEnergy}
              color="var(--fd-amber)"
              size="sm"
              icon={<Flame className="size-3" />}
              resetTo={0}
            />
          </div>
        </RackModule>
      </div>
    </section>
  )
}

function RackModule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fd-module rounded-md p-3">
      <div className="fd-micro-label mb-3">{title}</div>
      {children}
    </div>
  )
}

// ─── Energy strip (left edge anchor) ──────────────────────────────────────

function EnergyStrip({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const pct = Math.round(value * 100)
  const dragRef = useRef<{ pointerId: number; startY: number; startNorm: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const norm = Math.max(0, Math.min(1, value))
  const active = dragging || hovering

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const rect = event.currentTarget.getBoundingClientRect()
      const startNorm = norm
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startNorm }
      setDragging(true)
      // Click anywhere on the rail to jump there.
      const next = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height))
      if (Math.abs(next - startNorm) > 0.05) {
        onChange(next)
        dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startNorm: next }
      }
    },
    [norm, onChange],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d || d.pointerId !== event.pointerId) return
      const rect = event.currentTarget.getBoundingClientRect()
      const next = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height))
      onChange(next)
    },
    [onChange],
  )

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setDragging(false)
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const small = 0.02
      const large = 0.1
      const map: Record<string, number> = {
        ArrowUp: small,
        ArrowRight: small,
        ArrowDown: -small,
        ArrowLeft: -small,
        PageUp: large,
        PageDown: -large,
      }
      if (event.key === "Home") {
        event.preventDefault()
        onChange(0)
        return
      }
      if (event.key === "End") {
        event.preventDefault()
        onChange(1)
        return
      }
      const delta = map[event.key]
      if (delta != null) {
        event.preventDefault()
        onChange(Math.max(0, Math.min(1, norm + delta)))
      }
    },
    [norm, onChange],
  )

  return (
    <div
      className={cn(
        "hidden w-[78px] shrink-0 flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 md:flex",
      )}
      aria-label="Energy macro"
    >
      <div className="flex w-full items-center justify-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Flame className="size-3" />
        Energy
      </div>

      {/* Cap the rail height so the strip stays an instrument-sized element
          instead of stretching to fill the body. 260px = ~3.4× the cap width,
          plenty of throw for a 0..1 macro. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="relative flex h-full max-h-[260px] w-7 items-center justify-center">
          <div
            role="slider"
            aria-label="Energy macro"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={value}
            aria-valuetext={`${pct}`}
            tabIndex={0}
            onPointerEnter={() => setHovering(true)}
            onPointerLeave={() => setHovering(false)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
            onDoubleClick={() => onChange(0)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card relative flex h-full w-full cursor-ns-resize touch-none select-none items-center justify-center rounded-full"
          >
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 w-1 rounded-full transition-colors",
                active ? "bg-muted-foreground/30" : "bg-muted",
              )}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 w-1 rounded-full bg-primary transition-[height] duration-100"
              style={{ height: `${pct}%`, opacity: active ? 1 : 0.85 }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 h-2 w-5 -translate-x-1/2 rounded-full bg-foreground shadow-sm transition-[bottom] duration-100"
              style={{ bottom: `calc(${pct}% - 4px)` }}
            />
          </div>
        </div>
      </div>

      <span
        className={cn(
          "font-mono text-[11px] tabular-nums transition-colors",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {pct}
      </span>
    </div>
  )
}

type PatternSequencerProps = {
  pattern: Pattern
  tracks: Record<TrackId, TrackConfig>
  keyState: Key
  stepCount: number
  currentPage: number
  totalPages: number
  playhead: number
  focusedTrackId: TrackId
  onPageChange: (page: number) => void
  onFocusTrack: (id: TrackId) => void
  onToggleDrumStep: (trackId: "kick" | "snare" | "hat", step: number) => void
  onSetBassStep: (step: number, value: BassStep, audition: boolean) => void
  onAudition: (id: TrackId) => void
}

function PatternSequencer({
  pattern,
  tracks,
  keyState,
  stepCount,
  currentPage,
  totalPages,
  playhead,
  focusedTrackId,
  onPageChange,
  onFocusTrack,
  onToggleDrumStep,
  onSetBassStep,
  onAudition,
}: PatternSequencerProps) {
  const pageStart = currentPage * STEPS_PER_PAGE
  const visibleSteps = Array.from({ length: STEPS_PER_PAGE }, (_, i) => pageStart + i)

  return (
    <section className="fd-panel min-h-0 overflow-hidden p-4" aria-label="Pattern Sequencer">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="fd-section-label">Pattern Sequencer</span>
        <span className="ml-auto fd-micro-label">{STEPS_PER_PAGE} step x {TRACKS.length} trk</span>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, page) => {
            const selected = page === currentPage
            const start = page * STEPS_PER_PAGE + 1
            const end = Math.min(stepCount, (page + 1) * STEPS_PER_PAGE)
            return (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                className={cn(
                  "fd-button h-7 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em]",
                  selected && "fd-button-primary",
                )}
                aria-pressed={selected}
              >
                {String(start).padStart(2, "0")}-{String(end).padStart(2, "0")}
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 overflow-auto pb-1">
        <div
          className="grid min-w-[940px] gap-2"
          style={{
            gridTemplateColumns: `150px repeat(${STEPS_PER_PAGE}, minmax(42px, 1fr))`,
          }}
        >
          <div aria-hidden />
          {visibleSteps.map((step) => (
            <div
              key={`head-${step}`}
              className={cn(
                "fd-micro-label flex h-5 items-center justify-center text-[var(--fd-dim)]",
                playhead === step && "text-[var(--fd-amber)]",
              )}
            >
              {String(step + 1).padStart(2, "0")}
            </div>
          ))}

          {TRACKS.map((track) => {
            const focused = track.id === focusedTrackId
            const muted = tracks[track.id].mute
            return (
              <FragmentRow key={track.id}>
                <button
                  type="button"
                  onClick={() => onFocusTrack(track.id)}
                  className={cn(
                    "fd-button flex h-[46px] items-center gap-3 px-3 text-left",
                    focused && "fd-button-active",
                    muted && "opacity-55",
                  )}
                  style={{ ["--track-color" as string]: track.color }}
                  aria-pressed={focused}
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full shadow-[0_0_12px_currentColor]"
                    style={{ background: track.color, color: track.color }}
                  />
                  <span className="min-w-0 flex-1 font-mono text-[12px] font-black uppercase tracking-[0.14em]">
                    {track.label}
                  </span>
                  {muted && <VolumeX className="size-3.5 text-[var(--fd-muted)]" />}
                </button>

                {visibleSteps.map((step) => {
                  const inRange = step < stepCount
                  if (!inRange) {
                    return (
                      <div
                        key={`${track.id}-${step}`}
                        aria-hidden
                        className="fd-cell opacity-25"
                        style={{ ["--track-color" as string]: track.color }}
                      />
                    )
                  }
                  const isPlayhead = playhead === step
                  if (track.id === "bass") {
                    return (
                      <BassGridCell
                        key={`${track.id}-${step}`}
                        step={step}
                        cell={pattern.bass[step] ?? { on: false, degree: 0 }}
                        mode={keyState.mode}
                        muted={muted}
                        isPlayhead={isPlayhead}
                        color={track.color}
                        onSet={onSetBassStep}
                      />
                    )
                  }

                  const drumId = track.id as "kick" | "snare" | "hat"
                  const on = pattern[drumId][step] ?? false
                  return (
                    <button
                      key={`${track.id}-${step}`}
                      type="button"
                      onClick={() => {
                        if (!on) onAudition(track.id)
                        onToggleDrumStep(drumId, step)
                      }}
                      className={cn(
                        "fd-cell",
                        on && "fd-cell-on",
                        isPlayhead && "fd-cell-playhead",
                        muted && on && "opacity-45",
                      )}
                      style={{ ["--track-color" as string]: track.color }}
                      aria-label={`${track.label} step ${step + 1} ${on ? "on" : "off"}`}
                      aria-pressed={on}
                    />
                  )
                })}
              </FragmentRow>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>
}

type BassGridCellProps = {
  step: number
  cell: BassStep
  mode: ScaleMode
  muted: boolean
  isPlayhead: boolean
  color: string
  onSet: (step: number, value: BassStep, audition: boolean) => void
}

function BassGridCell({
  step,
  cell,
  mode,
  muted,
  isPlayhead,
  color,
  onSet,
}: BassGridCellProps) {
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startDegree: number
    lastDegree: number
    moved: boolean
    startedOff: boolean
  } | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      if (!cell.on) {
        const next: BassStep = { on: true, degree: 0 }
        onSet(step, next, true)
        dragRef.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          startDegree: 0,
          lastDegree: 0,
          moved: false,
          startedOff: true,
        }
        return
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startDegree: cell.degree,
        lastDegree: cell.degree,
        moved: false,
        startedOff: false,
      }
    },
    [cell, onSet, step],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const dy = drag.startY - event.clientY
      if (Math.abs(dy) < 3 && !drag.moved) return
      const raw = drag.startDegree + Math.round(dy / DRAG_PX_PER_SEMITONE)
      const clamped = Math.min(BASS_RANGE_MAX, Math.max(BASS_RANGE_MIN, raw))
      const snapped = snapToScale(clamped, mode)
      if (snapped !== drag.lastDegree) {
        drag.lastDegree = snapped
        drag.moved = true
        onSet(step, { on: true, degree: snapped }, true)
      } else if (Math.abs(dy) >= 3) {
        drag.moved = true
      }
    },
    [mode, onSet, step],
  )

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      const { moved, startedOff } = drag
      dragRef.current = null
      if (!moved && !startedOff) onSet(step, { on: false, degree: 0 }, false)
    },
    [onSet, step],
  )

  const onPointerCancel = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }, [])

  const label = cell.on ? degreeLabel(cell.degree, mode) : ""
  const octaveShift = cell.on ? Math.floor(cell.degree / 12) : 0

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        "fd-cell relative flex touch-none select-none items-center justify-center font-mono text-[15px] font-black tabular-nums",
        cell.on && "fd-cell-on",
        isPlayhead && "fd-cell-playhead",
        muted && cell.on && "opacity-45",
      )}
      style={{ ["--track-color" as string]: color, color: cell.on ? ON_CELL_INK : undefined }}
      aria-label={`Bass step ${step + 1} ${cell.on ? `degree ${label}` : "off"}`}
      aria-pressed={cell.on}
    >
      {label}
      {cell.on && octaveShift !== 0 && (
        <span className="absolute right-1 top-0.5 text-[9px] leading-none opacity-70">
          {octaveShift > 0 ? "^".repeat(Math.min(2, octaveShift)) : "v".repeat(Math.min(2, -octaveShift))}
        </span>
      )}
    </button>
  )
}

const METER_KEYS = ["kick", "snare", "hat", "bass", "master"] as const
type MeterKey = (typeof METER_KEYS)[number]

type MixBusProps = {
  engine: SequencerEngine
  state: EngineState
  focusedTrackId: TrackId
  onFocusTrack: (id: TrackId) => void
  onTrackChange: (trackId: TrackId, updater: (cfg: TrackConfig) => TrackConfig) => void
  onMaster: (value: number) => void
  onAudition: (id: TrackId) => void
}

function MixBus({
  engine,
  state,
  focusedTrackId,
  onFocusTrack,
  onTrackChange,
  onMaster,
  onAudition,
}: MixBusProps) {
  const meterEls = useRef<Partial<Record<MeterKey, HTMLDivElement | null>>>({})
  const shown = useRef<Record<MeterKey, number>>({
    kick: 0,
    snare: 0,
    hat: 0,
    bass: 0,
    master: 0,
  })

  // One loop feeds all five meters via direct style writes — re-rendering
  // React 60 times a second for meter movement would be wasteful.
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const levels = engine.meterLevels()
      for (const key of METER_KEYS) {
        const el = meterEls.current[key]
        if (!el) continue
        const target = levels ? levels[key] : 0
        // Meter ballistics: jump to peaks instantly, bleed down smoothly.
        const prev = shown.current[key]
        const next = target > prev ? target : prev * 0.92
        shown.current[key] = next
        // sqrt mapping spreads the useful range out like a dB-ish scale.
        el.style.height = `${Math.min(100, Math.sqrt(next) * 100).toFixed(1)}%`
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  return (
    <section className="fd-panel flex min-h-0 flex-col overflow-hidden p-4">
      <div className="mb-4 flex shrink-0 items-center gap-3">
        <span className="fd-section-label">Mix Bus</span>
        <span className="ml-auto fd-micro-label">4ch + mst</span>
      </div>

      <div className="grid min-h-[300px] flex-1 grid-cols-5 items-stretch gap-2">
        {TRACKS.map((track) => (
          <MixChannel
            key={track.id}
            meta={track}
            config={state.tracks[track.id]}
            focused={focusedTrackId === track.id}
            meterRef={(el) => {
              meterEls.current[track.id] = el
            }}
            onFocus={() => onFocusTrack(track.id)}
            onVolume={(volume) => onTrackChange(track.id, (c) => ({ ...c, volume }))}
            onMute={() => onTrackChange(track.id, (c) => ({ ...c, mute: !c.mute }))}
            onAudition={() => onAudition(track.id)}
          />
        ))}

        <MasterChannel
          value={state.masterGain}
          onChange={onMaster}
          meterRef={(el) => {
            meterEls.current.master = el
          }}
        />
      </div>
    </section>
  )
}

function MixChannel({
  meta,
  config,
  focused,
  meterRef,
  onFocus,
  onVolume,
  onMute,
  onAudition,
}: {
  meta: TrackMeta
  config: TrackConfig
  focused: boolean
  meterRef: (el: HTMLDivElement | null) => void
  onFocus: () => void
  onVolume: (value: number) => void
  onMute: () => void
  onAudition: () => void
}) {
  const pct = Math.round(config.volume * 100)

  return (
    <div
      className={cn(
        "fd-channel-strip min-w-0 rounded-md border border-[var(--fd-border)] bg-[var(--fd-module)] px-1.5 py-2",
        focused && "shadow-[0_0_18px_var(--fd-glow-soft)]",
      )}
      style={{
        ["--track-color" as string]: meta.color,
        borderColor: focused ? meta.color : undefined,
      }}
    >
      <button
        type="button"
        onClick={onFocus}
        className={cn(
          "fd-button flex h-10 w-full items-center justify-center truncate px-1 font-mono text-[9px] font-black uppercase tracking-[0.08em]",
          focused && "fd-button-active",
        )}
        style={{ ["--track-color" as string]: meta.color }}
      >
        {meta.label}
      </button>

      <div className="fd-channel-fader flex min-h-0 items-center justify-center gap-1.5">
        <div className="fd-channel-meter flex w-2 items-end overflow-hidden rounded-full bg-[var(--fd-rail)]">
          <div ref={meterRef} className="fd-vu w-full rounded-full" style={{ height: "0%" }} />
        </div>
        <Scrubber
          value={config.volume}
          onChange={onVolume}
          label="Vol"
          displayValue={`${pct}`}
          color={meta.color}
          size="xl"
          resetTo={defaultTrackConfig(meta.id).volume}
          bare
        />
      </div>

      <div className="fd-channel-controls grid w-full grid-cols-1 gap-1">
        <button
          type="button"
          onClick={onMute}
          className={cn(
            "fd-button flex h-10 w-full items-center justify-center font-mono text-[10px] font-black",
            config.mute && "fd-button-active",
          )}
          style={{ ["--track-color" as string]: meta.color }}
          aria-label={config.mute ? `Unmute ${meta.label}` : `Mute ${meta.label}`}
          aria-pressed={config.mute}
        >
          M
        </button>
        <button
          type="button"
          onClick={onAudition}
          className="fd-button flex h-10 w-full items-center justify-center font-mono text-[10px] font-black"
          aria-label={`Audition ${meta.label}`}
        >
          A
        </button>
      </div>

      <div className="self-center font-mono text-[10px] leading-none text-[var(--fd-amber)]">{pct}</div>
    </div>
  )
}

function MasterChannel({
  value,
  onChange,
  meterRef,
}: {
  value: number
  onChange: (value: number) => void
  meterRef: (el: HTMLDivElement | null) => void
}) {
  const pct = Math.round(value * 100)
  return (
    <div className="fd-channel-strip fd-master-channel min-w-0 rounded-md border px-1.5 py-2">
      <div className="fd-digital flex h-10 w-full items-center justify-center font-mono text-[10px] font-black uppercase tracking-[0.12em]">
        MST
      </div>
      <div className="fd-channel-fader flex min-h-0 items-center justify-center gap-1.5">
        <div className="fd-channel-meter flex w-2 items-end overflow-hidden rounded-full bg-[var(--fd-rail)]">
          <div ref={meterRef} className="fd-vu w-full rounded-full" style={{ height: "0%" }} />
        </div>
        <Scrubber
          value={value}
          onChange={onChange}
          label="Master"
          displayValue={`${pct}`}
          color="var(--fd-amber)"
          size="xl"
          resetTo={0.8}
          bare
        />
      </div>
      <div className="fd-channel-controls pointer-events-none grid w-full grid-cols-1 gap-1 opacity-0" aria-hidden>
        <div className="h-10" />
        <div className="h-10" />
      </div>
      <div className="self-center font-mono text-[10px] leading-none text-[var(--fd-amber)]">{pct}</div>
    </div>
  )
}

// ─── Track overview strip ─────────────────────────────────────────────────

type TrackOverviewStripProps = {
  pattern: Pattern
  stepCount: number
  currentPage: number
  stepsPerPage: number
  focusedTrackId: TrackId
  playhead: number
  onFocusTrack: (id: TrackId) => void
}

function TrackOverviewStrip({
  pattern,
  stepCount,
  currentPage,
  stepsPerPage,
  focusedTrackId,
  playhead,
  onFocusTrack,
}: TrackOverviewStripProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {TRACKS.map((track) => {
        const isBass = track.id === "bass"
        const drumRow = isBass ? null : (pattern[track.id as "kick" | "snare" | "hat"] as boolean[])
        const bassRow = isBass ? pattern.bass : null
        return (
          <OverviewRow
            key={track.id}
            meta={track}
            isFocused={track.id === focusedTrackId}
            drumPattern={drumRow}
            bassPattern={bassRow}
            stepCount={stepCount}
            currentPage={currentPage}
            stepsPerPage={stepsPerPage}
            playhead={playhead}
            onFocus={() => onFocusTrack(track.id)}
          />
        )
      })}
    </div>
  )
}

type OverviewRowProps = {
  meta: TrackMeta
  isFocused: boolean
  drumPattern: boolean[] | null
  bassPattern: BassStep[] | null
  stepCount: number
  currentPage: number
  stepsPerPage: number
  playhead: number
  onFocus: () => void
}

function OverviewRow({
  meta,
  isFocused,
  drumPattern,
  bassPattern,
  stepCount,
  currentPage,
  stepsPerPage,
  playhead,
  onFocus,
}: OverviewRowProps) {
  const muted = !isFocused
  const pageStart = currentPage * stepsPerPage
  const pageEnd = Math.min(stepCount, pageStart + stepsPerPage)

  return (
    <button
      type="button"
      onClick={onFocus}
      className={cn(
        "group relative flex h-7 items-center gap-2 rounded-md border border-transparent px-1.5 transition-colors",
        isFocused
          ? "border-border bg-muted/40"
          : "hover:border-border/60 hover:bg-muted/20",
      )}
      aria-pressed={isFocused}
      aria-label={`Focus ${meta.label} track`}
    >
      {/* Color strip */}
      <span
        aria-hidden
        className={cn(
          "h-full w-[3px] shrink-0 rounded-full transition-all",
          isFocused && playhead >= 0 && "shadow-[0_0_6px_var(--track-color)]",
        )}
        style={{
          background: meta.color,
          opacity: muted ? 0.35 : 1,
          ["--track-color" as string]: meta.color,
        }}
      />

      {/* Track label */}
      <span
        className={cn(
          "w-[58px] shrink-0 text-left font-mono text-[10px] font-bold uppercase tracking-wide transition-colors",
          isFocused ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {meta.label}
      </span>

      {/* Strip cells */}
      <div className="relative flex h-full min-w-0 flex-1 items-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 rounded-sm bg-foreground/[0.03]"
          style={{
            left: `${(pageStart / stepCount) * 100}%`,
            width: `${((pageEnd - pageStart) / stepCount) * 100}%`,
          }}
        />
        {playhead >= 0 && playhead < stepCount && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-[-3px] z-10 h-[14px] w-[2px] -translate-x-1/2 rounded-full bg-primary shadow-[0_0_4px_var(--primary)] transition-[left] duration-75 ease-linear"
            style={{ left: `${((playhead + 0.5) / stepCount) * 100}%` }}
          />
        )}
        <div className="relative flex h-full w-full items-center gap-[2px]">
          {Array.from({ length: stepCount }, (_, step) => {
            const inPage = step >= pageStart && step < pageEnd
            const isPlayhead = playhead === step
            const active = bassPattern
              ? bassPattern[step]?.on === true
              : drumPattern?.[step] === true
            return (
              <span
                key={step}
                aria-hidden
                className={cn(
                  "h-2.5 flex-1 rounded-[2px] transition-colors",
                  active
                    ? muted
                      ? "opacity-50"
                      : ""
                    : inPage
                      ? "bg-foreground/10"
                      : "bg-foreground/[0.04]",
                  isPlayhead && "ring-1 ring-primary/70",
                )}
                style={active ? { background: meta.color } : undefined}
              />
            )
          })}
        </div>
      </div>
    </button>
  )
}

// ─── Page tabs ─────────────────────────────────────────────────────────────

type PageTabsProps = {
  currentPage: number
  totalPages: number
  stepsPerPage: number
  stepCount: number
  onChange: (page: number) => void
}

function PageTabs({
  currentPage,
  totalPages,
  stepsPerPage,
  stepCount,
  onChange,
}: PageTabsProps) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Pages
      </span>
      <div
        role="tablist"
        aria-label="Step pages"
        className="inline-flex overflow-hidden rounded-md border border-border"
      >
        {Array.from({ length: totalPages }, (_, i) => {
          const start = i * stepsPerPage + 1
          const end = Math.min(stepCount, (i + 1) * stepsPerPage)
          const selected = i === currentPage
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(i)}
              className={cn(
                "min-w-[68px] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors",
                i > 0 && "border-l border-border",
                selected
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              P{i + 1} <span className="opacity-60">·</span>{" "}
              <span className="tabular-nums opacity-80">
                {start}–{end}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step matrix ───────────────────────────────────────────────────────────

type StepMatrixProps = {
  meta: TrackMeta
  config: TrackConfig
  keyState: Key
  pattern: Pattern
  playhead: number
  currentPage: number
  stepCount: number
  onToggleDrumStep: (step: number) => void
  onSetBassStep: (step: number, value: BassStep, audition: boolean) => void
  onAudition: () => void
}

function StepMatrix({
  meta,
  config,
  keyState,
  pattern,
  playhead,
  currentPage,
  stepCount,
  onToggleDrumStep,
  onSetBassStep,
  onAudition,
}: StepMatrixProps) {
  const muted = config.mute
  const isBass = meta.id === "bass"
  const cells = useMemo<Array<{ step: number; inRange: boolean }>>(() => {
    const out: Array<{ step: number; inRange: boolean }> = []
    const start = currentPage * STEPS_PER_PAGE
    for (let i = 0; i < STEPS_PER_PAGE; i++) {
      const step = start + i
      out.push({ step, inRange: step < stepCount })
    }
    return out
  }, [currentPage, stepCount])

  return (
    <div className="flex flex-col items-center gap-4 self-center pt-1 lg:flex-row lg:items-start lg:justify-center">
      <div
        className="relative grid w-full max-w-[420px] shrink-0 self-center"
        style={{
          gridTemplateColumns: `repeat(${PAGE_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${PAGE_ROWS}, 1fr)`,
          aspectRatio: "1 / 1",
          containerType: "inline-size",
        }}
      >
        {cells.map(({ step, inRange }) => {
          if (!inRange) {
            return (
              <div
                key={step}
                aria-hidden
                className="m-1 rounded-md border border-dashed border-border/30 bg-muted/5"
              />
            )
          }
          const isPlayhead = playhead === step
          if (isBass) {
            const bassCell = pattern.bass[step] ?? { on: false, degree: 0 }
            return (
              <BassMatrixPad
                key={step}
                step={step}
                cell={bassCell}
                mode={keyState.mode}
                isPlayhead={isPlayhead}
                muted={muted}
                color={meta.color}
                onSet={onSetBassStep}
              />
            )
          }
          const drumRow = pattern[meta.id] as boolean[]
          const isOn = drumRow[step] ?? false
          return (
            <DrumMatrixPad
              key={step}
              on={isOn}
              isPlayhead={isPlayhead}
              muted={muted}
              color={meta.color}
              label={`${meta.label} step ${step + 1}`}
              onClick={() => {
                // Audition-on-click: when you click an off pad, hear the sound
                // before committing. When you click an on pad, just turn it
                // off — no re-trigger, so you can mute a step mid-listening.
                if (!isOn) onAudition()
                onToggleDrumStep(step)
              }}
            />
          )
        })}
      </div>

      <div className="hidden w-[200px] shrink-0 flex-col gap-2 self-stretch py-2 xl:flex">
        <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: meta.color }}
            />
            <span className="font-mono text-xs font-bold uppercase tracking-wide">
              {meta.label}
            </span>
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {meta.id === "bass" ? "Synth" : "Drum"}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
            {isBass
              ? "Tap to toggle. Drag vertically to change the scale degree."
              : "Tap a step to toggle it. Audition in the inspector."}
          </p>
        </div>
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/10 p-2.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Steps</span>
            <span className="text-foreground">{stepCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Page</span>
            <span className="text-foreground">
              {currentPage + 1}/{Math.max(1, Math.ceil(stepCount / STEPS_PER_PAGE))}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Active</span>
            <span className="text-foreground">
              {countActive(pattern, meta.id, stepCount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function countActive(pattern: Pattern, trackId: TrackId, stepCount: number): number {
  if (trackId === "bass") {
    let n = 0
    for (let i = 0; i < stepCount; i++) if (pattern.bass[i]?.on) n++
    return n
  }
  const row = pattern[trackId]
  let n = 0
  for (let i = 0; i < stepCount; i++) if (row[i]) n++
  return n
}

type DrumMatrixPadProps = {
  on: boolean
  isPlayhead: boolean
  muted: boolean
  color: string
  label: string
  onClick: () => void
}

function DrumMatrixPad({
  on,
  isPlayhead,
  muted,
  color,
  label,
  onClick,
}: DrumMatrixPadProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "m-1 rounded-md border transition-[background-color,box-shadow,transform] duration-75 active:scale-[0.97]",
        on
          ? "border-transparent shadow-sm"
          : "border-border/40 bg-muted/15 hover:bg-muted/40",
        !on && isPlayhead && "bg-foreground/10",
        isPlayhead && "ring-2 ring-primary ring-offset-1 ring-offset-card shadow-[0_0_10px_var(--primary)]",
        muted && on && "opacity-40",
      )}
      style={on ? { backgroundColor: color } : undefined}
      aria-label={`${label} ${on ? "on" : "off"}`}
      aria-pressed={on}
    />
  )
}

type BassMatrixPadProps = {
  step: number
  cell: BassStep
  mode: ScaleMode
  isPlayhead: boolean
  muted: boolean
  color: string
  onSet: (step: number, value: BassStep, audition: boolean) => void
}

function BassMatrixPad({
  step,
  cell,
  mode,
  isPlayhead,
  muted,
  color,
  onSet,
}: BassMatrixPadProps) {
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startDegree: number
    lastDegree: number
    moved: boolean
    startedOff: boolean
  } | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      if (!cell.on) {
        const next: BassStep = { on: true, degree: 0 }
        onSet(step, next, true)
        dragRef.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          startDegree: 0,
          lastDegree: 0,
          moved: false,
          startedOff: true,
        }
        return
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startDegree: cell.degree,
        lastDegree: cell.degree,
        moved: false,
        startedOff: false,
      }
    },
    [cell, step, onSet],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const dy = drag.startY - event.clientY
      if (Math.abs(dy) < 3 && !drag.moved) return
      const raw = drag.startDegree + Math.round(dy / DRAG_PX_PER_SEMITONE)
      const clamped = Math.min(BASS_RANGE_MAX, Math.max(BASS_RANGE_MIN, raw))
      const snapped = snapToScale(clamped, mode)
      if (snapped !== drag.lastDegree) {
        drag.lastDegree = snapped
        drag.moved = true
        onSet(step, { on: true, degree: snapped }, true)
      } else if (Math.abs(dy) >= 3) {
        drag.moved = true
      }
    },
    [mode, onSet, step],
  )

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      const { moved, startedOff } = drag
      dragRef.current = null
      if (!moved && !startedOff) {
        onSet(step, { on: false, degree: 0 }, false)
      }
    },
    [onSet, step],
  )

  const onPointerCancel = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }, [])

  const label = cell.on ? degreeLabel(cell.degree, mode) : ""
  const octaveShift = cell.on ? Math.floor(cell.degree / 12) : 0

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        "relative m-1 flex select-none items-center justify-center rounded-md border font-mono font-bold tabular-nums transition-[background-color,box-shadow] duration-75",
        cell.on
          ? "border-transparent shadow-sm"
          : "border-border/40 bg-muted/15 text-muted-foreground/30 hover:bg-muted/40",
        !cell.on && isPlayhead && "bg-foreground/10",
        isPlayhead && "ring-2 ring-primary ring-offset-1 ring-offset-card shadow-[0_0_10px_var(--primary)]",
        muted && cell.on && "opacity-40",
        "cursor-ns-resize touch-none",
      )}
      style={
        cell.on
          ? { backgroundColor: color, color: ON_CELL_INK, fontSize: "clamp(11px, 5cqi, 26px)" }
          : { fontSize: "clamp(11px, 5cqi, 26px)" }
      }
      aria-label={`Bass step ${step + 1} ${cell.on ? `degree ${label}` : "off"}`}
      aria-pressed={cell.on}
    >
      {label && <span>{label}</span>}
      {cell.on && octaveShift !== 0 && (
        <span className="absolute right-1 top-0.5 text-[9px] leading-none opacity-70">
          {octaveShift > 0 ? "↑".repeat(Math.min(2, octaveShift)) : "↓".repeat(Math.min(2, -octaveShift))}
        </span>
      )}
    </button>
  )
}

// ─── Inspector (right rail) ────────────────────────────────────────────────

type InspectorProps = {
  className?: string
  meta: TrackMeta
  config: TrackConfig
  onConfigChange: (updater: (cfg: TrackConfig) => TrackConfig) => void
  onAudition: () => void
  onClearTrack: () => void
}

function Inspector({ className, meta, config, onConfigChange, onAudition, onClearTrack }: InspectorProps) {
  const muted = config.mute
  const volPct = Math.round(config.volume * 100)
  const cutoffNorm = normFromCutoff(config.filter.cutoff)
  const cutoffDisplay = formatHz(config.filter.cutoff)
  const resDisplay = config.filter.resonance.toFixed(1)
  const scDisabled = meta.id === "kick"
  const scOn = config.sidechain.on && !scDisabled
  const duckPct = Math.round(config.sidechain.depth * 100)
  const amtPct = Math.round(config.lfo.amount * 100)
  const revPct = Math.round(config.sends.reverb * 100)
  const dlyPct = Math.round(config.sends.delay * 100)
  const dests = lfoDestsFor(meta.id)

  return (
    <div className={className}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ background: meta.color }}
          />
          <span className="font-mono text-sm font-bold uppercase tracking-wide">
            {meta.label}
          </span>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            {meta.id === "bass" ? "Synth" : "Drum"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAudition}
            className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-muted/20 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            aria-label={`Audition ${meta.label}`}
          >
            <Play className="size-3" /> Audition
          </button>
          <button
            type="button"
            onClick={() => onConfigChange((c) => ({ ...c, mute: !c.mute }))}
            className={cn(
              "flex h-7 w-9 items-center justify-center rounded-md border border-border transition-colors",
              muted
                ? "bg-muted/40 text-muted-foreground"
                : "bg-muted/20 text-foreground hover:bg-muted/40",
            )}
            aria-label={muted ? `Unmute ${meta.label}` : `Mute ${meta.label}`}
            aria-pressed={muted}
          >
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClearTrack}
            className="flex h-7 w-9 items-center justify-center rounded-md border border-border bg-muted/20 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            aria-label={`Clear ${meta.label} pattern`}
            title={`Clear ${meta.label} steps (Del)`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <Divider2 />

      <InspectorSection label="Volume">
        <InspectorSlider
          label="Vol"
          display={`${volPct}`}
          color={meta.color}
        >
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[config.volume]}
            onValueChange={(v) => {
              const vol = v[0] ?? 0
              onConfigChange((c) => ({ ...c, volume: vol }))
            }}
            aria-label="Volume"
          />
        </InspectorSlider>
      </InspectorSection>

      <Divider2 />

      <InspectorSection label="Filter">
        <div className="flex items-center gap-2">
          <Segmented
            options={FILTER_TYPES}
            value={config.filter.type}
            onChange={(type) =>
              onConfigChange((c) => ({ ...c, filter: { ...c.filter, type: type as FilterType } }))
            }
            ariaPrefix="Filter"
          />
        </div>
        <div className="flex items-end justify-between gap-3">
          <InspectorSlider
            label="Cut"
            display={cutoffDisplay}
            color={meta.color}
            className="min-w-0 flex-1"
          >
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[cutoffNorm]}
              onValueChange={(v) => {
                const n = v[0] ?? 0
                onConfigChange((c) => ({
                  ...c,
                  filter: { ...c.filter, cutoff: cutoffFromNorm(n) },
                }))
              }}
              aria-label="Filter cutoff"
            />
          </InspectorSlider>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-7 items-center gap-1 rounded-md border border-border bg-muted/20 px-2 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                aria-label="Resonance"
              >
                <span className="uppercase tracking-wide">Res</span>
                <span className="tabular-nums">{resDisplay}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Resonance</Label>
                <span className="font-mono text-xs tabular-nums">{resDisplay}</span>
              </div>
              <Slider
                min={0.5}
                max={20}
                step={0.1}
                value={[config.filter.resonance]}
                onValueChange={(v) => {
                  const r = v[0] ?? 1
                  onConfigChange((c) => ({ ...c, filter: { ...c.filter, resonance: r } }))
                }}
                aria-label="Resonance"
              />
            </PopoverContent>
          </Popover>
        </div>
      </InspectorSection>

      <Divider2 />

      <InspectorSection label="Sidechain">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            On
          </span>
          <Switch
            checked={scOn}
            onCheckedChange={(checked) =>
              onConfigChange((c) => ({
                ...c,
                sidechain: { ...c.sidechain, on: checked },
              }))
            }
            disabled={scDisabled}
            aria-label="Sidechain"
          />
        </div>
        <InspectorSlider
          label="Duck"
          display={`${duckPct}`}
          disabled={!scOn}
          color={meta.color}
        >
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[config.sidechain.depth]}
            onValueChange={(v) => {
              const d = v[0] ?? 0
              onConfigChange((c) => ({ ...c, sidechain: { ...c.sidechain, depth: d } }))
            }}
            aria-label="Sidechain depth"
            disabled={!scOn}
          />
        </InspectorSlider>
      </InspectorSection>

      <Divider2 />

      <InspectorSection label="LFO">
        <div className="flex items-center gap-2">
          <LfoRateSelect
            value={config.lfo.rate}
            onChange={(rate) => onConfigChange((c) => ({ ...c, lfo: { ...c.lfo, rate } }))}
          />
          <LfoDestSelect
            value={config.lfo.dest}
            onChange={(dest) => onConfigChange((c) => ({ ...c, lfo: { ...c.lfo, dest } }))}
            options={dests}
          />
        </div>
        <InspectorSlider
          label="Amt"
          display={`${amtPct}`}
          color={meta.color}
        >
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[config.lfo.amount]}
            onValueChange={(v) => {
              const a = v[0] ?? 0
              onConfigChange((c) => ({ ...c, lfo: { ...c.lfo, amount: a } }))
            }}
            aria-label="LFO amount"
          />
        </InspectorSlider>
      </InspectorSection>

      <Divider2 />

      <InspectorSection label="Sends">
        <InspectorSlider
          label="Rev"
          display={`${revPct}`}
          color={meta.color}
        >
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[config.sends.reverb]}
            onValueChange={(v) => {
              const r = v[0] ?? 0
              onConfigChange((c) => ({ ...c, sends: { ...c.sends, reverb: r } }))
            }}
            aria-label="Reverb send"
          />
        </InspectorSlider>
        <InspectorSlider
          label="Dly"
          display={`${dlyPct}`}
          color={meta.color}
        >
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[config.sends.delay]}
            onValueChange={(v) => {
              const d = v[0] ?? 0
              onConfigChange((c) => ({ ...c, sends: { ...c.sends, delay: d } }))
            }}
            aria-label="Delay send"
          />
        </InspectorSlider>
      </InspectorSection>
    </div>
  )
}

function Divider2() {
  return <div aria-hidden className="h-px w-full bg-border/60" />
}

function InspectorSection({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function InspectorSlider({
  label,
  display,
  disabled,
  color,
  className,
  children,
}: {
  label: string
  display: string
  disabled?: boolean
  color?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", disabled && "opacity-40", className)}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <span
          className="font-mono text-[10px] tabular-nums"
          style={color ? { color } : undefined}
        >
          {display}
        </span>
      </div>
      {children}
    </div>
  )
}

// ─── Segmented control ─────────────────────────────────────────────────────

function Segmented({
  options,
  value,
  onChange,
  ariaPrefix,
  disabled,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  orientation?: "horizontal" | "vertical"
  ariaPrefix?: string
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        "inline-flex overflow-hidden rounded-md border border-[var(--fd-border)] bg-[var(--fd-control)]",
        disabled && "opacity-50",
      )}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            aria-pressed={selected}
            aria-label={ariaPrefix ? `${ariaPrefix} ${opt.label}` : opt.label}
            className={cn(
              "px-2.5 font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors disabled:pointer-events-none py-1",
              i > 0 && "border-l border-[var(--fd-border)]",
              selected
                ? "bg-[var(--fd-amber)] text-[var(--fd-on-accent)]"
                : "text-[var(--fd-muted)] hover:bg-[var(--fd-control-strong)] hover:text-[var(--fd-ink)]",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function LfoRateSelect({
  value,
  onChange,
}: {
  value: LfoRate
  onChange: (r: LfoRate) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as LfoRate)}>
      <SelectTrigger className="fd-select-trigger h-7 w-[68px] px-2 font-mono text-[11px]" aria-label="LFO rate">
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LFO_RATES.map((r) => (
          <SelectItem key={r} value={r} className="text-xs">
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function LfoDestSelect({
  value,
  onChange,
  options,
}: {
  value: LfoDest
  onChange: (d: LfoDest) => void
  options: LfoDest[]
}) {
  const safeValue = options.includes(value) ? value : options[0]
  return (
    <Select value={safeValue} onValueChange={(v) => onChange(v as LfoDest)}>
      <SelectTrigger
        className="fd-select-trigger h-7 w-[68px] px-2 font-mono text-[11px] capitalize"
        aria-label="LFO destination"
      >
        <SelectValue>{safeValue}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="text-xs capitalize">
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────

const EXPORT_MIN_SECONDS = 1
const EXPORT_MAX_SECONDS = 600

function clampSeconds(n: number): number {
  if (!Number.isFinite(n)) return EXPORT_MIN_SECONDS
  return Math.max(EXPORT_MIN_SECONDS, Math.min(EXPORT_MAX_SECONDS, Math.round(n)))
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function exportStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

type ExportFormat = "wav" | "mp3"

const MP3_BITRATES: Mp3Bitrate[] = [128, 192, 320]

function ExportControl({ state }: { state: EngineState }) {
  const [seconds, setSeconds] = useState(30)
  const [format, setFormat] = useState<ExportFormat>("mp3")
  const [kbps, setKbps] = useState<Mp3Bitrate>(192)
  const [rendering, setRendering] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [inFiles, setInFiles] = useState(false)
  const [filesHint, setFilesHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const onExport = useCallback(async () => {
    if (rendering) return
    const length = clampSeconds(seconds)
    setRendering(true)
    setError(null)
    setSaved(null)
    setCopied(false)
    setInFiles(false)
    setFilesHint(null)
    try {
      const buffer = await renderTrack(state, length)
      await new Promise((r) => setTimeout(r, 0))
      const bytes =
        format === "mp3" ? encodeMp3(buffer, kbps) : encodeWavPCM16(buffer)
      const filename = `music-${state.bpm}bpm-${state.steps}st-${length}s-${exportStamp()}.${format}`

      const sharedPath = `music-exports/${filename}`
      await shared.writeBinary(sharedPath, bytes)
      setSaved(sharedPath)

      const mime = format === "mp3" ? "audio/mpeg" : "audio/wav"
      let addedToFiles = false
      try {
        await publishToFiles(bytes, filename, mime)
        addedToFiles = true
      } catch {
        setFilesHint("Saved to shared. Grant Files access in Settings → Project Access to also add to Files.")
      }
      setInFiles(addedToFiles)

      ui.notify({
        title: addedToFiles ? "Exported to shared + Files" : "Exported to shared",
        body: `${filename} (${formatBytes(bytes.length)})`,
      }).catch(() => {})
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      ui.notify({ title: "Export failed", body: msg }).catch(() => {})
    } finally {
      setRendering(false)
    }
  }, [rendering, seconds, format, kbps, state])

  const onCopy = useCallback(() => {
    if (!saved) return
    navigator.clipboard?.writeText(saved)?.catch(() => {})
    setCopied(true)
  }, [saved])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="fd-button fd-button-primary flex h-8 items-center gap-1.5 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
        >
          <Download className="size-3.5" />
          Export
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">Export bounce</p>
          <p className="text-xs text-muted-foreground">
            Renders the current mix to shared files (and your Files library when granted).
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label>Length</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={EXPORT_MIN_SECONDS}
              max={EXPORT_MAX_SECONDS}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              onBlur={() => setSeconds((s) => clampSeconds(s))}
              disabled={rendering}
              aria-label="Export length in seconds"
              className="h-7 w-16 px-2 text-center font-mono text-xs tabular-nums"
            />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              sec
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label>Format</Label>
          <Segmented
            options={[
              { value: "wav", label: "WAV" },
              { value: "mp3", label: "MP3" },
            ]}
            value={format}
            onChange={(v) => setFormat(v as ExportFormat)}
            ariaPrefix="Export as"
            disabled={rendering}
          />
        </div>

        {format === "mp3" && (
          <div className="flex items-center justify-between gap-2">
            <Label>Bitrate</Label>
            <Select
              value={String(kbps)}
              onValueChange={(v) => setKbps(Number(v) as Mp3Bitrate)}
            >
              <SelectTrigger
                className="h-7 w-[96px] px-2 font-mono text-xs"
                aria-label="MP3 bitrate"
                disabled={rendering}
              >
                <SelectValue>{kbps} kbps</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MP3_BITRATES.map((b) => (
                  <SelectItem key={b} value={String(b)} className="text-xs">
                    {b} kbps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          type="button"
          variant="default"
          onClick={onExport}
          disabled={rendering}
          className="h-9 w-full gap-1.5"
        >
          {rendering ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          {rendering ? "Exporting…" : "Export"}
        </Button>

        {saved && (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
            <button
              type="button"
              onClick={onCopy}
              title="Copy path"
              className="flex w-full items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Check className="size-3 shrink-0 text-primary" />
              <span className="truncate">{saved}</span>
              {copied ? (
                <Check className="ml-auto size-3 shrink-0" />
              ) : (
                <Copy className="ml-auto size-3 shrink-0" />
              )}
            </button>
            {inFiles && (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <FolderPlus className="size-3 shrink-0 text-primary" />
                Added to Files
              </span>
            )}
            {filesHint && (
              <p className="text-[11px] leading-snug text-muted-foreground">{filesHint}</p>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive" title={error}>
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
