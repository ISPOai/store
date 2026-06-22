import type { ImageExt } from './types'

// Everything this app owns lives under one shared-storage root so a sibling
// ISPO project (or a cleanup pass) can find the board and its images together.
export const SHARED_ROOT = 'moodboard'

// The persisted board document.
export function boardPath(): string {
  return `${SHARED_ROOT}/board.json`
}

// The bytes for one image. The id is a fresh UUID, so the URL is unique and
// the host's immutable cache never serves a stale image for a reused name.
export function imagePath(id: string, ext: ImageExt): string {
  return `${SHARED_ROOT}/images/${id}${ext}`
}

// shared-root-relative path -> a URL the iframe CSP allows for <img src>.
export function sharedUrl(path: string): string {
  return `shared://${path}`
}
