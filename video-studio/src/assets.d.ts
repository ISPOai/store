// Static asset module declarations for the host's esbuild file loaders.
declare module '*.css'

declare module '*.ttf' {
  const url: string
  export default url
}

declare module '*.woff2' {
  const url: string
  export default url
}

declare module '*.svg' {
  const url: string
  export default url
}

declare module '*.png' {
  const url: string
  export default url
}

// File System Access API surface the vendored engine feature-detects; not
// yet in TypeScript's DOM lib. Ambient declaration only — no polyfill.
interface Window {
  showSaveFilePicker?(options?: {
    suggestedName?: string
    types?: readonly { accept: Record<string, readonly string[]>; description?: string }[]
  }): Promise<FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }>
}
