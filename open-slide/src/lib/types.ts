import type { DesignPresetName } from './design'

// Upstream open-slide pages are arbitrary React components compiled by its own
// Vite runtime. An ISPO project is built by the host from a fixed entry, so a
// deck here is DATA rendered by bundled layouts instead of source compiled per
// deck. The trade: a page can no longer be anything, but a deck can be created,
// stored, and read back through the host's ordinary planes — which is what lets
// an agent author one through a project command.

export type Block =
  | { kind: 'eyebrow'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'body'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'quote'; text: string; attribution?: string }
  | { kind: 'code'; text: string }
  | { kind: 'metric'; value: string; caption?: string }

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
  pages: DeckPage[]
  createdAt: string
  updatedAt: string
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
