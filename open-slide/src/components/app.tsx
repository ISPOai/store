import { useCallback, useEffect, useRef, useState } from 'react'
import { exampleDeck } from '../lib/example-deck'
import { createDeckCommand } from '../lib/deck-commands'
import { listDecks, writeDeck } from '../lib/deck-store'
import type { Deck } from '../lib/types'
import { EditorPanel } from './editor-panel'
import { Player } from './player'

// Owns the deck library and the current selection. Deck writes go through the
// store module, so the command handler and this component read the same files
// and neither depends on the other being mounted.

type Status = 'loading' | 'ready' | 'no-access'

/** Retry cadence while file access is still pending. */
const ACCESS_RETRY_MS = 2500

/** Keystrokes coalesce into one write rather than one write per character. */
const SAVE_DEBOUNCE_MS = 400

export function App() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [presenting, setPresenting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const seeded = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const pendingSave = useRef<Deck | null>(null)

  // The first run of a freshly installed app races the file-access prompt: the
  // initial read is refused or held while the user is still deciding. Treating
  // that as an empty library would strand the app on its empty state forever,
  // so a failed read is a distinct status that keeps retrying instead.
  const refresh = useCallback(async () => {
    try {
      let loaded = await listDecks()
      // Seed once, and only into a genuinely empty library — a user who deletes
      // the example should not get it back on the next open.
      if (loaded.length === 0 && !seeded.current) {
        seeded.current = true
        await writeDeck(exampleDeck(new Date().toISOString()))
        loaded = await listDecks()
      }
      setDecks(loaded)
      setSelectedId((current) =>
        current && loaded.some((deck) => deck.id === current) ? current : (loaded[0]?.id ?? null),
      )
      setStatus('ready')
    } catch (err) {
      console.warn('[open-slide] deck library unavailable:', err)
      // A failed seed must not count as done, or granting access later would
      // leave the library permanently empty.
      seeded.current = false
      setStatus('no-access')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (status !== 'no-access') return
    const id = window.setInterval(() => {
      void refresh()
    }, ACCESS_RETRY_MS)
    return () => window.clearInterval(id)
  }, [status, refresh])

  // A deck created by the command lands on disk while this view is open, so
  // refresh when the window regains focus rather than polling for it.
  useEffect(() => {
    const onFocus = () => {
      // A refresh mid-edit would re-read the file and discard whatever has not
      // been flushed yet, so skip while a write is still owed.
      if (pendingSave.current !== null) return
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  // The button runs the same command the host invokes — `.run()` executes the
  // one handler rather than a parallel in-app copy of it, so the two paths can
  // never drift into producing different decks.
  const [creating, setCreating] = useState(false)
  const createDeck = useCallback(async () => {
    setCreating(true)
    try {
      const result = await createDeckCommand.run({
        title: 'Untitled deck',
        pages: [
          {
            layout: 'title',
            blocks: [
              { kind: 'eyebrow', text: 'New deck' },
              { kind: 'heading', text: 'Untitled deck' },
            ],
          },
        ],
      })
      await refresh()
      const created = (result as { data?: { id?: string } }).data?.id
      if (created) setSelectedId(created)
    } catch (err) {
      console.warn('[open-slide] could not create a deck:', err)
    } finally {
      setCreating(false)
    }
  }, [refresh])

  // An edit updates the in-memory library at once so the canvas repaints on the
  // keystroke, and schedules the write. The timer holds the latest deck rather
  // than a queue: successive keystrokes supersede each other.
  const flushSave = useCallback(async () => {
    const deck = pendingSave.current
    pendingSave.current = null
    if (!deck) return
    try {
      await writeDeck(deck)
    } catch (err) {
      console.warn('[open-slide] could not save deck:', err)
    } finally {
      if (pendingSave.current === null) setSaving(false)
    }
  }, [])

  const editDeck = useCallback(
    (next: Deck) => {
      setDecks((current) => current.map((deck) => (deck.id === next.id ? next : deck)))
      pendingSave.current = next
      setSaving(true)
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        void flushSave()
      }, SAVE_DEBOUNCE_MS)
    },
    [flushSave],
  )

  // A pending edit must not be lost to an unmount or a reload.
  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      void flushSave()
    }
  }, [flushSave])

  const selected = decks.find((deck) => deck.id === selectedId) ?? decks[0] ?? null

  useEffect(() => {
    setIndex(0)
  }, [selectedId])

  if (status === 'loading') {
    return <div className="osd-empty">Loading decks…</div>
  }

  if (status === 'no-access') {
    return (
      <div className="osd-empty">
        <h1>Waiting for file access</h1>
        <p>Open Slide keeps its decks in this project’s own files. Allow access to continue.</p>
      </div>
    )
  }

  if (!selected) {
    return (
      <div className="osd-empty">
        <h1>No decks yet</h1>
        <p>Add one here, or ask for a deck through the “Create deck” command.</p>
        <button type="button" className="osd-new-deck" onClick={() => void createDeck()} disabled={creating}>
          {creating ? 'Adding…' : 'New deck'}
        </button>
      </div>
    )
  }

  const appClass = [
    'osd-app',
    presenting ? 'osd-app-presenting' : '',
    editing && !presenting ? 'osd-app-editing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={appClass}>
      <aside className="osd-sidebar">
        <header className="osd-sidebar-header">
          <span className="osd-wordmark">Open Slide</span>
          <button
            type="button"
            className="osd-new-deck"
            onClick={() => void createDeck()}
            disabled={creating}
          >
            {creating ? 'Adding…' : 'New deck'}
          </button>
        </header>
        <ul className="osd-deck-list">
          {decks.map((deck) => (
            <li key={deck.id}>
              <button
                type="button"
                className={deck.id === selected.id ? 'osd-deck osd-deck-current' : 'osd-deck'}
                onClick={() => setSelectedId(deck.id)}
              >
                <span className="osd-deck-title">{deck.title}</span>
                <span className="osd-deck-meta">
                  {deck.pages.length} {deck.pages.length === 1 ? 'page' : 'pages'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selected.pages[index]?.notes ? (
          <footer className="osd-notes">
            <span className="osd-notes-label">Notes · page {index + 1}</span>
            <p>{selected.pages[index]?.notes}</p>
          </footer>
        ) : null}
      </aside>

      <main className="osd-main">
        <Player
          deck={selected}
          index={index}
          onIndexChange={setIndex}
          presenting={presenting}
          onPresentingChange={setPresenting}
          editing={editing}
          onEditingChange={setEditing}
        />
      </main>

      {editing && !presenting ? (
        <EditorPanel
          deck={selected}
          pageIndex={Math.min(index, selected.pages.length - 1)}
          onChange={editDeck}
          onPageIndexChange={setIndex}
          onClose={() => setEditing(false)}
          saving={saving}
        />
      ) : null}
    </div>
  )
}
