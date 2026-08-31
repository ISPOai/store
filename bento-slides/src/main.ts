// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// ISPO entry point (`appEntry` in .ispo/project.json). The host bundles this
// file with esbuild and generates the surrounding index.html, so this is the
// first line of the app's own code that runs.
//
// Four jobs, in this order, and the order is the point:
//
//   1. give the editor the mount node it expects. The host's generated shell
//      offers `<div id="root">`; upstream's index.html offered `<div id="app">`
//      inside a full-height body. Making that node here — rather than teaching
//      the editor a second id — keeps every line of upstream layout code true.
//   2. follow the ISPO chrome's light/dark mode.
//   3. register the project's command catalog. Imported for effect, and BEFORE
//      the boot, because the catalog is a static declaration that must be
//      published whether or not a document ever loads: a host asking this
//      project what it can do should get an answer while the app is still
//      waiting for file access.
//   4. once storage answers, open the DECK LIBRARY — not a document.
//
// On (4): upstream opens a document because a Bento file IS a document. This
// app owns a folder of them, so it owes the reader the shelf before the book.
// The library is a page, not a dialog over an editor: on a cold start there is
// no editor yet, and the editor is built exactly once, when the first deck is
// chosen (ispo/active-editor.ts).

import '../ispo/src/ispo.css'
import { setHostTheme } from '../kernel/src/theme.ts'
import { bootBento } from '../slides/src/main.ts'
import { bootWhenStorageAnswers } from '../slides/src/ispo/boot.ts'
import { hideLibrary, showLibrary } from '../slides/src/ispo/library.ts'
import { activeEditor } from '../slides/src/ispo/active-editor.ts'
import { readDeck, refFor, setCurrentDeck } from '../ispo/src/store.ts'
import { createDeck, importDeck } from '../slides/src/ispo/deck-actions.ts'
// Registers this project's command catalog with the host and reports the
// bundle ready. Imported for effect only.
import '../slides/src/ispo/commands.ts'

/**
 * Follow the ISPO chrome's light/dark mode.
 *
 * The host posts its theme on first load and on every change; the SDK
 * re-dispatches it as an `ispo:theme` CustomEvent carrying `{ name }`, the
 * MODE. Bento's own theme layer treats that as what 'auto' resolves to, so an
 * explicit in-app choice still wins (kernel/src/theme.ts).
 *
 * Listened for by event NAME rather than by importing the SDK constant: it is
 * a string in the §6.2 wire contract, and this way the entry has no import
 * that only exists inside the host.
 */
function followHostTheme(): void {
  window.addEventListener('ispo:theme', (event) => {
    const name = (event as CustomEvent<{ name?: unknown }>).detail?.name
    if (name === 'dark' || name === 'light') setHostTheme(name)
  })
}

followHostTheme()

function mountNode(): HTMLElement {
  const existing = document.getElementById('app')
  if (existing) return existing
  const app = document.createElement('div')
  app.id = 'app'
  // The host pins `body { position: fixed; inset: 0 }` and gives `#root` the
  // viewport, so the app node only has to fill its parent. Set here rather
  // than in the app's stylesheet because it is a fact about the ISPO shell,
  // not about Bento.
  app.style.width = '100%'
  app.style.height = '100%'
  ;(document.getElementById('root') ?? document.body).appendChild(app)
  return app
}

mountNode()

/**
 * Open a deck from the library.
 *
 * The FIRST deck boots the app (one `Editor`, one set of document-level
 * listeners); every later one swaps the document through that same editor.
 * `openDeckPath` answers false when it declined — an unsaved edit the reader
 * chose to keep, an unreadable file — and the library stays up in that case
 * rather than closing onto a document that never opened.
 */
async function openDeck(path: string): Promise<void> {
  const editor = activeEditor()
  if (editor) {
    if (await editor.openDeckPath(path)) hideLibrary()
    return
  }
  const body = await readDeck(path)
  setCurrentDeck(refFor(path))
  hideLibrary()
  bootBento(body, false)
}

bootWhenStorageAnswers(() => {
  void showLibrary({
    open: openDeck,
    newDeck: async () => {
      const made = await createDeck()
      if (!made) return
      await openMade(made.body, made.path, made.name)
    },
    importFromFiles: async () => {
      const picked = await importDeck()
      if (!picked) return
      await openMade(picked.body, picked.path, picked.name)
    },
  })
})

/**
 * Open a document the reader just made or imported.
 *
 * `path` is null for an import: a picked file arrives by copy with no save
 * target, so the deck opens unsaved and the first ⌘S asks where it goes.
 *
 * Deliberately does NOT go through `bootBento(null, …)` — that boots the
 * STARTER deck, which is what made "New deck" and "Import from Files…" both
 * land on the feature tour before this existed.
 */
async function openMade(body: string, path: string | null, name: string): Promise<void> {
  const editor = activeEditor()
  setCurrentDeck(path ? refFor(path) : null)
  if (editor) {
    if (path) {
      await editor.openDeckPath(path)
    } else {
      await editor.adoptImportedBody(body, name)
    }
    hideLibrary()
    return
  }
  hideLibrary()
  bootBento(body, false)
}
