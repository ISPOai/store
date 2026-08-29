// Video Studio entry (solid target, non-React readiness path).
//
// Contract order, per the host bootstrap:
//   1. The host-owned bootstrap calls connectToHost() BEFORE importing this
//      bundle — the entry never owns the connection. The theme channel and
//      lifecycle acks ride it.
//   2. Mount visible DOM through solid-js/web render().
//   3. Wire the host lifecycle (will-sleep releases playback, audio, and the
//      render loop; did-wake restarts the loop) — before readiness.
//   4. Register the bundled font for both UI text and canvas text layout.
//   5. Report first visual readiness with notifyAppReady after mount.
//   6. Command exposure readiness waits for durable startup state: the
//      command catalog is published with the bundle, but `.ready()` fires
//      only after the initial project list proves the entity store usable.
import './index.css'
import interVariableUrl from '../assets/fonts/inter-variable.ttf'
import { render } from 'solid-js/web'
import { dialog, entities, files, lifecycle, notifyAppReady } from '@ispo/sdk'
import type { FontSource } from '@diffusionstudio/runtime'
import { AppController } from './app/app-controller.ts'
import { bindAssistantContext } from './app/assistant-context.ts'
import { AppView } from './ui/app-view.tsx'
import { projectCommands } from './commands/index.ts'

const FONT_FAMILY = 'Inter'

async function loadBundledFont(): Promise<FontSource> {
  const source: FontSource = { family: FONT_FAMILY, source: `url(${interVariableUrl})` }
  if (globalThis.FontFace === undefined) return source
  try {
    const face = new FontFace(FONT_FAMILY, `url(${interVariableUrl})`)
    await face.load()
    document.fonts.add(face)
  } catch {
    // Text falls back to the system font; nothing else changes.
  }
  return source
}

const rootEl = document.getElementById('root')
const controller = new AppController({ entities, files, dialog })

if (rootEl) {
  render(() => {
    // Inside render's root: the assistant-context publisher observes the
    // controller signals and clears itself when the app unmounts.
    bindAssistantContext(controller)
    return <AppView controller={controller} />
  }, rootEl)
}

lifecycle.onWillSleep(() => controller.sleep())
lifecycle.onDidWake(() => controller.wake())

void loadBundledFont().then((fontSource) => {
  controller.registerFonts([fontSource])
})

void controller.boot().then((durable) => {
  if (durable) projectCommands.ready()
})

notifyAppReady({ source: 'video-studio-mount' })
