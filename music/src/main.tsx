import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { connectToHost } from '@ispo/sdk'
import { Sequencer } from './sequencer'

connectToHost()

// Theme/mode is owned by the HOST: it sets the `.dark` class + `color-scheme` on
// the document root before first paint and pushes changes at runtime, and the
// imported `@ispo/design/tokens.css` (`:root` = light, `.dark` = dark) resolves
// to the host-set mode automatically. The app must NOT self-manage theme — no
// `prefers-color-scheme`, no `data-theme` toggling — that fights the host and
// flashes the wrong mode.

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
      <Sequencer />
  )
}
