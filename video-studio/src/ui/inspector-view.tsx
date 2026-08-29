// The inspector: edits the selected clip's authored props. The field list
// rebuilds whenever the selection or the timeline layout changes (the layout
// read doubles as the version tick), and each field commits on change.
// Numeric fields carry the domain vocabulary's own min/max and clamp before
// committing, so a typed value can never drift outside what restore parses.
import { createEffect, type JSX } from 'solid-js'
import type { AppController } from '../app/app-controller.ts'
import type { ClipKind } from '../editor/timeline-model.ts'
import { numericPropBounds } from '../domain/schema.ts'

interface FieldSpec {
  readonly label: string
  readonly name: string
  readonly kind: 'text' | 'number'
  readonly step?: string
}

const FIELDS: readonly FieldSpec[] = [
  { label: 'Name', name: 'name', kind: 'text' },
  { label: 'X', name: 'x', kind: 'number', step: '1' },
  { label: 'Y', name: 'y', kind: 'number', step: '1' },
  { label: 'Width', name: 'width', kind: 'number', step: '1' },
  { label: 'Height', name: 'height', kind: 'number', step: '1' },
  { label: 'Start', name: 'start', kind: 'number', step: '0.1' },
  { label: 'End', name: 'end', kind: 'number', step: '0.1' },
  { label: 'Volume', name: 'volume', kind: 'number', step: '0.5' },
]

function makeField(
  controller: AppController,
  field: FieldSpec,
  kind: ClipKind,
  value: string | number | boolean,
): HTMLElement {
  const row = document.createElement('label')
  row.className = 'flex items-center justify-between gap-3'
  const label = document.createElement('span')
  label.className = 'text-xs text-muted-foreground'
  label.textContent = field.label
  const input = document.createElement('input')
  input.dataset.prop = field.name
  input.type = field.kind
  input.step = field.step ?? 'any'
  input.value = String(value)
  input.className = 'w-32 rounded-md border border-border bg-secondary px-2 py-1 font-mono text-xs'
  const bounds = field.kind === 'number' ? numericPropBounds(kind, field.name) : null
  if (bounds !== null) {
    input.min = String(bounds.min)
    input.max = String(bounds.max)
  }
  input.addEventListener('change', () => {
    if (field.kind !== 'number') {
      controller.setPropFromField(field.name, input.value)
      return
    }
    const next = Number(input.value)
    if (!Number.isFinite(next)) return
    const committed = bounds === null ? next : Math.min(bounds.max, Math.max(bounds.min, next))
    if (committed !== next) input.value = String(committed)
    controller.setPropFromField(field.name, committed)
  })
  row.append(label, input)
  return row
}

function makeTextField(controller: AppController, initial: string): HTMLElement {
  const wrap = document.createElement('label')
  wrap.className = 'flex flex-col gap-1'
  const label = document.createElement('span')
  label.className = 'text-xs text-muted-foreground'
  label.textContent = 'Text'
  const area = document.createElement('textarea')
  area.dataset.prop = 'text'
  area.rows = 3
  area.value = initial
  area.className = 'w-full rounded-md border border-border bg-secondary px-2 py-1 font-mono text-xs'
  area.addEventListener('change', () => {
    controller.setTextFromField(area.value)
  })
  wrap.append(label, area)
  return wrap
}

export function InspectorView(props: { controller: AppController }): JSX.Element {
  let fieldsPane: HTMLDivElement | undefined
  let caption: HTMLSpanElement | undefined

  createEffect(() => {
    if (!fieldsPane || !caption) return
    const selection = props.controller.selection()
    // Reading the layout keeps the fields in step with previewed drags.
    props.controller.rows()
    if (selection === null) {
      caption.textContent = 'No selection'
      fieldsPane.replaceChildren()
      return
    }
    caption.textContent = selection.name
    const authored = props.controller.selectedProps()
    const built: HTMLElement[] = []
    for (const field of FIELDS) {
      const value = authored[field.name]
      if (value === undefined) continue
      built.push(makeField(props.controller, field, selection.kind, value))
    }
    if (selection.kind === 'text') {
      built.push(makeTextField(props.controller, props.controller.selectedText()))
    }
    fieldsPane.replaceChildren(...built)
  })

  return (
    <section class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium">Inspector</h2>
        <span ref={(element) => (caption = element)} class="font-mono text-xs text-muted-foreground" />
      </div>
      <div ref={(element) => (fieldsPane = element)} data-inspector-fields class="flex flex-col gap-2" />
    </section>
  )
}
