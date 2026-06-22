import { useEffect, useState } from 'react'
import { ImageDown } from 'lucide-react'
import { cn } from '../lib/cn'

// A full-page, pointer-events:none overlay that paints a "drop images" hint
// only while a drag is over the window. Drag/drop is handled on `window` (not
// the overlay) so it never blocks panning the board underneath, and every
// drag event is preventDefault'd to stop the browser from opening the file.
export function DropZone(props: {
  onDropFiles: (files: FileList, clientX: number, clientY: number) => void
}) {
  const { onDropFiles } = props
  const [active, setActive] = useState(false)

  useEffect(() => {
    // A counter so nested dragenter/dragleave (firing per child element) don't
    // flicker the overlay off mid-drag.
    let depth = 0

    const hasFiles = (e: DragEvent) =>
      e.dataTransfer != null && Array.from(e.dataTransfer.types).includes('Files')

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth += 1
      setActive(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (e: DragEvent) => {
      e.preventDefault()
      depth = Math.max(0, depth - 1)
      if (depth === 0) setActive(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setActive(false)
      const files = e.dataTransfer?.files
      if (files && files.length > 0) onDropFiles(files, e.clientX, e.clientY)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [onDropFiles])

  return (
    <div className={cn('drop-zone', active && 'is-active')} aria-hidden>
      <div className="drop-zone-hint">
        <ImageDown className="size-6" aria-hidden />
        <span>Drop images to add them to the board</span>
      </div>
    </div>
  )
}
