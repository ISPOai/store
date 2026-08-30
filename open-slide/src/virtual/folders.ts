// Replaces `virtual:open-slide/folders`. Upstream inlines
// `slides/.folders.json` at build time; here it is read from project storage
// before the app mounts and kept in this module's shape.

import type { FoldersManifest } from '@/lib/sdk'
import { FOLDERS_PATH, readJson } from '../runtime/store'

const EMPTY: FoldersManifest = { folders: [], assignments: {} }

let manifest: FoldersManifest = EMPTY

export async function refreshFolders(): Promise<FoldersManifest> {
  const loaded = await readJson<FoldersManifest>(FOLDERS_PATH, EMPTY)
  manifest = {
    folders: Array.isArray(loaded.folders) ? loaded.folders : [],
    assignments: loaded.assignments && typeof loaded.assignments === 'object' ? loaded.assignments : {},
  }
  return manifest
}

export default new Proxy(EMPTY, {
  get: (_target, prop) => manifest[prop as keyof FoldersManifest],
}) as FoldersManifest
