import { useCallback, useEffect, useRef, useState } from 'react'
import { files as filesApi, fs, ui } from '@ispo/sdk'
import { cn } from '../lib/cn'
import { IDENTITY, type Viewport } from '../lib/transform'
import { useBoard } from '../hooks/use-board'
import { usePointerPan } from '../hooks/use-pointer-pan'
import { useZoom } from '../hooks/use-zoom'
import { useImageIngest } from '../hooks/use-image-ingest'
import { BoardCard } from './board-card'
import { Toolbar } from './toolbar'
import { DropZone } from './drop-zone'
import { EmptyState } from './empty-state'

const GRID_SIZE = 24 // px, at scale 1 — must match the dot-grid in canvas.css
const ANIM_MS = 220 // keep in sync with .canvas-board.is-animating transition
const VIEWPORT_KEY = 'canvas:viewport'
const FILES_ACCEPT = ['image/']

function loadViewport(): Viewport {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<Viewport>
      if (typeof v.x === 'number' && typeof v.y === 'number' && typeof v.scale === 'number') {
        return { x: v.x, y: v.y, scale: v.scale }
      }
    }
  } catch { /* ignore corrupt data */ }
  return IDENTITY
}

export function CanvasBoard() {
  const board = useBoard()

  const [view, setViewState] = useState<Viewport>(loadViewport)
  const [importingFromFiles, setImportingFromFiles] = useState(false)
  const viewRef = useRef(view)
  viewRef.current = view

  const surfaceRef = useRef<HTMLDivElement>(null)
  const [animating, setAnimating] = useState(false)
  const animTimer = useRef<number | undefined>(undefined)

  // animate=true is used only for discrete jumps (buttons/keys); pan and wheel
  // pass false so dragging stays glued to the cursor with no easing lag.
  const setView = useCallback((next: Viewport, animate = false) => {
    setViewState(next)
    try { localStorage.setItem(VIEWPORT_KEY, JSON.stringify(next)) } catch { /* quota */ }
    if (animate) {
      setAnimating(true)
      window.clearTimeout(animTimer.current)
      animTimer.current = window.setTimeout(() => setAnimating(false), ANIM_MS)
    }
  }, [])

  const { panning, panHandlers } = usePointerPan({ viewRef, setView })
  const { zoomIn, zoomOut, reset, fit } = useZoom({
    viewRef,
    setView,
    surfaceRef,
    getItems: () => board.items,
  })
  const ingest = useImageIngest({
    addItems: board.addItems,
    topZ: board.topZ,
    viewRef,
    surfaceRef,
  })

  const handleDrop = useCallback(
    (files: FileList, clientX: number, clientY: number) => {
      void ingest(files, { clientX, clientY })
    },
    [ingest],
  )
  const handlePick = useCallback((files: FileList) => void ingest(files), [ingest])
  const handleAddFromFiles = useCallback(async () => {
    if (importingFromFiles) return
    setImportingFromFiles(true)
    try {
      const picked = await filesApi.pick({ accept: FILES_ACCEPT })
      if (!picked) return
      const bytes = await fs.readBinary(picked.path)
      const file = new File(
        [bytes],
        picked.name || 'files-image',
        { type: picked.mimeType || 'application/octet-stream' },
      )
      await ingest([file])
    } catch (err) {
      console.warn('[canvas] files.pick import failed:', err)
      try {
        await ui.notify({
          title: 'Could not add from Files',
          body: 'Grant Files picker access from the Access panel, then try again.',
        })
      } catch (notifyErr) {
        console.warn('[canvas] ui.notify failed for Files import:', notifyErr)
      }
    } finally {
      setImportingFromFiles(false)
    }
  }, [importingFromFiles, ingest])
  const getScale = useCallback(() => viewRef.current.scale, [])

  // Global canvas shortcuts: +/- zoom, 0 reset, F fit. Ignored while a dialog
  // or text field has focus; card-level arrows/Delete are handled on the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, [contenteditable], [role="dialog"]')) return
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault()
          zoomIn()
          break
        case '-':
        case '_':
          e.preventDefault()
          zoomOut()
          break
        case '0':
          e.preventDefault()
          reset()
          break
        case 'f':
        case 'F':
          e.preventDefault()
          fit()
          break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [zoomIn, zoomOut, reset, fit])

  const transformStyle = {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
  }
  // The dot grid lives on the surface but tracks the viewport so the canvas
  // reads as a single infinite plane even when empty.
  const gridStyle = {
    backgroundPosition: `${view.x}px ${view.y}px`,
    backgroundSize: `${GRID_SIZE * view.scale}px ${GRID_SIZE * view.scale}px`,
  }

  return (
    <div className="canvas-root">
      <Toolbar
        scale={view.scale}
        count={board.items.length}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onReset={reset}
        onFit={fit}
        onAddFromFiles={() => void handleAddFromFiles()}
        importingFromFiles={importingFromFiles}
        onClear={board.clearAll}
      />

      <div
        ref={surfaceRef}
        className={cn('canvas-surface', panning && 'is-panning')}
        style={gridStyle}
        {...panHandlers}
      >
        <div className={cn('canvas-board', animating && 'is-animating')} style={transformStyle}>
          {board.items.map((item) => (
            <BoardCard
              key={item.id}
              item={item}
              getScale={getScale}
              onMove={board.moveItem}
              onResize={board.resizeItem}
              onRename={board.renameItem}
              onDelete={board.removeItem}
              onBringToFront={board.bringToFront}
            />
          ))}
        </div>
      </div>

      {board.items.length === 0 && (
        <EmptyState
          onPickFiles={handlePick}
          onAddFromFiles={() => void handleAddFromFiles()}
          importingFromFiles={importingFromFiles}
        />
      )}
      <DropZone onDropFiles={handleDrop} />
    </div>
  )
}
