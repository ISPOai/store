import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

type DragState = {
  pointerId: number
  startX: number
  startY: number
  scale: number
}

// Drags a single card. The card renders at (item.x + dx, item.y + dy) while a
// drag is live; on release we commit the board-space delta to persisted state
// and reset the local delta in the same handler, so the two updates batch into
// one render and the card never flashes back to its old spot.
//
// The screen delta is divided by the scale captured at grab time: at 50% zoom
// the cursor moves twice as far on screen as the card should move in board
// coordinates.
export function usePointerDrag(opts: {
  getScale: () => number
  onCommit: (dx: number, dy: number) => void
  onGrab?: () => void
}) {
  const { getScale, onCommit, onGrab } = opts
  const drag = useRef<DragState | null>(null)
  const [delta, setDelta] = useState<{ dx: number; dy: number } | null>(null)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return // left button only
      e.stopPropagation()
      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
      drag.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        scale: getScale() || 1,
      }
      setDelta({ dx: 0, dy: 0 })
      onGrab?.()
    },
    [getScale, onGrab],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    setDelta({
      dx: (e.clientX - d.startX) / d.scale,
      dy: (e.clientY - d.startY) / d.scale,
    })
  }, [])

  const endDrag = useCallback(
    (e: ReactPointerEvent) => {
      const d = drag.current
      if (!d || d.pointerId !== e.pointerId) return
      const el = e.currentTarget as HTMLElement
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      const dx = (e.clientX - d.startX) / d.scale
      const dy = (e.clientY - d.startY) / d.scale
      drag.current = null
      // Only persist if it actually moved — a plain click shouldn't write.
      if (dx !== 0 || dy !== 0) onCommit(dx, dy)
      setDelta(null)
    },
    [onCommit],
  )

  return {
    dragging: delta !== null,
    dx: delta?.dx ?? 0,
    dy: delta?.dy ?? 0,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
