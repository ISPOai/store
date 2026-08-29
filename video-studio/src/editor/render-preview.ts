// Render preview: one frame of a saved composition, rendered headlessly
// through the same vendored engine the editor uses, returned as a bounded
// JPEG data URL for the `render-preview` command. The frame is rendered on a
// detached engine surface (the same kind of capture canvas the export path
// uses); media that has not decoded yet simply does not appear in the frame.
import {
  Fonts,
  FrameRate,
  Library,
  RenderSurface,
  setPlayhead,
  assetSystem,
  playbackSystem,
  motionSystem,
  transformSystem,
  renderSystem,
  type FontSource,
} from '@diffusionstudio/runtime'
import type { AssetLibrary } from '@diffusionstudio/assets'
import { mountDocument, activeScene } from './document-codec.ts'
import { PREVIEW_MAX_DATA_URL_CHARS, PREVIEW_MAX_WIDTH, previewFrameAt, previewSize } from '../domain/preview-math.ts'
import type { CompositionDocument } from '../domain/schema.ts'

export { PREVIEW_MAX_DATA_URL_CHARS, PREVIEW_MAX_WIDTH, previewFrameAt, previewSize } from '../domain/preview-math.ts'

export interface RenderPreviewDeps {
  readonly library: AssetLibrary
  readonly fontSources: readonly FontSource[]
  readonly fps: number
  readonly projectId: string
  /** Creates the capture surface; defaults to a detached DOM canvas. */
  readonly newCanvas?: () => HTMLCanvasElement
}

export interface RenderPreviewResult {
  readonly width: number
  readonly height: number
  readonly frame: number
  readonly frameSeconds: number
  readonly image: string
}

/**
 * Renders the frame at `atSeconds` and returns it as a JPEG data URL. Throws
 * when the document has no scene, the surface cannot produce a 2D context,
 * or the encoded image exceeds the bounded data-URL budget.
 */
export async function renderPreviewFrame(
  deps: RenderPreviewDeps,
  document: CompositionDocument,
  atSeconds: number,
  maxWidth: number = PREVIEW_MAX_WIDTH,
): Promise<RenderPreviewResult> {
  const newCanvas = deps.newCanvas ?? defaultCanvas
  const size = previewSize(document.stage, maxWidth)
  const canvas = newCanvas()
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('the preview surface cannot render in this frame')

  const capture = mountDocument(document, deps.projectId)
  try {
    capture.world.set(Library, deps.library)
    capture.world.set(FrameRate, { value: deps.fps })
    const fonts = capture.world.get(Fonts)?.list
    if (fonts) fonts.push(...deps.fontSources)
    capture.world.set(RenderSurface, { canvas, ctx, resolution: 1 })

    const scene = activeScene(capture.world)
    if (scene === null) throw new Error('the composition has no scene to preview')
    const frame = previewFrameAt(deps.fps, atSeconds)
    setPlayhead(capture.world, scene, frame)
    assetSystem(capture.world)
    playbackSystem(capture.world)
    motionSystem(capture.world)
    transformSystem(capture.world)
    renderSystem(capture.world)

    const image = canvas.toDataURL('image/jpeg', 0.85)
    if (image.length > PREVIEW_MAX_DATA_URL_CHARS) {
      throw new Error('the preview image exceeds its bounded size')
    }
    return { width: size.width, height: size.height, frame, frameSeconds: frame / Math.max(1, deps.fps), image }
  } finally {
    capture.dispose()
  }
}

function defaultCanvas(): HTMLCanvasElement {
  try {
    return document.createElement('canvas')
  } catch {
    throw new Error('the preview surface cannot render in this frame')
  }
}
