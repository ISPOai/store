// Reactive authoring helpers for the esbuild automatic JSX runtime (no
// Babel transform). Under solid-js/h the jsx() call funnels through
// hyperscript `h`, which converts any ZERO-ARGUMENT function prop into a
// lazy value getter (`props.foo` already evaluates it) and leaves nested
// plain objects untouched. So the authoring rule this module enforces:
// accessors and zero-arg callbacks ride inside a nested holder object
// (`text: { read() }`, `list: { items() }`), multi-argument callbacks (like
// `render`) may ride bare, and DOM attribute handlers are unaffected.
import { createEffect, type JSX } from 'solid-js'
import { insert } from 'solid-js/web'

/** A reactive string source; see the module comment for why it nests. */
export interface TextSource {
  read(): string
}

/** A reactive list source; see the module comment for why it nests. */
export interface ListSource<T> {
  items(): readonly T[]
}

/**
 * A reactive list: `list.items` is read inside an effect that owns the
 * container, so the children rebuild when the underlying signal changes.
 * Re-renders are whole-list — right for the bounded lists this app shows
 * (timeline rows, capability probes, project rows).
 */
export function ReactiveList<T>(props: {
  container?: string
  list: ListSource<T>
  render: (item: T, index: number) => JSX.Element
}): JSX.Element {
  let parent: HTMLDivElement | undefined
  createEffect(() => {
    if (!parent) return
    const items = props.list.items()
    parent.replaceChildren()
    for (const [index, item] of items.entries()) {
      insert(parent, props.render(item, index))
    }
  })
  return <div ref={(element) => (parent = element)} data-list={props.container ?? ''} />
}

/** Reactive text: the source is read inside an effect that owns the node. */
export function LiveText(props: { text: TextSource }): JSX.Element {
  let node: HTMLSpanElement | undefined
  createEffect(() => {
    if (node) node.textContent = props.text.read()
  })
  return <span ref={(element) => (node = element)} />
}
