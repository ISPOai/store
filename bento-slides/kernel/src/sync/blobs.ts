// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Ported to ISPO from nyblnet/bento kernel/src/sync/blobs.ts (see UPSTREAM.md).
//
// ISPO PORT — the blob offload is GONE; the data-URI helpers stay.
//
// Upstream this is the large-media side of live collaboration: an asset over
// ~64 KB is encrypted with the room key, PUT to the relay under a content
// address, cached in IndexedDB, and replaced in the document by a `blobs` ref
// that peers resolve on demand.
//
// Every part of that depends on the relay this port removed
// (kernel/src/sync/online.ts). `SyncSession.offloadAssets` reaches the network
// only past `if (!creds) continue`, and `blobCreds()` asks each transport for
// relay credentials — the online transport was the only one that ever had any,
// so the branch is now unreachable by construction rather than by a flag.
//
// So `putBlob`/`getBlob` refuse, keeping their signatures because `session.ts`
// imports them; and the encryption, content-addressing and IndexedDB cache go
// with them. That cache was this app's LAST use of browser storage — every
// durable byte now lives on an SDK plane, which is what the store guide asks
// for and what makes a deck survive a cleared origin.
//
// What survives is not relay machinery at all: turning a `data:` URI into bytes
// and back, and the size arithmetic around it. Those are document-model
// helpers, and `session.ts` uses them to decide whether an asset is even a
// candidate before any of the above would have applied.

/** Ceiling upstream applies to one offloaded asset. Kept for the size check. */
export const MAX_BLOB = 8 * 1024 * 1024

/** Split a `data:` URI into raw bytes and its MIME type; null if it is not one
 *  (raw SVG markup, for instance, is stored inline as text). */
export function dataUriToBytes(uri: string): { bytes: Uint8Array; mime: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri)
  if (!match) return null
  const mime = match[1] || 'application/octet-stream'
  const body = match[3] ?? ''
  if (!match[2]) {
    return { bytes: new TextEncoder().encode(decodeURIComponent(body)), mime }
  }
  try {
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { bytes, mime }
  } catch {
    return null
  }
}

/** The inverse: bytes back into a `data:` URI the renderer can use directly. */
export function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return `data:${mime};base64,${btoa(s)}`
}

/** Base64 encodes 3 bytes as 4 characters, rounded up to a 4-character group. */
export function encodedSize(n: number): number {
  return Math.ceil(n / 3) * 4
}

// --- the relay lanes, refused -------------------------------------------------
//
// Signatures preserved so `session.ts` compiles unchanged. Neither is reachable:
// both sit behind a credentials check that no surviving transport can satisfy.

export interface BlobEndpoint {
  base: string
  room: string
  tok: string
}

export type PutResult =
  | { ok: true; key: string }
  | { ok: false; reason: 'unsupported' | 'too-large' | 'network' | 'denied' }

export async function putBlob(
  _endpoint: BlobEndpoint,
  _rawRoomKey: Uint8Array,
  _bytes: Uint8Array,
): Promise<PutResult> {
  return { ok: false, reason: 'unsupported' }
}

export async function getBlob(
  _endpoint: BlobEndpoint,
  _rawRoomKey: Uint8Array,
  _key: string,
): Promise<Uint8Array | null> {
  return null
}
