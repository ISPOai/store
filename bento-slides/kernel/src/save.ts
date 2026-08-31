// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Ported to ISPO from nyblnet/bento kernel/src/save.ts (see UPSTREAM.md).
//
// ISPO PORT — where a deck is saved, and what a saved deck IS.
//
// UPSTREAM: the file is the app. At boot the document is deep-cloned before any
// mutation; on save the clone's `#bento-doc` block is swapped for the current
// model JSON and the whole thing re-serialized, so one `.bento.html` carries the
// deck AND the editor that opens it. TiddlyWiki's trick, and the product's
// central promise.
//
// THAT PROMISE CANNOT BE KEPT HERE, and pretending otherwise would be the worst
// possible outcome — a "self-contained" file that opens to nothing. ISPO builds
// this project with esbuild into an external `main.js` and generates the
// surrounding `index.html` itself (apps/desktop/src/main/projects/build-html.ts).
// There is no shell in the document to clone, and cloning what IS there would
// serialize a page whose only script is a `<script src>` pointing back inside
// this ISPO install.
//
// SO THE WRAPPER GOES AND THE DOCUMENT STAYS. A deck here is the exact JSON
// upstream keeps inside the block — same model, same version, same additive
// format guarantees — written to the project's private storage as
// `decks/<name>.bento.json`. Consequences, stated plainly:
//
//   · Nothing is lost in the direction that matters most: a `.bento.html`
//     someone sends you still OPENS here (the editor reads its block out), and
//     an exported deck still round-trips into any real Bento file through
//     "Replace from JSON". Only "export a file that IS the app" is gone.
//   · ⌘S, autosave write-back and Save-a-copy work exactly as upstream, because
//     the layer below them — a handle you hold, written silently after the
//     first save — maps cleanly onto an fs path.
//   · `downloadFile` is deleted, not stubbed. A browser download (`<a download>`)
//     is a hard ISPO build error (spec §25): artifacts leave through Files.
//     `exportToFiles` below is where they leave through instead.
//
// The serialization half of this module — the encryption envelope, the
// suggested-name rules — is upstream's, kept verbatim where it still applies.
// The disk half is new and lives on top of ispo/src/store.ts.

import type { KernelDoc } from './doc.ts'
import { appConfig } from './app.ts'
import { askText, say } from '../../ispo/src/dialogs.ts'
import {
  currentDeck,
  freshDeckPath,
  listDecks,
  readDeck,
  refFor,
  sanitize,
  setCurrentDeck,
  writeDeck,
} from '../../ispo/src/store.ts'
import { exportToFiles } from '../../ispo/src/files.ts'

/**
 * ISPO: nothing to capture — there is no shell in the document. Kept as a
 * no-op because it is the FIRST call in every app's boot sequence and its
 * absence would read as a missing step rather than a deliberate one.
 */
export function capturePristine(): void {
  /* no shell to clone — see the header */
}

/**
 * ISPO: the document never arrives in the page. It is read from project
 * storage by ispo/src/boot.ts and handed to the app, precisely so a REFUSED
 * read can be told apart from an EMPTY one — a distinction this signature
 * (`string | null`) cannot express, and which decides whether the reader gets
 * the starter deck or a retry.
 */
export function readEmbeddedDoc(): string | null {
  return null
}

/**
 * Extra plaintext blocks an app wanted written into every saved shell —
 * language packs, upstream. There is no shell, so nothing carries them and
 * nothing reads them back. Kept so `slides/src/i18n.ts` registers unchanged.
 */
export interface ShellBlock {
  id: string
  type: string
  body: string
  attrs?: Record<string, string>
}

export function registerShellBlocks(_fn: () => ShellBlock[], _types: string[]): void {
  /* no shell — see slides/src/packs.ts for what this cost */
}

export function readShellBlocks(_type: string): Array<{ id: string; body: string; el: Element }> {
  return []
}

/**
 * A static rendering of page one that upstream splices into the saved shell so
 * file managers thumbnail the deck. ISPO decks are not files in a file manager
 * and the host renders its own project icons, so the provider is accepted and
 * never called.
 */
export type PreviewProvider = (doc: KernelDoc) => HTMLElement | null

export function registerPreview(_fn: PreviewProvider): void {
  /* no shell to write a preview into */
}

// --- serialization ----------------------------------------------------------

/** The deck body: the document JSON, exactly as it sits in a `#bento-doc` block. */
export function serializeWith(_shell: Document, doc: KernelDoc): string {
  return JSON.stringify(doc)
}

