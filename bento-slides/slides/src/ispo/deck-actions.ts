// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// ISPO PORT — "start a deck" and "bring a deck in", written ONCE.
//
// Both actions are reachable from two places that look nothing alike: the deck
// library on a cold start, when no editor exists yet, and the editor's Save
// menu once one does. The first version of this port implemented them only on
// the editor, so the library's buttons had to boot an editor first to borrow
// them — and `bootBento(null, …)` boots the STARTER DECK, so "New deck" and
// "Import from Files…" both dropped the reader into the feature tour instead of
// what they asked for. Reported, and the right fix is that neither action needs
// an editor at all: each produces a document, and the caller decides where to
// put it.

import { newDoc, parseDoc, type BentoDoc } from '../model'
import { t } from '../i18n'
import { askText, say } from '../../../ispo/src/dialogs.ts'
import { freshDeckPath, writeDeck } from '../../../ispo/src/store.ts'
import { pickDeck } from '../../../ispo/src/files.ts'

/** A deck that is ready to open. `path` is null for an import — a picked file
 *  arrives by copy with no save target, so the first ⌘S asks where it goes. */
export interface OpenableDeck {
  doc: BentoDoc
  body: string
  path: string | null
  name: string
}

/** Ask for a name, write an EMPTY deck, and hand it back. Null if cancelled. */
export async function createDeck(): Promise<OpenableDeck | null> {
  const name = await askText(t('Name this deck'), t('Untitled'), { ok: t('Create') })
  if (name === null) return null
  const doc = newDoc()
  doc.title = name.trim() || t('Untitled')
  const body = JSON.stringify(doc)
  const path = await freshDeckPath(doc.title)
  await writeDeck(path, body)
  return { doc, body, path, name: doc.title }
}

/**
 * Read a deck out of Files through the host powerbox. Null if the reader
 * cancelled or the file was not a deck — it says why in that case.
 */
export async function importDeck(): Promise<OpenableDeck | null> {
  let picked
  try {
    picked = await pickDeck()
  } catch (err) {
    await say(t('That file could not be read: {err}',
      { err: String((err as Error)?.message ?? err) }))
    return null
  }
  if (picked.kind === 'cancelled') return null
  if (picked.kind === 'empty-shell') {
    await say(t('{name} is an empty copy of Bento, not a saved deck.', { name: picked.name }))
    return null
  }
  if (picked.kind === 'not-bento') {
    await say(t('{name} isn’t a Bento document.', { name: picked.name }))
    return null
  }
  const doc = parseDoc(picked.body)
  if (!doc) {
    await say(picked.body.includes('"bento/enc"')
      ? t('{name} is password-protected. Bento can only unlock an encrypted deck at launch.',
        { name: picked.name })
      : t('{name} isn’t a Bento document.', { name: picked.name }))
    return null
  }
  return { doc, body: picked.body, path: null, name: picked.name }
}
