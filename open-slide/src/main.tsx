// Host entry. Order matters: `./runtime/env` publishes the globals the
// vendored Vite sources read, and it must run before any of them.
import './runtime/env'
import './app/styles.css'

import { ThemeProvider } from 'next-themes'
import { createRoot } from 'react-dom/client'
import { App } from './app/app'
import { installDevServerShim } from './runtime/dev-server-shim'
import { refreshSlideIndex } from './virtual/slides'
import { refreshFolders } from './virtual/folders'
import { refreshThemes } from './virtual/themes'
import './lib/commands'

// Upstream mounts inside <StrictMode>; the host runs the production bundle and
// a double mount would run first-run seeding twice, so it is dropped here.
async function start(): Promise<void> {
  installDevServerShim()
  // Upstream can publish these synchronously because Vite has already walked
  // the workspace at build time. Storage is async, so the index is warmed
  // before the first render rather than leaving the app briefly empty.
  await Promise.all([refreshSlideIndex(), refreshFolders(), refreshThemes()])

  const rootEl = document.getElementById('root')
  if (!rootEl) return
  createRoot(rootEl).render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
    </ThemeProvider>,
  )
}

void start()
