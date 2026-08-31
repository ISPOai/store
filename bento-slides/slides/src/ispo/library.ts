// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// ISPO PORT — the deck library. THE SCREEN THIS APP OPENS ON.
//
// Upstream has nothing like it and does not need it: a deck is a file, so the
// library is the operating system's, and opening Bento means opening one
// document. Here the app owns its decks (they live in project-private storage
// under `fs:self`), which means the app also owes the reader the answer to
// "what have I got?" — and owes it FIRST, before picking one for them.
//
// So boot lands here, not in a document. The previously-open deck is marked but
// not auto-opened: choosing is one click, and guessing wrong drops someone into
// the wrong deck with an editor already warm.
//
// The thumbnails are `renderThumbnail` — the same primitive the editor's slide
// rail uses, which renders a slide at a GIVEN WIDTH and scales it there.
// `buildSlidePreview` (upstream's file-manager preview) looked like the
// obvious choice and is not: it renders at its own size, not the deck's, so
// scaling it by `doc.size.width` cropped every card. Measured, not assumed.

import { inLinearFlow, parseDoc, type BentoDoc } from '../model'
import { renderThumbnail } from '../render'
import { t } from '../i18n'
import { ask, say } from '../../../ispo/src/dialogs.ts'
import {
  currentDeck, deleteDeck, listDecks, readDeck, type DeckRef,
} from '../../../ispo/src/store.ts'

/** How many previews to render. Each parses a whole deck; the rest get a mark. */
const PREVIEW_LIMIT = 24

export interface LibraryActions {
  /** Open a deck by fs path. Boots the editor the first time, swaps it after. */
  open: (path: string) => Promise<void> | void
  newDeck: () => Promise<void> | void
  importFromFiles: () => Promise<void> | void
}

let host: HTMLElement | null = null
let actions: LibraryActions | null = null
/** Cards awaiting a thumbnail, rendered once the grid has real widths. */
let pending: Array<{ shot: HTMLElement; doc: BentoDoc }> = []

export function isLibraryOpen(): boolean {
  return host !== null
}

export function hideLibrary(): void {
  host?.remove()
  host = null
}

/** Show (or refresh) the library. Safe to call when it is already up. */
export async function showLibrary(next?: LibraryActions): Promise<void> {
  if (next) actions = next
  if (!actions) throw new Error('the deck library needs its actions on first show')
  hideLibrary()

  bindFit()
  pending = []
  host = document.createElement('div')
  host.className = 'ed-ispo-library'
  document.body.appendChild(host)
  document.getElementById('bento-splash')?.remove()

  const head = document.createElement('header')
  head.className = 'ed-ispo-lib-head'
  const title = document.createElement('h1')
  title.textContent = t('Your decks')
  const spacer = document.createElement('div')
  spacer.className = 'ed-ispo-lib-spacer'
  // ISPO PORT: no Import button here. Bringing a deck in from Files stays
  // reachable from the editor (Save ▾ → Open deck… → From Files…), where the
  // rest of the file operations live; on this page it was the loudest control
  // for the rarest action.
  const newB = button(t('New deck'), 'ed-ispo-primary', () =>
    void run(newB, t('Working…'), () => actions!.newDeck()))
  head.append(title, spacer, newB)
  host.appendChild(head)

  const grid = document.createElement('div')
  grid.className = 'ed-ispo-lib-grid'
  host.appendChild(grid)

  let decks: DeckRef[]
  try {
    decks = await listDecks()
  } catch (err) {
    grid.appendChild(note(t('Your decks could not be read: {err}',
      { err: String((err as Error)?.message ?? err) })))
    return
  }

  if (!decks.length) {
    grid.appendChild(note(t('No decks yet. Start one, or bring a .bento.html or .bento.json in from your Files.')))
    return
  }

  const open = currentDeck()?.path
  for (const [index, deck] of decks.entries()) {
    grid.appendChild(await card(deck, deck.path === open, index < PREVIEW_LIMIT))
  }
  fitPreviews()
}

/**
 * Scale each thumbnail to the width its card actually got.
 *
 * Measured rather than assumed: the grid is fluid (`auto-fill` over a
 * `minmax`), so the card width depends on the pane, which in ISPO depends on
 * the chat plane, the panel, and the window. Re-run on resize for the same
 * reason.
 */
function fitPreviews(): void {
  for (const { shot, doc } of pending) {
    const width = shot.clientWidth
    if (!width) continue
    const slide = doc.slides.find(inLinearFlow) ?? doc.slides[0]
    if (!slide) continue
    shot.textContent = ''
    const thumb = renderThumbnail(slide, doc, width)
    thumb.style.position = 'absolute'
    thumb.style.left = '0'
    thumb.style.top = '0'
    shot.appendChild(thumb)
  }
}

let fitBound = false
function bindFit(): void {
  if (fitBound) return
  fitBound = true
  // No ResizeObserver: an ISPO project frame gets no rendering steps while it
  // is backgrounded, so RO callbacks are exactly what it drops. `resize` plus
  // a re-fit on every show covers the cases that matter.
  window.addEventListener('resize', () => { if (host) fitPreviews() })
}

