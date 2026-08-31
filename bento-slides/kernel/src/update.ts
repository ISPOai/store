// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Ported to ISPO from nyblnet/bento kernel/src/update.ts (see UPSTREAM.md).
//
// ISPO PORT — the signed self-update channel is GONE, and this module is what
// is left of it: the version string, the offline re-exports, and honest
// "unavailable" answers on the surface the editor still calls.
//
// WHY IT CANNOT EXIST HERE. Upstream, an update downloads a NEW APP SHELL from
// the release origin, verifies its ECDSA signature, splices this document into
// it and rewrites the file on disk — the file is the app, so updating the app
// means rewriting the document. Two of the three steps are structurally
// unavailable in ISPO:
//
//   · the download needs `egress.connect` to bento.page, and this app declares
//     none (see net.ts — offline is pinned on);
//   · there IS no shell to splice into. ISPO builds the project with esbuild
//     into an external `main.js` and generates its own `index.html`, so the
//     running app cannot serialize itself into a single file.
//
// And it should not exist: ISPO already owns app lifecycle. An installed store
// app updates by reinstalling from the store, under the host's trust model,
// not by an app rewriting its own bytes inside the sandbox.
//
// The export surface is kept whole rather than deleted, because `checkForUpdates`
// has been this module's public API since 0.9.x and the editor's About dialog
// reads it. It now answers `{status:'current'}` — which is the truth: the store
// installed this version and the app has no newer one to offer.

import type { KernelDoc } from './doc.ts'

/**
 * Version of the vendored bento/slides shell.
 *
 * Upstream this is `__APP_VERSION__`, a Vite `define` fed from
 * slides/package.json. ISPO builds with esbuild and injects no such define, so
 * the value is pinned here to the version recorded in UPSTREAM.md — keep the
 * two in step when the port is refreshed from upstream.
 */
export const APP_VERSION = '1.0.18'

/**
 * The offline switch and every network primitive live in net.ts — one
 * chokepoint, so a call site cannot forget to consult the switch. Re-exported
 * here because this has been update.ts's public surface since 0.9.x and the
 * editor imports it from here.
 */
export { offlineEnabled, setOffline, OfflineError, startNetGuard } from './net.ts'

/** Auto-check has nothing to check. Reported off, and not settable on. */
export const autoCheckEnabled = (): boolean => false
export const setAutoCheck = (_on: boolean): void => {
  /* no release channel to check against — see the header */
}

export interface ReleaseInfo {
  app: string
  version: string
  sha256: string
  url: string
  notes?: string
  notesFrom?: Record<string, string[]>
  at?: string
}

export type UpdateCheck =
  | { status: 'current'; version: string }
  | { status: 'update'; release: ReleaseInfo }
  | { status: 'error'; message: string }

/** Dotted-numeric compare: 0.2.0 > 0.1.9 > 0.1 — positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

/**
 * Always `current`. Not an error: an error would put a retry in front of the
 * reader for something that can never succeed, and this app genuinely IS at
 * the version the store installed.
 */
export async function checkForUpdates(_manifestUrl?: string): Promise<UpdateCheck> {
  return { status: 'current', version: APP_VERSION }
}

/** Kept so `i18n.ts` can register its hook unchanged; never fires. */
export function registerUpdatePrepare(_fn: (version: string) => Promise<void>): void {
  /* nothing prepares an update that cannot happen */
}

const unavailable = () =>
  new Error('Updates are managed by ISPO — reinstall this app from the Store.')

export async function buildUpdatedFile(_release: ReleaseInfo, _doc: KernelDoc): Promise<string> {
  throw unavailable()
}

export async function applyUpdate(_release: ReleaseInfo, _doc: KernelDoc): Promise<void> {
  throw unavailable()
}

export const canUpdateInPlace = (): boolean => false

export type InPlaceOutcome = { backup: 'beside' | 'downloaded' | 'none' }

export async function applyUpdateInPlace(
  _release: ReleaseInfo,
  _doc: KernelDoc,
): Promise<InPlaceOutcome> {
  throw unavailable()
}
