// The media library: imported `video.asset` records grouped by
// `video.asset-folder`, with one Insert action that re-places a persisted
// asset on the live timeline without re-picking. Folders are an organizing
// layer only — assignment happens at import time under the active folder.
import { createEffect, type JSX } from 'solid-js'
import type { AppController } from '../app/app-controller.ts'
import { LiveText, ReactiveList } from './reactive.tsx'

export function LibraryPanel(props: { controller: AppController }): JSX.Element {
  const controller = props.controller
  let folderButton: HTMLButtonElement | undefined
  let newFolderButton: HTMLButtonElement | undefined

  createEffect(() => {
    if (folderButton) folderButton.style.fontWeight = controller.activeFolderId() === null ? '600' : '400'
    if (newFolderButton) newFolderButton.disabled = controller.isImporting()
  })

  return (
    <section class="flex flex-col gap-3" data-library-panel>
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium">Library</h2>
        <button
          type="button"
          ref={(element) => (newFolderButton = element)}
          class="rounded-md border border-border px-2 py-0.5 text-xs hover-wash"
          onclick={() => void controller.createFolder(`Folder ${controller.libraryFolders().length + 1}`)}
        >
          New folder
        </button>
      </div>
      <div class="flex flex-wrap gap-1" data-library-folders>
        <button
          type="button"
          ref={(element) => (folderButton = element)}
          class="rounded-md border border-border px-2 py-0.5 font-mono text-xs hover-wash"
          onclick={() => controller.setActiveFolder(null)}
        >
          All media
        </button>
        <ReactiveList
          container="library-folders"
          list={{ items: () => controller.libraryFolders() }}
          render={(folder) => <FolderChip controller={controller} folderId={folder.id} name={folder.data.name} />}
        />
      </div>
      <div class="flex flex-col gap-1" data-library-list>
        <ReactiveList
          container="library-assets"
          list={{ items: () => controller.visibleLibraryAssets() }}
          render={(asset) => (
            <div class="flex items-center gap-2 rounded-md border border-border px-2 py-1">
              <span class="min-w-0 flex-1 truncate text-xs">{asset.data.name}</span>
              <span class="font-mono text-[10px] uppercase text-muted-foreground">{asset.data.kind}</span>
              <button
                type="button"
                class="rounded-md border border-border px-2 py-0.5 text-xs hover-wash"
                onclick={() => void controller.insertAssetFromLibrary(asset.id)}
              >
                Insert
              </button>
            </div>
          )}
        />
        <LiveText text={{ read: () => (controller.visibleLibraryAssets().length === 0 ? 'No imported media yet.' : '') }} />
      </div>
    </section>
  )
}

function FolderChip(props: { controller: AppController; folderId: string; name: string }): JSX.Element {
  let node: HTMLButtonElement | undefined
  createEffect(() => {
    if (node) node.style.fontWeight = props.controller.activeFolderId() === props.folderId ? '600' : '400'
  })
  return (
    <button
      type="button"
      ref={(element) => (node = element)}
      class="rounded-md border border-border px-2 py-0.5 font-mono text-xs hover-wash"
      onclick={() => props.controller.setActiveFolder(props.folderId)}
    >
      {props.name}
    </button>
  )
}
