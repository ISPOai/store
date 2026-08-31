// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// ISPO PORT — in-frame replacements for window.alert / confirm / prompt.
//
// WHY THIS EXISTS. An ISPO project runs in an iframe sandboxed with
// `allow-scripts allow-same-origin allow-forms` and NOT `allow-modals`
// (apps/desktop/src/shared/project-frame-sandbox.ts). Chromium answers the
// browser's own modals in a sandboxed frame by ignoring them:
//
//   alert(...)    → ignored, nothing shown
//   confirm(...)  → returns FALSE, nothing shown
//   prompt(...)   → returns NULL, nothing shown
//
// and it does so silently as far as the app is concerned — only a console
// warning. That failure mode is the dangerous one: `if (!confirm('Delete this
// slide?')) return` becomes "you can never delete a slide", and
// `prompt('Comment:')` becomes "comments cannot be written", with no error
// anywhere for either. The upstream code is correct; it is simply talking to a
// browser feature this frame does not have.
//
// So these are the same three questions, asked with a `<dialog>` — which
// `showModal()` opens fine here, being a DOM element rather than a browser
// modal. They deliberately reuse the editor's own `ed-dialog ed-pwdialog`
// styling so they look like the app rather than like a port.
//
// All three are ASYNC, which the browser's are not. Every converted call site
// therefore awaits, and the ones that could not (a synchronous event handler
// that must decide now) were restructured rather than made to guess.

const CLASS = 'ed-dialog ed-pwdialog ed-ispo-dialog'

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function open(build: (dlg: HTMLDialogElement, done: () => void) => void): void {
  const dlg = document.createElement('dialog')
  dlg.className = CLASS
  const done = () => {
    dlg.close()
    dlg.remove()
  }
  build(dlg, done)
  document.body.appendChild(dlg)
  dlg.showModal()
}

/** A message with one way out. Resolves when it is dismissed. */
export function say(message: string, okLabel = 'OK'): Promise<void> {
  return new Promise((resolve) => {
    open((dlg, done) => {
      dlg.innerHTML =
        `<p>${esc(message)}</p>` +
        `<div class="ed-dialog-actions"><button class="ok ed-primary">${esc(okLabel)}</button></div>`
      const finish = () => {
        done()
        resolve()
      }
      dlg.querySelector('.ok')!.addEventListener('click', finish)
      dlg.addEventListener('cancel', (ev) => {
        ev.preventDefault()
        finish()
      })
      setTimeout(() => dlg.querySelector<HTMLButtonElement>('.ok')?.focus())
    })
  })
}

/**
 * A yes/no question. `danger` styles the confirming button as destructive and
 * leaves Cancel focused, because the answer to "delete this?" arrived at by
 * pressing Enter without reading should be no.
 */
export function ask(
  message: string,
  opts: { ok?: string; cancel?: string; danger?: boolean } = {},
): Promise<boolean> {
  const okLabel = opts.ok ?? 'OK'
  const cancelLabel = opts.cancel ?? 'Cancel'
  return new Promise((resolve) => {
    open((dlg, done) => {
      dlg.innerHTML =
        `<p>${esc(message)}</p>` +
        `<div class="ed-dialog-actions">` +
        `<button class="cancel">${esc(cancelLabel)}</button>` +
        `<button class="ok${opts.danger ? '' : ' ed-primary'}">${esc(okLabel)}</button></div>`
      const finish = (v: boolean) => {
        done()
        resolve(v)
      }
      dlg.querySelector('.cancel')!.addEventListener('click', () => finish(false))
      dlg.querySelector('.ok')!.addEventListener('click', () => finish(true))
      dlg.addEventListener('cancel', (ev) => {
        ev.preventDefault()
        finish(false)
      })
      setTimeout(() =>
        dlg.querySelector<HTMLButtonElement>(opts.danger ? '.cancel' : '.ok')?.focus())
    })
  })
}

