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
// What it has instead is Entities — records in the ISPO database that belong
// to this app. A deck is one `bento.deck` record whose `body` is exactly the
// document JSON that upstream keeps in the `#bento-doc` block (or a bento/enc
// envelope). The bytes are the same bytes; only the wrapper is gone. That is
// what makes `.bento.html` files importable (we read their block) and exports
// meaningful (we write that block's content).
//
// Everything above this module — kernel/src/save.ts and the editor — keeps
// upstream's vocabulary of handles, in-place saves and file names, and still
// addresses a deck by its path (`decks/<name>.bento.json`). The path is the
// deck record's indexed `path` field; this is the one place that knows it.

import { entities, type EntityRecord } from '@ispo/sdk'

/**
 * The entity API a call goes through. The app uses the ambient SDK; a headless
 * command passes `ctx.sdk.entities` so the host keeps its invocation attribution.
 */
export type Entities = typeof entities

/** The directory part of every deck path. */
export const DECK_DIR = 'decks'
export const DECK_EXT = '.bento.json'

export const DECK_TYPE = 'bento.deck'
export const SESSION_TYPE = 'bento.session'
/** The one session record: which deck was open, and whether the starter deck was planted. */
const SESSION_ID = 'session'

export interface DeckData {
  /** e.g. `decks/Q3_Board.bento.json` */
  path: string
  /** basename shown in the file chip, e.g. `Q3_Board.bento.json` */
  name: string
  /** document JSON, or a bento/enc envelope */
  body: string
  updatedAt: string
}

export interface SessionData {
  /** path of the deck open when the app was last closed; '' for none */
  deck: string
  /** when the one-time starter deck was planted; 0 if never */
  seededAt: number
  /** when decks from the retired private file storage were copied in; 0 if never */
  legacyImportedAt: number
}

export interface DeckRef {
  /** deck path, e.g. `decks/Q3_Board.bento.json` */
  path: string
  /** basename shown in the file chip, e.g. `Q3_Board.bento.json` */
  name: string
}

/** A deck path that has no record. Distinct from "you may not look". */
class DeckNotFoundError extends Error {
  constructor(path: string) {
    super(`deck not found: ${path}`)
    this.name = 'DeckNotFoundError'
  }
}

/**
 * Is this failure "there is nothing there" rather than "you may not look"?
 *
 * The distinction is the whole of the first-run permission race: answering a
 * refused read with the starter deck would put an empty document in front of
 * someone whose real deck exists, and the next save would make it permanent.
 * Only a genuinely missing record is allowed to mean "new".
 */
export const isNotFound = (err: unknown): boolean => err instanceof DeckNotFoundError

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

export function refFor(path: string): DeckRef {
  return { path, name: path.slice(path.lastIndexOf('/') + 1) }
}

async function deckRecord(path: string, api: Entities = entities): Promise<EntityRecord<DeckData> | null> {
  const { records } = await api.query<DeckData>(DECK_TYPE, { where: { path }, limit: 1 })
  return records[0] ?? null
}

/** Every deck, sorted by name. */
export async function listDecks(api: Entities = entities): Promise<DeckRef[]> {
  const { records } = await api.query<DeckData>(DECK_TYPE, { limit: 1000 })
  return records
    .map((record) => refFor(record.data.path))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Read a deck's body (document JSON, or a bento/enc envelope). */
export async function readDeck(path: string, api: Entities = entities): Promise<string> {
  const record = await deckRecord(path, api)
  if (!record) throw new DeckNotFoundError(path)
  return record.data.body
}

/**
 * What this app last wrote to each deck, so a change made by SOMEONE ELSE can
 * be told from its own writes.
 *
 * "Someone else" is not hypothetical: this project exports headless commands
 * (add-slide, new-deck) that a host or an agent can invoke while the editor is
 * open, and they write the same records. Without this the editor would not
 * notice, and its next save would silently overwrite them.
 */
const lastWritten = new Map<string, string>()

export async function writeDeck(path: string, body: string): Promise<void> {
  await putDeck(path, body)
  lastWritten.set(path, body)
}

/** Create or replace the deck at `path`. Shared with the headless commands. */
export async function putDeck(path: string, body: string, api: Entities = entities): Promise<void> {
  const updatedAt = new Date().toISOString()
  const existing = await deckRecord(path, api)
  if (existing) {
    await api.update<DeckData>(DECK_TYPE, existing.id, { body, updatedAt })
    return
  }
  await api.create<DeckData>(DECK_TYPE, { path, name: refFor(path).name, body, updatedAt })
}

/** Remember a body that arrived from storage, so it does not read as a change. */
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
    body = await readDeck(open.path)
  } catch {
    return null
  }
  if (body === lastWritten.get(open.path)) return null
  lastWritten.set(open.path, body)
  return body
}

export async function deleteDeck(path: string): Promise<void> {
  const record = await deckRecord(path)
  if (!record) return
  await entities.delete(DECK_TYPE, record.id)
}

/**
 * A deck path that is not taken yet. Saving a copy of "Q3 Board" beside an
 * existing one lands on `Q3_Board-2`, the way a file manager would — never on
 * top of the deck already there.
 */
export async function freshDeckPath(base: string, api: Entities = entities): Promise<string> {
  const taken = new Set((await listDecks(api)).map((d) => d.path))
  const first = deckPath(base)
  if (!taken.has(first)) return first
  for (let n = 2; n < 1000; n++) {
    const candidate = deckPath(`${sanitize(base)}-${n}`)
    if (!taken.has(candidate)) return candidate
  }
  return deckPath(`${sanitize(base)}-${Date.now()}`)
}

// --- the session record -----------------------------------------------------

/** The session record, or null when this app has never written one. */
export async function readSession(api: Entities = entities): Promise<SessionData | null> {
  const { records } = await api.query<SessionData>(SESSION_TYPE, { limit: 1 })
  return records[0]?.data ?? null
}

/** Merge `patch` into the session record, creating it on first use. */
export async function patchSession(patch: Partial<SessionData>, api: Entities = entities): Promise<void> {
  const { records } = await api.query<SessionData>(SESSION_TYPE, { limit: 1 })
  const existing = records[0]
  if (existing) {
    await api.update<SessionData>(SESSION_TYPE, existing.id, patch)
    return
  }
  await api.create<SessionData>(
    SESSION_TYPE,
    { deck: '', seededAt: 0, legacyImportedAt: 0, ...patch },
    { id: SESSION_ID },
  )
}

// --- which deck is open -----------------------------------------------------

let current: DeckRef | null = null

export const currentDeck = (): DeckRef | null => current

export function setCurrentDeck(ref: DeckRef | null): void {
  current = ref
  void rememberCurrent()
}

async function rememberCurrent(): Promise<void> {
  try {
    await patchSession({ deck: current?.path ?? '' })
  } catch {
    // A session pointer that fails to save costs the user one "which deck was
    // I in?" on the next launch. It must never cost them the save that is
    // happening at the same time, so this stays silent by design.
  }
}

/** The deck open when the app was last closed, if it recorded one. */
export async function lastOpenedDeck(api: Entities = entities): Promise<string | null> {
  const session = await readSession(api)
  return session?.deck || null
}
