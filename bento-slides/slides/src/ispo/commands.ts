// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// ISPO PORT — the project command catalog (spec §25).
//
// Every ISPO store app must export a code-first command catalog; store installs
// build with `requireProjectCommands` on and fail without one. It is not
// paperwork: these are the four things an agent or another project can ask a
// deck to do without a human driving the editor.
//
// THE RULE THESE FOLLOW is that a handler is HEADLESS. It never touches the
// editor, the canvas, or the mounted document — it reads the deck from disk
// through `ctx.sdk.fs`, works on the JSON, and writes it back. So a host call
// is served identically whether the app is on screen, in a background frame,
// or was never opened in this session. That is also why they use `ctx.sdk`
// rather than the ambient SDK import: the scoped facade carries the host's
// invocation attribution, and the ambient one drops it.
//
// The editor picks up on-disk changes when the frame regains focus (see
// slides/src/editor/editor.ts, `reloadIfChangedOnDisk`), so a command run
// while the app is open does not fight the open document.

import { commands } from '@ispo/sdk'
import type { ProjectCommandSdk } from '@ispo/sdk'
import {
  emptySlide,
  newDoc,
  parseDoc,
  uid,
  FONT_STACK,
  type BentoDoc,
  type Slide,
  type TextElement,
} from '../model'
import { validateDoc } from '../validate'
import { DECK_DIR, DECK_EXT, sanitize } from '../../../ispo/src/store.ts'

type Sdk = ProjectCommandSdk

const SESSION = 'session.json'
const MAX_ROWS = 200

const isMissing = (err: unknown): boolean =>
  (err instanceof Error ? err.message : String(err ?? '')).includes('not found:')

/** Plain text of a text element, tags stripped — what a slide is "called". */
function plainText(el: TextElement): string {
  return el.html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A slide's title: its own name, else the largest text on it. Same rule a
 * reader's eye uses — biggest type is the heading.
 *
 * Two things are excluded, and both were found by running this against the
 * real starter deck rather than reasoned about:
 *
 *   · FURNITURE. Page numerals and running heads are often set large, and one
 *     slide's outline came back as its page number. The same 3%-of-canvas
 *     area test the deck validator uses for "small chrome" excludes them.
 *   · TEMPLATE TOKENS. `{{page:2}}` and friends are placeholders the renderer
 *     substitutes; the literal source text is never what a slide is called.
 */
function slideTitle(slide: Slide, doc: BentoDoc): string {
  if (slide.name) return slide.name
  const canvas = doc.size.width * doc.size.height
  let best: TextElement | null = null
  for (const el of slide.elements) {
    if (el.type !== 'text') continue
    const text = el as TextElement
    if (el.w * el.h < canvas * 0.03) continue // furniture
    const plain = plainText(text)
    if (!plain || /^\{\{[^}]*\}\}$/.test(plain)) continue
    if (!best || text.fontSize > best.fontSize || (text.fontSize === best.fontSize && el.y < best.y)) {
      best = text
    }
  }
  return best ? plainText(best).slice(0, 120) : ''
}

