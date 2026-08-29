// The project list: every `video.project` row, one New action, and the
// capability summary of this frame's media runtime (the same probes the
// export path gates on, reported truthfully even when unsupported).
import { type JSX } from 'solid-js'
import type { AppController } from '../app/app-controller.ts'
import { CapabilityTable } from './capability-table.tsx'
import { LiveText, ReactiveList } from './reactive.tsx'

export function ProjectListView(props: { controller: AppController }): JSX.Element {
  return (
    <section class="h-dvh overflow-y-auto">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
        <header class="flex flex-col gap-1">
          <h1 class="text-lg font-semibold">Video Studio</h1>
          <p class="text-sm text-muted-foreground">Offline compositions, edited and exported in this frame.</p>
        </header>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
            disabled={props.controller.isLoading()}
            onclick={() => void props.controller.newProject()}
          >
            New composition
          </button>
          <LiveText text={{ read: () => (props.controller.isLoading() ? 'Loading…' : '') }} />
        </div>

        <div class="flex flex-col gap-3">
          <h2 class="text-sm font-medium">Compositions</h2>
          <LiveText
            text={{
              read: () =>
                props.controller.projectsList().length === 0 && !props.controller.isLoading()
                  ? 'No compositions yet.'
                  : '',
            }}
          />
          <ReactiveList
            container="projects"
            list={{ items: () => props.controller.projectsList() }}
            render={(row) => (
              <button
                type="button"
                class="flex w-full flex-col gap-1 rounded-md border border-border px-4 py-3 text-left hover-wash"
                onclick={() => void props.controller.openProject(row.id)}
              >
                <span class="text-sm font-medium">{row.data.title}</span>
                <span class="font-mono text-xs text-muted-foreground">
                  {row.data.width}×{row.data.height} · {row.data.fps} fps
                </span>
              </button>
            )}
          />
        </div>

        <CapabilityTable
          source={{
            exportRows: () => props.controller.exportCapabilityRows(),
            playbackRows: () => props.controller.playbackCapabilityRows(),
            exportBlocker: () => props.controller.exportCapabilities()?.blocker ?? null,
          }}
        />
      </div>
    </section>
  )
}
