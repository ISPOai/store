// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// ISPO PORT — deciding what to open, and what to do when we cannot look.
//
// Upstream there is nothing to decide: the document is in the page. Here the
// deck is an Entity record behind the host's access review, and on a FRESHLY
// INSTALLED app the first read races the review the user is still reading. The
// host may hold that call, or refuse it outright.
//
// Three answers, three different things to show, and conflating any two of
// them loses data:
//
//   · a deck came back            → open it
//   · there is genuinely no deck  → first run: seed the starter deck ONCE
//   · the read did not succeed    → SAY SO AND WAIT. Never the starter.
//
// The third is the whole reason this file exists. Booting the starter deck
// over a deck that was merely unreadable puts an empty document in front of
// someone whose real work is on disk, and the next autosave makes it
// permanent. So a failed read is its own state with its own screen, it retries
// by itself, and it leaves that screen the moment access lands — no reload,
// because a reader who just pressed Allow should not have to.

import { t } from '../i18n'
import { newDoc, type BentoDoc } from '../model'
import { starterDoc } from '../starterdeck'
import {
  currentDeck,
  deckPath,
  lastOpenedDeck,
  listDecks,
  readDeck,
  noteLoaded,
  patchSession,
  readSession,
  refFor,
  setCurrentDeck,
  writeDeck,
} from '../../../ispo/src/store.ts'

/** What the app should open, once storage has actually answered. */
export type Opening =
  | { kind: 'deck'; body: string }
  | { kind: 'fresh'; body: string }

/**
 * Resolve the deck to open. THROWS if storage could not be read — the caller
 * turns that into the waiting state rather than into an empty document.
 */
export async function resolveOpening(): Promise<Opening> {
  const decks = await listDecks()

  if (decks.length > 0) {
    const remembered = await lastOpenedDeck()
    const target = decks.find((d) => d.path === remembered) ?? decks[0]!
    setCurrentDeck(target)
    const body = await readDeck(target.path)
    noteLoaded(target.path, body)
    return { kind: 'deck', body }
  }

  // No decks. First run, or every deck deleted — and those want different
  // documents. The starter deck is the product's feature tour and is worth
  // planting exactly once; bringing it back every time the author empties
  // their storage would be the app arguing with them.
  const seeded = ((await readSession())?.seededAt ?? 0) > 0
  if (seeded) {
    return { kind: 'fresh', body: JSON.stringify(newDoc()) }
  }

  const starter = starterDoc() as BentoDoc
  const body = JSON.stringify(starter)
  const path = deckPath(starter.title)
  await writeDeck(path, body)
  await patchSession({ seededAt: Date.now() })
  setCurrentDeck(refFor(path))
  return { kind: 'deck', body }
}

/**
 * Run `resolveOpening`, showing a waiting screen for as long as storage
 * refuses, and calling `onReady` exactly once when it does not.
 *
 * The retry is automatic AND manual: automatic because the common case is the
 * user pressing Allow a second later and nothing else should be required of
 * them, manual because the uncommon case is a grant that was deferred to the
 * Approval Center, where "when" is not something this app can know.
 */
export function bootWhenStorageAnswers(onReady: (opening: Opening) => void): void {
  let done = false
  let gate: HTMLElement | null = null
  let timer: number | undefined

  const attempt = async (): Promise<void> => {
    if (done) return
    try {
      const opening = await resolveOpening()
      done = true
      window.clearTimeout(timer)
      window.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
      gate?.remove()
      onReady(opening)
    } catch (err) {
      if (done) return
      gate ??= showGate(() => void attempt())
      setGateError(gate, err)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void attempt(), 1500)
    }
  }

  const wake = () => {
    if (!done) void attempt()
  }
  window.addEventListener('visibilitychange', wake)
  window.addEventListener('focus', wake)
  void attempt()
}

function showGate(onRetry: () => void): HTMLElement {
  const gate = document.createElement('div')
  gate.className = 'ed-ispo-gate'
  const card = document.createElement('div')
  card.className = 'ed-ispo-gate-card'
  const h = document.createElement('h1')
  h.textContent = t('Waiting for access to your decks')
  const p = document.createElement('p')
  p.textContent = t(
    'Bento could not open your decks yet. If ISPO is asking you to review access for this app, approve it — this screen goes away by itself once you do.',
  )
  const button = document.createElement('button')
  button.textContent = t('Try again')
  button.addEventListener('click', onRetry)
  const err = document.createElement('div')
  err.className = 'ed-ispo-gate-err'
  card.append(h, p, button, err)
  gate.appendChild(card)
  document.body.appendChild(gate)
  document.getElementById('bento-splash')?.remove()
  return gate
}

function setGateError(gate: HTMLElement, err: unknown): void {
  const target = gate.querySelector<HTMLElement>('.ed-ispo-gate-err')
  if (!target) return
  target.textContent = err instanceof Error ? err.message : String(err ?? '')
}

/** Reported by the editor's title bar so "which deck am I in" survives a reopen. */
export const openedDeckName = (): string | null => currentDeck()?.name ?? null
