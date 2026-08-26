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
  SLIDES_DIR,
  writeJson,
} from './store'
import { invalidateSlide } from '../virtual/slides'
import {
  deleteAsset,
  isAssetScope,
  isSafeAssetName,
  listAssets,
  mimeForName,
  renameAsset,
  writeAsset,
  assetExists,
} from './assets-store'

type Handler = (req: {
  method: string
  path: string
  query: URLSearchParams
  body: () => Promise<unknown>
  bytes: () => Promise<Uint8Array>
  contentType: string
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

  // Source edits from the inspector and style panel, and slide create /
  // rename / delete / page operations.
  //
  // All of these rewrite a slide's TSX. In this port a slide is *app source*
  // compiled into the bundle (see src/virtual/slides.ts), and a sandboxed app
  // cannot write its own source — `fs` is scoped to project data, not the
  // project root. Writing the new source into storage would return a cheerful
  // 200 and change nothing on screen, which is worse than refusing, so these
  // say what actually has to happen instead.
  [
    /^\/__edit(\/batch)?$/,
    async () =>
      json(501, {
        error:
          'this app cannot edit its own slide sources: a slide is compiled app source, and a ' +
          'sandboxed app cannot write the project root. Edit src/slides/<id>/index.tsx through ' +
          'the Code surface or an agent — the build watcher rebuilds and the app reloads.',
      }),
  ],

  [
    /^\/__slides(\/.*)?$/,
    async ({ method, path }) => {
      const rest = path.replace(/^\/__slides\/?/, '')
      if (method === 'GET' && !rest) return json(200, { slides: await listSlideIds() })
      return json(501, {
        error:
          'creating, renaming, deleting or reordering a slide rewrites app source, which this ' +
          'app cannot do from inside the sandbox. Ask an agent to edit src/slides/, then re-run ' +
          'vendor/build-slide-manifest.mjs if a slide was added or removed.',
      })
    },
  ],

  // Per-slide asset files. Bytes live in project storage and reach the UI as
  // blob: URLs, which the iframe's img-src allows.
  [
    /^\/__assets(\/.*)?$/,
    async ({ method, path, query, body, bytes, contentType }) => {
      const rest = path.replace(/^\/__assets\/?/, '')
      const parts = rest.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
      const scope = parts[0] ?? ''
      if (!isAssetScope(scope)) return json(400, { error: 'invalid asset scope' })

      if (parts.length === 1) {
        if (method !== 'GET') return json(405, { error: 'unsupported asset operation' })
        return json(200, { assets: await listAssets(scope) })
      }

      const name = parts[1] ?? ''
      if (!isSafeAssetName(name)) return json(400, { error: 'invalid asset name' })

      // Upstream reports which slides reference an asset by scanning their
      // sources. Slides here are compiled app source that the app cannot read,
      // so the honest answer is "unknown", not a confident empty list.
      if (parts[2] === 'usages') return json(200, { usages: [], totalCount: 0, known: false })

      if (method === 'POST') {
        if (!query.has('overwrite') && (await assetExists(scope, name))) {
          return json(409, { error: 'asset already exists' })
        }
        const data = await bytes()
        if (data.byteLength === 0) return json(400, { error: 'empty upload' })
        const entry = await writeAsset(scope, name, data, contentType || mimeForName(name))
        return json(200, { ok: true, asset: entry })
      }

      if (method === 'PATCH') {
        const next = (await body()) as { name?: unknown }
        const to = typeof next.name === 'string' ? next.name : ''
        if (!isSafeAssetName(to)) return json(400, { error: 'invalid asset name' })
        if (to !== name && (await assetExists(scope, to))) {
          return json(409, { error: 'asset already exists' })
        }
        if (to !== name) await renameAsset(scope, name, to)
        return json(200, { ok: true, name: to })
      }

      if (method === 'DELETE') {
        await deleteAsset(scope, name)
        return json(200, { ok: true })
      }

      return json(405, { error: 'unsupported asset operation' })
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
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const contentType = (headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''

    // Uploads arrive as a File/Blob body; everything else is JSON.
    const bytes = async (): Promise<Uint8Array> => {
      const payload = init?.body ?? (input instanceof Request ? await input.clone().blob() : null)
      if (!payload) return new Uint8Array()
      if (payload instanceof Uint8Array) return payload
      if (payload instanceof ArrayBuffer) return new Uint8Array(payload)
      if (payload instanceof Blob) return new Uint8Array(await payload.arrayBuffer())
      if (typeof payload === 'string') return new TextEncoder().encode(payload)
      return new Uint8Array()
    }

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
        return await handler({
          method,
          path: url.pathname,
          query: url.searchParams,
          body,
          bytes,
          contentType,
        })
      } catch (err) {
        return json(500, { error: (err as Error).message })
      }
    }
    return json(404, { error: `no route for ${url.pathname}` })
  }
}
