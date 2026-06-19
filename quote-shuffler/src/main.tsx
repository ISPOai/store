import './index.css'
import { createRoot } from 'react-dom/client'
import { connectToHost } from '@ispo/sdk'
import { App } from './app'

connectToHost()

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<App />)
}
