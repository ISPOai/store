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
// ISPO PORT — the backing store is Entities, not IndexedDB.
//
// Upstream this is IndexedDB, because a `.bento.html` has nowhere else to put
// a backstop: the browser origin is all it has. Here the app owns records in
// the ISPO database that are backed up and moved with the project, which buys
// three things beyond compliance:
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
// NOTHING HERE DELETES A RECORD. Every entity delete asks the user to confirm,
// and a backstop that interrupts the author on a timer is worse than none. So
// the version timeline is a RING of MAX_VERSIONS slot records per doc, each
// overwritten in turn, and "clearing" a snapshot blanks it (`json: ''`,
// `at: 0`) in place. A blank snapshot reads as absent everywhere.
//
// Unchanged from upstream: snapshots hold the plain document JSON, and
// ENCRYPTED DECKS ARE NEVER SNAPSHOTTED here — the editor clears both stores
// when a password is set, because plaintext left behind would defeat the
// encryption the author just turned on.

import type { KernelDoc } from './doc.ts'
import { entities, type EntityRecord } from '@ispo/sdk'

const RECOVERY_TYPE = 'bento.recovery'
const VERSION_TYPE = 'bento.version'
const MAX_VERSIONS = 20 // per doc
const PRUNE_DAYS = 30

export interface Snapshot {
  id?: number
  docId: string
  at: number
  title: string
  json: string
}

type SnapshotRecord = EntityRecord<Snapshot>

const isBlank = (snap: Snapshot): boolean => snap.json === ''

const BLANK = { at: 0, title: '', json: '' } as const

async function recoveryRecord(docId: string): Promise<SnapshotRecord | null> {
  const { records } = await entities.query<Snapshot>(RECOVERY_TYPE, { where: { docId }, limit: 1 })
  return records[0] ?? null
}

async function versionRecords(docId: string): Promise<SnapshotRecord[]> {
  const { records } = await entities.query<Snapshot>(VERSION_TYPE, {
    where: { docId },
    limit: MAX_VERSIONS,
  })
  return records
}

/**
 * Write the single latest recovery snapshot for this doc.
 *
 * Returns whether it ACTUALLY stored — the editor tells the author their work
 * is backed up, and claiming a backstop that isn't there would be worse than
 * saying nothing. Under ISPO the honest answer is available: a refused or
 * failed write is a rejected promise, not a silent null.
 */
export async function putRecovery(doc: KernelDoc): Promise<boolean> {
  const snap: Snapshot = {
    docId: doc.docId,
    at: Date.now(),
    title: doc.title,
    json: JSON.stringify(doc),
  }
  try {
    const existing = await recoveryRecord(doc.docId)
    if (existing) await entities.update<Snapshot>(RECOVERY_TYPE, existing.id, snap)
    else await entities.create<Snapshot>(RECOVERY_TYPE, snap)
    return true
  } catch {
    return false
  }
}

export async function getRecovery(docId: string): Promise<Snapshot | null> {
  try {
    const record = await recoveryRecord(docId)
    return record && !isBlank(record.data) ? record.data : null
  } catch (err) {
    // A backstop that throws would take down the open it exists to protect.
    console.warn('[bento autosave] could not read recovery for', docId, err)
    return null
  }
}

export async function clearRecovery(docId: string): Promise<void> {
  try {
    const record = await recoveryRecord(docId)
    if (record && !isBlank(record.data)) await entities.update<Snapshot>(RECOVERY_TYPE, record.id, BLANK)
  } catch {
    /* nothing to clear */
  }
}

/**
 * Blank every version-history snapshot for a docId. Used when a deck is
 * encrypted: the plaintext snapshots written before encryption was enabled
 * must not linger.
 */
export async function clearVersions(docId: string): Promise<void> {
  let records: SnapshotRecord[]
  try {
    records = await versionRecords(docId)
  } catch {
    return
  }
  for (const record of records) {
    if (isBlank(record.data)) continue
    try {
      await entities.update<Snapshot>(VERSION_TYPE, record.id, BLANK)
    } catch {
      /* best effort */
    }
  }
  slots.delete(docId)
}

/** Each doc's ring of slot records, learned on first use and kept current. */
const slots = new Map<string, Array<{ id: string; at: number }>>()

export async function addVersion(doc: KernelDoc): Promise<void> {
  const snap: Snapshot = { docId: doc.docId, at: Date.now(), title: doc.title, json: JSON.stringify(doc) }
  try {
    let ring = slots.get(doc.docId)
    if (!ring) {
      ring = (await versionRecords(doc.docId)).map((r) => ({ id: r.id, at: r.data.at }))
      slots.set(doc.docId, ring)
    }
    if (ring.length < MAX_VERSIONS) {
      const created = await entities.create<Snapshot>(VERSION_TYPE, snap)
      ring.push({ id: created.id, at: snap.at })
      return
    }
    // The oldest slot — a blanked one has `at: 0` and goes first.
    const oldest = ring.reduce((a, b) => (b.at < a.at ? b : a))
    await entities.update<Snapshot>(VERSION_TYPE, oldest.id, snap)
    oldest.at = snap.at
  } catch {
    // A version that could not be written is not worth failing the edit, and
    // the ring is re-learned next time rather than trusted half-updated.
    slots.delete(doc.docId)
  }
}

export async function listVersions(docId: string): Promise<Snapshot[]> {
  let records: SnapshotRecord[]
  try {
    records = await versionRecords(docId)
  } catch (err) {
    console.warn('[bento autosave] could not list versions for', docId, err)
    return []
  }
  return records
    .map((r) => r.data)
    .filter((snap) => !isBlank(snap))
    // `id` is what the editor's restore list keys rows on. Upstream it is the
    // IndexedDB autoincrement; here the timestamp already is a per-doc unique
    // key, and using it keeps the rows stable across a reload.
    .map((snap) => ({ ...snap, id: snap.at }))
    .sort((a, b) => b.at - a.at) // newest first
}

/** Blank snapshots older than PRUNE_DAYS across all docs (housekeeping). */
export async function pruneOld(): Promise<void> {
  const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000
  for (const type of [RECOVERY_TYPE, VERSION_TYPE]) {
    let records: SnapshotRecord[]
    try {
      ;({ records } = await entities.query<Snapshot>(type, {
        where: { at: { gt: 0, lt: cutoff } },
        limit: 1000,
      }))
    } catch {
      continue
    }
    for (const record of records) {
      try {
        await entities.update<Snapshot>(type, record.id, BLANK)
      } catch {
        /* best effort */
      }
    }
  }
  slots.clear()
}
