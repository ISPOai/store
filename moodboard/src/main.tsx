import './index.css'
import './vcr-font.css'
import './canvas.css'
import { createRoot } from 'react-dom/client'
import { commands } from '@ispo/sdk'
import { CanvasBoard } from './components/canvas-board'

// No <StrictMode> (the host runs the production bundle by default — StrictMode
// would double-mount and flicker in dev React) and no connectToHost() (the
// host injects the bootstrap before this bundle, see dist/index.html).
const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<CanvasBoard />)
}

const focusCanvas = commands.define({
  id: 'focus-canvas',
  label: 'Focus canvas',
  description: 'Bring the Moodboard canvas workspace into focus.',
  inputSchema: { type: 'object' },
  resultSchema: { type: 'object' },
  invocationMode: 'iframe-action',
  resultChannels: ['json'],
  confirmation: 'none',
}, async () => {
  rootEl?.setAttribute('tabindex', '-1')
  rootEl?.focus()
  return { kind: 'json', data: { focused: document.activeElement === rootEl } }
})

export const projectCommands = commands.expose([focusCanvas])
projectCommands.ready()
