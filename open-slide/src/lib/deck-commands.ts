import { commands } from '@ispo/sdk'
import { allocateDeckId, listDecks, writeDeck } from './deck-store'
import type { Block, Deck, DeckPage, PageLayout } from './types'

// Upstream's pitch is that a coding agent writes the deck. Upstream spends a
// CLI and a file watcher on that; here it is one command — the deck is data, so
// an agent can author a whole deck without the app being open, and the next
// open renders it.
//
// Both handlers reach durable state through `ctx.sdk`, never the ambient SDK
// singleton, so a host invocation carries its attribution down to the fs leaf.

const MAX_PAGES = 60
const MAX_BLOCKS = 12
const LAYOUTS: PageLayout[] = ['title', 'content', 'section', 'statement']

type RawBlock = {
  kind: string
  text?: string
  items?: string[]
  attribution?: string
  value?: string
  caption?: string
}

/**
 * Narrow one authored block onto the union the renderer knows. An unknown kind
 * or a block missing its required field is dropped rather than rendered as an
 * empty box — a page with fewer blocks still presents; a broken one does not.
 */
function toBlock(raw: RawBlock): Block | null {
  switch (raw.kind) {
    case 'eyebrow':
    case 'heading':
    case 'subheading':
    case 'body':
    case 'code':
      return raw.text ? { kind: raw.kind, text: raw.text } : null
    case 'bullets': {
      const items = (raw.items ?? []).filter((item) => item.length > 0)
      return items.length > 0 ? { kind: 'bullets', items } : null
    }
    case 'quote':
      return raw.text
        ? {
            kind: 'quote',
            text: raw.text,
            ...(raw.attribution ? { attribution: raw.attribution } : {}),
          }
        : null
    case 'metric':
      return raw.value
        ? { kind: 'metric', value: raw.value, ...(raw.caption ? { caption: raw.caption } : {}) }
        : null
    default:
      return null
  }
}

export const createDeckCommand = commands.define(
  {
    id: 'create-deck',
    label: 'Create deck',
    description:
      'Create a slide deck from a title and a list of pages. Each page picks a layout and carries blocks — heading, body, bullets, quote, code, or metric.',
    promptExamples: ['Make a deck about…', 'Turn this outline into slides'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'pages'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 160 },
        design: { type: 'string', enum: ['default', 'midnight'] },
        pages: {
          type: 'array',
          minItems: 1,
          maxItems: 60,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['layout', 'blocks'],
            properties: {
              layout: { type: 'string', enum: ['title', 'content', 'section', 'statement'] },
              notes: { type: 'string', maxLength: 2000 },
              blocks: {
                type: 'array',
                minItems: 1,
                maxItems: 12,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['kind'],
                  properties: {
                    kind: {
                      type: 'string',
                      enum: [
                        'eyebrow',
                        'heading',
                        'subheading',
                        'body',
                        'bullets',
                        'quote',
                        'code',
                        'metric',
                      ],
                    },
                    text: { type: 'string', maxLength: 2000 },
                    items: {
                      type: 'array',
                      maxItems: 12,
                      items: { type: 'string', minLength: 1, maxLength: 300 },
                    },
                    attribution: { type: 'string', maxLength: 200 },
                    value: { type: 'string', maxLength: 40 },
                    caption: { type: 'string', maxLength: 200 },
                  },
                },
              },
            },
          },
        },
      },
    },
    resultSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'data'],
      properties: {
        kind: { const: 'json' },
        data: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'title', 'pageCount'],
          properties: {
            id: { type: 'string', minLength: 1, maxLength: 64 },
            title: { type: 'string', maxLength: 160 },
            pageCount: { type: 'number' },
            droppedBlocks: { type: 'number' },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['json'],
    aliases: ['new deck', 'make slides'],
  },
  async (input, ctx) => {
    const existing = await listDecks()
    const id = await allocateDeckId(
      input.title,
      existing.map((deck) => deck.id),
    )

    let dropped = 0
    const pages: DeckPage[] = []
    for (const rawPage of input.pages.slice(0, MAX_PAGES)) {
      const blocks: Block[] = []
      for (const rawBlock of (rawPage.blocks ?? []).slice(0, MAX_BLOCKS)) {
        const block = toBlock(rawBlock as RawBlock)
        if (block) blocks.push(block)
        else dropped += 1
      }
      if (blocks.length === 0) continue
      const layout = LAYOUTS.includes(rawPage.layout as PageLayout)
        ? (rawPage.layout as PageLayout)
        : 'content'
      pages.push({ layout, blocks, ...(rawPage.notes ? { notes: rawPage.notes } : {}) })
    }

    if (pages.length === 0) {
      throw new Error('every page was empty once its blocks were validated')
    }

    // Timestamps come from the handler, not the caller: they order the library
    // and must not be something an authoring prompt can backdate.
    const now = new Date().toISOString()
    const deck: Deck = {
      schemaVersion: 1,
      id,
      title: input.title,
      design: input.design === 'midnight' ? 'midnight' : 'default',
      pages,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.sdk.fs.write(`decks/${id}.json`, `${JSON.stringify(deck, null, 2)}\n`)

    return {
      kind: 'json' as const,
      data: { id, title: deck.title, pageCount: pages.length, droppedBlocks: dropped },
    }
  },
)

export const listDecksCommand = commands.define(
  {
    id: 'list-decks',
    label: 'List decks',
    description: 'List the slide decks saved in this app, most recently updated first.',
    promptExamples: ['What decks do I have?'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
    },
    resultSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'data'],
      properties: {
        kind: { const: 'json' },
        data: {
          type: 'object',
          additionalProperties: false,
          required: ['count', 'decks'],
          properties: {
            count: { type: 'number' },
            decks: {
              type: 'array',
              maxItems: 100,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'title', 'pageCount', 'updatedAt'],
                properties: {
                  id: { type: 'string', minLength: 1, maxLength: 64 },
                  title: { type: 'string', maxLength: 160 },
                  pageCount: { type: 'number' },
                  updatedAt: { type: 'string', maxLength: 64 },
                },
              },
            },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['json'],
    aliases: ['my decks'],
  },
  async (input, ctx) => {
    // Read through the scoped facade so the listing is attributable too, then
    // reuse the store's parsing rather than duplicating it here.
    let entries: string[] = []
    try {
      entries = await ctx.sdk.fs.list('decks')
    } catch {
      entries = []
    }

    const decks: Array<{ id: string; title: string; pageCount: number; updatedAt: string }> = []
    for (const entry of entries) {
      if (!entry.endsWith('.json') || entry.endsWith('/')) continue
      try {
        const parsed: unknown = JSON.parse(await ctx.sdk.fs.read(`decks/${entry}`))
        const deck = parsed as Deck
        if (!deck || typeof deck.id !== 'string' || !Array.isArray(deck.pages)) continue
        decks.push({
          id: deck.id,
          title: typeof deck.title === 'string' ? deck.title : deck.id,
          pageCount: deck.pages.length,
          updatedAt: typeof deck.updatedAt === 'string' ? deck.updatedAt : '',
        })
      } catch {
        // Skip an unreadable deck rather than failing the whole listing.
      }
    }

    decks.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
    const limit = Math.min(input.limit ?? 100, 100)
    return {
      kind: 'json' as const,
      data: { count: decks.length, decks: decks.slice(0, limit) },
    }
  },
)

export const projectCommands = commands.expose([createDeckCommand, listDecksCommand])

// Both handlers read and write files directly — there is no React-owned state to
// hydrate first, so the bundle can serve host calls as soon as this module runs.
projectCommands.ready()
