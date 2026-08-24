import { commands } from '@ispo/sdk'
import { boardPath } from './shared-paths'
import type { BoardItem, BoardState } from './types'

// The one code-first use case this app exposes to the host: read back what the
// board holds. It reads the same shared document `useBoard` persists, so it
// answers from durable state rather than from the mounted canvas — a host call
// is served identically whether or not the app is on screen.

const MAX_ITEMS = 200

function parseItems(raw: string): BoardItem[] {
  const doc = JSON.parse(raw) as Partial<BoardState>
  return Array.isArray(doc.items) ? (doc.items as BoardItem[]) : []
}

export const listBoardCommand = commands.define(
  {
    id: 'list-board',
    label: 'List board images',
    description:
      'List the images pinned to this moodboard, most recently added first, with their file names and sizes.',
    promptExamples: ["What's on my moodboard?", 'List my moodboard images'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 200 },
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
          required: ['count', 'items'],
          properties: {
            count: { type: 'number' },
            items: {
              type: 'array',
              maxItems: 200,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'name', 'bytes', 'addedAt'],
                properties: {
                  id: { type: 'string', minLength: 1, maxLength: 512 },
                  name: { type: 'string', maxLength: 512 },
                  mimeType: { type: 'string', maxLength: 128 },
                  bytes: { type: 'number' },
                  addedAt: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['json'],
    aliases: ['moodboard contents'],
  },
  async (input, ctx) => {
    // A board that was never saved is the ordinary first-run empty state, not
    // an error: report zero items rather than failing the invocation.
    let items: BoardItem[] = []
    try {
      items = parseItems(await ctx.sdk.shared.read(boardPath()))
    } catch {
      items = []
    }

    const limit = Math.min(input.limit ?? MAX_ITEMS, MAX_ITEMS)
    const newestFirst = [...items].sort((left, right) => right.addedAt - left.addedAt)
    return {
      kind: 'json' as const,
      data: {
        count: items.length,
        items: newestFirst.slice(0, limit).map((item) => ({
          id: item.id,
          name: item.originalName,
          mimeType: item.mimeType,
          bytes: item.bytes,
          addedAt: item.addedAt,
        })),
      },
    }
  },
)

export const projectCommands = commands.expose([listBoardCommand])

// The board document is the whole service: nothing has to hydrate before a host
// call can be served, so the bundle is ready as soon as this module registers.
projectCommands.ready()
