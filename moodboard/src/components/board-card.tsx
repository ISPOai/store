import { useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { ArrowUp, Pencil, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { usePointerDrag } from '../hooks/use-pointer-drag'
import { usePointerResize } from '../hooks/use-pointer-resize'
import type { BoardItem } from '../lib/types'

const NUDGE = 8
const NUDGE_LARGE = 32

function stopPointer(e: ReactPointerEvent) {
  // Keep clicks on the overlay buttons from starting a card drag.
  e.stopPropagation()
}

export function BoardCard(props: {
  item: BoardItem
  getScale: () => number
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, w: number, h: number) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onBringToFront: (id: string) => void
}) {
  const { item, getScale, onMove, onResize, onRename, onDelete, onBringToFront } = props

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.originalName)

  const drag = usePointerDrag({
    getScale,
    onCommit: (dx, dy) =>
      onMove(item.id, Math.round(item.x + dx), Math.round(item.y + dy)),
    onGrab: () => onBringToFront(item.id),
  })

  const resize = usePointerResize({
    getScale,
    getSize: () => ({ w: item.w, h: item.h }),
    onCommit: (w, h) => onResize(item.id, w, h),
  })

  const left = item.x + drag.dx
  const top = item.y + drag.dy
  const width = resize.resizing ? resize.w : item.w
  const height = resize.resizing ? resize.h : item.h

  function startRename() {
    setDraft(item.originalName)
    setEditing(true)
  }

  function commitRename() {
    const name = draft.trim()
    if (name && name !== item.originalName) onRename(item.id, name)
    setEditing(false)
  }

  function onRenameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation() // don't trigger card nudges / global shortcuts while typing
    if (e.key === 'Enter') commitRename()
    else if (e.key === 'Escape') {
      setDraft(item.originalName)
      setEditing(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (editing) return
    const step = e.shiftKey ? NUDGE_LARGE : NUDGE
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        onMove(item.id, item.x - step, item.y)
        break
      case 'ArrowRight':
        e.preventDefault()
        onMove(item.id, item.x + step, item.y)
        break
      case 'ArrowUp':
        e.preventDefault()
        onMove(item.id, item.x, item.y - step)
        break
      case 'ArrowDown':
        e.preventDefault()
        onMove(item.id, item.x, item.y + step)
        break
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        onDelete(item.id)
        break
      case 'F2':
        e.preventDefault()
        startRename()
        break
    }
  }

  return (
    <div
      className={cn('board-card', (drag.dragging || resize.resizing) && 'is-active')}
      data-ispo-no-pan
      role="button"
      tabIndex={0}
      aria-label={`Image: ${item.originalName}. Drag to move, arrow keys to nudge, F2 to rename, Delete to remove.`}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        zIndex: item.z,
      }}
      onKeyDown={onKeyDown}
      {...drag.dragHandlers}
    >
      <img
        src={item.src}
        width={width}
        height={height}
        draggable={false}
        decoding="async"
        className="board-card-image"
      />

      <div className="board-card-overlay">
        <button
          type="button"
          className="board-card-btn"
          aria-label="Rename image"
          onPointerDown={stopPointer}
          onClick={startRename}
        >
          <Pencil className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="board-card-btn"
          aria-label="Bring to front"
          onPointerDown={stopPointer}
          onClick={() => onBringToFront(item.id)}
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="board-card-btn board-card-btn-danger"
          aria-label="Remove image"
          onPointerDown={stopPointer}
          onClick={() => onDelete(item.id)}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* No filename caption on hover (per request). The rename field still
          appears in place while editing — opened via the pencil button or F2. */}
      {editing && (
        <input
          className="board-card-caption board-card-rename"
          value={draft}
          autoFocus
          data-allow-select
          aria-label="Image name"
          onChange={(e) => setDraft(e.target.value)}
          onPointerDown={stopPointer}
          onKeyDown={onRenameKeyDown}
          onBlur={commitRename}
        />
      )}

      <div
        className="board-card-resize"
        aria-label="Resize image"
        {...resize.resizeHandlers}
      />
    </div>
  )
}
