// The editor view: transport header, canvas stage, timeline, inspector,
// and the export panel. All state rides the controller; this file only
// arranges surfaces and wires pointer/keyboard gestures to actions.
import { createEffect, onCleanup, type JSX } from 'solid-js'
import type { AppController } from '../app/app-controller.ts'
import { StageCanvas } from './stage-canvas.tsx'
import { TimelineView } from './timeline-view.tsx'
import { InspectorView } from './inspector-view.tsx'
import { ExportPanel } from './export-panel.tsx'
import { LibraryPanel } from './library-panel.tsx'

function SaveBadge(props: { controller: AppController }): JSX.Element {
  let node: HTMLSpanElement | undefined
  createEffect(() => {
    if (!node) return
    const state = props.controller.saveState()
    node.textContent = state.status
    node.dataset.status = state.status
  })
  return (
    <span
      ref={(element) => (node = element)}
      data-save-badge
      class="font-mono text-xs text-muted-foreground"
    />
  )
}

export function EditorView(props: { controller: AppController }): JSX.Element {
  const controller = props.controller
  let importButton: HTMLButtonElement | undefined
  let deleteButton: HTMLButtonElement | undefined
  let undoButton: HTMLButtonElement | undefined
  let redoButton: HTMLButtonElement | undefined
  createEffect(() => {
    if (importButton) importButton.disabled = controller.isImporting()
  })
  createEffect(() => {
    if (deleteButton) deleteButton.disabled = controller.selection() === null
  })
  createEffect(() => {
    const history = controller.undoRedo()
    if (undoButton) undoButton.disabled = !history.canUndo
    if (redoButton) redoButton.disabled = !history.canRedo
  })
  createEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (controller.screen() !== 'editor') return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) controller.redo()
        else controller.undo()
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        controller.redo()
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        if (controller.selection()) {
          event.preventDefault()
          controller.removeSelected()
        }
      } else if (event.key === ' ') {
        event.preventDefault()
        controller.playOrPause()
      }
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  })
  return (
    <section class="flex h-dvh flex-col">
      <header class="flex items-center gap-3 border-b border-border px-4 py-2">
        <button
          type="button"
          class="rounded-md border border-border px-2.5 py-1 text-sm hover-wash"
          onclick={() => void controller.closeEditor()}
        >
          Compositions
        </button>
        <button
          type="button"
          ref={(element) => (undoButton = element)}
          class="rounded-md border border-border px-2.5 py-1 text-sm hover-wash disabled:opacity-50"
          onclick={() => controller.undo()}
        >
          Undo
        </button>
        <button
          type="button"
          ref={(element) => (redoButton = element)}
          class="rounded-md border border-border px-2.5 py-1 text-sm hover-wash disabled:opacity-50"
          onclick={() => controller.redo()}
        >
          Redo
        </button>
        <SaveBadge controller={controller} />
        <span class="flex-1" />
        <button
          type="button"
          ref={(element) => (importButton = element)}
          class="rounded-md border border-border px-2.5 py-1 text-sm hover-wash disabled:opacity-50"
          onclick={() => void controller.importMedia()}
        >
          Import media
        </button>
        <button
          type="button"
          class="rounded-md border border-border px-2.5 py-1 text-sm hover-wash"
          onclick={() => controller.addText()}
        >
          Add text
        </button>
        <button
          type="button"
          ref={(element) => (deleteButton = element)}
          class="rounded-md border border-border px-2.5 py-1 text-sm hover-wash disabled:opacity-50"
          onclick={() => controller.removeSelected()}
        >
          Delete
        </button>
      </header>

      <div class="flex min-h-0 flex-1 flex-col">
        <div class="flex min-h-0 flex-1">
          <div class="flex min-w-0 flex-1 flex-col">
            <StageCanvas controller={controller} />
            <TimelineView controller={controller} />
          </div>
          <aside class="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-3">
            <InspectorView controller={controller} />
            <LibraryPanel controller={controller} />
            <ExportPanel controller={controller} />
          </aside>
        </div>
      </div>
    </section>
  )
}
