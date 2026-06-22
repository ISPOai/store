import { useState } from 'react'
import { FolderOpen, Maximize, Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

// All controls sit at h-8 (32px) and text stays at text-sm to hold the density
// floor; the scaffold Button defaults to h-9, so each instance overrides it.
const ICON_BTN = 'h-8 w-8 p-0'

export function Toolbar(props: {
  scale: number
  count: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onFit: () => void
  onAddFromFiles: () => void
  importingFromFiles: boolean
  onClear: () => void
}) {
  const {
    scale,
    count,
    onZoomIn,
    onZoomOut,
    onReset,
    onFit,
    onAddFromFiles,
    importingFromFiles,
    onClear,
  } = props
  const [confirmOpen, setConfirmOpen] = useState(false)

  function confirmClear() {
    onClear()
    setConfirmOpen(false)
  }

  return (
    <div style={{ fontSize: "10px" }} className="toolbar">
      <div className="toolbar-group">
        <Button variant="ghost" className={ICON_BTN} aria-label="Zoom out" onClick={onZoomOut}>
          <Minus className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          className="h-8 min-w-12 px-2 text-sm font-medium tabular-nums"
          aria-label="Reset zoom to 100%"
          onClick={onReset}
        >
          {Math.round(scale * 100)}%
        </Button>
        <Button variant="ghost" className={ICON_BTN} aria-label="Zoom in" onClick={onZoomIn}>
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="toolbar-divider" aria-hidden />

      <Button
        variant="ghost"
        className="h-8 gap-1.5 px-2.5 text-sm"
        aria-label="Fit all images in view"
        onClick={onFit}
      >
        <Maximize className="size-4" aria-hidden />
        Fit
      </Button>

      <Button
        variant="ghost"
        className="h-8 gap-1.5 px-2.5 text-sm"
        aria-label="Add an image from the Files library"
        disabled={importingFromFiles}
        onClick={onAddFromFiles}
      >
        <FolderOpen className="size-4" aria-hidden />
        {importingFromFiles ? 'Opening' : 'Files'}
      </Button>

      <Button
        variant="ghost"
        className="toolbar-danger h-8 gap-1.5 px-2.5 text-sm"
        aria-label="Clear the board"
        disabled={count === 0}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-4" aria-hidden />
        Clear
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear the board?</DialogTitle>
            <DialogDescription>
              This removes {count} image{count === 1 ? '' : 's'} from the board. The image
              files stay in shared storage — there's no delete capability yet — so nothing is
              destroyed; you just start from a blank canvas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" className="h-8 px-3 text-sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button className="toolbar-danger-solid h-8 px-3 text-sm" onClick={confirmClear}>
              Clear board
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
