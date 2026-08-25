import type { DesignPresetName } from './design'

// Upstream open-slide pages are arbitrary React components compiled by its own
// Vite runtime. An ISPO project is built by the host from a fixed entry, so a
// deck here is DATA rendered by bundled layouts instead of source compiled per
// deck. The trade: a page can no longer be anything, but a deck can be created,
// stored, and read back through the host's ordinary planes — which is what lets
// an agent author one through a project command.

/**
 * `step` stages a block's entrance: 0 (or absent) is on the page from the
 * start, 1 and up are revealed one keypress at a time. Upstream expresses this
 * as a `<Steps>` component inside a compiled page; against a data page it is a
 * number on the block, and the player advances through the steps before moving
 * to the next page.
 */
type Stepped = { step?: number }

export type Block = Stepped &
  (
  | { kind: 'eyebrow'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'body'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'quote'; text: string; attribution?: string }
  | { kind: 'code'; text: string }
  | { kind: 'metric'; value: string; caption?: string }
  )

/** How one page gives way to the next. Mirrors upstream's deck-level setting. */
export type DeckTransition = 'none' | 'fade' | 'slide'

export type PageLayout = 'title' | 'content' | 'section' | 'statement'

export type DeckPage = {
  layout: PageLayout
  blocks: Block[]
  /** Speaker notes — shown in the deck list, never on the canvas. */
  notes?: string
}

export type Deck = {
  schemaVersion: 1
  id: string
  title: string
  design: DesignPresetName
  transition?: DeckTransition
  pages: DeckPage[]
  createdAt: string
  updatedAt: string
}

/** Highest `step` on a page — how many keypresses it takes to finish it. */
export function maxStep(page: DeckPage): number {
  return page.blocks.reduce((max, block) => Math.max(max, block.step ?? 0), 0)
}

export const CANVAS_WIDTH = 1920
export const CANVAS_HEIGHT = 1080

/** A deck id is also its filename, so it stays a single safe path segment. */
export const DECK_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export function isDeck(value: unknown): value is Deck {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Partial<Deck>
  return (
    d.schemaVersion === 1 &&
    typeof d.id === 'string' &&
    typeof d.title === 'string' &&
    Array.isArray(d.pages)
  )
}
