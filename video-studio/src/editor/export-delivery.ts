// Export delivery: the final hand-off of encoded bytes to a user-chosen
// destination, and the durable job bookkeeping that goes with it. Two
// destinations exist, both explicit user intents:
//
//   'files'    — the powerbox save; the user picks a Files library location.
//   'computer' — the OS save dialog (`files.export`); explicit off-platform
//                export outside ISPO. The export returns only display names,
//                never an OS path, so the job records no result path.
//
// Every non-delivered outcome (cancel, dialog refusal, transport failure)
// leaves the composition untouched: exports read a document copy, and the
// editor's own autosave/history never ride on the export path.
import type { ExportFormat } from '../domain/schema.ts'
import type { ExportJobResultInput, ExportJobService } from '../domain/export-jobs.ts'
import type { FilesPort } from '../sdk-port.ts'

export type ExportDestination = 'files' | 'computer'

export type DeliveryOutcome =
  | { readonly kind: 'delivered'; readonly resultPath: string | null; readonly resultPublicId: string | null }
  | { readonly kind: 'canceled'; readonly displayName: string | null }
  | { readonly kind: 'failed'; readonly error: string }

export type ByteDelivery = (bytes: Uint8Array, format: ExportFormat) => Promise<DeliveryOutcome>

export function exportFileName(format: ExportFormat): string {
  return `video-studio-export.${format === 'webm' ? 'webm' : 'mp4'}`
}

/** Delivery through the powerbox save into the Files library. */
export function filesDelivery(files: FilesPort): ByteDelivery {
  return async (bytes, format) => {
    const saved = await files.save({
      content: bytes,
      name: exportFileName(format),
      accept: ['video/'],
    })
    if (saved === null) return { kind: 'canceled', displayName: null }
    return {
      kind: 'delivered',
      resultPath: saved.path,
      resultPublicId: saved.publicId ?? null,
    }
  }
}

/** Explicit off-platform delivery through the OS save dialog. */
export function offPlatformDelivery(files: FilesPort): ByteDelivery {
  return async (bytes, format) => {
    const answer = await files.export({
      data: bytes,
      defaultName: exportFileName(format),
      filters: [{ name: format === 'webm' ? 'WebM video' : 'MP4 video', extensions: [format] }],
    })
    if (!answer.saved) return { kind: 'canceled', displayName: null }
    return { kind: 'delivered', resultPath: null, resultPublicId: null }
  }
}
/**
 * Runs one delivery to completion and records the outcome on the job:
 * delivered → succeeded (with the Files identity when the destination is
 * Files), canceled → canceled, and any throw → failed with the message
 * clamped to the job record's bounded error field.
 */
export async function deliverExport(
  deps: { readonly jobs: ExportJobService; readonly deliver: ByteDelivery },
  jobId: string,
  bytes: Uint8Array,
  format: ExportFormat,
): Promise<DeliveryOutcome> {
  let outcome: DeliveryOutcome
  try {
    outcome = await deps.deliver(bytes, format)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'the export delivery failed'
    outcome = { kind: 'failed', error: message }
  }
  if (outcome.kind === 'delivered') {
    await deps.jobs.markSucceeded(jobId, { path: outcome.resultPath, publicId: outcome.resultPublicId })
  } else if (outcome.kind === 'canceled') {
    await deps.jobs.markCanceled(jobId)
  } else {
    await deps.jobs.markFailed(jobId, outcome.error.slice(0, 400))
  }
  return outcome
}
