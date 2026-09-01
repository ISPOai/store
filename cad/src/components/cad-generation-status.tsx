import {
  Bot,
  CheckCircle2,
  Clipboard,
  Clock3,
  ExternalLink,
  FileBox,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  statusLabel,
  type CadGeneration,
  type CadModel,
  type EntityRecord,
} from "@/features/generations/generation-model";

export function CadGenerationStatus({
  model,
  generation,
  onOpenAgent,
  onCopy,
}: {
  model: EntityRecord<CadModel> | null;
  generation: EntityRecord<CadGeneration> | null;
  onOpenAgent: (terminalId: string) => void;
  onCopy: (value: string, label: string) => void;
}) {
  if (!model) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Model details</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Select a model to inspect its run, validation, and published deliverables.
        </p>
      </div>
    );
  }
  const terminalId = generation?.data.terminalId ?? null;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate text-sm font-medium">{model.data.title}</h2>
          <Badge variant={model.data.status === "failed" ? "destructive" : "secondary"}>
            {statusLabel(model.data.status)}
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{model.data.prompt}</p>
        <CopyRow label="Model ID" value={model.id} onCopy={onCopy} />
      </section>

      {generation ? (
        <>
          <section className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <StatusIcon status={generation.data.status} />
              <h3 className="text-sm font-medium">Generation run</h3>
              <Badge variant="outline">{statusLabel(generation.data.status)}</Badge>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {generation.data.summary || statusMessage(generation.data.status)}
            </p>
            {generation.data.error ? (
              <Alert variant="destructive">
                <TriangleAlert strokeWidth={1.7} />
                <AlertTitle>Run failed</AlertTitle>
                <AlertDescription>{generation.data.error}</AlertDescription>
              </Alert>
            ) : null}
            <CopyRow label="Generation ID" value={generation.id} onCopy={onCopy} />
            <CopyRow label="Workspace key" value={generation.data.workspaceKey} onCopy={onCopy} />
            {terminalId ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenAgent(terminalId)}
              >
                <ExternalLink strokeWidth={1.7} />
                Open agent
              </Button>
            ) : null}
          </section>

          <section className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 opacity-[0.72]" strokeWidth={1.7} />
              <h3 className="text-sm font-medium">Validation</h3>
            </div>
            <div className="rounded-[7px] border border-border bg-background p-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm text-muted-foreground">Result</span>
                <span className="text-sm font-medium">
                  {generation.data.validation ? statusLabel(generation.data.validation.status) : "Pending"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {generation.data.validation?.summary || "The worker has not posted validation results yet."}
              </p>
              {generation.data.validation ? (
                <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                  <Metric label="Passed" value={generation.data.validation.passedCount} />
                  <Metric label="Failed" value={generation.data.validation.failedCount} />
                  <Metric label="Warnings" value={generation.data.validation.warningCount} />
                </div>
              ) : null}
            </div>
          </section>

          <section className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <FileBox className="size-4 opacity-[0.72]" strokeWidth={1.7} />
              <h3 className="text-sm font-medium">Artifacts</h3>
              <Badge variant="outline">{generation.data.artifactNames.length}</Badge>
            </div>
            {generation.data.artifactNames.length ? (
              <div className="flex flex-col gap-1">
                {generation.data.artifactNames.map((name) => (
                  <div
                    key={name}
                    className="grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[7px] border border-border bg-background px-3 py-2.5"
                  >
                    <span className="truncate font-mono text-xs">{name}</span>
                    <Badge variant="secondary">
                      {generation.data.publishedArtifacts.some(
                        (artifact) => artifact.name === name && artifact.filesRef,
                      ) ? "Published" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Artifact names appear after the worker catalogs and publishes its outputs.
              </p>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No generation is attached to this model.</p>
      )}
    </div>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[7px] bg-muted px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <code className="truncate font-mono text-xs">{value}</code>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => onCopy(value, label)}>
        <Clipboard strokeWidth={1.7} />
        Copy
      </Button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-[6px] bg-muted p-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function StatusIcon({ status }: { status: CadGeneration["status"] }) {
  if (status === "completed") {
    return <CheckCircle2 className="size-4 text-[var(--w-status-ok)]" strokeWidth={1.7} />;
  }
  if (status === "failed" || status === "cancelled") {
    return <TriangleAlert className="size-4 text-[var(--w-status-error)]" strokeWidth={1.7} />;
  }
  if (status === "waiting" || status === "outcome-unknown") {
    return <Clock3 className="size-4 text-[var(--w-status-warn)]" strokeWidth={1.7} />;
  }
  return <LoaderCircle className="size-4 animate-spin text-[var(--w-status-info)]" strokeWidth={1.7} />;
}

function statusMessage(status: CadGeneration["status"]) {
  if (status === "queued") return "Waiting for the host to start the CAD agent.";
  if (status === "running") return "The CAD agent is authoring and checking the model.";
  if (status === "waiting") return "The CAD agent needs user input or permission.";
  if (status === "processing") return "The sealed runtime is processing STEP and preview artifacts.";
  if (status === "publishing") return "Valuable outputs are being published to Files.";
  if (status === "completed") return "Generation and publication completed.";
  if (status === "cancelled") return "The run was cancelled.";
  if (status === "outcome-unknown") return "The agent outcome is uncertain; no automatic retry will run.";
  return "The run did not complete.";
}
