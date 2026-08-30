// Per-slide asset files.
//
// Upstream keeps these on the dev server's filesystem beside the slide and
// serves them over `/__assets/...`. Here the bytes live in project-scoped
// storage (`fs.writeBinary`) and are handed to the UI as `blob:` URLs, which
// the project iframe's `img-src 'self' assets: data: blob:` allows.
//
// Sizes, mime types and timestamps are not recoverable from `fs.list`, so a
// sidecar records them — the same fields upstream reads off `stat`.

import { fs } from '@ispo/sdk'
import { listDir, readJson, SLIDES_DIR, writeJson } from './store'

export const GLOBAL_ASSET_SCOPE = '@global'

export type AssetEntry = {
  name: string
  size: number
  createdAt: number
  mtime: number
  mime: string
  url: string
  unused: boolean
}

type AssetMeta = Omit<AssetEntry, 'url' | 'unused'>

/** A scope is a slide id or the shared `@global` bucket. */
export function isAssetScope(value: string): boolean {
  return value === GLOBAL_ASSET_SCOPE || /^[a-z0-9][a-z0-9-]*$/.test(value)
}

function scopeDir(scope: string): string {
  return scope === GLOBAL_ASSET_SCOPE
    ? `${SLIDES_DIR}/.global-assets`
    : `${SLIDES_DIR}/${scope}/assets`
}

function metaPath(scope: string): string {
  return `${scopeDir(scope)}/.meta.json`
}

function assetPath(scope: string, name: string): string {
  return `${scopeDir(scope)}/${name}`
}

/** A name has to stay a single path segment: no separators, no traversal. */
export function isSafeAssetName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && !/[/\\]/.test(name) && !name.startsWith('.')
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  woff2: 'font/woff2',
  json: 'application/json',
}

export function mimeForName(name: string, fallback = 'application/octet-stream'): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  return MIME_BY_EXT[ext] ?? fallback
}

async function readMeta(scope: string): Promise<Record<string, AssetMeta>> {
  return readJson<Record<string, AssetMeta>>(metaPath(scope), {})
}

async function writeMeta(scope: string, meta: Record<string, AssetMeta>): Promise<void> {
  await writeJson(metaPath(scope), meta)
}

// Object URLs are revoked when the same scope is listed again, so a long
// session does not accumulate them while a re-render still resolves old ones.
const liveUrls = new Map<string, string[]>()

function trackUrls(scope: string, urls: string[]): void {
  for (const stale of liveUrls.get(scope) ?? []) URL.revokeObjectURL(stale)
  liveUrls.set(scope, urls)
}

export async function listAssets(scope: string): Promise<AssetEntry[]> {
  const entries = (await listDir(scopeDir(scope)))
    .map((entry) => entry.replace(/\/$/, ''))
    .filter((entry) => entry && !entry.startsWith('.'))
  const meta = await readMeta(scope)

  const assets: AssetEntry[] = []
  const urls: string[] = []
  for (const name of entries.sort()) {
    let url = ''
    let size = meta[name]?.size ?? 0
    try {
      const bytes = await fs.readBinary(assetPath(scope, name))
      size = bytes.byteLength
      const mime = meta[name]?.mime ?? mimeForName(name)
      url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
      urls.push(url)
    } catch {
      // A file recorded in the sidecar but missing on disk is skipped rather
      // than surfaced as a broken entry.
      continue
    }
    assets.push({
      name,
      size,
      createdAt: meta[name]?.createdAt ?? 0,
      mtime: meta[name]?.mtime ?? 0,
      mime: meta[name]?.mime ?? mimeForName(name),
      url,
      // Upstream marks an asset unused by scanning slide sources for its name.
      // Slides here are compiled app source the app cannot read, so usage is
      // unknown — claiming "unused" would invite deleting a referenced file.
      unused: false,
    })
  }
  trackUrls(scope, urls)
  return assets
}

export async function assetExists(scope: string, name: string): Promise<boolean> {
  try {
    await fs.readBinary(assetPath(scope, name))
    return true
  } catch {
    return false
  }
}

export async function writeAsset(
  scope: string,
  name: string,
  bytes: Uint8Array,
  mime: string,
): Promise<AssetEntry> {
  await fs.writeBinary(assetPath(scope, name), bytes)
  const meta = await readMeta(scope)
  const now = Date.now()
  meta[name] = {
    name,
    size: bytes.byteLength,
    createdAt: meta[name]?.createdAt ?? now,
    mtime: now,
    mime: mime || mimeForName(name),
  }
  await writeMeta(scope, meta)
  return {
    ...meta[name],
    url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: meta[name].mime })),
    unused: false,
  }
}

export async function renameAsset(scope: string, from: string, to: string): Promise<void> {
  const bytes = await fs.readBinary(assetPath(scope, from))
  await fs.writeBinary(assetPath(scope, to), bytes)
  await fs.delete(assetPath(scope, from)).catch(() => undefined)
  const meta = await readMeta(scope)
  const previous = meta[from]
  delete meta[from]
  meta[to] = {
    name: to,
    size: previous?.size ?? bytes.byteLength,
    createdAt: previous?.createdAt ?? Date.now(),
    mtime: Date.now(),
    mime: previous?.mime ?? mimeForName(to),
  }
  await writeMeta(scope, meta)
}

export async function deleteAsset(scope: string, name: string): Promise<void> {
  await fs.delete(assetPath(scope, name)).catch(() => undefined)
  const meta = await readMeta(scope)
  delete meta[name]
  await writeMeta(scope, meta)
}
