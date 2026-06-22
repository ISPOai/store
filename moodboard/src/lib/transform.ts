import type { BoardItem } from './types'

// The viewport is a single CSS transform applied to the board <div>:
//   translate(x, y) scale(scale)   with transform-origin: 0 0
// Cards live in board-space; the viewport is the only thing that moves.
export type Viewport = { x: number; y: number; scale: number }

export const MIN_SCALE = 0.1
export const MAX_SCALE = 4
export const IDENTITY: Viewport = { x: 0, y: 0, scale: 1 }

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

// Convert a point expressed relative to the surface's top-left (e.g.
// clientX - rect.left) into board-space. This is the inverse of the CSS
// transform: undo the translate, then undo the scale.
export function screenToBoard(
  view: Viewport,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale }
}

// Zoom by `factor` while keeping the board point currently under (sx, sy)
// pinned to that same screen pixel — the behaviour that makes wheel/pinch zoom
// feel like it's centred on the cursor rather than the origin.
//
// The board point under the cursor is  b = (s - view.x) / view.scale.
// After zooming we need  s = b * scale + x', so  x' = s - b * scale.
export function zoomAround(
  view: Viewport,
  sx: number,
  sy: number,
  factor: number,
): Viewport {
  const scale = clampScale(view.scale * factor)
  const bx = (sx - view.x) / view.scale
  const by = (sy - view.y) / view.scale
  return { scale, x: sx - bx * scale, y: sy - by * scale }
}

// Frame every item inside `rect` with breathing room around the bounding box,
// then centre it. An empty board returns to the identity viewport.
export function fitToItems(
  items: BoardItem[],
  rect: { width: number; height: number },
): Viewport {
  if (items.length === 0) return { ...IDENTITY }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const it of items) {
    minX = Math.min(minX, it.x)
    minY = Math.min(minY, it.y)
    maxX = Math.max(maxX, it.x + it.w)
    maxY = Math.max(maxY, it.y + it.h)
  }

  const PADDING = 80
  const boxW = Math.max(1, maxX - minX)
  const boxH = Math.max(1, maxY - minY)
  const scale = clampScale(
    Math.min(rect.width / (boxW + PADDING * 2), rect.height / (boxH + PADDING * 2)),
  )

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  return {
    scale,
    x: rect.width / 2 - centerX * scale,
    y: rect.height / 2 - centerY * scale,
  }
}
