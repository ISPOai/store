// Headless timeline reading: flattens a composition document into addressed
// clip summaries. Shared by the inspect-timeline command and tests; no SDK
// or engine imports.
import type { AuthoredNode } from './schema.ts'
import { countOf, textOf } from './value-guards.ts'

export interface TimelineRowSummary {
  readonly path: readonly number[]
  readonly tag: string
  readonly name: string | null
  readonly start: number | null
  readonly end: number | null
}

export function inspectTimeline(document: {
  scenes: readonly AuthoredNode[]
}): readonly TimelineRowSummary[] {
  const rows: TimelineRowSummary[] = []
  const walk = (nodes: readonly AuthoredNode[], base: readonly number[]): void => {
    for (const [index, node] of nodes.entries()) {
      const path = [...base, index]
      rows.push({
        path,
        tag: node.tag,
        name: textOf(node.props['name']),
        start: countOf(node.props['start']),
        end: countOf(node.props['end']),
      })
      walk(node.children, path)
    }
  }
  walk(document.scenes, [])
  return rows
}

export interface ResolvedNode {
  readonly node: AuthoredNode
}

/** Resolves an addressed clip inside a composition document. */
export function resolveNode(
  scenes: readonly AuthoredNode[],
  path: readonly number[],
): ResolvedNode | null {
  if (path.length === 0) return null
  let children: readonly AuthoredNode[] = scenes
  let found: AuthoredNode | null = null
  for (const [depth, index] of path.entries()) {
    const candidate = children[index]
    if (candidate === undefined) return null
    found = candidate
    if (depth < path.length - 1) children = candidate.children
  }
  return found === null ? null : { node: found }
}
