import { useCallback } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { shared, ui } from '@ispo/sdk'
import type { BoardItem } from '../lib/types'
import { guessExtension, extToMime, isAllowedImage, newImageId } from '../lib/image-id'
import { imagePath, sharedUrl } from '../lib/shared-paths'
import { screenToBoard, type Viewport } from '../lib/transform'

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB — generous for moodboard assets
// Default on-board display box for a freshly dropped image. The stored bytes
// are full-resolution and untouched; this only sizes the card (object-fit:
// contain), so it's free to make large. Existing items keep their saved size.
const DEFAULT_W = 440
const MAX_H = 700
const FALLBACK_H = 320
const CASCADE = 28 // board-space offset between images in a multi-file drop

async function notify(title: string, body?: string) {
  try {
    await ui.notify(body ? { title, body } : { title })
  } catch (err) {
    console.warn('[canvas] ui.notify failed:', title, err)
  }
}

// Measure natural dimensions from the original File (local object URL) rather
// than the shared:// URL — it's faster and never races the host serving the
// freshly-written bytes. Falls back gracefully for corrupt/unsized files.
async function measure(file: File): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    if (!nw || !nh) return { w: DEFAULT_W, h: FALLBACK_H }
    return { w: DEFAULT_W, h: Math.min(MAX_H, Math.round(DEFAULT_W * (nh / nw))) }
  } catch {
    return { w: DEFAULT_W, h: FALLBACK_H }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function useImageIngest(opts: {
  addItems: (items: BoardItem[]) => void
  topZ: () => number
  viewRef: MutableRefObject<Viewport>
  surfaceRef: RefObject<HTMLElement | null>
}) {
  const { addItems, topZ, viewRef, surfaceRef } = opts

  // `at` is the drop point in client coords; omitted for the "Browse" path,
  // which drops onto the centre of the visible surface instead.
  const ingest = useCallback(
    async (fileList: FileList | File[], at?: { clientX: number; clientY: number }) => {
      const files = Array.from(fileList)
      if (files.length === 0) return

      const surface = surfaceRef.current
      const rect = surface?.getBoundingClientRect()
      const sx = at && rect ? at.clientX - rect.left : (rect?.width ?? 0) / 2
      const sy = at && rect ? at.clientY - rect.top : (rect?.height ?? 0) / 2
      const anchor = screenToBoard(viewRef.current, sx, sy)

      const skipped: string[] = []
      const oversized: string[] = []
      const accepted = files.filter((f) => {
        if (!isAllowedImage(f)) {
          skipped.push(f.name || 'unnamed file')
          return false
        }
        if (f.size > MAX_BYTES) {
          oversized.push(f.name || 'unnamed file')
          return false
        }
        return true
      })

      const baseZ = topZ()
      const built = await Promise.all(
        accepted.map(async (file, i): Promise<BoardItem | null> => {
          const ext = guessExtension(file)
          if (!ext) return null
          const id = newImageId()
          const requestPath = imagePath(id, ext)
          const bytes = new Uint8Array(await file.arrayBuffer())
          // The host scopes writes to THIS app's own shared subtree, so it
          // returns the RESOLVED path (prefixed with the projectId, e.g.
          // `<projectId>/moodboard/images/<id>.png`). That resolved path — NOT
          // the relative one we asked to write — is what the `shared://` URL must
          // address; a hand-built `shared://moodboard/...` reads the flat root
          // where the bytes do NOT live (→ broken image).
          let path: string
          try {
            const written = await shared.writeBinary(requestPath, bytes)
            path = written?.path ?? requestPath
          } catch (err) {
            console.warn('[canvas] shared.writeBinary failed:', requestPath, err)
            await notify(
              'Shared storage denied',
              'Grant the Shared files write permission from the Access panel, then drop again.',
            )
            return null
          }
          const { w, h } = await measure(file)
          // Centre each image on the drop point, cascading multi-drops so they
          // don't land in one opaque stack.
          return {
            id,
            src: sharedUrl(path),
            path,
            mimeType: file.type || extToMime(ext),
            bytes: file.size,
            originalName: file.name || `image${ext}`,
            addedAt: Date.now(),
            x: Math.round(anchor.x - w / 2 + i * CASCADE),
            y: Math.round(anchor.y - h / 2 + i * CASCADE),
            w,
            h,
            z: baseZ + 1 + i,
          }
        }),
      )

      const items = built.filter((it): it is BoardItem => it !== null)
      addItems(items)

      if (skipped.length > 0) {
        await notify(
          skipped.length === 1 ? 'Skipped a non-image file' : `Skipped ${skipped.length} non-image files`,
          skipped.join(', '),
        )
      }
      if (oversized.length > 0) {
        await notify(
          oversized.length === 1 ? 'File too large (max 20 MB)' : `${oversized.length} files over 20 MB`,
          oversized.join(', '),
        )
      }
    },
    [addItems, topZ, viewRef, surfaceRef],
  )

  return ingest
}