/** The deck body with `doc` in it (plain — encryption-aware callers use serializeAuto). */
export function serializeFile(doc: KernelDoc): string {
  return JSON.stringify(doc)
}

// --- password encryption ----------------------------------------------------
//
// Upstream's envelope, unchanged: AES-GCM-256 over the doc JSON with a
// PBKDF2-SHA-256 key. It applied to the block's contents rather than to the
// file, so it survives the wrapper's removal untouched — an encrypted ISPO
// deck is byte-identical to the block an encrypted `.bento.html` carries, and
// each opens the other.

export interface EncEnvelope {
  format: 'bento/enc'
  v: 1
  it: number
  salt: string
  iv: string
  data: string
}

/**
 * PBKDF2 rounds for NEW envelopes only. READING IS UNAFFECTED: the count
 * travels in the envelope (`it`) and `decryptEnvelope` derives with THAT
 * number, so every deck encrypted by an older build keeps opening.
 */
const ENC_ITERATIONS = 600_000

const eb64 = {
  enc(bytes: Uint8Array): string {
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s)
  },
  dec(s: string): Uint8Array {
    const b = atob(s)
    const out = new Uint8Array(b.length)
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
    return out
  },
}

let encPassword: string | null = null

/** Set (or clear with null) the password used for every subsequent save. */
export function setEncryptionPassword(p: string | null) {
  encPassword = p
}

export const isEncryptionActive = () => encPassword !== null

/** Parse a deck body as an encryption envelope; null if it is not one. */
export function parseEnvelope(text: string): EncEnvelope | null {
  try {
    const env = JSON.parse(text)
    if (env && env.format === 'bento/enc' && env.v === 1 && env.data && env.salt && env.iv) {
      return env as EncEnvelope
    }
  } catch {
    /* not an envelope */
  }
  return null
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function encryptBody(json: string, password: string): Promise<string> {
  const salt = new Uint8Array(16)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(salt)
  crypto.getRandomValues(iv)
  const key = await deriveKey(password, salt, ENC_ITERATIONS)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(json))
  const env: EncEnvelope = {
    format: 'bento/enc', v: 1, it: ENC_ITERATIONS,
    salt: eb64.enc(salt), iv: eb64.enc(iv), data: eb64.enc(new Uint8Array(ct)),
  }
  return JSON.stringify(env)
}

/** Decrypt an envelope with a candidate password; null on wrong password. */
export async function decryptEnvelope(env: EncEnvelope, password: string): Promise<string | null> {
  try {
    const key = await deriveKey(password, eb64.dec(env.salt), env.it || ENC_ITERATIONS)
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: eb64.dec(env.iv) as BufferSource }, key, eb64.dec(env.data) as BufferSource)
    return new TextDecoder().decode(pt)
  } catch {
    return null
  }
}

/** Encryption-aware serialization — THE path for every save. */
export async function serializeDocInto(_shell: Document, doc: KernelDoc): Promise<string> {
  return encPassword
    ? await encryptBody(JSON.stringify(doc), encPassword)
    : JSON.stringify(doc)
}

/** Encryption-aware serializeFile. */
export async function serializeAuto(doc: KernelDoc): Promise<string> {
  return serializeDocInto(document, doc)
}

/**
 * The name a deck proposes for itself. `.bento.json` rather than
 * `.bento.html`, because that is what the bytes are here — naming a JSON
 * document `.html` would break the one thing this port keeps intact, which is
 * that the format is legible and round-trippable by other tools.
 */
export function suggestedFileName(doc: KernelDoc, suffix = ''): string {
  const base = sanitize(doc.title)
  return `${base}${suffix ? `-${suffix}` : ''}.bento.json`
}

// --- writing to storage -----------------------------------------------------

type SaveResult = 'saved' | 'saved-as' | 'downloaded' | 'cancelled'

/**
 * ISPO always can. `fs:self` is a standing grant on this project's own private
 * storage, so there is no browser to lack the File System Access API and no
 * "this browser can only hand back copies" state to warn about. Every promise
 * the editor makes about ⌘S — rewrite in place, silent autosave write-back —
 * is true here.
 */
export const canWriteInPlace = () => true

export type SavePurpose = 'in-place' | 'copy' | 'share' | 'backup'

/**
 * ISPO is a HOST in upstream's sense — it resolves saves itself rather than
 * leaving them to a browser picker. Answering `true` is what tells the editor
 * that an in-place save needs no destination prompt.
 */
export const hostCan = (op: string): boolean =>
  op === 'write' || op === 'backup' || op === 'open'

