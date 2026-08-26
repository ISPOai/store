// Upstream's app talks to its dev server over `/__*` HTTP routes. There is no
// server here, so those routes are answered in-process by patching `fetch`
// before the app mounts. Keeping the wire shapes identical is what lets the
// vendored UI stay unmodified — the app cannot tell the difference.
//
// Reads and writes land in project-scoped storage through the SDK, in the same
// layout an upstream workspace uses on disk.

import {
  FOLDERS_PATH,
  listDir,
  listSlideIds,
  readJson,
  readText,
  slideSourcePath,
  SLIDES_DIR,
  writeJson,
  writeText,
} from './store'
import { invalidateSlide, refreshSlideIndex } from '../virtual/slides'

type Handler = (req: {
  method: string
  path: string
  query: URLSearchParams
  body: () => Promise<unknown>
}) => Promise<Response>

const json = (status: number, value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const SLIDE_ID_RE = /^[a-z0-9][a-z0-9-]*$/

function notesPath(slideId: string): string {
  return `${SLIDES_DIR}/${slideId}/notes.json`
}

function designPath(slideId: string): string {
  return `${SLIDES_DIR}/${slideId}/design.json`
}

function commentsPath(slideId: string): string {
  return `${SLIDES_DIR}/${slideId}/comments.json`
}

const routes: Array<[RegExp, Handler]> = [
  // The app polls this to show connection state. Upstream reports the dev
  // server's health; here the "server" is this module, which is always up.
  [
    /^\/__server-status$/,
    async () => json(200, { ok: true, status: 'ready', restarting: false }),
  ],

  // Whole-workspace folder manifest.
  [
    /^\/__folders$/,
    async ({ method, body }) => {
      if (method === 'GET') {
        return json(200, await readJson(FOLDERS_PATH, { folders: [], assignments: {} }))
      }
      const next = (await body()) as Record<string, unknown>
      await writeJson(FOLDERS_PATH, {
        folders: Array.isArray(next.folders) ? next.folders : [],
        assignments:
          next.assignments && typeof next.assignments === 'object' ? next.assignments : {},
      })
      return json(200, { ok: true })
    },
  ],

  // Speaker notes, one file per slide, index-aligned with the page array.
  [
    /^\/__notes$/,
    async ({ method, query, body }) => {
      const slideId = query.get('slideId') ?? ''
      if (!SLIDE_ID_RE.test(slideId)) return json(400, { error: 'invalid slideId' })
      if (method === 'GET') return json(200, await readJson(notesPath(slideId), { notes: [] }))
      const next = (await body()) as Record<string, unknown>
      await writeJson(notesPath(slideId), { notes: Array.isArray(next.notes) ? next.notes : [] })
      return json(200, { ok: true })
    },
  ],

  // The design system a slide was last saved with.
  [
    /^\/__design$/,
    async ({ method, query, body }) => {
      const slideId = query.get('slideId') ?? ''
      if (!SLIDE_ID_RE.test(slideId)) return json(400, { error: 'invalid slideId' })
      if (method === 'GET') return json(200, await readJson(designPath(slideId), {}))
      await writeJson(designPath(slideId), await body())
      invalidateSlide(slideId)
      return json(200, { ok: true })
    },
  ],

  // Inline comment markers live in the slide source upstream; this port keeps
  // them beside it so a comment never rewrites the module.
  [
    /^\/__comments(\/.*)?$/,
    async ({ method, query, body, path }) => {
      const slideId = query.get('slideId') ?? ''
      if (!SLIDE_ID_RE.test(slideId)) return json(400, { error: 'invalid slideId' })
      const stored = await readJson<{ comments: unknown[] }>(commentsPath(slideId), {
        comments: [],
      })
      if (method === 'GET') return json(200, stored)
      if (path.endsWith('/add')) {
        const next = (await body()) as Record<string, unknown>
        stored.comments.push(next)
        await writeJson(commentsPath(slideId), stored)
        return json(200, { ok: true })
      }
      if (method === 'DELETE') {
        const id = path.split('/').pop()
        const kept = stored.comments.filter((c) => (c as { id?: string })?.id !== id)
        await writeJson(commentsPath(slideId), { comments: kept })
        return json(200, { ok: true })
      }
      return json(405, { error: 'unsupported comment operation' })
    },
  ],

  // Source edits from the inspector and style panel.
  [
    /^\/__edit(\/batch)?$/,
    async ({ body }) => {
      const payload = (await body()) as { slideId?: string; source?: string }
      const slideId = payload.slideId ?? ''
      if (!SLIDE_ID_RE.test(slideId)) return json(400, { error: 'invalid slideId' })
      if (typeof payload.source !== 'string') {
        // The AST-splicing edit ops are vendored (src/editing) but not yet
        // wired to this route; a caller that sends splices rather than whole
        // source gets an honest refusal instead of a silent no-op.
        return json(501, { error: 'splice edits are not wired yet in this port' })
      }
      await writeText(slideSourcePath(slideId), payload.source)
      invalidateSlide(slideId)
      return json(200, { ok: true })
    },
  ],

  // Slide create / rename / delete, and the page-level operations.
  [
    /^\/__slides(\/.*)?$/,
    async ({ method, path, body }) => {
      const rest = path.replace(/^\/__slides\/?/, '')
      if (method === 'GET' && !rest) return json(200, { slides: await listSlideIds() })
      if (method === 'POST' && !rest) {
        const next = (await body()) as { id?: string; source?: string }
        const id = next.id ?? ''
        if (!SLIDE_ID_RE.test(id)) return json(400, { error: 'invalid slideId' })
        await writeText(slideSourcePath(id), next.source ?? STARTER_SLIDE)
        await refreshSlideIndex()
        return json(200, { ok: true, slideId: id })
      }
      if (rest.includes('/pages/') || rest.endsWith('/reorder') || rest.endsWith('/duplicate')) {
        // These rewrite the slide's TSX through upstream's AST ops, which need
        // `editing/slide-ops` adapted from node fs to the SDK first.
        return json(501, { error: 'page operations are not wired yet in this port' })
      }
      return json(404, { error: 'unknown slides route' })
    },
  ],

  // Per-slide asset files.
  [
    /^\/__assets(\/.*)?$/,
    async ({ method, path }) => {
      const rest = path.replace(/^\/__assets\/?/, '')
      const slideId = rest.split('/')[0] ?? ''
      if (!SLIDE_ID_RE.test(slideId)) return json(400, { error: 'invalid slideId' })
      if (method === 'GET') {
        const files = await listDir(`${SLIDES_DIR}/${slideId}/assets`)
        return json(200, { assets: files.map((name) => ({ name })) })
      }
      return json(501, { error: 'asset writes are not wired yet in this port' })
    },
  ],

  // Dev-server lifecycle and the package updater describe a process this host
  // does not run. Refusing plainly beats pretending to restart something.
  [
    /^\/__(restart-server|update-check|update-package)$/,
    async () => json(501, { error: 'the dev server does not exist in this host' }),
  ],

  // Icon search is an outbound call to svgl.app; this app declares no egress.
  [/^\/__svgl\/.*$/, async () => json(501, { error: 'icon search needs network access' })],
]

const STARTER_SLIDE = `import type { Page } from '@open-slide/core';

function Title() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
      <h1 style={{ fontSize: 120 }}>New slide</h1>
    </div>
  );
}

export default [Title] satisfies Page[];
`

/** Patch `fetch` so `/__*` is served in-process. Everything else is passed
 *  through untouched. */
export function installDevServerShim(): void {
  const original = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!raw.includes('/__')) return original(input as RequestInfo, init)
    const url = new URL(raw, globalThis.location.href)
    if (!url.pathname.startsWith('/__')) return original(input as RequestInfo, init)

    const method = (init?.method ?? (input as Request).method ?? 'GET').toUpperCase()
    const body = async (): Promise<unknown> => {
      const payload = init?.body
      if (typeof payload === 'string') {
        try {
          return JSON.parse(payload)
        } catch {
          return {}
        }
      }
      if (input instanceof Request) {
        try {
          return await input.clone().json()
        } catch {
          return {}
        }
      }
      return {}
    }

    for (const [pattern, handler] of routes) {
      if (!pattern.test(url.pathname)) continue
      try {
        return await handler({ method, path: url.pathname, query: url.searchParams, body })
      } catch (err) {
        return json(500, { error: (err as Error).message })
      }
    }
    return json(404, { error: `no route for ${url.pathname}` })
  }
}
