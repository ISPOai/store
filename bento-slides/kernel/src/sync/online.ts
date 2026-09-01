// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Ported to ISPO from nyblnet/bento kernel/src/sync/online.ts (see UPSTREAM.md).
//
// ISPO PORT — the online relay transport is GONE, and this is what is left of it.
//
// Upstream this file is the E2EE collaboration client: an authenticated
// WebSocket to a blind relay, credential minting, an invite/member signature
// chain, reconnect logic and snapshot upload. None of it can run here — the app
// declares `egress.connect: []` and pins offline mode on (kernel/src/net.ts), so
// `netWebSocket` refuses before the host's CSP has to.
//
// It was first kept vendered-but-unreachable, on the theory that dead code is
// cheaper than a diff. That was wrong twice over: it left `wss://sync.bento.page`
// sitting in the bundle of an app whose whole claim is that it has no network,
// which is exactly the string a security reviewer greps for; and "unreachable"
// was a property of one pinned boolean rather than of the code itself.
//
// What survives is the part that is NOT networking: `mintCollab` generates a
// document's identity keys with WebCrypto, locally, at document creation.
// kernel/src/sync/session.ts calls it, and every Bento document carries a
// `collab` block whether or not it is ever shared — a deck saved here must stay
// a valid deck when opened in a real Bento file.
//
// The connect/share functions keep their names and answer honestly, because the
// editor's Share panel reads them and upstream already wrote the copy for this
// state ("Offline mode is on — nothing leaves this computer.").

import type { Store } from '../../../slides/src/store'
import type { SyncSession } from './session.ts'

const b64u = {
  enc(bytes: Uint8Array): string {
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  dec(s: string): Uint8Array {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(b.length)
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
    return out
  },
}

const EC = { name: 'ECDSA', namedCurve: 'P-256' } as const

export type CollabCreds = {
  room: string
  key: string
  on: boolean
  v: number
  owner: string
  ownerPriv: string
  role: 'writer'
}

export type CollabInvite = {
  pub: string
  priv: string
  role: 'writer' | 'commenter'
  exp?: number
  sig: string
}

/** A fresh symmetric read capability. Local, no network. */
export function mintRoomKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return b64u.enc(bytes)
}

async function mintKeypair(): Promise<{ pub: string; priv: string }> {
  const pair = await crypto.subtle.generateKey(EC, true, ['sign', 'verify'])
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  return { pub: b64u.enc(pub), priv: b64u.enc(priv) }
}

/**
 * Fresh collaboration credentials, minted at DOCUMENT CREATION.
 *
 * Kept because it is not networking: it is part of the document model. The room
 * id commits to the owner's public key — `w` + base64url(SHA-256(pub)) — so a
 * deck created here is structurally identical to one created by upstream and
 * stays shareable if its JSON is ever opened in a real Bento file. `on` is
 * false here rather than upstream's true: this app can never connect, and a
 * document that says it is live when nothing can carry it would be a lie in the
 * saved bytes.
 */
export async function mintCollab(): Promise<CollabCreds> {
  const kp = await mintKeypair()
  const commit = new Uint8Array(
    await crypto.subtle.digest('SHA-256', b64u.dec(kp.pub) as BufferSource),
  )
  return {
    room: `w${b64u.enc(commit)}`,
    key: mintRoomKey(),
    on: false,
    v: 2,
    owner: kp.pub,
    ownerPriv: kp.priv,
    role: 'writer',
  }
}

/** Revocation still means something offline: it re-keys the document. */
export async function rotateKeys(_session: SyncSession, store: Store): Promise<void> {
  const fresh = await mintCollab()
  store.commit(() => {
    const sync = store.doc.collab?.sync
    store.doc.collab = sync ? { ...fresh, sync } : fresh
  })
}

/** Does this document want a relay? Structurally possible, never satisfiable here. */
export function sharingOn(store: Store): boolean {
  const c = store.doc.collab
  return !!c?.room && !!c.key && c.on !== false
}

// --- the transport, refused ---------------------------------------------------
//
// Names and signatures preserved so the editor's Share panel compiles and takes
// its offline branch. `null` is the same answer upstream gives when its own
// offline switch is on.

export type OnlineStatus = 'connecting' | 'open' | 'closed'
export interface OnlineTransport {
  readonly kind: 'online'
  readonly status: OnlineStatus
  onStatus?: () => void
  revokeKey(peerPub: string, owner: string, ownerPriv: string): Promise<boolean>
}

export const onlineTransport = (): OnlineTransport | null => null
export const joinFromDoc = (_s: SyncSession, _st: Store): OnlineTransport | null => null
export const startSharing = async (_s: SyncSession, _st: Store): Promise<OnlineTransport | null> => null
export const disconnectOnline = (_s: SyncSession): void => {}
export const stopSharing = (_s: SyncSession, _st: Store): void => {}

/**
 * An invite is a capability to reach a relay, and there is no relay.
 *
 * Signature preserved (owner key, role, optional expiry) so the editor's
 * invite-export path still type-checks; it refuses at the point of use rather
 * than minting a credential that could never be redeemed — and, worse, could be
 * redeemed by a real Bento file against the live relay.
 */
export async function mintInvite(
  _ownerPrivB64: string,
  _role: 'writer' | 'commenter' = 'writer',
  _exp = 0,
): Promise<CollabInvite> {
  throw new Error('Live collaboration is unavailable — this app has no network access.')
}
