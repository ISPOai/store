// The root view: switches between the project list and the editor, mirrors
// the toast, and owns nothing — every accessor and action rides the stage
// (the AppController) exactly like the solid readiness fixture's live object.
import { createEffect, type JSX } from 'solid-js'
import type { AppController } from '../app/app-controller.ts'
import { ProjectListView } from './project-list-view.tsx'
import { EditorView } from './editor-view.tsx'

function Toast(props: { controller: AppController }): JSX.Element {
  let node: HTMLDivElement | undefined
  createEffect(() => {
    const message = props.controller.message()
    if (node) {
      node.textContent = message === null ? '' : message.text
      node.dataset.tone = message === null ? '' : message.tone
      node.style.display = message === null ? 'none' : 'block'
    }
  })
  return (
    <div class="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div
        ref={(element) => (node = element)}
        data-toast="video-studio"
        style="display:none"
        class="pointer-events-auto max-w-xl rounded-md border bg-card px-4 py-2 font-mono text-xs"
      />
    </div>
  )
}

export function AppView(props: { controller: AppController }): JSX.Element {
  let projectsPane: HTMLElement | undefined
  let editorPane: HTMLElement | undefined
  createEffect(() => {
    const screen = props.controller.screen()
    if (projectsPane) projectsPane.style.display = screen === 'projects' ? 'block' : 'none'
    if (editorPane) editorPane.style.display = screen === 'editor' ? 'flex' : 'none'
  })
  return (
    <main class="h-dvh overflow-hidden bg-background text-foreground">
      <div data-screen="projects" ref={(element) => (projectsPane = element)}>
        <ProjectListView controller={props.controller} />
      </div>
      <div data-screen="editor" style="display:none" ref={(element) => (editorPane = element)}>
        <EditorView controller={props.controller} />
      </div>
      <Toast controller={props.controller} />
    </main>
  )
}
