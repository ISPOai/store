import type { ImageExt } from './types'

// MIME -> canonical extension. Only the host-CSP-allowed image set; anything
// outside this map is rejected before it ever reaches shared storage.
const EXT_BY_MIME: Record<string, ImageExt> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
}

// Reverse map for the rare case a file has a known extension but no MIME type
// (some drags of local files report an empty File.type).
const MIME_BY_EXT: Record<ImageExt, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

const ALLOWED_EXTS = Object.keys(MIME_BY_EXT) as ImageExt[]

export function newImageId(): string {
  return crypto.randomUUID()
}

export function mimeToExt(mime: string): ImageExt | '' {
  return EXT_BY_MIME[mime.toLowerCase()] ?? ''
}

export function extToMime(ext: ImageExt): string {
  return MIME_BY_EXT[ext]
}

function extFromName(name: string): ImageExt | '' {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  let raw = name.slice(dot).toLowerCase()
  if (raw === '.jpeg') raw = '.jpg' // normalize the long form
  return (ALLOWED_EXTS as string[]).includes(raw) ? (raw as ImageExt) : ''
}

// Prefer the filename extension (most reliable for local drags), fall back to
// sniffing the MIME type. Returns '' for anything outside the allowlist.
export function guessExtension(file: File): ImageExt | '' {
  return extFromName(file.name) || mimeToExt(file.type)
}

// A file is an acceptable image only if we can pin it to one of the allowed
// extensions — via MIME or filename. This rejects image/bmp, image/tiff, and
// non-images alike, so the drop pipeline can notify-and-skip cleanly.
export function isAllowedImage(file: File): boolean {
  return guessExtension(file) !== ''
}
