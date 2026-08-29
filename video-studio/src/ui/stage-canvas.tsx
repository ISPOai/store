// The canvas stage: mounts the engine's render surface, keeps it sized to
// its container, and carries the transport (play/pause, scrub, timecode).
import { createEffect, onCleanup, type JSX } from 'solid-js'
import type { AppController } from '../app/app-controller.ts'
import { formatTimecode } from '../editor/timeline-model.ts'
import { LiveText } from './reactive.tsx'

export function StageCanvas(props: { controller: AppController }): JSX.Element {
  let canvas: HTMLCanvasElement | undefined
  let scrubber: HTMLInputElement | undefined
  let playLabel: HTMLSpanElement | undefined

  createEffect(() => {
    if (!canvas) return
    props.controller.attachCanvas(canvas)
    const observer = new ResizeObserver(() => props.controller.resize())
    observer.observe(canvas.parentElement ?? canvas)
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    const playing = props.controller.isPlaying()
    if (playLabel) playLabel.textContent = playing ? 'Pause' : 'Play'
  })

  createEffect(() => {
    if (!scrubber) return
    const layout = props.controller.rows()
    const playhead = props.controller.playhead()
    const max = Math.max(layout.duration, 1)
    scrubber.min = '0'
    scrubber.max = String(max)
    if (!scrubberMatchesPointer) scrubber.value = String(Math.min(playhead, max))
  })

  // While the user drags the scrubber the input owns the value; the engine
  // follows, and the playhead mirror must not fight the thumb.
  let scrubberMatchesPointer = false

  return (
    <div class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background p-4">
      <div class="relative flex h-full w-full items-center justify-center">
        <canvas
          ref={(element) => (canvas = element)}
          data-stage-canvas
          class="max-h-full max-w-full bg-[#161616] object-contain"
        />
      </div>
      <div class="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t border-border bg-card px-4 py-2">
        <button
          type="button"
          class="rounded-md border border-border px-2.5 py-1 text-sm hover-wash"
          onclick={() => props.controller.playOrPause()}
        >
          <span ref={(element) => (playLabel = element)}>Play</span>
        </button>
        <input
          ref={(element) => (scrubber = element)}
          data-scrubber
          type="range"
          min="0"
          max="1"
          step="any"
          value="0"
          onpointerdown={() => {
            scrubberMatchesPointer = true
          }}
          oninput={(event) => {
            props.controller.scrub(Number(event.currentTarget.value))
          }}
          onpointerup={() => {
            scrubberMatchesPointer = false
          }}
          class="min-w-0 flex-1"
        />
        <LiveText text={{ read: () => formatTimecode(props.controller.playhead(), props.controller.fps()) }} />
      </div>
    </div>
  )
}
