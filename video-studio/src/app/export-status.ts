// App-level export status: one module-owned signal the export command, the
// editor UI, and the assistant context all observe. An export run may be
// started by the UI or by a host-dispatched command; either way there is at
// most one active run and its phase is published here.
import { createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { ExportPhase } from '../editor/export.ts'
import type { CompositionDocument, ExportFormat } from '../domain/schema.ts'

export type ExportRunStarter = (
  document: CompositionDocument,
  format: ExportFormat,
  jobId: string,
) => void

type PhaseListener = (phase: ExportPhase) => void

const [readPhase, writePhase] = createSignal<ExportPhase>({ kind: 'idle' })
const listeners = new Set<PhaseListener>()
let cancelHandle: (() => void) | null = null

export const exportPhase: Accessor<ExportPhase> = readPhase

export function publishExportPhase(phase: ExportPhase): void {
  writePhase(phase)
  if (
    phase.kind === 'succeeded' ||
    phase.kind === 'failed' ||
    phase.kind === 'canceled'
  ) {
    cancelHandle = null
  }
  for (const listener of [...listeners]) listener(phase)
}

export function setExportCancelHandle(cancel: (() => void) | null): void {
  cancelHandle = cancel
}

export function cancelExportRun(): void {
  cancelHandle?.()
}

export function onExportPhase(listener: PhaseListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** One-line bounded status text for the assistant context. */
export function exportStatusText(): string {
  const phase = readPhase()
  switch (phase.kind) {
    case 'idle':
      return 'export idle'
    case 'encoding':
      return `exporting ${Math.round(phase.progress * 100)}%`
    case 'saving':
      return 'export saving'
    case 'succeeded':
      return phase.destination === 'files' ? 'export saved to Files' : 'export saved off-platform'
    case 'failed':
      return 'export failed'
    case 'canceled':
      return 'export canceled'
  }
}
