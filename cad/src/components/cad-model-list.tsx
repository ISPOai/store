import { Check, Cuboid, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isWorkingGeneration,
  statusLabel,
  visibleModelStatus,
  type CadGeneration,
  type CadModel,
  type EntityRecord,
} from "@/features/generations/generation-model";
import { cn } from "@/lib/utils";

export function CadModelList({
  models,
  generations,
  selectedId,
  loading,
  onSelect,
}: {
  models: EntityRecord<CadModel>[];
  generations: EntityRecord<CadGeneration>[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-[58px] w-full" />
        ))}
      </div>
    );
  }

  if (!models.length) {
    return (
      <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 p-4 text-center">
        <Cuboid className="size-5 opacity-[0.52]" strokeWidth={1.7} />
        <p className="text-sm font-medium">No models yet</p>
        <p className="max-w-48 text-sm leading-relaxed text-muted-foreground">
          Start a generation or open a supported CAD artifact.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {models.map((model) => {
        const selected = selectedId === model.id;
        const status = visibleModelStatus(model.data, generations);
        return (
          <button
            key={model.id}
            type="button"
            className={cn(
              "grid min-h-[58px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[7px] border border-transparent px-3 py-2.5 text-left transition-[background-color,border-color,color] hover:bg-[var(--w-hover-wash-soft)]",
              selected && "bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]",
            )}
            onClick={() => onSelect(model.id)}
          >
            <div className="flex size-8 items-center justify-center rounded-[7px] bg-secondary">
              {isWorkingGeneration(status)
                ? <LoaderCircle className="size-4 animate-spin opacity-[0.72]" strokeWidth={1.7} />
                : <Cuboid className="size-4 opacity-[0.72]" strokeWidth={1.7} />}
            </div>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{model.data.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {formatUpdated(model.data.updatedAt)}
              </span>
            </span>
            {selected
              ? <Check className="size-3.5 opacity-[0.72]" strokeWidth={1.7} />
              : <Badge variant="outline">{statusLabel(status)}</Badge>}
          </button>
        );
      })}
    </div>
  );
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  return `Updated ${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}
