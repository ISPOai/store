// The export path: render the current composition document through the
// vendored encoder in a capture world, then hand the produced bytes to the
// user's chosen destination (Files through the powerbox save, or explicit
// off-platform delivery through the OS save dialog). Truthful about
// capability: the caller gates on the probe result before starting.
import { createEncoder } from '@diffusionstudio/encoder'
import { Fonts, FrameRate, Library, RenderSurface, Root, type FontSource } from '@diffusionstudio/runtime'
import { getEntityChildren } from '@diffusionstudio/runtime'
import type { AssetLibrary } from '@diffusionstudio/assets'
import type { Entity } from 'koota'
import { mountDocument, removeEntityTree } from './document-codec.ts'
import { appendFontSources } from './engine-singletons.ts'
import { deliverExport, filesDelivery, type ByteDelivery, type ExportDestination } from './export-delivery.ts'
import type { CompositionDocument, ExportFormat } from '../domain/schema.ts'
import type { ExportJobService } from '../domain/export-jobs.ts'
import type { FilesPort } from '../sdk-port.ts'

export interface ExportDeps {
  readonly library: AssetLibrary
  readonly fontSources: readonly FontSource[]
  readonly jobs: ExportJobService
  readonly files: FilesPort
  readonly fps: number
  readonly projectId: string
  /** Delivery override; defaults to the Files powerbox save. */
  readonly deliver?: ByteDelivery
  readonly destination?: ExportDestination
}

export type ExportPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'encoding'; readonly progress: number }
  | { readonly kind: 'saving' }
  | { readonly kind: 'succeeded'; readonly path: string | null; readonly destination: ExportDestination }
  | { readonly kind: 'failed'; readonly error: string }
  | { readonly kind: 'canceled' }

export interface ExportRunHandle {
  readonly cancel: () => void
}

/**
 * Encodes `document` to an in-memory file, then delivers the bytes to the
 * user-chosen destination. The video.export-job record tracks the durable
 * state across the whole run; the composition itself is only ever read.
 */
export async function runExport(
  deps: ExportDeps,
  compositionDocument: CompositionDocument,
  format: ExportFormat,
  jobId: string,
  onPhase: (phase: ExportPhase) => void,
): Promise<ExportRunHandle> {
  let canceled = false
  let encoderCancel: (() => void) | null = null
  const destination: ExportDestination = deps.destination ?? 'files'
  const deliver: ByteDelivery = deps.deliver ?? filesDelivery(deps.files)

  const run = (async () => {
    onPhase({ kind: 'encoding', progress: 0 })
    await deps.jobs.markRunning(jobId)

    // The capture world: the same document mounted again, its stage reduced
    // to the scene being exported (the encoder asserts one scene per world).
    const capture = mountDocument(compositionDocument, deps.projectId)
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    canvas.style.position = 'fixed'
    canvas.style.left = '0'
    canvas.style.bottom = '0'
    canvas.style.width = '2px'
    canvas.style.height = '2px'
    canvas.style.opacity = '0'
    try {
      capture.world.set(Library, deps.library)
      capture.world.set(FrameRate, { value: deps.fps })
      const fonts = capture.world.get(Fonts)?.list
      if (fonts) appendFontSources(fonts, deps.fontSources)
      document.body.append(canvas)

      capture.world.set(RenderSurface, { canvas, ctx: canvas.getContext('2d'), resolution: 1 })

      const scene = reduceToFirstScene(capture.world, capture.document)
      if (scene === null) {
        throw new Error('the composition has no scene to export')
      }

      const encoder = await createEncoder(capture.world, {
        format,
        onProgress(progress) {
          const ratio = progress.progress / Math.max(1, progress.total)
          onPhase({ kind: 'encoding', progress: ratio })
          void deps.jobs.markProgress(jobId, ratio)
        },
      })
      encoderCancel = encoder.cancel
      if (canceled) {
        encoder.cancel()
        await deps.jobs.markCanceled(jobId)
        onPhase({ kind: 'canceled' })
        return
      }

      const result = await encoder.render()

      if (result.type === 'canceled' || canceled) {
        await deps.jobs.markCanceled(jobId)
        onPhase({ kind: 'canceled' })
        return
      }
      if (result.type === 'error') {
        await deps.jobs.markFailed(jobId, result.error.message)
        onPhase({ kind: 'failed', error: result.error.message })
        return
      }
      const blob = result.data
      if (blob === undefined) {
        await deps.jobs.markFailed(jobId, 'the encoder produced no file')
        onPhase({ kind: 'failed', error: 'the encoder produced no file' })
        return
      }

      const bytes = new Uint8Array(await blob.arrayBuffer())
      onPhase({ kind: 'saving' })
      const outcome = await deliverExport({ jobs: deps.jobs, deliver }, jobId, bytes, format)
      if (outcome.kind === 'delivered') {
        onPhase({ kind: 'succeeded', path: outcome.resultPath, destination })
      } else if (outcome.kind === 'canceled') {
        onPhase({ kind: 'canceled' })
      } else {
        onPhase({ kind: 'failed', error: outcome.error })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'the export failed'
      await deps.jobs.markFailed(jobId, message).catch(() => undefined)
      onPhase({ kind: 'failed', error: message })
    } finally {
      // Removed here, not on the success path alone: an encoder-setup or
      // render throw must not leak the hidden capture canvas in the frame.
      canvas.remove()
      capture.dispose()
    }
  })()

  return {
    cancel() {
      canceled = true
      encoderCancel?.()
    },
  }
}

/**
 * Removes every scene except the first under the stage, so the encoder's
 * one-scene assertion holds. Returns the surviving scene.
 */
function reduceToFirstScene(
  world: ReturnType<typeof mountDocument>['world'],
  document: ReturnType<typeof mountDocument>['document'],
): Entity | null {
  const root = world.get(Root)
  if (!root) return null
  const children = getEntityChildren(world, root)
  const keep = children[0]
  if (keep === undefined) return null
  for (const child of children.slice(1)) {
    removeEntityTree(document, child)
  }
  return keep
}
