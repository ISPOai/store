import './index.css'
import './vcr-font.css'
import './canvas.css'
import { createRoot } from 'react-dom/client'
import { CanvasBoard } from './components/canvas-board'
// Registers this project's command catalog with the host. Imported for effect:
// the module exposes the commands and reports the bundle ready on load.
import './lib/board-commands'

// No <StrictMode> (the host runs the production bundle by default — StrictMode
// would double-mount and flicker in dev React) and no connectToHost() (the
// host injects the bootstrap before this bundle, see dist/index.html).
const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<CanvasBoard />)
}