/** A single line of text, or null if the reader backed out. */
export function askText(
  message: string,
  initial = '',
  opts: { ok?: string; placeholder?: string; multiline?: boolean } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    open((dlg, done) => {
      const field = opts.multiline
        ? `<textarea class="ed-ispo-field" rows="3" placeholder="${esc(opts.placeholder ?? '')}"></textarea>`
        : `<input class="ed-ispo-field" type="text" placeholder="${esc(opts.placeholder ?? '')}">`
      dlg.innerHTML =
        `<label>${esc(message)}${field}</label>` +
        `<div class="ed-dialog-actions"><button class="cancel">Cancel</button>` +
        `<button class="ok ed-primary">${esc(opts.ok ?? 'OK')}</button></div>`
      const input = dlg.querySelector<HTMLInputElement | HTMLTextAreaElement>('.ed-ispo-field')!
      input.value = initial
      const finish = (v: string | null) => {
        done()
        resolve(v)
      }
      dlg.querySelector('.cancel')!.addEventListener('click', () => finish(null))
      dlg.querySelector('.ok')!.addEventListener('click', () => finish(input.value))
      input.addEventListener('keydown', (event) => {
        const ev = event as KeyboardEvent
        if (ev.key === 'Enter' && !opts.multiline) {
          ev.preventDefault()
          finish(input.value)
        }
      })
      dlg.addEventListener('cancel', (ev) => {
        ev.preventDefault()
        finish(null)
      })
      setTimeout(() => {
        input.focus()
        input.select()
      })
    })
  })
}

export interface ChoiceRow {
  id: string
  label: string
  hint?: string
}

/**
 * Pick one row from a list, or take one of the extra actions offered beside
 * it. Returns the chosen row id, `{action}` for an extra, or null on cancel.
 */
export function chooseFrom(
  title: string,
  rows: ChoiceRow[],
  opts: { empty?: string; actions?: Array<{ id: string; label: string }> } = {},
): Promise<{ kind: 'row'; id: string } | { kind: 'action'; id: string } | null> {
  return new Promise((resolve) => {
    open((dlg, done) => {
      const list = rows.length
        ? `<div class="ed-ispo-list">${rows
            .map(
              (r) =>
                `<button class="ed-ispo-row" data-id="${esc(r.id)}">` +
                `<span class="ed-ispo-row-label">${esc(r.label)}</span>` +
                (r.hint ? `<span class="ed-ispo-row-hint">${esc(r.hint)}</span>` : '') +
                `</button>`,
            )
            .join('')}</div>`
        : `<p>${esc(opts.empty ?? 'Nothing here yet.')}</p>`
      const actions = (opts.actions ?? [])
        .map((a) => `<button class="ed-ispo-action" data-id="${esc(a.id)}">${esc(a.label)}</button>`)
        .join('')
      dlg.innerHTML =
        `<h2>${esc(title)}</h2>${list}` +
        `<div class="ed-dialog-actions">${actions}<button class="cancel">Cancel</button></div>`
      const finish = (v: Parameters<typeof resolve>[0]) => {
        done()
        resolve(v)
      }
      for (const el of Array.from(dlg.querySelectorAll<HTMLElement>('.ed-ispo-row'))) {
        el.addEventListener('click', () => finish({ kind: 'row', id: el.dataset.id! }))
      }
      for (const el of Array.from(dlg.querySelectorAll<HTMLElement>('.ed-ispo-action'))) {
        el.addEventListener('click', () => finish({ kind: 'action', id: el.dataset.id! }))
      }
      dlg.querySelector('.cancel')!.addEventListener('click', () => finish(null))
      dlg.addEventListener('cancel', (ev) => {
        ev.preventDefault()
        finish(null)
      })
      setTimeout(() => dlg.querySelector<HTMLButtonElement>('.ed-ispo-row, .cancel')?.focus())
    })
  })
}
