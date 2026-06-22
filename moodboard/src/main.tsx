import './index.css'
import './vcr-font.css'
import './canvas.css'
import { createRoot } from 'react-dom/client'
import { CanvasBoard } from './components/canvas-board'

// No <StrictMode> (the host runs the production bundle by default — StrictMode
// would double-mount and flicker in dev React) and no connectToHost() (the
// host injects the bootstrap before this bundle, see dist/index.html).
const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<CanvasBoard />)
}
