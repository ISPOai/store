import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react"
import { cn } from "@/lib/utils"

// A mixing-console fader: a thin recessed rail with a grippable cap that you
// push up/down. Bottom = min, top = max. Monochrome by design — color in this
// app is reserved for active sequencer steps, so every control reads as a
// neutral instrument surface.
//
// Interaction is *relative*: the cap moves from wherever it is by how far you
// drag, rather than jumping to the cursor. On a small fader that prevents a
// click from yanking the value across its whole range, and it makes fine moves
// feel precise. Double-click resets; arrows/Page keys nudge; it's a real
// ARIA slider.
export type ScrubberProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Caption rendered under the rail. Optional; ariaLabel covers the a11y name. */
  label?: string
  /** Readout shown above the rail. Defaults to the 0–100 percentage. */
  displayValue?: string
  /** Small glyph shown beside the caption (e.g. a flame for Energy). */
  icon?: ReactNode
  size?: "sm" | "md" | "lg" | "xl"
  /** Fill/cap tint. Defaults to the neutral foreground (keep it monochrome). */
  color?: string
  disabled?: boolean
  ariaLabel?: string
  /** Value to jump to on double-click. Defaults to min. */
  resetTo?: number
  /** Draw N evenly-spaced reference ticks along the rail. */
  ticks?: number
  /** Render only the rail — no value readout or caption. Lets a parent grid
   *  own those rows so faders align with non-fader controls on shared baselines. */
  bare?: boolean
}

type SizeSpec = {
  hitW: number
  trackH: number
  railW: number
  capW: number
  capH: number
  capHActive: number
}

// The hit area is wider than the visible rail so the cap is comfortable to grab
// even though the rail itself stays thin and minimal.
const SIZES: Record<NonNullable<ScrubberProps["size"]>, SizeSpec> = {
  sm: { hitW: 26, trackH: 56, railW: 4, capW: 22, capH: 6, capHActive: 8 },
  md: { hitW: 32, trackH: 72, railW: 5, capW: 28, capH: 7, capHActive: 9 },
  lg: { hitW: 40, trackH: 92, railW: 6, capW: 34, capH: 9, capHActive: 12 },
  xl: { hitW: 40, trackH: 132, railW: 6, capW: 34, capH: 9, capHActive: 12 },
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0
  return clamp((value - min) / (max - min), 0, 1)
}

function denormalize(norm: number, min: number, max: number): number {
  return min + clamp(norm, 0, 1) * (max - min)
}

export function Scrubber({
  value,
  onChange,
  min = 0,
  max = 1,
  label,
  displayValue,
  icon,
  size = "sm",
  color = "var(--foreground)",
  disabled,
  ariaLabel,
  resetTo,
  ticks = 0,
  bare = false,
}: ScrubberProps) {
  // A drag remembers where it started so movement is measured as a delta from
  // the grab point, not an absolute cursor position.
  const drag = useRef<{ pointerId: number; startY: number; startNorm: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)

  const spec = SIZES[size]
  const norm = normalize(value, min, max)
  const percent = norm * 100
  const valueText = displayValue ?? `${Math.round(norm * 100)}`
  const active = dragging || hovering

  const emitNorm = useCallback(
    (nextNorm: number) => onChange(denormalize(nextNorm, min, max)),
    [onChange, min, max],
  )

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { pointerId: event.pointerId, startY: event.clientY, startNorm: norm }
      setDragging(true)
    },
    [disabled, norm],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d || d.pointerId !== event.pointerId) return
      // Dragging up the full rail height covers the full 0..1 range.
      const deltaNorm = (d.startY - event.clientY) / spec.trackH
      emitNorm(clamp(d.startNorm + deltaNorm, 0, 1))
    },
    [emitNorm, spec.trackH],
  )

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    drag.current = null
    setDragging(false)
  }, [])

  const handleKeyDown = useCallback(
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
        emitNorm(0)
        return
      }
      if (event.key === "End") {
        event.preventDefault()
        emitNorm(1)
        return
      }
      const delta = map[event.key]
      if (delta != null) {
        event.preventDefault()
        emitNorm(clamp(norm + delta, 0, 1))
      }
    },
    [emitNorm, norm],
  )

  const resetNorm = resetTo != null ? normalize(resetTo, min, max) : 0
  const capH = active ? spec.capHActive : spec.capH

  const rail = (
    <div
        role="slider"
        aria-orientation="vertical"
        aria-label={ariaLabel ?? label ?? "value"}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => emitNorm(resetNorm)}
        className={cn(
          "relative flex items-center justify-center rounded-md",
          disabled ? "pointer-events-none" : "cursor-ns-resize touch-none select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card",
        )}
        style={{ width: spec.hitW, height: spec.trackH }}
      >
        {/* The recessed rail + monochrome fill, clipped to the capsule shape. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 overflow-hidden rounded-full bg-muted transition-colors",
            active && "bg-muted-foreground/20",
          )}
          style={{ width: spec.railW }}
        >
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-100 ease-out"
            style={{
              height: `${percent}%`,
              background: color,
              opacity: active ? 0.5 : 0.35,
            }}
          />
        </div>

        {/* Reference ticks sit just to the right of the rail. */}
        {ticks > 0 &&
          Array.from({ length: ticks }, (_, i) => {
            const pos = ((i + 1) / (ticks + 1)) * 100
            return (
              <div
                key={i}
                aria-hidden
                className="pointer-events-none absolute left-1/2 h-px w-1 rounded-full bg-foreground/25"
                style={{ bottom: `${pos}%`, transform: `translateX(${spec.railW / 2 + 3}px)` }}
              />
            )
          })}

        {/* The cap is rendered outside the rail's clip so it stays fully visible
            at the extremes and reads as a physical fader handle. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 rounded-full transition-[height,box-shadow,transform] duration-100 ease-out"
          style={{
            bottom: `${percent}%`,
            width: spec.capW,
            height: capH,
            background: color,
            transform: "translate(-50%, 50%)",
            boxShadow: active
              ? "0 0 0 1.5px var(--card), 0 2px 5px rgba(0,0,0,0.28)"
              : "0 0 0 1.5px var(--card), 0 1px 2px rgba(0,0,0,0.22)",
          }}
        />
    </div>
  )

  // Rail-only: the parent owns the readout/caption rows (channel-strip grid).
  if (bare) {
    return <div className={cn(disabled && "opacity-40")}>{rail}</div>
  }

  return (
    <div className={cn("flex flex-col items-center gap-1 leading-none", disabled && "opacity-40")}>
      <span
        className={cn(
          "font-mono text-[10px] tabular-nums transition-colors",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {valueText}
      </span>

      {rail}

      {(label || icon) && (
        <span className="flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {icon}
          {label}
        </span>
      )}
    </div>
  )
}
