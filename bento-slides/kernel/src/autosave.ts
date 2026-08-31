// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Ported to ISPO from nyblnet/bento kernel/src/autosave.ts (see UPSTREAM.md).
//
// Local auto-save + lightweight version history. Two concerns, one store:
//   · recovery  — a single latest snapshot per docId, overwritten each cycle.
//     On reopen, if it differs from the deck we loaded, we offer to restore.
//   · versions  — a capped, throttled timeline of snapshots per docId, for the
//     "Version history" restore UI.
//
// ISPO PORT — the backing store is `fs`, not IndexedDB.
//
// Upstream this is IndexedDB, because a `.bento.html` has nowhere else to put
// a backstop: the browser origin is all it has. Here the app owns private,
// project-scoped storage that is backed up and moved with the project, and the
// port guide is explicit that browser storage belongs on an SDK plane. So each
// snapshot is a file under `.autosave/`, which buys three things beyond
// compliance:
//
//   · the backstop survives what IndexedDB does not — a cleared origin, a
//     different device the project syncs to;
//   · "did it actually store?" stops being a guess. `putRecovery` returns a
//     real answer, and the editor's "your work is backed up" line is only ever
//     shown when it is true (upstream's own comment asks for exactly this and
//     could not have it);
//   · snapshots live beside the decks they protect, so deleting the project
//     deletes them, rather than leaving plaintext documents in a browser
//     origin after the app is gone.
//
// One snapshot per file rather than one index: `addVersion` runs on a timer and
// rewriting a single index would rewrite every retained version each time.
//
// Unchanged from upstream: snapshots hold the plain document JSON, and
// ENCRYPTED DECKS ARE NEVER SNAPSHOTTED here — the editor clears both stores
// when a password is set, because plaintext left behind would defeat the
// encryption the author just turned on.

import type { KernelDoc } from './doc.ts'
import { fs } from '@ispo/sdk'

const ROOT = '.autosave'
const RECOVERY_DIR = `${ROOT}/recovery`
const VERSIONS_DIR = `${ROOT}/versions`
const MAX_VERSIONS = 20 // per doc
const PRUNE_DAYS = 30

export interface Snapshot {
  id?: number
  docId: string
  at: number
  title: string
  json: string
}

/** A docId as a path segment. UUIDs pass through; hand-written ids are tamed. */
const seg = (docId: string): string =>
  (docId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100) || 'unknown')

const isMissing = (err: unknown): boolean =>
  (err instanceof Error ? err.message : String(err ?? '')).includes('not found:')

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.read(path)) as T
  } catch (err) {
    // Missing is ordinary. Anything else — a refused grant during the first-run
    // race, half-written JSON — is also survivable HERE: this is a backstop, and
    // a backstop that throws would take down the save it exists to protect.
    if (!isMissing(err)) console.warn('[bento autosave] could not read', path, err)
    return null
  }
}

async function listDir(path: string): Promise<string[]> {
  try {
    return (await fs.list(path)).filter((name) => name.endsWith('.json'))
  } catch (err) {
    if (!isMissing(err)) console.warn('[bento autosave] could not list', path, err)
    return []
  }
}

/**
 * Write the single latest recovery snapshot for this doc.
 *
 * Returns whether it ACTUALLY stored — the editor tells the author their work
 * is backed up, and claiming a backstop that isn't there would be worse than
 * saying nothing. Under ISPO the honest answer is available: a refused or
 * failed `fs.write` is a rejected promise, not a silent null.
 */
export async function putRecovery(doc: KernelDoc): Promise<boolean> {
  const snap: Snapshot = {
    docId: doc.docId,
    at: Date.now(),
    title: doc.title,
    json: JSON.stringify(doc),
  }
  try {
    await fs.write(`${RECOVERY_DIR}/${seg(doc.docId)}.json`, JSON.stringify(snap))
    return true
  } catch {
    return false
  }
}

export async function getRecovery(docId: string): Promise<Snapshot | null> {
  return readJson<Snapshot>(`${RECOVERY_DIR}/${seg(docId)}.json`)
}

export async function clearRecovery(docId: string): Promise<void> {
  try {
    await fs.delete(`${RECOVERY_DIR}/${seg(docId)}.json`)
  } catch {
    /* nothing to clear */
  }
}

/**
 * Delete every version-history snapshot for a docId. Used when a deck is
 * encrypted: the plaintext snapshots written before encryption was enabled
 * must not linger.
 */
export async function clearVersions(docId: string): Promise<void> {
  const dir = `${VERSIONS_DIR}/${seg(docId)}`
  for (const name of await listDir(dir)) {
    try {
      await fs.delete(`${dir}/${name}`)
    } catch {
      /* best effort */
    }
  }
}

export async function addVersion(doc: KernelDoc): Promise<void> {
  const dir = `${VERSIONS_DIR}/${seg(doc.docId)}`
  const at = Date.now()
  const snap: Snapshot = { docId: doc.docId, at, title: doc.title, json: JSON.stringify(doc) }
  try {
    await fs.write(`${dir}/${at}.json`, JSON.stringify(snap))
  } catch {
    return // a version that could not be written is not worth failing the edit
  }
  // prune to the newest MAX_VERSIONS for this doc
  const names = (await listDir(dir)).sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10))
  for (const name of names.slice(MAX_VERSIONS)) {
    try {
      await fs.delete(`${dir}/${name}`)
    } catch {
      /* best effort */
    }
  }
}

export async function listVersions(docId: string): Promise<Snapshot[]> {
  const dir = `${VERSIONS_DIR}/${seg(docId)}`
  const names = await listDir(dir)
  const out: Snapshot[] = []
  for (const name of names) {
    const snap = await readJson<Snapshot>(`${dir}/${name}`)
    // `id` is what the editor's restore list keys rows on. Upstream it is the
    // IndexedDB autoincrement; here the timestamp already is a per-doc unique
    // key, and using it keeps the rows stable across a reload.
    if (snap) out.push({ ...snap, id: snap.at })
  }
  return out.sort((a, b) => b.at - a.at) // newest first
}

/** Drop snapshots older than PRUNE_DAYS across all docs (housekeeping). */
export async function pruneOld(): Promise<void> {
  const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000
  for (const name of await listDir(RECOVERY_DIR)) {
    const snap = await readJson<Snapshot>(`${RECOVERY_DIR}/${name}`)
    if (snap && snap.at < cutoff) {
      try {
        await fs.delete(`${RECOVERY_DIR}/${name}`)
      } catch {
        /* best effort */
      }
    }
  }
  let docDirs: string[] = []
  try {
    docDirs = (await fs.list(VERSIONS_DIR)).filter((n) => n.endsWith('/')).map((n) => n.slice(0, -1))
  } catch {
    return
  }
  for (const docDir of docDirs) {
    const dir = `${VERSIONS_DIR}/${docDir}`
    for (const name of await listDir(dir)) {
      if (Number.parseInt(name, 10) < cutoff) {
        try {
          await fs.delete(`${dir}/${name}`)
        } catch {
          /* best effort */
        }
      }
    }
  }
}
