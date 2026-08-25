import { useCallback, useEffect, useState } from 'react'
import { hasModifier, isBackwardKey, isForwardKey, isTypingTarget } from '../lib/keys'
import { DESIGN_PRESETS } from '../lib/design'
import type { Deck } from '../lib/types'
import { PageView } from './page-view'
import { SlideCanvas } from './slide-canvas'

// Navigation and present mode, following upstream's bindings: arrows / space /
// PageDown advance, Home and End jump to the ends, O toggles the overview, Esc
// leaves present mode.
//
// Two upstream affordances are deliberately absent rather than half-built: the
// presenter window (a second window the sandboxed project iframe cannot open)
// and per-page reveal steps (they belong to the compiled-React page model).

type Props = {
  deck: Deck
  index: number
  onIndexChange: (index: number) => void
  presenting: boolean
  onPresentingChange: (presenting: boolean) => void
}

export function Player({ deck, index, onIndexChange, presenting, onPresentingChange }: Props) {
  const [overviewOpen, setOverviewOpen] = useState(false)
  const design = DESIGN_PRESETS[deck.design] ?? DESIGN_PRESETS.default
  const total = deck.pages.length
  const page = deck.pages[Math.min(index, total - 1)]

  const goTo = useCallback(
    (next: number) => onIndexChange(Math.max(0, Math.min(total - 1, next))),
    [onIndexChange, total],
  )
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index])
  const goNext = useCallback(() => goTo(index + 1), [goTo, index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return

      // While the overview is open only Esc and O reach the player, so arrow
      // keys keep moving the selection inside the grid instead of the deck.
      if (overviewOpen) {
        if (e.key === 'Escape' || e.key === 'o' || e.key === 'O') {
          e.preventDefault()
          setOverviewOpen(false)
        }
        return
      }

      if (e.key === 'Escape') {
        if (presenting) {
          e.preventDefault()
          onPresentingChange(false)
        }
        return
      }
      if (isForwardKey(e)) {
        e.preventDefault()
        goNext()
        return
      }
      if (isBackwardKey(e)) {
        e.preventDefault()
        goPrev()
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        goTo(0)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        goTo(total - 1)
        return
      }
      if (hasModifier(e)) return
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault()
        setOverviewOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, goTo, overviewOpen, presenting, onPresentingChange, total])

  // Leaving present mode should not strand the overview open on top of the
  // ordinary editor view.
  useEffect(() => {
    if (!presenting) setOverviewOpen(false)
  }, [presenting])

  if (!page) {
    return (
      <div className="osd-empty">
        <p>This deck has no pages yet.</p>
      </div>
    )
  }

  return (
    <div className={presenting ? 'osd-player osd-player-presenting' : 'osd-player'}>
      <div className="osd-stage" onClick={goNext} role="presentation">
        <SlideCanvas design={design} flat={presenting}>
          <PageView page={page} />
        </SlideCanvas>
      </div>

      <div className="osd-controls">
        <button type="button" onClick={goPrev} disabled={index === 0} aria-label="Previous page">
          ‹
        </button>
        <span className="osd-counter">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={index >= total - 1}
          aria-label="Next page"
        >
          ›
        </button>
        <button type="button" onClick={() => setOverviewOpen(true)}>
          Overview
        </button>
        <button type="button" onClick={() => onPresentingChange(!presenting)}>
          {presenting ? 'Exit present' : 'Present'}
        </button>
      </div>

      {overviewOpen ? (
        <div className="osd-overview" role="dialog" aria-label="Page overview">
          <div className="osd-overview-grid">
            {deck.pages.map((p, i) => (
              <button
                type="button"
                key={`${p.layout}-${i}`}
                className={i === index ? 'osd-thumb osd-thumb-current' : 'osd-thumb'}
                onClick={() => {
                  goTo(i)
                  setOverviewOpen(false)
                }}
              >
                {/* 0.14 puts a 1920px stage at ~269px — small enough to tile,
                    large enough that the page's real layout is recognisable. */}
                <SlideCanvas design={design} scale={0.14}>
                  <PageView page={p} />
                </SlideCanvas>
                <span className="osd-thumb-index">{i + 1}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="osd-overview-close"
            onClick={() => setOverviewOpen(false)}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  )
}