/**
 * The deck currently open, in upstream's vocabulary. Upstream's handle is a
 * `FileSystemFileHandle`; here it is a path in project storage, and it is held
 * by ispo/src/store.ts so a restart can return to the same deck.
 */
export const hasFileHandle = () => currentDeck() !== null
export const currentFileName = () => currentDeck()?.name ?? null

/** Adopt a deck opened outside the save path — see the editor's Open… flow. */
export function adoptFileHandle(handle: { name: string; path?: string }): void {
  if (handle.path) setCurrentDeck(refFor(handle.path))
}

/**
 * The name of the file this document is open AS.
 *
 * Upstream falls back to the page URL, because a `.bento.html` double-clicked
 * from disk grants no handle. There is no such case here — a deck is either
 * open from storage or has never been saved — so the fallback is dropped
 * rather than left to answer with the ISPO project path.
 */
export function openedFileName(): string | null {
  return currentDeck()?.name ?? null
}

/** Strip the document extension: "Q3-board.bento.json" -> "Q3-board". */
export const fileBase = (name: string) =>
  name.replace(/\.bento\.(json|html)$/i, '').replace(/\.html$/i, '')

/** Ask for a deck name, defaulted from the document. Null if the reader backs out. */
async function askDeckName(suggested: string): Promise<string | null> {
  const answer = await askText('Name this deck', fileBase(suggested), {
    ok: 'Save',
    placeholder: 'Deck name',
  })
  if (answer === null) return null
  const trimmed = answer.trim()
  return trimmed ? trimmed : fileBase(suggested)
}

/**
 * Save the document.
 *
 * `forcePicker` is upstream's "Save a copy…" — a second deck, named by the
 * author, which then becomes the ⌘S target (that retargeting is upstream's
 * behaviour, kept deliberately: continuing to type after "save a copy" should
 * go into the copy). A first save of a never-saved document also asks for a
 * name, because a deck with no file needs one, and is `saved-as` for the same
 * reason it is upstream.
 */
export async function saveFile(doc: KernelDoc, forcePicker = false): Promise<SaveResult> {
  const body = await serializeAuto(doc)
  const open = currentDeck()
  if (forcePicker || !open) {
    const name = await askDeckName(suggestedFileName(doc))
    if (name === null) return 'cancelled'
    const path = await freshDeckPath(name)
    await writeDeck(path, body)
    setCurrentDeck(refFor(path))
    return 'saved-as'
  }
  await writeDeck(open.path, body)
  return 'saved'
}

/** Overwrite the open deck with an already-serialized body (autosave write-back). */
export async function writeUpdatedFile(body: string): Promise<void> {
  const open = currentDeck()
  if (!open) throw new Error('no deck is open')
  await writeDeck(open.path, body)
}

/**
 * Write a body to a NEW deck the author names — every export upstream routes
 * through a save picker for: view-only copies, presentation packages, invites,
 * templates. Returns false if they backed out.
 *
 * `keepHandle` is honoured exactly as upstream: an export must NOT become the
 * ⌘S target, or the next save would overwrite a view-only copy with the full
 * document, owner keys included.
 */
export async function writeUpdatedFileAs(
  body: string,
  doc: KernelDoc,
  opts: { suffix?: string; keepHandle?: boolean; suggestedName?: string; purpose?: SavePurpose } = {},
): Promise<boolean> {
  const suggested = opts.suggestedName ?? suggestedFileName(doc, opts.suffix)
  const name = await askDeckName(suggested)
  if (name === null) return false
  const path = await freshDeckPath(name)
  await writeDeck(path, body)
  if (opts.keepHandle) setCurrentDeck(refFor(path))
  return true
}

/**
 * Hand a deck OUT of ISPO, into the user's Files library.
 *
 * This is the replacement for `downloadFile`, and it is a better one: a
 * browser download is a build error here (spec §25), and the powerbox is the
 * host's own save dialog — grantless, because the modal IS the consent. Call
 * it only from an explicit gesture.
 */
export async function exportDeckToFiles(doc: KernelDoc): Promise<string | null> {
  const body = await serializeAuto(doc)
  return exportToFiles(suggestedFileName(doc), body)
}

/** Every deck in project storage. Re-exported so the editor's Open… flow has one import. */
export { listDecks, readDeck, currentDeck, setCurrentDeck, refFor, freshDeckPath }

/** Used by the editor when a deck it just opened turns out to be unreadable. */
export const sayError = say
export const appLabel = () => appConfig().appName
