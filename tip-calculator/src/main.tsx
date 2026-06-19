import './index.css'
import { createRoot } from 'react-dom/client'
import { connectToHost } from '@ispo/sdk'
import { App } from './app'

// One connect at the entry: theme delivery + the host hello handshake.
connectToHost()

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<App />)
}
