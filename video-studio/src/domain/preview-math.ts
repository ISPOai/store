// Pure preview geometry: frame snapping and bounded scaling for the
// render-preview path. Kept domain-side so the math is testable without the
// engine's rendering surface.
export const PREVIEW_MAX_WIDTH = 640

/** The JPEG data URL the preview command returns is refused above this. */
export const PREVIEW_MAX_DATA_URL_CHARS = 2_000_000

/** The frame index a preview at `seconds` shows, snapped like the playhead. */
export function previewFrameAt(fps: number, seconds: number): number {
  return Math.max(0, Math.round(Math.max(0, seconds) * Math.max(1, fps)))
}

export interface PreviewSize {
  readonly width: number
  readonly height: number
}

/** The pixel size a stage renders at within `maxWidth`, never upscaled. */
export function previewSize(
  stage: { width: number; height: number },
  maxWidth: number,
): PreviewSize {
  const capped = Math.max(1, Math.min(maxWidth, Math.max(1, stage.width)))
  const scale = capped / Math.max(1, stage.width)
  return { width: Math.round(capped), height: Math.max(1, Math.round(stage.height * scale)) }
}
