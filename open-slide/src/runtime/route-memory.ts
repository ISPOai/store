// Keep the open deck across a rebuild.
//
// A source edit is applied by an agent and the project is rebuilt, which
// reloads this frame — and the host reloads it at `project://<projectId>/`
// with no fragment. The app routes on the hash, so an empty fragment lands on
// the deck catalog: you edit a line of a slide, wait for it to rebuild, and get
// thrown back to the index. Upstream never sees this because Vite's HMR patches
// the running page instead of navigating it.
//
// The distinction that matters is between "the reload dropped the fragment"
// (hash is empty — restore) and "the user is genuinely on the catalog" (hash is
// `#/` — leave it). Saving every route including `#/` is what keeps those two
// apart; restoring only on an empty hash is what stops this from dragging the
// user back to a deck they deliberately left.

const KEY = 'open-slide:route'

function readSaved(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    // Storage can be unavailable (private window, blocked site data). A lost
    // route is a small annoyance; a thrown error here would stop the app from
    // mounting at all.
    return null
  }
}

function save(hash: string): void {
  try {
    sessionStorage.setItem(KEY, hash)
  } catch {
    /* see readSaved */
  }
}

/** Put the remembered route back before the router reads the URL. */
export function restoreRoute(): void {
  if (globalThis.location?.hash) return
  const saved = readSaved()
  if (!saved || saved === '#/') return
  globalThis.location.hash = saved
}

/** Remember every route change, including the catalog. */
export function rememberRoute(): void {
  const remember = () => {
    const hash = globalThis.location?.hash
    if (hash) save(hash)
  }
  remember()
  globalThis.addEventListener('hashchange', remember)
}
