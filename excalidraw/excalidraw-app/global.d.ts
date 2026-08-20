import "@excalidraw/excalidraw/global";
import "@excalidraw/excalidraw/css";

declare global {
  var __ISPO_ENV: Record<string, any> | undefined;

  interface Window {
    __EXCALIDRAW_SHA__: string | undefined;
  }
}

declare module "react" {
  interface CSSProperties {
    [name: `--${string}`]: string | number | undefined;
  }
}

export {};
