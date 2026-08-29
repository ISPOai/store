// The timeline: one row per engine layer, clips positioned by their timing,
// a ruler with the playhead, drag-to-move and edge-trim gestures, and
// click-to-select. All geometry math lives in timeline-model.ts.
import { createEffect, type JSX } from 'solid-js'
import type { AppController } from '../app/app-controller.ts'
import { formatTimecode, secondsToPx, type TimelineRow } from '../editor/timeline-model.ts'
import { LiveText, ReactiveList } from './reactive.tsx'

const PX_PER_SECOND = 90
const ROW_HEIGHT = 34

interface DragState {
  readonly kind: 'move' | 'trim-start' | 'trim-end'
  readonly row: TimelineRow
  readonly originSeconds: number
  readonly pointerStart: number
}

export function TimelineView(props: { controller: AppController }): JSX.Element {
  let playheadMark: HTMLDivElement | undefined
  let durationLabel: HTMLSpanElement | undefined
  let drag: DragState | null = null

  createEffect(() => {
    if (!playheadMark) return
    const playhead = props.controller.playhead()
    playheadMark.style.left = `${secondsToPx(playhead, PX_PER_SECOND)}px`
  })

  createEffect(() => {
    if (!durationLabel) return
    const layout = props.controller.rows()
    durationLabel.textContent = formatTimecode(layout.duration, props.controller.fps())
  })

  const beginDrag = (state: DragState, event: PointerEvent) => {
    drag = state
    const target = event.currentTarget
    if (target instanceof HTMLElement) target.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (drag === null) return
    const deltaSeconds = (event.clientX - drag.pointerStart) / PX_PER_SECOND
    if (drag.kind === 'move') {
      props.controller.moveClipPreview(drag.row, drag.originSeconds + deltaSeconds)
    } else {
      const edge = drag.kind === 'trim-start' ? 'start' : 'end'
      props.controller.trimClipPreview(drag.row, edge, drag.originSeconds + deltaSeconds)
    }
  }

  const endDrag = () => {
    if (drag === null) return
    drag = null
    props.controller.finishInteraction()
  }

  return (
    <div
      class="flex h-64 shrink-0 flex-col border-t border-border"
      data-timeline
      onpointermove={(event) => onPointerMove(event)}
      onpointerup={() => endDrag()}
      onpointercancel={() => endDrag()}
    >
      <div class="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span class="text-sm font-medium">Timeline</span>
        <span ref={(element) => (durationLabel = element)} class="font-mono text-xs text-muted-foreground" />
      </div>
      <div class="relative min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        <div style={`width:${secondsToPx(props.controller.rows().duration, PX_PER_SECOND) + 160}px`} class="relative">
          <div data-timeline-rows>
            <ReactiveList
              container="timeline"
              list={{ items: () => props.controller.rows().rows }}
              render={(row) => (
                <TimelineRowView
                  row={row}
                  interaction={{
                    isSelected: () => props.controller.selection()?.key === row.key,
                    select: () => props.controller.selectRow(row),
                    beginDrag: (kind, event) =>
                      beginDrag(
                        {
                          kind,
                          row,
                          originSeconds: kind === 'move' ? row.start : kind === 'trim-start' ? row.start : row.end,
                          pointerStart: event.clientX,
                        },
                        event,
                      ),
                  }}
                />
              )}
            />
          </div>
          <div
            ref={(element) => (playheadMark = element)}
            data-playhead
            class="pointer-events-none absolute top-0 bottom-0 w-px bg-foreground"
            style="left:0"
          />
        </div>
      </div>
    </div>
  )
}

/** Row-level signals and actions; nested so h leaves the members callable. */
interface RowInteraction {
  isSelected(): boolean
  select(): void
  beginDrag(kind: 'move' | 'trim-start' | 'trim-end', event: PointerEvent): void
}

function TimelineRowView(props: { row: TimelineRow; interaction: RowInteraction }): JSX.Element {
  const row = props.row
  const interaction = props.interaction
  let body: HTMLDivElement | undefined
  createEffect(() => {
    if (!body) return
    body.dataset.selected = interaction.isSelected() ? 'true' : 'false'
    body.style.left = `${secondsToPx(row.start, PX_PER_SECOND)}px`
    body.style.width = `${Math.max(8, secondsToPx(Math.max(0, row.end - row.start), PX_PER_SECOND))}px`
    body.style.marginLeft = `${row.depth * 16}px`
  })
  return (
    <div class="relative border-b hairline-dense" style={`height:${ROW_HEIGHT}px`}>
      <span class="absolute left-2 top-1 z-10 max-w-40 truncate font-mono text-xs text-muted-foreground">
        {row.name}
      </span>
      <div
        ref={(element) => (body = element)}
        data-clip={row.kind}
        data-clip-key={String(row.key)}
        class="absolute top-1.5 flex h-6 cursor-grab items-center justify-between rounded border border-border bg-popover px-1 text-xs"
        style="left:0;width:0"
        onclick={() => interaction.select()}
        onpointerdown={(event) => {
          if (event.button !== 0) return
          interaction.beginDrag('move', event)
        }}
      >
        <span
          data-handle="start"
          class="h-full w-1.5 cursor-ew-resize rounded-l bg-border"
          onpointerdown={(event) => {
            if (event.button !== 0) return
            event.stopPropagation()
            interaction.beginDrag('trim-start', event)
          }}
        />
        <span class="truncate px-1 font-mono text-[10px] text-muted-foreground">{row.kind}</span>
        <span
          data-handle="end"
          class="h-full w-1.5 cursor-ew-resize rounded-r bg-border"
          onpointerdown={(event) => {
            if (event.button !== 0) return
            event.stopPropagation()
            interaction.beginDrag('trim-end', event)
          }}
        />
      </div>
    </div>
  )
}
