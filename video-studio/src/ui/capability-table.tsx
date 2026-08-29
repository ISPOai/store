// The truthful capability table: every row is a real probe result of THIS
// frame. Unsupported rows are named, never hidden, and never block editing.
// Accessor sources ride inside nested objects (see reactive.tsx for the
// solid-js/h rule).
import { createEffect, type JSX } from 'solid-js'
import type { CapabilityProbeRow } from '../capabilities/probes.ts'
import { ReactiveList, type ListSource } from './reactive.tsx'

export interface CapabilitySource {
  exportRows(): readonly CapabilityProbeRow[]
  playbackRows(): readonly CapabilityProbeRow[]
  exportBlocker(): string | null
}

function ProbeRows(props: { caption: string; rows: ListSource<CapabilityProbeRow> }): JSX.Element {
  return (
    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-medium">{props.caption}</h3>
      <ReactiveList
        container={`probes-${props.caption.toLowerCase()}`}
        list={props.rows}
        render={(row) => (
          <div class="flex items-center justify-between gap-4">
            <dt>{row.label}</dt>
            <dd data-probe={row.id} data-supported={row.supported ? 'true' : 'false'} class="text-muted-foreground">
              {row.value}
            </dd>
          </div>
        )}
      />
    </section>
  )
}

export function CapabilityTable(props: { source: CapabilitySource }): JSX.Element {
  let blocker: HTMLElement | undefined
  createEffect(() => {
    if (!blocker) return
    const caps = props.source.exportBlocker()
    blocker.textContent = caps ?? ''
    blocker.style.display = caps === null ? 'none' : 'block'
  })
  return (
    <div class="flex flex-col gap-4 rounded-md border border-border p-4" data-capability-panel>
      <ProbeRows caption="Playback" rows={{ items: () => props.source.playbackRows() }} />
      <ProbeRows caption="Export" rows={{ items: () => props.source.exportRows() }} />
      <p
        ref={(element) => (blocker = element)}
        data-capability-blocker
        style="display:none"
        class="rounded-md border border-border bg-secondary px-3 py-2 font-mono text-xs text-muted-foreground"
      />
    </div>
  )
}
