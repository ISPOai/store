export type SlideSourceHit = {
  line: number;
  column: number;
  anchor: HTMLElement;
};

export type FindSlideSourceOptions = {
  // Visual editor uses this: skip component-invocation JSX (`<MyComp/>`)
  // since most components don't forward `style`. Comments leave it off
  // so any JSX can be annotated.
  hostOnly?: boolean;
};

type FiberLike = {
  return: FiberLike | null;
  stateNode?: unknown;
  _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number };
  memoizedProps?: { __source?: { fileName?: string; lineNumber?: number; columnNumber?: number } };
};

function getFiber(el: Element): FiberLike | null {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  if (!key) return null;
  return (el as unknown as Record<string, FiberLike>)[key] ?? null;
}

function getSource(fiber: FiberLike) {
  return fiber._debugSource ?? fiber.memoizedProps?.__source;
}

// `_debugSource.fileName` may carry Vite's HMR query (`?t=…`) and, on
// Windows, backslash separators. Both break the naive `endsWith` match.
function normalizeDebugFileName(fileName: string): string {
  return fileName.split(/[?#]/)[0].replace(/\\/g, '/');
}

export function findSlideSource(
  el: HTMLElement,
  slideId: string,
  opts?: FindSlideSourceOptions,
): SlideSourceHit | null {
  // Primary path: the `data-slide-loc` attribute injected by the
  // loc-tags Vite plugin. Immune to HMR-stale fiber state.
  const tagged = el.closest<HTMLElement>('[data-slide-loc]');
  if (tagged) {
    const loc = tagged.dataset.slideLoc;
    if (loc) {
      const idx = loc.indexOf(':');
      if (idx > 0) {
        const line = Number(loc.slice(0, idx));
        const column = Number(loc.slice(idx + 1));
        if (Number.isFinite(line) && Number.isFinite(column)) {
          return { line, column, anchor: tagged };
        }
      }
    }
  }

  // Port seam: this host stamps every intrinsic element with
  // `data-ispo-source="<relPath>:<line>:<col>"` at build time
  // (apps/desktop/src/main/projects/jsx-source-plugin.ts), which is the exact
  // equivalent of upstream's `data-slide-loc`. It is also the ONLY path that
  // works here: upstream's fallback reads `_debugSource`/`__source` off the
  // React fiber, and React 19 carries neither — the app builds with the
  // production JSX transform, so without this the inspector can never identify
  // a clicked element and nothing on the slide is selectable.
  //
  // Only elements belonging to THIS slide's module are eligible, so clicking
  // app chrome does not resolve to a source location. The attribute is stamped
  // on host elements only, which is what `hostOnly` asks for anyway.
  const ispoNeedle = `/slides/${slideId}/index.tsx`;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const raw = node.dataset.ispoSource;
    if (!raw) continue;
    const at = raw.lastIndexOf(':');
    const at2 = raw.lastIndexOf(':', at - 1);
    if (at <= 0 || at2 <= 0) continue;
    const file = normalizeDebugFileName(raw.slice(0, at2));
    if (!file.endsWith(ispoNeedle)) continue;
    const line = Number(raw.slice(at2 + 1, at));
    const column = Number(raw.slice(at + 1));
    if (!Number.isFinite(line) || !Number.isFinite(column)) continue;
    return { line, column, anchor: node };
  }

  // Fallback for JSX rendered from imported component files (which the
  // loc-tags plugin doesn't transform).
  const needle = `/slides/${slideId}/index.tsx`;
  let fiber = getFiber(el);
  let anchor: HTMLElement = el;
  while (fiber) {
    const src = getSource(fiber);
    const isHost = fiber.stateNode instanceof HTMLElement;
    if (
      src?.fileName &&
      normalizeDebugFileName(src.fileName).endsWith(needle) &&
      src.lineNumber &&
      (!opts?.hostOnly || isHost)
    ) {
      return {
        line: src.lineNumber,
        column: src.columnNumber ?? 0,
        anchor: isHost ? (fiber.stateNode as HTMLElement) : anchor,
      };
    }
    if (isHost) {
      anchor = fiber.stateNode as HTMLElement;
    }
    fiber = fiber.return;
  }
  return null;
}