async function readJson(sdk: Sdk, path: string): Promise<string | null> {
  try {
    return await sdk.fs.read(path)
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
}

/** The deck the app has open, or the only/first one if the pointer is stale. */
async function openDeckPath(sdk: Sdk): Promise<string | null> {
  const raw = await readJson(sdk, SESSION)
  if (raw) {
    try {
      const pointer = (JSON.parse(raw) as { deck?: unknown }).deck
      if (typeof pointer === 'string' && (await readJson(sdk, pointer)) !== null) return pointer
    } catch {
      /* fall through to the directory */
    }
  }
  let entries: string[]
  try {
    entries = await sdk.fs.list(DECK_DIR)
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
  const decks = entries.filter((n) => n.endsWith(DECK_EXT)).sort((a, b) => a.localeCompare(b))
  return decks.length ? `${DECK_DIR}/${decks[0]}` : null
}

interface OpenDeck {
  path: string
  doc: BentoDoc
}

/**
 * Load the open deck for a command.
 *
 * An ENCRYPTED deck is refused rather than half-answered: its body is a
 * bento/enc envelope and the password lives only in the reader's session, so
 * there is nothing here to read and saying so is the only honest answer.
 */
async function loadOpenDeck(sdk: Sdk): Promise<OpenDeck | null> {
  const path = await openDeckPath(sdk)
  if (!path) return null
  const body = await readJson(sdk, path)
  if (body === null) return null
  const doc = parseDoc(body)
  if (!doc) {
    throw new Error(
      body.includes('"bento/enc"')
        ? 'That deck is password-protected — open it in the app to unlock it first.'
        : 'That deck could not be parsed as a bento/slides document.',
    )
  }
  return { path, doc }
}

async function writeDoc(sdk: Sdk, path: string, doc: BentoDoc): Promise<void> {
  doc.modified = new Date().toISOString()
  await sdk.fs.write(path, JSON.stringify(doc))
}

// --- list-slides ------------------------------------------------------------

export const listSlidesCommand = commands.define(
  {
    id: 'list-slides',
    label: 'List slides',
    description:
      'Outline the deck that is open in Bento Slides: its title, how many slides it has, and each slide’s heading and speaker notes.',
    promptExamples: ['What’s in my deck?', 'List the slides in Bento', 'Outline my presentation'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        // WORKAROUND — host behaviour, not an input this handler reads.
        // `agentSession.invoke-capability-from-chat` (the @-mention path) sends
        // `input: { instruction: <the typed text> }` UNCONDITIONALLY, whatever
        // the command declared (apps/desktop/src/main/ipc/capability-mention-invoke.ts).
        // A correctly-closed schema therefore rejects its own invocation with
        // `schema-invalid`. Declaring the field is the only way to be callable
        // from a mention today. Remove it when the host stops injecting it.
        instruction: { type: 'string', maxLength: 4000 },
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
          required: ['deck', 'count', 'slides'],
          properties: {
            deck: { type: 'string', maxLength: 512 },
            title: { type: 'string', maxLength: 512 },
            count: { type: 'number' },
            slides: {
              type: 'array',
              maxItems: 200,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['index', 'id', 'title'],
                properties: {
                  index: { type: 'number' },
                  id: { type: 'string', maxLength: 256 },
                  title: { type: 'string', maxLength: 256 },
                  notes: { type: 'string', maxLength: 2000 },
                  hidden: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['json'],
    aliases: ['deck outline'],
  },
  async (input, ctx) => {
    const open = await loadOpenDeck(ctx.sdk)
    if (!open) {
      // No deck yet is the ordinary first-run state, not a failure.
      return { kind: 'json' as const, data: { deck: '', count: 0, slides: [] } }
    }
    const limit = Math.min(input.limit ?? MAX_ROWS, MAX_ROWS)
    return {
      kind: 'json' as const,
      data: {
        deck: open.path,
        title: open.doc.title,
        count: open.doc.slides.length,
        slides: open.doc.slides.slice(0, limit).map((slide, index) => ({
          index,
          id: slide.id,
          title: slideTitle(slide, open.doc),
          notes: (slide.notes ?? '').slice(0, 2000),
          hidden: !!slide.hidden,
        })),
      },
    }
  },
)

// --- add-slide --------------------------------------------------------------

/** A heading + optional bullet body, laid out on the deck's own canvas size. */
function composeSlide(doc: BentoDoc, title: string, bullets: string[]): Slide {
  const { width, height } = doc.size
  const pad = Math.round(width * 0.075)
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const base = {
    fontFamily: doc.theme.fontFamily || FONT_STACK,
    color: doc.theme.color,
    align: 'left' as const,
    valign: 'top' as const,
    lineHeight: 1.25,
    rotation: 0,
    opacity: 1,
  }
  const elements: TextElement[] = [
    {
      ...base,
      id: uid('el'),
      type: 'text',
      x: pad,
      y: Math.round(height * 0.16),
      w: width - pad * 2,
      h: Math.round(height * 0.16),
      html: escape(title),
      fontSize: Math.round(height * 0.083),
      fontWeight: 700,
    },
  ]
  if (bullets.length) {
    elements.push({
      ...base,
      id: uid('el'),
      type: 'text',
      x: pad,
      y: Math.round(height * 0.36),
      w: width - pad * 2,
      h: Math.round(height * 0.46),
      html: bullets.map((b) => `• ${escape(b)}`).join('<br>'),
      fontSize: Math.round(height * 0.042),
      fontWeight: 400,
      lineHeight: 1.6,
    })
  }
  return emptySlide({
    background: doc.theme.background,
    elements: elements as unknown as Slide['elements'],
  })
}

export const addSlideCommand = commands.define(
  {
    id: 'add-slide',
    label: 'Add a slide',
    description:
      'Add a slide with a heading and optional bullet points to the deck that is open in Bento Slides. Writes it to the deck on disk.',
    promptExamples: [
      'Add a slide called Q3 results to my deck',
      'Add a closing slide with three bullets',
    ],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        bullets: {
          type: 'array',
          maxItems: 12,
          items: { type: 'string', minLength: 1, maxLength: 300 },
        },
        notes: { type: 'string', maxLength: 2000 },
        position: { type: 'integer', minimum: 0, maximum: 999 },
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
          required: ['deck', 'slideId', 'index', 'count'],
          properties: {
            deck: { type: 'string', maxLength: 512 },
            slideId: { type: 'string', maxLength: 256 },
            index: { type: 'number' },
            count: { type: 'number' },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['json'],
  },
  async (input, ctx) => {
    const open = await loadOpenDeck(ctx.sdk)
    if (!open) throw new Error('There is no deck to add a slide to — open Bento Slides first.')
    const slide = composeSlide(open.doc, input.title, input.bullets ?? [])
    if (input.notes) slide.notes = input.notes
    const at = Math.min(input.position ?? open.doc.slides.length, open.doc.slides.length)
    open.doc.slides.splice(at, 0, slide)
    await writeDoc(ctx.sdk, open.path, open.doc)
    return {
      kind: 'json' as const,
      data: {
        deck: open.path,
        slideId: slide.id,
        index: at,
        count: open.doc.slides.length,
      },
    }
  },
)

// --- new-deck ---------------------------------------------------------------

export const newDeckCommand = commands.define(
  {
    id: 'new-deck',
    label: 'Start a new deck',
    description:
      'Create a new Bento Slides deck with a title and, optionally, one slide per heading you give. It becomes the deck the app opens.',
    promptExamples: [
      'Start a new deck called Roadmap',
      'Make me a deck about onboarding with slides for intro, setup and next steps',
    ],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        slideTitles: {
          type: 'array',
          maxItems: 40,
          items: { type: 'string', minLength: 1, maxLength: 200 },
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
          required: ['deck', 'title', 'count'],
          properties: {
            deck: { type: 'string', maxLength: 512 },
            title: { type: 'string', maxLength: 512 },
            count: { type: 'number' },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['json'],
  },
  async (input, ctx) => {
    const doc = newDoc()
    doc.title = input.title
    const headings = input.slideTitles ?? []
    if (headings.length) {
      doc.slides = headings.map((heading) => composeSlide(doc, heading, []))
    }
    // A name that is free. Two decks called "Roadmap" is a thing people do,
    // and the second must not land on top of the first.
    let taken: string[] = []
    try {
      taken = await ctx.sdk.fs.list(DECK_DIR)
    } catch (err) {
      if (!isMissing(err)) throw err
    }
    const base = sanitize(doc.title)
    let name = `${base}${DECK_EXT}`
    for (let n = 2; taken.includes(name) && n < 1000; n++) name = `${base}-${n}${DECK_EXT}`
    const path = `${DECK_DIR}/${name}`
    await writeDoc(ctx.sdk, path, doc)
    await ctx.sdk.fs.write(SESSION, `${JSON.stringify({ v: 1, deck: path })}\n`)
    return {
      kind: 'json' as const,
      data: { deck: path, title: doc.title, count: doc.slides.length },
    }
  },
)

// --- check-deck -------------------------------------------------------------

export const checkDeckCommand = commands.define(
  {
    id: 'check-deck',
    label: 'Check the deck',
    description:
      'Report what the deck that is open in Bento Slides gets wrong: unknown fields, elements off the canvas, broken links and asset references, effects that can never run, chart options the renderer ignores.',
    promptExamples: ['Check my deck for problems', 'Is anything broken in my presentation?'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        // WORKAROUND — host behaviour, not an input this handler reads.
        // `agentSession.invoke-capability-from-chat` (the @-mention path) sends
        // `input: { instruction: <the typed text> }` UNCONDITIONALLY, whatever
        // the command declared (apps/desktop/src/main/ipc/capability-mention-invoke.ts).
        // A correctly-closed schema therefore rejects its own invocation with
        // `schema-invalid`. Declaring the field is the only way to be callable
        // from a mention today. Remove it when the host stops injecting it.
        instruction: { type: 'string', maxLength: 4000 },
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
          required: ['deck', 'ok', 'errors', 'warnings', 'findings'],
          properties: {
            deck: { type: 'string', maxLength: 512 },
            ok: { type: 'boolean' },
            errors: { type: 'number' },
            warnings: { type: 'number' },
            findings: {
              type: 'array',
              maxItems: 200,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['code', 'severity', 'message'],
                properties: {
                  code: { type: 'string', maxLength: 64 },
                  severity: { type: 'string', maxLength: 16 },
                  message: { type: 'string', maxLength: 500 },
                  slide: { type: 'string', maxLength: 256 },
                  element: { type: 'string', maxLength: 256 },
                  path: { type: 'string', maxLength: 256 },
                },
              },
            },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['json'],
    aliases: ['validate deck'],
  },
  async (input, ctx) => {
    const open = await loadOpenDeck(ctx.sdk)
    if (!open) throw new Error('There is no deck to check — open Bento Slides first.')
    // `measure: false` keeps this handler headless. Text-overflow findings need
    // the real renderer and a laid-out DOM; a command may run with the app
    // never mounted, so it reports the checks it can actually make rather than
    // measuring against a document that is not on screen. The editor's own
    // validate surface (`window.bento.validate()`) still measures.
    const result = validateDoc(open.doc, { measure: false })
    const limit = Math.min(input.limit ?? MAX_ROWS, MAX_ROWS)
    return {
      kind: 'json' as const,
      data: {
        deck: open.path,
        ok: result.ok,
        errors: result.counts.error,
        warnings: result.counts.warning,
        findings: result.findings.slice(0, limit).map((f) => ({
          code: f.code,
          severity: f.severity,
          message: f.message.slice(0, 500),
          ...(f.slide ? { slide: f.slide } : {}),
          ...(f.element ? { element: f.element } : {}),
          ...(f.path ? { path: f.path } : {}),
        })),
      },
    }
  },
)

// --- export-deck --------------------------------------------------------------

export const exportDeckCommand = commands.define(
  {
    id: 'export-deck',
    label: 'Export the deck to Files',
    description:
      'Publish the deck that is open in Bento Slides into your Files library, where it can be shared or opened elsewhere. Returns the published Files entry.',
    promptExamples: [
      'Export my deck to Files',
      'Put the presentation in my Files so I can share it',
    ],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        // WORKAROUND — host behaviour, not an input this handler reads. See the
        // identical note on `list-slides`.
        instruction: { type: 'string', maxLength: 4000 },
      },
    },
    resultSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'refs'],
      properties: {
        kind: { const: 'files' },
        refs: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['publicId'],
            properties: {
              publicId: { type: 'string', minLength: 1, maxLength: 512 },
              path: { type: 'string', maxLength: 1024 },
            },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    // `files` is the §25 result channel for handing back a published artifact:
    // the caller receives a REF, never store access.
    resultChannels: ['files'],
    aliases: ['publish deck'],
  },
  async (input, ctx) => {
    const open = await loadOpenDeck(ctx.sdk)
    if (!open) throw new Error('There is no deck to export — open Bento Slides first.')
    const base = sanitize(input.name?.trim() || open.doc.title)
    // No `folder` argument on purpose. The host defaults a publish to the
    // PRODUCING PROJECT's own Files folder (`/Projects/Bento Slides`), which is
    // where a reader looking for this app's output goes first. Passing a folder
    // would nest it one level deeper, under that same bound folder.
    const published = await ctx.sdk.files.publish({
      content: JSON.stringify(open.doc),
      name: `${base}${DECK_EXT}`,
      mimeType: 'application/json',
    })
    return {
      kind: 'files' as const,
      refs: [{ publicId: published.publicId, path: published.path }],
    }
  },
)

export const projectCommands = commands.expose([
  listSlidesCommand,
  addSlideCommand,
  newDeckCommand,
  checkDeckCommand,
  exportDeckCommand,
])

// Nothing has to hydrate before a host call can be served — every handler
// reads the deck from disk on demand — so the bundle is ready as soon as this
// module registers.
projectCommands.ready()
