// ISPO: must stay the first import so window.EXCALIDRAW_ASSET_PATH is set before
// any excalidraw module constructs a font face. Points bundled fonts at our own
// origin instead of the CSP-blocked esm.sh fallback.
import "./ispo-asset-path";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./ispo-host.css";

// ISPO: `virtual:pwa-register` is a Vite-plugin-pwa virtual module that the
// host esbuild bundler can't resolve, and service-worker registration is not
// needed in the sealed ISPO iframe (reload is host-driven). No-op shim.
const registerSW = () => {};

import "../excalidraw-app/sentry";

import ExcalidrawApp from "./App";

window.__EXCALIDRAW_SHA__ = (globalThis.__ISPO_ENV||(globalThis.__ISPO_ENV={MODE:"production",PROD:true,DEV:false,SSR:false})).VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
registerSW();
root.render(
  <StrictMode>
    <ExcalidrawApp />
  </StrictMode>,
);
