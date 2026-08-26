// The host requires every store app to expose a command catalog; store installs
// build with `requireProjectCommands` on. Handlers are headless and reach
// storage through `ctx.sdk`, never the ambient SDK.

import { commands } from '@ispo/sdk'
import { listSlideIds, slideSourcePath } from '../runtime/store'

export const listSlidesCommand = commands.define(
  {
    id: 'list-slides',
    label: 'List slides',
    description: 'List the slide decks in this workspace.',
    promptExamples: ['What slides do I have?'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { limit: { type: 'number', minimum: 1, maximum: 200 } },
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
          required: ['count', 'slides'],
          properties: {
            count: { type: 'number' },
            slides: { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 128 } },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['json'],
  },
  async (input, ctx) => {
    let entries: string[] = []
    try {
      entries = await ctx.sdk.fs.list('slides')
    } catch {
      entries = []
    }
    const slides = entries
      .map((entry) => entry.replace(/\/$/, ''))
      .filter((entry) => entry && !entry.startsWith('.') && !entry.includes('.'))
      .sort()
    const limit = Math.min(input.limit ?? 200, 200)
    return { kind: 'json' as const, data: { count: slides.length, slides: slides.slice(0, limit) } }
  },
)

export const createSlideCommand = commands.define(
  {
    id: 'create-slide',
    label: 'Create slide',
    description:
      'Create a slide deck from TSX source. The source must default-export an array of React page components, exactly as an Open Slide deck does.',
    promptExamples: ['Make a deck about…'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'source'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 128 },
        source: { type: 'string', minLength: 1, maxLength: 200000 },
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
          required: ['id'],
          properties: { id: { type: 'string', maxLength: 128 } },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['json'],
  },
  async (input, ctx) => {
    const id = input.id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
    if (!id) throw new Error('a slide id must contain at least one letter or digit')
    await ctx.sdk.fs.write(slideSourcePath(id), input.source)
    return { kind: 'json' as const, data: { id } }
  },
)

export const projectCommands = commands.expose([listSlidesCommand, createSlideCommand])

projectCommands.ready()

// Referenced so bundlers keep the storage helper next to the command that uses
// it even when tree-shaking is aggressive.
void listSlideIds
