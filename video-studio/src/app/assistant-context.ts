// Publishes the bounded assistant context for this app: the pure brief from
// domain/assistant-brief.ts, pushed to the host assistant surface whenever it
// materially changes. Bound from the root view so the publish effect runs
// inside a component lifecycle; cleared when the app unmounts.
import { createEffect, onCleanup } from 'solid-js'
import { ui } from '@ispo/sdk'
import { buildAssistantBrief } from '../domain/assistant-brief.ts'
import type { AppController } from './app-controller.ts'

export function bindAssistantContext(controller: AppController): void {
  let lastPublished = ''
  createEffect(() => {
    const brief = buildAssistantBrief({
      screen: controller.screen(),
      projectTitle: controller.activeProjectTitle(),
      stage: controller.activeStage(),
      clipCount: controller.rows().rows.length,
      selectionLabel: controller.selectionLabel(),
      saveStatus: controller.saveState().status,
      exportStatus: controller.exportStatusText(),
    })
    const serialized = JSON.stringify(brief)
    if (serialized === lastPublished) return
    lastPublished = serialized
    ui.context.set(brief)
  })
  onCleanup(() => {
    ui.context.clear()
  })
}
