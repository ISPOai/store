// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// ISPO PORT — the "disk" a Bento deck is saved to.
//
// Upstream, the disk is the user's real filesystem and a deck is a
// self-contained `.bento.html` that rewrites itself in place. Neither exists
// here: an ISPO project app has no filesystem handle, and it cannot serialize
// itself into one file because the host builds it into an external `main.js`
// and generates the surrounding HTML.
//
// What it has instead is `fs.*` — private, project-scoped storage under
// `~/ISPO/.state/<projectId>/`, which no other app can read. So a deck is a
// FILE THERE: `decks/<name>.bento.json`, holding exactly the document JSON
// that upstream keeps in the `#bento-doc` block. The bytes are the same bytes;
// only the wrapper is gone. That is what makes `.bento.html` files importable
// (we read their block) and exports meaningful (we write that block's content).
//
// Everything above this module — kernel/src/save.ts and the editor — keeps
// upstream's vocabulary of handles, in-place saves and file names. This is the
// one place that knows they are `fs` paths.

import { fs } from '@ispo/sdk'

/** Where decks live, relative to the project's private storage root. */
export const DECK_DIR = 'decks'
/** Which deck was open last, so a restart returns to it. */
const STATE_PATH = 'session.json'
export const DECK_EXT = '.bento.json'

export interface DeckRef {
  /** fs path, e.g. `decks/Q3_Board.bento.json` */
  path: string
  /** basename shown in the file chip, e.g. `Q3_Board.bento.json` */
  name: string
}

const isMissing = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return message.includes('not found:')
}

/**
 * Is this failure "there is nothing there" rather than "you may not look"?
 *
 * The distinction is the whole of the first-run permission race: a freshly
 * installed app's first read fires while the user is still looking at the
 * access review, and answering that with the starter deck would put an empty
 * document in front of someone whose real deck is on disk — and the next save
 * would make it permanent. Only a genuine ENOENT is allowed to mean "new".
 */
export const isNotFound = isMissing

export function deckPath(base: string): string {
  return `${DECK_DIR}/${sanitize(base)}${DECK_EXT}`
}

/** A file name safe for the deck directory, derived from a deck title. */
export function sanitize(base: string): string {
  const cleaned = base
    .replace(/\.bento\.(json|html)$/i, '')
    .replace(/[^\w\d-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return cleaned || 'Untitled'
}

/** Every deck in project storage, newest name order irrelevant — sorted. */
export async function listDecks(): Promise<DeckRef[]> {
  let entries: string[]
  try {
    entries = await fs.list(DECK_DIR)
  } catch (err) {
    if (isMissing(err)) return []
    throw err
  }
  return entries
    .filter((name) => name.endsWith(DECK_EXT))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ path: `${DECK_DIR}/${name}`, name }))
}

/** Read a deck's body (document JSON, or a bento/enc envelope). */
export function readDeck(path: string): Promise<string> {
  return fs.read(path)
}

/**
 * What this app last wrote to each deck, so a change made by SOMEONE ELSE can
 * be told from its own writes.
 *
 * "Someone else" is not hypothetical: this project exports headless commands
 * (add-slide, new-deck) that a host or an agent can invoke while the editor is
 * open, and they write straight to disk. Without this the editor would not
 * notice, and its next save would silently overwrite them.
 */
const lastWritten = new Map<string, string>()

export async function writeDeck(path: string, body: string): Promise<void> {
  await fs.write(path, body)
  lastWritten.set(path, body)
}

/** Remember a body that arrived from disk, so it does not read as a change. */
export function noteLoaded(path: string, body: string): void {
  lastWritten.set(path, body)
}

/**
 * The open deck's body if it changed underneath us, else null. Never throws:
 * a failed poll is not worth interrupting an edit for.
 */
export async function deckChangedOnDisk(): Promise<string | null> {
  const open = current
  if (!open) return null
  let body: string
  try {
    body = await fs.read(open.path)
  } catch {
    return null
  }
  if (body === lastWritten.get(open.path)) return null
  lastWritten.set(open.path, body)
  return body
}

export function deleteDeck(path: string): Promise<void> {
  return fs.delete(path)
}

/**
 * A deck path that is not taken yet. Saving a copy of "Q3 Board" beside an
 * existing one lands on `Q3_Board-2`, the way a file manager would — never on
 * top of the deck already there.
 */
export async function freshDeckPath(base: string): Promise<string> {
  const taken = new Set((await listDecks()).map((d) => d.path))
  const first = deckPath(base)
  if (!taken.has(first)) return first
  for (let n = 2; n < 1000; n++) {
    const candidate = deckPath(`${sanitize(base)}-${n}`)
    if (!taken.has(candidate)) return candidate
  }
  return deckPath(`${sanitize(base)}-${Date.now()}`)
}

// --- which deck is open -----------------------------------------------------

let current: DeckRef | null = null

export const currentDeck = (): DeckRef | null => current

export function setCurrentDeck(ref: DeckRef | null): void {
  current = ref
  void rememberCurrent()
}

export function refFor(path: string): DeckRef {
  return { path, name: path.slice(path.lastIndexOf('/') + 1) }
}

async function rememberCurrent(): Promise<void> {
  try {
    await fs.write(STATE_PATH, `${JSON.stringify({ v: 1, deck: current?.path ?? null })}\n`)
  } catch {
    // A session pointer that fails to save costs the user one "which deck was
    // I in?" on the next launch. It must never cost them the save that is
    // happening at the same time, so this stays silent by design.
  }
}

/** The deck open when the app was last closed, if it still exists. */
export async function lastOpenedDeck(): Promise<string | null> {
  const raw = await fs.read(STATE_PATH).catch((err: unknown) => {
    if (isMissing(err)) return null
    throw err
  })
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as { deck?: unknown }
    return typeof parsed.deck === 'string' ? parsed.deck : null
  } catch {
    return null
  }
}
