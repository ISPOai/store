// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// ISPO PORT — a handle on the running editor.
//
// The deck library (ispo/library.ts) opens BEFORE any editor exists and can be
// reopened later, from a document that is already loaded. Those are two
// different jobs: the first boots the app, the second swaps the open document
// through the editor that is already mounted.
//
// They must not be the same code path. `new Editor(...)` attaches document-level
// listeners (drop, pointerdown, keydown); constructing a second one to "go back"
// would stack them silently. So the editor is built exactly once and registered
// here, and every later open reuses it via `Editor.openDeckPath`.

import type { Editor } from '../editor/editor'

let editor: Editor | null = null

export function setActiveEditor(next: Editor): void {
  editor = next
}

export const activeEditor = (): Editor | null => editor
