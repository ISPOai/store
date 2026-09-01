// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Ported to ISPO from nyblnet/bento slides/src/packs.ts (see UPSTREAM.md).
//
// ISPO PORT — downloadable language packs are dropped, and this is the stub
// that keeps the rest of the app compiling and honest about it.
//
// Upstream, a pack is fetched from the release channel, verified against a
// signed index, and then LIVES IN THE FILE: `shellBlocksForPacks()` writes it
// into every saved .bento.html so the language travels with the deck. Both
// halves are gone here:
//
//   · the fetch needs `egress.connect` to bento.page, which this app does not
//     declare (kernel/src/net.ts pins offline on);
//   · there is no shell to carry a pack in. An ISPO deck is the document JSON
//     in project storage, not a self-contained HTML file, so a pack would have
//     nowhere durable to live and would silently vanish on the next open —
//     which is exactly the failure upstream's own comment refuses to ship.
//
// The NINE built-in interface languages are unaffected: English plus the eight
// compiled into `i18n/packed.ts` (ja, zh-Hans, zh-Hant, es, fr, de, it, pt).
// Those are bundle data, not downloads, and the language picker still offers
// them. Only "add another language from the channel" is gone.

import type { LanguagePack } from '../../kernel/src/i18n.ts'
import type { ShellBlock } from '../../kernel/src/save.ts'
import { PACKED } from './i18n/packed.ts'

export interface PackListing {
  lang: string
  label: string
  url: string
  version?: string
  sha256: string
  bytes?: number
}

export type PackError = 'offline' | 'bad-pack' | 'wrong-app' | 'unverified'

/** The block type that carried a pack inside a saved shell. Nothing writes it. */
export const PACK_BLOCK_TYPE = 'application/bento+lang'

/** No shell, so no packs arrive with the document. */
export function readPacksFromShell(): number {
  return 0
}

/** Unchanged from upstream: pure arithmetic over the compiled string table. */
export function packCoverage(pack: LanguagePack): { missing: number; total: number } {
  const keys = Object.keys(PACKED)
  let missing = 0
  for (const k of keys) if (!pack.strings[k]) missing++
  return { missing, total: keys.length }
}

export function packsInFile(): Array<LanguagePack & { pending: boolean }> {
  return []
}

export async function fetchPack(_listing: PackListing): Promise<LanguagePack | PackError> {
  return 'offline'
}

export function stageForFile(_pack: LanguagePack): boolean {
  return false
}

export function unstageFromFile(_lang: string): boolean {
  return false
}

export function markFileSaved(): void {
  /* nothing is ever pending */
}

export function shellBlocksForPacks(): ShellBlock[] {
  return []
}

export async function availablePacks(): Promise<PackListing[]> {
  return []
}

export async function refreshPacksForVersion(
  _version: string,
): Promise<{ refreshed: string[]; kept: string[] }> {
  return { refreshed: [], kept: [] }
}
