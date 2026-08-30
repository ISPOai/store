export type ViewerPhase = "idle" | "loading" | "ready" | "unsupported" | "error";

export type ViewerPart = {
  id: string;
  label: string;
};

export type ViewerState = {
  phase: ViewerPhase;
  message: string;
  parts: ViewerPart[];
};

export const initialViewerState: ViewerState = {
  phase: "idle",
  message: "Select a ready model to load its preview.",
  parts: [],
};

export function sourceKindForUrl(url: string) {
  const sourcePath = sourcePathForUrl(url);
  if (sourcePath.endsWith(".glb")) return "glb";
  if (sourcePath.endsWith(".step")) return "step";
  if (sourcePath.endsWith(".stp")) return "stp";
  return "unknown";
}

function sourcePathForUrl(url: string) {
  const value = String(url || "").trim();
  try {
    const parsed = new URL(value, "https://ispo.invalid");
    return (parsed.searchParams.get("file") || parsed.pathname).toLowerCase();
  } catch {
    return value.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  }
}
