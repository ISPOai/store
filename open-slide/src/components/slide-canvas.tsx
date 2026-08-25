import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../lib/types'
import { designToCssVars, type DesignSystem } from '../lib/design'

// Ported from open-slide (`packages/core/src/app/components/slide-canvas.tsx`,
// MIT, © 2026 Yiwei Ho).
//
// The idea the whole framework rests on: a page is authored against a fixed
// 1920×1080 stage and the stage is scaled to whatever space it is given. Every
// size inside a page can then be an absolute pixel value, and the deck looks
// identical in a sidebar thumbnail, a project pane, and full screen.

type Props = {
  children: ReactNode
  /** Fixed scale (thumbnails). Omit to measure and fit the container. */
  scale?: number
  design: DesignSystem
  /** Fill the container edge-to-edge instead of floating a rounded page. */
  flat?: boolean
}

export function SlideCanvas({ children, scale, design, flat = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState<number | null>(null)

  const measure = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    if (width === 0 || height === 0) return
    setFitScale(Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT))
  }, [])

  // `flat` is in the deps because entering present mode changes this canvas's
  // container in the same commit: re-measuring here means the fit is correct on
  // the first presented frame instead of waiting on an observer callback.
  useLayoutEffect(() => {
    if (scale !== undefined) return
    // Measured synchronously before paint so the first visible frame is already
    // fitted — otherwise the canvas flashes at full 1920px width.
    measure()
    const ro = new ResizeObserver(measure)
    const el = containerRef.current
    if (el) ro.observe(el)
    return () => ro.disconnect()
  }, [scale, flat, measure])

  // A hidden frame gets no rendering steps, so no ResizeObserver callback and no
  // rAF are delivered while the window is occluded or the pane is in the
  // background — a layout change made in that state would otherwise keep a stale
  // scale once the deck came back on screen. These two listeners are the safety
  // net; the observer above still handles the ordinary case.
  useEffect(() => {
    if (scale !== undefined) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') measure()
    }
    window.addEventListener('resize', measure)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('resize', measure)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [scale, measure])

  const measured = scale ?? fitScale
  const s = measured ?? 1
  const vars = designToCssVars(design)

  return (
    <div ref={containerRef} className="osd-canvas-fit">
      <div
        className={flat ? 'osd-canvas osd-canvas-flat' : 'osd-canvas'}
        style={
          {
            width: CANVAS_WIDTH * s,
            height: CANVAS_HEIGHT * s,
            // Hidden until measured rather than unmounted, so the ResizeObserver
            // keeps a box to observe on the very first layout pass.
            visibility: measured === null ? 'hidden' : undefined,
            ...vars,
            background: 'var(--osd-bg)',
            borderRadius: flat ? 0 : 'var(--osd-radius)',
          } as CSSProperties
        }
      >
        <div
          className="osd-canvas-stage"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            transform: `scale(${s})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
