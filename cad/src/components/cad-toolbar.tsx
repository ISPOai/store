import { Box, FolderOpen, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RuntimeHealth } from "@/lib/cad-api";

export function CadToolbar({
  runtime,
  busy,
  onImport,
  onRefresh,
}: {
  runtime: RuntimeHealth | null;
  busy: boolean;
  onImport: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="flex min-h-[58px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-[7px] bg-secondary">
          <Box className="size-4 opacity-[0.72]" strokeWidth={1.7} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-sm font-medium">CAD</h1>
          <p className="truncate text-xs text-muted-foreground">STEP-first models, agents, and validation</p>
        </div>
        <Badge variant={runtime?.ok ? "secondary" : "outline"}>
          <span
            className={
              runtime?.ok
                ? "size-1.5 rounded-full bg-[var(--w-status-ok)]"
                : "size-1.5 rounded-full bg-[var(--w-status-warn)]"
            }
          />
          {runtime?.ok ? "Runtime ready" : "Runtime held"}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={onRefresh} disabled={busy}>
          <RefreshCw strokeWidth={1.7} />
          Refresh
        </Button>
        <Button type="button" variant="secondary" onClick={onImport} disabled={busy || !runtime?.ok}>
          <FolderOpen strokeWidth={1.7} />
          Open
        </Button>
      </div>
    </header>
  );
}
