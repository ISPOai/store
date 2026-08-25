// Ported from open-slide (`packages/core/src/app/lib/keys.ts`, MIT, © 2026
// Yiwei Ho) so a deck driven here answers the same keys as one driven upstream.

// Widened from upstream's `input, textarea` to cover `select`: the editor panel
// uses select controls, and arrow keys inside an open one must change the
// option rather than flip to the next slide.
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select')
}

// Single-letter shortcuts bail on this so browser combos (⌘P, ⌘F…) still work.
export function hasModifier(e: KeyboardEvent): boolean {
  return e.altKey || e.ctrlKey || e.metaKey
}

export function isForwardKey(e: KeyboardEvent): boolean {
  return e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown'
}

export function isBackwardKey(e: KeyboardEvent): boolean {
  return e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp'
}
