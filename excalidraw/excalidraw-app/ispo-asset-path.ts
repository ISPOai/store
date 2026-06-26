// ISPO: point Excalidraw's font/asset loader at our own served origin.
//
// Upstream, `excalidraw-app/index.html` sets `window.EXCALIDRAW_ASSET_PATH =
// window.origin` inside an EJS (`<% %>`) template. The ISPO build serves its own
// HTML shell generated from `appEntry`, so that inline script never runs and the
// global stays undefined. When it is undefined, ExcalidrawFontFace.createUrls()
// falls back to its CDN URL (`https://esm.sh/@excalidraw/excalidraw/dist/prod/`)
// for the bundled fonts (ComicShanns / Excalifont / Xiaolai). The iframe CSP
// (`font-src 'self' assets: data:`) blocks that cross-origin fetch, so glyphs
// fail to load.
//
// The fonts are already vendored into the served build root (dist/) under the
// exact hashed filenames the loader requests, so setting the asset path to our
// own origin makes the loader fetch them from 'self', which the CSP allows.
//
// This module is imported FIRST in index.tsx so the global is set before any
// ExcalidrawFontFace is constructed.
const w = window as unknown as {
  EXCALIDRAW_ASSET_PATH?: string | string[];
};

if (typeof window !== "undefined" && !w.EXCALIDRAW_ASSET_PATH) {
  w.EXCALIDRAW_ASSET_PATH = window.location.origin;
}

export {};
