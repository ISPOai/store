// Replaces `virtual:open-slide/slides`.
//
// Upstream generates this module at build time by globbing the slides
// directory and emitting a dynamic `import()` per slide. Here the same three
// values and the same `loadSlide` contract are served from project storage,
// with the source compiled on demand (see ../runtime/slide-module).

import type { SlideModule } from '@/lib/sdk'
import { compileSlideModule } from '../runtime/slide-module'
import { listSlideIds, readJson, readSlideSource, slideSourcePath, SLIDES_DIR } from '../runtime/store'

type SlideIndex = {
  ids: string[]
  themes: Record<string, string>
  createdAt: Record<string, number>
}

const INDEX_PATH = `${SLIDES_DIR}/.index.json`

// Upstream can emit these synchronously because Vite has already walked the
// directory. Storage here is async, so the module exposes the last known index
// and refreshes it — `refreshSlideIndex()` is awaited by the entry before the
// app mounts, so the first render sees a populated list.
let index: SlideIndex = { ids: [], themes: {}, createdAt: {} }

export let slideIds: string[] = index.ids
export let slideThemes: Record<string, string> = index.themes
export let slideCreatedAt: Record<string, number> = index.createdAt

export async function refreshSlideIndex(): Promise<SlideIndex> {
  const ids = await listSlideIds()
  const stored = await readJson<Partial<SlideIndex>>(INDEX_PATH, {})
  const themes = { ...(stored.themes ?? {}) }
  const createdAt = { ...(stored.createdAt ?? {}) }
  for (const id of ids) if (!createdAt[id]) createdAt[id] = Date.now()
  index = { ids, themes, createdAt }
  slideIds = ids
  slideThemes = themes
  slideCreatedAt = createdAt
  return index
}

const cache = new Map<string, SlideModule>()

export function invalidateSlide(id: string): void {
  cache.delete(id)
}

export async function loadSlide(id: string): Promise<SlideModule> {
  const cached = cache.get(id)
  if (cached) return cached
  const source = await readSlideSource(id)
  if (source === null) throw new Error(`Slide not found: ${id}`)
  const compiled = compileSlideModule(source, slideSourcePath(id)) as unknown as SlideModule
  if (!Array.isArray(compiled.default)) {
    throw new Error(`Slide ${id} must default-export an array of page components`)
  }
  cache.set(id, compiled)
  return compiled
}
