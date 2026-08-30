import './index.css'
import { createRoot } from 'react-dom/client'
import { App } from './components/app'
// Registers this project's command catalog with the host. Imported for effect:
// the module exposes the commands and reports the bundle ready on load.
import './lib/deck-commands'

// No <StrictMode> (the host runs the production bundle, and a double mount would
// seed the example deck twice) and no connectToHost() — the host injects its
// bootstrap ahead of this bundle.
const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<App />)
}
