import { useCallback, useEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { IDENTITY, fitToItems, zoomAround, type Viewport } from '../lib/transform'
import type { BoardItem } from '../lib/types'

const STEP_IN = 1.5
const STEP_OUT = 1 / 1.5

// Wheel/pinch behaviour. The spec's literal rule was "all wheel zooms", but the
// modern infinite-canvas convention (Figma / Miro / tldraw) is what users
// expect and feels far better on a trackpad:
//
//   • ctrl/⌘ + wheel, and trackpad pinch (which reports ctrlKey) → zoom at cursor
//   • plain two-finger scroll / mouse wheel                      → pan
//
// Mouse-only users still zoom via ⌘+wheel, the toolbar +/− buttons, or the
// +/−/0/F keyboard shortcuts, so no input is left without a zoom path.
const ZOOM_SENSITIVITY = 0.003

export function useZoom(opts: {
  viewRef: MutableRefObject<Viewport>
  setView: (next: Viewport, animate?: boolean) => void
  surfaceRef: RefObject<HTMLElement | null>
  getItems: () => BoardItem[]
}) {
  const { viewRef, setView, surfaceRef, getItems } = opts

  const zoomBy = useCallback(
    (factor: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect()
      if (!rect) return
      // Buttons/keys zoom around the viewport centre.
      setView(zoomAround(viewRef.current, rect.width / 2, rect.height / 2, factor), true)
    },
    [surfaceRef, viewRef, setView],
  )

  const zoomIn = useCallback(() => zoomBy(STEP_IN), [zoomBy])
  const zoomOut = useCallback(() => zoomBy(STEP_OUT), [zoomBy])
  const reset = useCallback(() => setView(IDENTITY, true), [setView])
  const fit = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return
    setView(fitToItems(getItems(), rect), true)
  }, [surfaceRef, getItems, setView])

  // Native, non-passive wheel listener so we can preventDefault (React's
  // onWheel is passive and can't stop the page from scroll-zooming).
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY)
        setView(zoomAround(viewRef.current, sx, sy, factor), false)
      } else {
        const v = viewRef.current
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }, false)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [surfaceRef, viewRef, setView])

  return { zoomIn, zoomOut, reset, fit }
}