/**
 * Run a header action with a VISIBLE pending state, and refuse a second one
 * while it is in flight.
 *
 * `files.pick` opens a host-owned powerbox and waits up to 90s for the reader
 * to choose. On this host that modal can open WITHOUT RENDERING ANYWHERE — the
 * host still marks a blocking surface open, which inerts this whole frame, so
 * the page freezes with no picker to answer and no clue why (reported as "the
 * button got stuck, and then New deck was stuck too").
 *
 * `inert` blocks INPUT, not painting, so the app can still say what it is
 * waiting for even while nothing responds to a click. That is the whole point
 * of this: the freeze is not ours to fix, but the silence is.
 */
let busy = false
async function run(btn: HTMLButtonElement, pending: string, work: () => Promise<void> | void): Promise<void> {
  if (busy) return
  busy = true
  const label = btn.textContent
  btn.textContent = pending
  btn.classList.add('is-busy')
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('.ed-ispo-lib-btn'))) {
    b.disabled = true
  }
  try {
    await work()
  } finally {
    busy = false
    btn.textContent = label
    btn.classList.remove('is-busy')
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('.ed-ispo-lib-btn'))) {
      b.disabled = false
    }
  }
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = `ed-ispo-lib-btn ${cls}`.trim()
  b.textContent = label
  b.addEventListener('click', onClick)
  return b
}

function note(text: string): HTMLElement {
  const p = document.createElement('p')
  p.className = 'ed-ispo-lib-empty'
  p.textContent = text
  return p
}

/** "3 days ago" style, from the document's own `modified` stamp. */
function whenModified(doc: BentoDoc): string {
  const at = doc.modified ? new Date(doc.modified).getTime() : NaN
  if (!Number.isFinite(at)) return ''
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 2) return t('just now')
  if (mins < 60) return t('{n}m ago', { n: mins })
  if (mins < 60 * 24) return t('{n}h ago', { n: Math.round(mins / 60) })
  if (mins < 60 * 24 * 30) return t('{n}d ago', { n: Math.round(mins / 1440) })
  return new Date(at).toLocaleDateString()
}

async function card(deck: DeckRef, isOpen: boolean, withPreview: boolean): Promise<HTMLElement> {
  const wrap = document.createElement('div')
  wrap.className = `ed-ispo-lib-card${isOpen ? ' is-open' : ''}`

  const face = document.createElement('button')
  face.className = 'ed-ispo-lib-face'
  face.addEventListener('click', () => void actions!.open(deck.path))
  wrap.appendChild(face)

  const shot = document.createElement('div')
  shot.className = 'ed-ispo-lib-shot'
  face.appendChild(shot)

  const meta = document.createElement('div')
  meta.className = 'ed-ispo-lib-meta'
  face.appendChild(meta)

  const name = document.createElement('div')
  name.className = 'ed-ispo-lib-name'
  name.textContent = deck.name.replace(/\.bento\.json$/i, '')
  const sub = document.createElement('div')
  sub.className = 'ed-ispo-lib-sub'
  meta.append(name, sub)

  // Read and parse lazily per card: a deck is a few hundred KB and there is no
  // reason to hold them all at once. A deck that fails to parse still gets a
  // card — it is somebody's data and hiding it would be the wrong answer.
  let doc: BentoDoc | null = null
  try {
    const body = await readDeck(deck.path)
    doc = body.includes('"bento/enc"') ? null : parseDoc(body)
    if (!doc && body.includes('"bento/enc"')) {
      sub.textContent = t('Password-protected')
      shot.classList.add('is-locked')
      shot.textContent = '🔒'
    } else if (!doc) {
      sub.textContent = t('Not readable by this version')
    }
  } catch {
    sub.textContent = t('Could not be read')
  }

  if (doc) {
    name.textContent = doc.title || name.textContent
    const parts = [doc.slides.length === 1
      ? t('1 slide')
      : t('{n} slides', { n: doc.slides.length })]
    const when = whenModified(doc)
    if (when) parts.push(when)
    sub.textContent = parts.join(' · ')
    if (withPreview) {
      // Rendered in the post-append pass, once the card has a real width.
      shot.style.aspectRatio = `${doc.size.width} / ${doc.size.height}`
      pending.push({ shot, doc })
    }
  }

  if (isOpen) {
    const badge = document.createElement('span')
    badge.className = 'ed-ispo-lib-badge'
    badge.textContent = t('open')
    meta.appendChild(badge)
  }

  const del = document.createElement('button')
  del.className = 'ed-ispo-lib-del'
  del.title = t('Delete this deck')
  del.textContent = '✕'
  del.addEventListener('click', (ev) => {
    ev.stopPropagation()
    void (async () => {
      const label = doc?.title || deck.name
      if (!(await ask(t('Delete “{name}”? This cannot be undone.', { name: label }),
        { ok: t('Delete'), danger: true }))) return
      try {
        await deleteDeck(deck.path)
      } catch (err) {
        await say(t('That deck could not be deleted: {err}',
          { err: String((err as Error)?.message ?? err) }))
        return
      }
      await showLibrary()
    })()
  })
  wrap.appendChild(del)

  return wrap
}
