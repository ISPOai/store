// Pure timeline layout math. The session layer reads engine state into
// plain rows; every drag, trim, snap, and pixel conversion happens here
// where it can be tested without a world or a DOM. Row keys are opaque
// session-stable ids; the session maps them back to engine entities.

export type ClipKind = 'scene' | 'group' | 'sequence' | 'video' | 'image' | 'audio' | 'text' | 'other'

export interface TimelineRow {
  /** Stable within one mounted document: the engine entity id. */
  readonly key: number
  readonly name: string
  readonly kind: ClipKind
  readonly depth: number
  /** Timeline placement in seconds. */
  readonly start: number
  readonly end: number
  readonly muted: boolean
}

export interface TimelineLayout {
  readonly rows: readonly TimelineRow[]
  /** Total content duration in seconds (>= 0). */
  readonly duration: number
}

export const MIN_CLIP_SECONDS = 0.05

export function buildLayout(rows: readonly TimelineRow[]): TimelineLayout {
  let duration = 0
  for (const row of rows) {
    if (row.kind === 'scene') duration = Math.max(duration, row.end)
    else if (row.end > duration && row.end > 0) duration = Math.max(duration, row.end)
  }
  return { rows, duration: Math.max(duration, 1) }
}

export function secondsToPx(seconds: number, pxPerSecond: number): number {
  return seconds * pxPerSecond
}

export function pxToSeconds(px: number, pxPerSecond: number): number {
  return px / pxPerSecond
}

/** Snaps `seconds` to whole frame boundaries when within one frame's reach. */
export function snapToFrame(seconds: number, fps: number): number {
  const frame = Math.round(seconds * fps)
  return frame / fps
}

export interface MoveResult {
  readonly start: number
}

/** Clamps a dragged clip start: never before 0, never past its own end. */
export function clampMove(row: TimelineRow, nextStart: number): MoveResult {
  const minStart = 0
  const maxStart = Math.max(minStart, row.end - MIN_CLIP_SECONDS)
  return { start: Math.min(Math.max(nextStart, minStart), maxStart) }
}

export interface TrimResult {
  readonly start: number
  readonly end: number
}

/** Clamps a trim of either edge, keeping a minimal clip length. */
export function clampTrim(row: TimelineRow, edge: 'start' | 'end', nextValue: number): TrimResult {
  if (edge === 'start') {
    const start = Math.min(Math.max(nextValue, 0), row.end - MIN_CLIP_SECONDS)
    return { start, end: row.end }
  }
  const end = Math.max(nextValue, row.start + MIN_CLIP_SECONDS)
  return { start: row.start, end }
}

export function formatTimecode(seconds: number, fps: number): string {
  const safe = Math.max(0, seconds)
  const whole = Math.floor(safe)
  const frames = Math.round((safe - whole) * fps)
  const carriedFrames = Math.min(frames, Math.round(fps) - 1)
  const mm = Math.floor(whole / 60)
  const ss = whole % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(carriedFrames).padStart(2, '0')}`
}

export function kindFromTag(tag: string): ClipKind {
  switch (tag) {
    case 'scene':
    case 'group':
    case 'sequence':
    case 'video':
    case 'image':
    case 'audio':
    case 'text':
      return tag
    default:
      return 'other'
  }
}
