import { useRef } from 'react'
import { FolderOpen, ImagePlus, Upload } from 'lucide-react'
import { Button } from './ui/button'

// Allowlist mirrors lib/image-id.ts so the native picker only surfaces images
// the app can actually persist. A native <input type="file"> needs no host
// files.pick grant — the browser owns the dialog — so this stays within the
// scaffolded shared-read-write access envelope.
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif'

export function EmptyState(props: {
  onPickFiles: (files: FileList) => void
  onAddFromFiles: () => void
  importingFromFiles: boolean
}) {
  const { onPickFiles, onAddFromFiles, importingFromFiles } = props
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="empty-state">
      <div className="empty-state-panel">
        <div className="empty-state-icon" aria-hidden>
          <ImagePlus className="size-7" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Start your moodboard
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Drop images anywhere on the canvas to pin them, then drag to arrange. Scroll to
          pan, ⌘/Ctrl + scroll to zoom.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) onPickFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="empty-state-actions">
          <Button
            className="h-9 gap-2 px-4 text-sm"
            disabled={importingFromFiles}
            onClick={onAddFromFiles}
          >
            <FolderOpen className="size-4" aria-hidden />
            {importingFromFiles ? 'Opening Files' : 'Add from Files'}
          </Button>
          <Button
            variant="secondary"
            className="h-9 gap-2 px-4 text-sm"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            Browse local
          </Button>
        </div>
      </div>
    </div>
  )
}
