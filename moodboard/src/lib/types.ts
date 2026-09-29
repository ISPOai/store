// Shape of everything persisted to shared://moodboard/board.json plus the
// transient metadata the ingest pipeline carries before it becomes a card.

// Only the host-CSP-allowed image set. guessExtension never returns anything
// outside this union, so BoardItem.path is always a servable shared:// URL.
export type ImageExt = '.png' | '.jpg' | '.webp' | '.gif' | '.svg' | '.avif'

export type BoardItem = {
  id: string // crypto.randomUUID()
  src: string // 'shared://<projectId>/moodboard/images/<id>.<ext>' (host-resolved write path)
  path: string // host-resolved shared path returned by writeBinary (projectId-prefixed)
  mimeType: string // 'image/png', 'image/jpeg', ...
  bytes: number // original file size
  originalName: string // dropped file's name; shown as the caption pill
  addedAt: number // Date.now()
  x: number // board-space (untransformed) pixels — top-left of the card
  y: number
  w: number // rendered display width
  h: number // rendered display height (preserves aspect, capped)
  z: number // stacking order; larger = on top
}

export type BoardState = {
  schemaVersion: 1
  items: BoardItem[]
  // Reserved for a future per-board saved viewport. Left undefined in v1 —
  // pan/zoom is ephemeral and resets to the origin on every open.
  viewport?: { x: number; y: number; scale: number }
}

// Measured facts about a dropped file, gathered before we know where on the
// board it lands. Kept separate from BoardItem so ingest stays testable.
export type ImageMeta = {
  id: string
  ext: ImageExt
  path: string
  src: string
  mimeType: string
  bytes: number
  originalName: string
  naturalWidth: number
  naturalHeight: number
}
