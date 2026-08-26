// Host entry.
//
// Order is load-bearing twice over:
//
// 1. `./runtime/env` publishes the globals the vendored Vite sources read
//    (`__OSD_ENV__`), so it must run before any of their module bodies.
// 2. `app/lib/slides.ts` snapshots `slideIds` at module scope, so that list has
//    to be correct before any vendored module body runs. It is: slides are
//    compiled into the bundle and the ids come from the generated manifest, not
//    from storage. Only mutable per-slide metadata is read asynchronously
//    below, which nothing snapshots.
import './runtime/env'
import './app/styles.css'
import './lib/commands'

import { ThemeProvider } from 'next-themes'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
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
