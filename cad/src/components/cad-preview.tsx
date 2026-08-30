import { forwardRef, useState } from "react";
import { Box, Maximize2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CadViewerAdapter,
  type CadViewerHandle,
} from "@/features/viewer/cad-viewer-adapter";
import { initialViewerState, type ViewerState } from "@/features/viewer/viewer-state";
import { CadEmptyState } from "./cad-empty-state";

export const CadPreview = forwardRef<CadViewerHandle, {
  sourceUrl: string | null;
  modelTitle: string | null;
  runtimeAvailable: boolean;
  revision?: number;
  onSnapshotReady?: (dataUrl: string) => void;
}>(function CadPreview({
  sourceUrl,
  modelTitle,
  runtimeAvailable,
  revision = 0,
  onSnapshotReady,
}, ref) {
  const [viewer, setViewer] = useState<ViewerState>(initialViewerState);

  return (
    <section className="relative flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-[48px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Box className="size-4 opacity-[0.72]" strokeWidth={1.7} />
          <h2 className="truncate text-sm font-medium">{modelTitle || "Model preview"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={viewer.phase !== "ready"}
            onClick={() => (ref && typeof ref !== "function" ? ref.current?.fit() : undefined)}
          >
            <Maximize2 strokeWidth={1.7} />
            Fit
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={viewer.phase !== "ready"}
            onClick={() => (ref && typeof ref !== "function" ? ref.current?.reset() : undefined)}
          >
            <RotateCcw strokeWidth={1.7} />
            Reset
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {sourceUrl && runtimeAvailable ? (
          <>
            <CadViewerAdapter
              key={`${sourceUrl}:${revision}`}
              ref={ref}
              sourceUrl={sourceUrl}
              onStateChange={setViewer}
              onSnapshotReady={onSnapshotReady}
            />
            {viewer.phase === "loading" ? (
              <div className="absolute inset-0 grid place-items-center bg-background/70 p-6">
                <div className="flex w-full max-w-sm flex-col gap-3">
                  <Skeleton className="h-44 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ) : null}
            {viewer.phase === "error" || viewer.phase === "unsupported" ? (
              <div className="absolute inset-0 bg-background">
                <CadEmptyState
                  error
                  title={viewer.phase === "unsupported" ? "Preview format unavailable" : "Preview failed"}
                  description={viewer.message}
                />
              </div>
            ) : null}
          </>
        ) : (
          <CadEmptyState
            error={!runtimeAvailable}
            title={runtimeAvailable ? "No preview selected" : "CAD runtime is held"}
            description={
              runtimeAvailable
                ? "Generate or open a supported model. STEP files are processed into a GLB preview before rendering."
                : "The host has not started the confirmed sealed API process. Generation records remain available, but preview processing is paused."
            }
          />
        )}
      </div>
      {viewer.phase === "ready" && viewer.parts.length ? (
        <div className="max-h-36 shrink-0 overflow-auto border-t border-border bg-card p-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-1.5 pb-1">
              <span className="text-sm font-medium">Assembly</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{viewer.parts.length} parts</span>
            </div>
            {viewer.parts.slice(0, 24).map((part) => (
              <div key={part.id} className="min-h-8 truncate rounded-[6px] px-2.5 py-2 text-sm hover:bg-[var(--w-hover-wash-soft)]">
                {part.label}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
});
