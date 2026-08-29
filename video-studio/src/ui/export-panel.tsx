// The export panel: capability gate, format choice, destination choice
// (Files through the powerbox, or explicit off-platform through the OS save
// dialog), run state, and the durable job trail. When this frame cannot
// encode, the panel says exactly why and leaves the rest of the editor
// untouched.
import { createEffect, type JSX } from 'solid-js'
import type { AppController } from '../app/app-controller.ts'

export function ExportPanel(props: { controller: AppController }): JSX.Element {
  const controller = props.controller
  let mp4Button: HTMLButtonElement | undefined
  let webmButton: HTMLButtonElement | undefined
  let mp4DiskButton: HTMLButtonElement | undefined
  let webmDiskButton: HTMLButtonElement | undefined
  let cancelButton: HTMLButtonElement | undefined
  let stateLine: HTMLParagraphElement | undefined

  createEffect(() => {
    if (!mp4Button || !stateLine) return
    const caps = controller.exportCapabilities()
    const phase = controller.exportState()
    const busy = phase.kind === 'encoding' || phase.kind === 'saving'
    const blocked = busy || caps === null || !caps.supported
    for (const button of [mp4Button, webmButton, mp4DiskButton, webmDiskButton]) {
      if (button) button.disabled = blocked
    }
    if (cancelButton) cancelButton.style.display = busy ? 'inline-flex' : 'none'

    switch (phase.kind) {
      case 'idle':
        stateLine.textContent = caps !== null && !caps.supported ? (caps.blocker ?? 'Export unavailable here.') : ''
        stateLine.dataset.state = 'idle'
        break
      case 'encoding':
        stateLine.textContent = `Encoding ${Math.round(phase.progress * 100)}%`
        stateLine.dataset.state = 'encoding'
        break
      case 'saving':
        stateLine.textContent = 'Waiting for the save destination…'
        stateLine.dataset.state = 'saving'
        break
      case 'succeeded':
        stateLine.textContent =
          phase.destination === 'files' ? `Saved to ${phase.path ?? 'Files'}` : 'Saved outside ISPO.'
        stateLine.dataset.state = 'succeeded'
        break
      case 'failed':
        stateLine.textContent = `Export failed: ${phase.error}`
        stateLine.dataset.state = 'failed'
        break
      case 'canceled':
        stateLine.textContent = 'Export canceled.'
        stateLine.dataset.state = 'canceled'
        break
    }
  })

  return (
    <section class="flex flex-col gap-3" data-export-panel>
      <h2 class="text-sm font-medium">Export</h2>
      <p
        ref={(element) => (stateLine = element)}
        data-export-state
        class="min-h-0 rounded-md border border-border bg-secondary px-3 py-2 font-mono text-xs text-muted-foreground"
      />
      <div class="flex items-center gap-2">
        <button
          type="button"
          ref={(element) => (mp4Button = element)}
          class="rounded-md bg-foreground px-2.5 py-1 text-sm font-medium text-background disabled:opacity-50"
          onclick={() => void controller.startExport('mp4', 'files')}
        >
          Export MP4
        </button>
        <button
          type="button"
          ref={(element) => (webmButton = element)}
          class="rounded-md border border-border px-2.5 py-1 text-sm hover-wash disabled:opacity-50"
          onclick={() => void controller.startExport('webm', 'files')}
        >
          Export WebM
        </button>
        <button
          type="button"
          ref={(element) => (cancelButton = element)}
          style="display:none"
          class="rounded-md border border-border px-2.5 py-1 text-sm hover-wash"
          onclick={() => controller.cancelExport()}
        >
          Cancel
        </button>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          ref={(element) => (mp4DiskButton = element)}
          class="rounded-md border border-border px-2.5 py-1 text-xs hover-wash disabled:opacity-50"
          onclick={() => void controller.startExport('mp4', 'computer')}
        >
          Save MP4 to computer
        </button>
        <button
          type="button"
          ref={(element) => (webmDiskButton = element)}
          class="rounded-md border border-border px-2.5 py-1 text-xs hover-wash disabled:opacity-50"
          onclick={() => void controller.startExport('webm', 'computer')}
        >
          Save WebM to computer
        </button>
      </div>
    </section>
  )
}
