// Project-scoped storage for the workspace upstream keeps on the dev server's
// filesystem. Same layout as an upstream workspace — `slides/<id>/index.tsx`,
// `slides/.folders.json`, `themes/<id>.md`, `slides/<id>/assets/*` — so a deck
// authored here has the same shape as one authored upstream.
//
// The host places all of this under `~/ISPO/.state/<projectId>/`.

import { fs } from '@ispo/sdk'

export const SLIDES_DIR = 'slides'
export const THEMES_DIR = 'themes'
export const FOLDERS_PATH = `${SLIDES_DIR}/.folders.json`

/** The SDK throws when a path is absent. An empty workspace is the ordinary
 *  first run, so absence is translated to "nothing yet" rather than an error. */
export function isMissing(err: unknown): boolean {
  const message = typeof err === 'string' ? err : ((err as { message?: unknown })?.message ?? '')
  return (
    typeof message === 'string' &&
    (message.includes('project file not found:') ||
      message.includes('project directory not found:'))
  )
}

export async function readText(path: string): Promise<string | null> {
  try {
    return await fs.read(path)
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
}

export async function writeText(path: string, contents: string): Promise<void> {
  await fs.write(path, contents)
}

export async function listDir(path: string): Promise<string[]> {
  try {
    return await fs.list(path)
  } catch (err) {
    if (isMissing(err)) return []
    throw err
  }
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  const raw = await readText(path)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    // A hand-edited file that no longer parses is skipped, not fatal — the
    // same tolerance upstream has for a broken workspace file.
    return fallback
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** Slide ids are directory names under `slides/`, excluding dotfiles. */
export async function listSlideIds(): Promise<string[]> {
  const entries = await listDir(SLIDES_DIR)
  return entries
    .map((entry) => entry.replace(/\/$/, ''))
    .filter((entry) => entry && !entry.startsWith('.') && !entry.includes('.'))
    .sort()
}

/** Saved design overrides live beside the slide's other project data. */
export function designPath(id: string): string {
  return `${SLIDES_DIR}/${id}/design.json`
}

export function slideSourcePath(id: string): string {
  return `${SLIDES_DIR}/${id}/index.tsx`
}

export async function readSlideSource(id: string): Promise<string | null> {
  return readText(slideSourcePath(id))
}
