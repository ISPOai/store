// Host entry.
//
// Order is load-bearing twice over:
//
// 1. `./runtime/env` publishes the globals the vendored Vite sources read
//    (`__OSD_ENV__`), so it must run before any of their module bodies.
// 2. The app itself is imported *dynamically*, after the workspace index has
//    been read. Upstream can publish `slideIds` synchronously because Vite has
//    already walked the slides directory at build time; here the list comes out
//    of async storage, and `app/lib/slides.ts` snapshots it at module scope
//    (`export const slideIds = ids`). With a static import every vendored
//    module body would evaluate before the first `await` in this file, and the
//    app would mount against an empty workspace. Deferring the import is what
//    makes the snapshot land on real data.
import './runtime/env'
import './app/styles.css'
import './lib/commands'

import { createRoot } from 'react-dom/client'
import { installDevServerShim } from './runtime/dev-server-shim'
import { refreshFolders } from './virtual/folders'
import { refreshSlideIndex } from './virtual/slides'
import { refreshThemes } from './virtual/themes'

async function start(): Promise<void> {
  // Patched before anything can call a `/__*` route.
  installDevServerShim()

  // A first `fs` read races the access review on a freshly installed app: it
  // may be held or refused while the user is still deciding. Failing here would
  // strand the app on an empty workspace, so a failed warm-up is retried rather
  // than treated as "no slides".
  await warmWorkspace()

  const [{ App }, { ThemeProvider }] = await Promise.all([
    import('./app/app'),
    import('next-themes'),
  ])

  const rootEl = document.getElementById('root')
  if (!rootEl) return
  // No <StrictMode>: the host runs the production bundle and a double mount
  // would re-run one-time work.
  createRoot(rootEl).render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
    </ThemeProvider>,
  )
}

const ACCESS_RETRY_MS = 1000
const MAX_ATTEMPTS = 30

async function warmWorkspace(): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      await Promise.all([refreshSlideIndex(), refreshFolders(), refreshThemes()])
      return
    } catch (err) {
      if (attempt === 0) {
        // Shown only while access is still pending, and replaced by the app.
        const rootEl = document.getElementById('root')
        if (rootEl && !rootEl.firstChild) {
          rootEl.textContent = 'Waiting for file access…'
        }
        console.warn('[open-slide] workspace unavailable, retrying:', err)
      }
      await new Promise((resolve) => setTimeout(resolve, ACCESS_RETRY_MS))
    }
  }
}

void start()
