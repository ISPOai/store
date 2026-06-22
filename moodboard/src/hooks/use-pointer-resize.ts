import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

const MIN_W = 60
const MAX_W = 2000
// >1 makes the card grow/shrink faster than the cursor moves.
const RESIZE_SPEED = 2

type ResizeState = {
  pointerId: number
  startX: number
  startY: number
  startW: number
  startH: number
  aspect: number // startW / startH, held constant so resize preserves aspect
  scale: number
}

// Resizes a card from its bottom-right handle, preserving aspect ratio. Like
// the drag hook, the screen delta is divided by the scale captured at grab
// time, and the live size is committed to board state only on release.
//
// Both axes contribute (we take the larger of the horizontal grow and the
// vertical grow projected through the aspect ratio) so dragging the corner in
// any outward direction feels responsive.
export function usePointerResize(opts: {
  getScale: () => number
  getSize: () => { w: number; h: number }
  onCommit: (w: number, h: number) => void
}) {
  const { getScale, getSize, onCommit } = opts
  const state = useRef<ResizeState | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  const compute = (e: ReactPointerEvent, s: ResizeState) => {
    const dx = (e.clientX - s.startX) / s.scale
    const dy = (e.clientY - s.startY) / s.scale
    const grow = Math.max(dx, dy * s.aspect) * RESIZE_SPEED
    const w = Math.min(MAX_W, Math.max(MIN_W, s.startW + grow))
    return { w: Math.round(w), h: Math.round(w / s.aspect) }
  }

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation() // don't let the card body start a drag
      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
      const s = getSize()
      state.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startW: s.w,
        startH: s.h,
        aspect: s.w / s.h || 1,
        scale: getScale() || 1,
      }
      setSize({ w: s.w, h: s.h })
    },
    [getScale, getSize],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const s = state.current
    if (!s || s.pointerId !== e.pointerId) return
    setSize(compute(e, s))
  }, [])

  const endResize = useCallback(
    (e: ReactPointerEvent) => {
      const s = state.current
      if (!s || s.pointerId !== e.pointerId) return
      const el = e.currentTarget as HTMLElement
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      const final = compute(e, s)
      state.current = null
      if (final.w !== s.startW || final.h !== s.startH) onCommit(final.w, final.h)
      setSize(null)
    },
    [onCommit],
  )

  return {
    resizing: size !== null,
    w: size?.w ?? 0,
    h: size?.h ?? 0,
    resizeHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endResize,
      onPointerCancel: endResize,
    },
  }
}
