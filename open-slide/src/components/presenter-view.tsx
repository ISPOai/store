import { useEffect, useState } from 'react'
import { DESIGN_PRESETS } from '../lib/design'
import type { Deck } from '../lib/types'
import { PageView } from './page-view'
import { SlideCanvas } from './slide-canvas'

// What upstream's presenter window contains — elapsed time, the next page, and
// the speaker notes — as an overlay inside this frame. A sandboxed project
// iframe cannot open a second window, so the choice is this or nothing; a
// presenter with one screen is served either way.

function elapsed(startedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function PresenterView({
  deck,
  index,
  startedAt,
  onClose,
}: {
  deck: Deck
  index: number
  startedAt: number
  onClose: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const design = DESIGN_PRESETS[deck.design] ?? DESIGN_PRESETS.default
  const next = deck.pages[index + 1]
  const notes = deck.pages[index]?.notes

  return (
    <aside className="osd-presenter" aria-label="Presenter view">
      <header className="osd-presenter-head">
        <span className="osd-presenter-clock">{elapsed(startedAt, now)}</span>
        <span className="osd-presenter-pos">
          {index + 1} / {deck.pages.length}
        </span>
        <button
          type="button"
          className="osd-icon-button"
          onClick={onClose}
          aria-label="Close presenter view"
        >
          ✕
        </button>
      </header>

      <div className="osd-presenter-next">
        <span className="osd-label">Next</span>
        {next ? (
          <div className="osd-presenter-thumb">
            <SlideCanvas design={design} scale={0.1}>
              <PageView page={next} />
            </SlideCanvas>
          </div>
        ) : (
          <p className="osd-presenter-empty">End of deck</p>
        )}
      </div>

      <div className="osd-presenter-notes">
        <span className="osd-label">Notes</span>
        <p>{notes ?? 'No notes for this page.'}</p>
      </div>
    </aside>
  )
}
