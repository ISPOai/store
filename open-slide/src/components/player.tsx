import { useCallback, useEffect, useRef, useState } from 'react'
import { hasModifier, isBackwardKey, isForwardKey, isTypingTarget } from '../lib/keys'
import { DESIGN_PRESETS } from '../lib/design'
import { maxStep, type Deck } from '../lib/types'
import { PageView } from './page-view'
import { PresenterView } from './presenter-view'
import { SlideCanvas } from './slide-canvas'

// Navigation and present mode, following upstream's bindings: arrows / space /
// PageDown advance, Home and End jump to the ends, O toggles the overview, Esc
// leaves present mode. While presenting, B and W black or white the screen, P
// opens the presenter view, and typing digits then Enter jumps to a page.
//
// The presenter *window* stays absent — a sandboxed project iframe cannot open a
// second window — so what that window would have shown is an in-frame overlay.

type Props = {
  deck: Deck
  index: number
  onIndexChange: (index: number) => void
  presenting: boolean
  onPresentingChange: (presenting: boolean) => void
  editing: boolean
  onEditingChange: (editing: boolean) => void
}

export function Player({
  deck,
  index,
  onIndexChange,
  presenting,
  onPresentingChange,
  editing,
  onEditingChange,
}: Props) {
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [revealed, setRevealed] = useState(0)
  const [blackout, setBlackout] = useState<'black' | 'white' | null>(null)
  const [presenterOpen, setPresenterOpen] = useState(false)
  const [jumpBuffer, setJumpBuffer] = useState('')
  const [startedAt, setStartedAt] = useState(() => Date.now())

  const design = DESIGN_PRESETS[deck.design] ?? DESIGN_PRESETS.default
  const total = deck.pages.length
  const page = deck.pages[Math.min(index, total - 1)]
  const steps = page ? maxStep(page) : 0
  const transition = deck.transition ?? 'fade'

  // While editing, every block must be visible or the panel would be editing
  // something the canvas is hiding.
  const shownSteps = editing ? Number.POSITIVE_INFINITY : revealed

  const goTo = useCallback(
    (next: number, opts?: { fromEnd?: boolean }) => {
      const clamped = Math.max(0, Math.min(total - 1, next))
      const target = deck.pages[clamped]
      // Entering a page backwards lands on its finished state; entering it
      // forwards starts it over. Upstream calls this the entry direction.
      setRevealed(opts?.fromEnd && target ? maxStep(target) : 0)
      onIndexChange(clamped)
    },
    [deck.pages, onIndexChange, total],
  )

  const goNext = useCallback(() => {
    if (revealed < steps) {
      setRevealed(revealed + 1)
      return
    }
    if (index < total - 1) goTo(index + 1)
  }, [goTo, index, revealed, steps, total])

  const goPrev = useCallback(() => {
    if (revealed > 0) {
      setRevealed(revealed - 1)
      return
    }
    if (index > 0) goTo(index - 1, { fromEnd: true })
  }, [goTo, index, revealed])

  // A deck switch or an out-of-band index change (overview, editor) restarts the
  // current page's steps rather than carrying the previous page's progress over.
  useEffect(() => {
    setRevealed(0)
  }, [deck.id])

  useEffect(() => {
    if (!presenting) {
      setBlackout(null)
      setPresenterOpen(false)
      setJumpBuffer('')
      return
    }
    setStartedAt(Date.now())
  }, [presenting])

  const jumpTimer = useRef<number | null>(null)
  const queueJumpClear = useCallback(() => {
    if (jumpTimer.current !== null) window.clearTimeout(jumpTimer.current)
    jumpTimer.current = window.setTimeout(() => setJumpBuffer(''), 1600)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return

      if (overviewOpen) {
        if (e.key === 'Escape' || e.key === 'o' || e.key === 'O') {
          e.preventDefault()
          setOverviewOpen(false)
        }
        return
      }

      if (e.key === 'Escape') {
        // Esc clears a blackout first — it is the state most likely to look like
        // a frozen app — and only then leaves present mode.
        if (blackout) {
          e.preventDefault()
          setBlackout(null)
          return
        }
        if (jumpBuffer) {
          e.preventDefault()
          setJumpBuffer('')
          return
        }
        if (presenting) {
          e.preventDefault()
          onPresentingChange(false)
        }
        return
      }

      if (presenting && !hasModifier(e) && /^[0-9]$/.test(e.key)) {
        e.preventDefault()
        setJumpBuffer((current) => (current + e.key).slice(0, 4))
        queueJumpClear()
        return
      }
      if (presenting && e.key === 'Enter' && jumpBuffer) {
        e.preventDefault()
        goTo(Number(jumpBuffer) - 1)
        setJumpBuffer('')
        return
      }

      if (isForwardKey(e) || isBackwardKey(e)) {
        if (blackout) setBlackout(null)
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
        goTo(total - 1, { fromEnd: true })
        return
      }

      if (hasModifier(e)) return
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault()
        setOverviewOpen(true)
        return
      }
      if (!presenting) return
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        setBlackout((c) => (c === 'black' ? null : 'black'))
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        setBlackout((c) => (c === 'white' ? null : 'white'))
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        setPresenterOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    blackout,
    goNext,
    goPrev,
    goTo,
    jumpBuffer,
    overviewOpen,
    presenting,
    onPresentingChange,
    queueJumpClear,
    total,
  ])

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
      <div className="osd-stage" onClick={editing ? undefined : goNext} role="presentation">
        <SlideCanvas design={design} flat={presenting}>
          {/* Keyed on the page so the transition class re-runs per page rather
              than animating a mutation of the page already on screen. */}
          <div key={index} className={`osd-page osd-page-${transition}`}>
            <PageView page={page} revealed={shownSteps} />
          </div>
        </SlideCanvas>
      </div>

      {blackout ? (
        <div
          className="osd-blackout"
          style={{ background: blackout === 'black' ? '#000' : '#fff' }}
          onClick={() => setBlackout(null)}
          role="presentation"
        />
      ) : null}

      {jumpBuffer ? <div className="osd-jump">{jumpBuffer}</div> : null}

      {presenting && presenterOpen ? (
        <PresenterView
          deck={deck}
          index={index}
          startedAt={startedAt}
          onClose={() => setPresenterOpen(false)}
        />
      ) : null}

      <div className="osd-controls">
        <button type="button" onClick={goPrev} disabled={index === 0 && revealed === 0} aria-label="Previous">
          ‹
        </button>
        <span className="osd-counter">
          {index + 1} / {total}
          {steps > 0 && !editing ? <em className="osd-step-count"> · {revealed}/{steps}</em> : null}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={index >= total - 1 && revealed >= steps}
          aria-label="Next"
        >
          ›
        </button>
        <button type="button" onClick={() => setOverviewOpen(true)}>
          Overview
        </button>
        {presenting ? (
          <button type="button" onClick={() => setPresenterOpen((v) => !v)}>
            {presenterOpen ? 'Hide notes' : 'Presenter'}
          </button>
        ) : (
          <button type="button" onClick={() => onEditingChange(!editing)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
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
