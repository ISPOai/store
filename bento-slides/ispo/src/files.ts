// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// ISPO PORT — how a deck gets in and out of this app.
//
// Upstream both directions are the OS: a deck arrives by being double-clicked
// or dropped onto the editor, and leaves through a save picker or a download.
// Here they are the host's POWERBOX (spec §19.4) — `files.pick` to receive one
// and `files.save` to hand one over. Both are grantless: the host-owned modal
// IS the consent, which is why this app asks for `files: ["pick"]` and no
// standing grant at all.
//
// A pick is delivered BY COPY behind a controlled `assets:` URL, never as a
// live handle — so "open" here means "read those bytes into the editor", and
// saving afterwards writes to the project's own deck storage, never back over
// the file that was picked. That is the host's rule (§19.5: editing a pick
// forks), and it happens to match Bento's own: a deck you were sent is yours.

import { files } from '@ispo/sdk'

/** What a picked file turned out to hold. */
export type PickedDeck =
  | { kind: 'doc'; name: string; body: string }
  | { kind: 'empty-shell'; name: string }
  | { kind: 'not-bento'; name: string }
  | { kind: 'cancelled' }

const DOC_BLOCK_ID = 'bento-doc'

/**
 * Pull the document out of whatever the user picked.
 *
 * Two shapes are accepted, and both are real Bento documents:
 *
 *   · `.bento.html` — a file saved by any build of Bento, anywhere. The
 *     document is the text of its `#bento-doc` block; the rest of the file is
 *     the app shell, which this port has no use for. Parsed with DOMParser
 *     into an INERT document — it is never attached, so nothing in it runs.
 *   · `.bento.json` — the block's contents on their own, which is what this
 *     port saves and exports.
 *
 * A shell with an EMPTY block is not a broken file: it is a pristine, never-
 * saved copy of Bento, and saying so is more useful than "not a Bento
 * document" (upstream's drop handler makes the same distinction).
 */
export function extractDeckBody(name: string, text: string): PickedDeck {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    return { kind: 'doc', name, body: trimmed }
  }
  let block: Element | null = null
  try {
    block = new DOMParser().parseFromString(text, 'text/html').querySelector(`#${DOC_BLOCK_ID}`)
  } catch {
    return { kind: 'not-bento', name }
  }
  if (!block) return { kind: 'not-bento', name }
  const body = (block.textContent ?? '').trim()
  if (!body) return { kind: 'empty-shell', name }
  return { kind: 'doc', name, body }
}

/** Open the host powerbox and read back whatever the user chose. */
export async function pickDeck(): Promise<PickedDeck> {
  const picked = await files.pick({ accept: ['text/html', 'application/json', 'text/plain'] })
  const one = Array.isArray(picked) ? picked[0] : picked
  if (!one?.url) return { kind: 'cancelled' }
  const res = await fetch(one.url)
  if (!res.ok) throw new Error(`could not read ${one.name} (${res.status})`)
  return extractDeckBody(one.name, await res.text())
}

/**
 * Publish a deck to the user's Files library through the powerbox.
 * Returns the Files path it landed at, or null if the user cancelled.
 */
export async function exportToFiles(name: string, body: string): Promise<string | null> {
  const saved = await files.save({
    content: body,
    name,
    accept: ['application/json'],
  })
  return saved?.path ?? null
}
