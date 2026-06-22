import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, MutableRefObject } from 'react'
import type { Viewport } from '../lib/transform'

type PanState = {
  pointerId: number
  startX: number
  startY: number
  startTx: number
  startTy: number
}

// ───────────────────────────────────────────────────────────────────────────
// shouldStartPan — the gesture policy for the canvas.
//
// This predicate decides whether a pointerdown on the surface begins a pan.
// It is deliberately the one knob that shapes how the whole canvas *feels*,
// and there are several defensible answers:
//
//   • Middle-button-only pan (CAD-style) — never hijacks left-click.
//   • Left-drag-on-empty pans, left-drag-on-card moves the card (this default).
//   • Space-bar-to-pan (hold Space, then left-drag) — Figma/Photoshop muscle
//     memory; needs a keydown flag threaded in here.
//
// The default below: pan on the primary (left) or middle button, but bail when
// the pointer landed on a card — cards carry [data-ispo-no-pan] and own their
// own drag. Right-click and other buttons are ignored so context menus work.
//
// Tweak this body to change the feel; everything downstream stays the same.
// ───────────────────────────────────────────────────────────────────────────
function shouldStartPan(e: ReactPointerEvent): boolean {
  if (e.button !== 0 && e.button !== 1) return false
  const target = e.target as Element | null
  if (target?.closest('[data-ispo-no-pan]')) return false
  return true
}

// Hand-rolled pointer panning for the board surface. Uses pointer capture so a
// drag that leaves the iframe keeps tracking, and writes the translate part of
// the viewport directly (scale is untouched). Pan is 1:1 with screen pixels at
// any zoom — that's why we don't divide the delta by scale here.
export function usePointerPan(opts: {
  viewRef: MutableRefObject<Viewport>
  setView: (next: Viewport) => void
}) {
  const { viewRef, setView } = opts
  const pan = useRef<PanState | null>(null)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!shouldStartPan(e)) return
      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
      const v = viewRef.current
      pan.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTx: v.x,
        startTy: v.y,
      }
    },
    [viewRef],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const p = pan.current
      if (!p || p.pointerId !== e.pointerId) return
      const v = viewRef.current
      setView({
        ...v,
        x: p.startTx + (e.clientX - p.startX),
        y: p.startTy + (e.clientY - p.startY),
      })
    },
    [viewRef, setView],
  )

  const endPan = useCallback((e: ReactPointerEvent) => {
    const p = pan.current
    if (!p || p.pointerId !== e.pointerId) return
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    pan.current = null
  }, [])

  const panning = pan.current !== null

  return {
    panning,
    panHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPan,
      onPointerCancel: endPan,
    },
  }
}
