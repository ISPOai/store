import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Activity, Bot, RefreshCw, TriangleAlert } from "lucide-react";
import { assistant, entities, host, ui } from "@ispo/sdk";
import { useAgentActivities } from "@ispo/sdk/react";

import { CadGenerationForm } from "@/components/cad-generation-form";
import { CadGenerationStatus } from "@/components/cad-generation-status";
import { CadModelList } from "@/components/cad-model-list";
import { CadPreview } from "@/components/cad-preview";
import { CadToolbar } from "@/components/cad-toolbar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { markCadCommandsReady } from "@/commands/cad-commands";
import {
  GENERATION_TYPE,
  MODEL_TYPE,
  cachedPreviewRefForWorkspace,
  currentProjectId,
  isWorkingGeneration,
  normalizeEntityRecord,
  previewArtifactName,
  shouldReconcileGenerationPreview,
  type CadGeneration,
  type CadModel,
  type EntityRecord,
} from "@/features/generations/generation-model";
import {
  registerImportedModel,
  startCadGeneration,
} from "@/features/generations/generation-service";
import { useCadData } from "@/features/generations/generation-subscription";
import type { CadViewerHandle } from "@/features/viewer/cad-viewer-adapter";
import {
  getCadCatalog,
  getRuntimeHealth,
  processCadArtifact,
  type RuntimeHealth,
} from "@/lib/cad-api";
import {
  mimeForName,
  pickAndProcessCadArtifact,
  publishArtifact,
  readPublishedArtifact,
} from "@/lib/cad-artifacts";
import { classifyProjectError } from "@/lib/project-errors";

type ActivityRow = {
  id?: string;
  state?: string;
  title?: string;
  summary?: string;
  agentId?: string;
  terminalId?: string;
};

export function CadApp() {
  const projectId = currentProjectId();
  const data = useCadData();
  const { activities, status: activityStatus } = useAgentActivities({
    projectId,
    limit: 12,
  });
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<RuntimeHealth | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [busy, setBusy] = useState("");
  const [operationError, setOperationError] = useState("");
  const [mobileView, setMobileView] = useState("preview");
  const [previewRevision, setPreviewRevision] = useState(0);
  const hydratedRuns = useRef(new Set<string>());
  const capturedRuns = useRef(new Set<string>());
  const viewerRef = useRef<CadViewerHandle>(null);

  const selectedModel = useMemo(
    () => data.models.find((model) => model.id === selectedModelId) ?? data.models[0] ?? null,
    [data.models, selectedModelId],
  );
  const selectedGeneration = useMemo(() => {
    if (!selectedModel?.data.activeGenerationId) return null;
    return data.generations.find(
      (generation) => generation.id === selectedModel.data.activeGenerationId,
    ) ?? null;
  }, [data.generations, selectedModel]);
  const workingRuns = useMemo(
    () => data.generations.filter((generation) => isWorkingGeneration(generation.data.status)),
    [data.generations],
  );
  const activityRows = activities as ActivityRow[];

  const refreshRuntime = useCallback(async () => {
    try {
      const health = await getRuntimeHealth();
      hydratedRuns.current.clear();
      setRuntime(health);
      setRuntimeError("");
    } catch (error) {
      setRuntime(null);
      setRuntimeError(
        error instanceof Error
          ? error.message
          : "The confirmed sealed CAD runtime is not available.",
      );
    }
  }, []);

  useEffect(() => {
    void refreshRuntime();
  }, [refreshRuntime]);

  useEffect(() => {
    if (!selectedModelId && data.models[0]) {
      setSelectedModelId(data.models[0].id);
    }
  }, [data.models, selectedModelId]);

  useEffect(() => {
    if (data.status === "ready") {
      markCadCommandsReady();
    }
  }, [data.status]);

  useEffect(() => {
    assistant.context.replace({
      title: "CAD",
      summary: `${data.models.length} models · ${workingRuns.length} active runs · ${runtime?.ok ? "runtime ready" : "runtime held"}`,
      breadcrumbs: ["CAD", selectedModel?.data.title || "Workspace"],
      selection: selectedModel?.data.title || "No model selected",
      status: workingRuns.length ? "working" : runtime?.ok ? "ready" : "held",
      updatedAt: new Date().toISOString(),
    });
  }, [workingRuns.length, data.models.length, runtime?.ok, selectedModel?.data.title]);

  useEffect(() => {
    const generation = selectedGeneration;
    const model = selectedModel;
    if (
      !runtime?.ok ||
      !generation ||
      !model ||
      !shouldReconcileGenerationPreview(generation.data, model.data) ||
      hydratedRuns.current.has(generation.id)
    ) {
      return;
    }
    hydratedRuns.current.add(generation.id);
    void reconcileGenerationPreview(generation, model)
      .then((rehydrated) => {
        if (rehydrated) setPreviewRevision((revision) => revision + 1);
        return data.refresh();
      })
      .catch((error) => {
        hydratedRuns.current.delete(generation.id);
        setOperationError(
          classifyProjectError(
            error,
            "The saved preview could not be restored to the CAD runtime.",
          ).message,
        );
      });
  }, [data, runtime?.ok, selectedGeneration, selectedModel]);

  const generate = async (input: { title: string; prompt: string }) => {
    setBusy("generate");
    setOperationError("");
    try {
      const result = await startCadGeneration(input);
      setSelectedModelId(result.model.id);
      setMobileView("preview");
      await data.refresh();
      await notify("CAD agent started", `${input.title} is now generating.`);
    } catch (error) {
      const classified = classifyProjectError(error, "The CAD generation could not be started.");
      setOperationError(classified.message);
    } finally {
      setBusy("");
    }
  };

  const importArtifact = async () => {
    setBusy("import");
    setOperationError("");
    const workspaceKey = createImportKey();
    try {
      const result = await pickAndProcessCadArtifact(workspaceKey);
      if (!result) return;
      const registered = await registerImportedModel({
        title: titleFromFile(result.name),
        name: result.name,
        previewRef: result.processed.preview?.url ?? null,
        workspaceKey,
        publishedArtifact: result.publishedArtifact,
      });
      setSelectedModelId(registered.model.id);
      setMobileView("preview");
      await data.refresh();
      await notify("CAD artifact opened", result.name);
    } catch (error) {
      const classified = classifyProjectError(error, "The CAD artifact could not be opened.");
      if (classified.kind !== "cancelled") setOperationError(classified.message);
    } finally {
      setBusy("");
    }
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      await notify("Copied", label);
    } catch {
      setOperationError(`${label} could not be copied.`);
    }
  };

  const openAgent = (terminalId: string) => {
    host.navigate({
      projectId,
      surface: { kind: "agents", terminalId },
    });
  };

  const storeSnapshot = useCallback(async (dataUrl: string) => {
    const generation = selectedGeneration;
    if (!generation || capturedRuns.current.has(generation.id)) return;
    // Durable skip: a remounted warm iframe clears the in-memory set, but an
    // already-published snapshot must not re-publish or re-toast on every load.
    const alreadyPublished = generation.data.publishedArtifacts.some(
      (artifact) => artifact.name === "snapshot.png" && artifact.kind === "snapshot",
    );
    if (alreadyPublished) {
      capturedRuns.current.add(generation.id);
      return;
    }
    capturedRuns.current.add(generation.id);
    try {
      const bytes = dataUrlBytes(dataUrl);
      const name = "snapshot.png";
      const published = await publishArtifact(bytes, name, "image/png");
      const now = new Date().toISOString();
      const latestGeneration = normalizeEntityRecord<CadGeneration>(
        await entities.get<CadGeneration>(GENERATION_TYPE, generation.id),
      );
      if (
        latestGeneration.data.publishedArtifacts.some(
          (artifact) => artifact.name === name && artifact.kind === "snapshot",
        )
      ) {
        return;
      }
      const artifactNames = Array.from(new Set([...latestGeneration.data.artifactNames, name]));
      const publishedArtifacts = [
        ...latestGeneration.data.publishedArtifacts.filter((artifact) => artifact.name !== name),
        {
          ...published,
          name,
          kind: "snapshot" as const,
        },
      ];
      await entities.update<CadGeneration>(
        GENERATION_TYPE,
        generation.id,
        {
          artifactNames,
          publishedArtifacts,
          updatedAt: now,
        },
      );
      await data.refresh();
      await notify("Snapshot published", `${selectedModel?.data.title || "CAD model"} is ready for visual review.`);
    } catch (error) {
      capturedRuns.current.delete(generation.id);
      setOperationError(
        classifyProjectError(error, "The rendered snapshot could not be published.").message,
      );
    }
  }, [data.refresh, selectedGeneration, selectedModel?.data.title]);

  const selection = (
    <CadModelList
      models={data.models}
      generations={data.generations}
      selectedId={selectedModel?.id ?? null}
      loading={data.status === "loading"}
      onSelect={(id) => {
        setSelectedModelId(id);
        setMobileView("preview");
      }}
    />
  );

  const preview = (
    <CadPreview
      ref={viewerRef}
      sourceUrl={selectedModel?.data.previewRef ?? null}
      modelTitle={selectedModel?.data.title ?? null}
      runtimeAvailable={Boolean(runtime?.ok)}
      revision={previewRevision}
      onSnapshotReady={storeSnapshot}
    />
  );

  const inspector = (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex flex-col gap-5 p-4">
        <CadGenerationForm
          busy={busy === "generate"}
          disabled={data.status !== "ready" || !runtime?.ok}
          onGenerate={generate}
        />
        {operationError ? (
          <Alert variant="destructive">
            <TriangleAlert strokeWidth={1.7} />
            <AlertTitle>Action unavailable</AlertTitle>
            <AlertDescription>{operationError}</AlertDescription>
          </Alert>
        ) : null}
        <CadGenerationStatus
          model={selectedModel}
          generation={selectedGeneration}
          onOpenAgent={openAgent}
          onCopy={(value, label) => void copyValue(value, label)}
        />
      </div>
    </div>
  );

  return (
    <div className="h-dvh text-foreground antialiased">
      <main className="isolate flex h-full min-h-0 flex-col overflow-hidden bg-card text-card-foreground">
        <CadToolbar
          runtime={runtime}
          busy={Boolean(busy)}
          onImport={() => void importArtifact()}
          onRefresh={() => {
            void refreshRuntime();
            void data.refresh();
          }}
        />

        {runtimeError ? (
          <div className="shrink-0 border-b border-border bg-muted px-4 py-3">
            <Alert className="bg-background">
              <TriangleAlert strokeWidth={1.7} />
              <AlertTitle>Sealed runtime held</AlertTitle>
              <AlertDescription className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <p>{runtimeError}</p>
                <Button type="button" variant="secondary" onClick={() => void refreshRuntime()}>
                  <RefreshCw strokeWidth={1.7} />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {data.status === "denied" || data.status === "error" ? (
          <div className="shrink-0 border-b border-border bg-muted px-4 py-3">
            <Alert variant="destructive">
              <TriangleAlert strokeWidth={1.7} />
              <AlertTitle>CAD records unavailable</AlertTitle>
              <AlertDescription className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <p>{data.error?.message}</p>
                <Button type="button" variant="secondary" onClick={() => void data.refresh()}>
                  <RefreshCw strokeWidth={1.7} />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <Tabs
          value={mobileView}
          onValueChange={setMobileView}
          className="flex min-h-0 flex-1 gap-0 md:hidden"
        >
          <div className="shrink-0 border-b border-border px-3 py-2.5">
            <TabsList className="w-full">
              <TabsTrigger value="models" className="flex-1">Models</TabsTrigger>
              <TabsTrigger value="preview" className="flex-1">Preview</TabsTrigger>
              <TabsTrigger value="build" className="flex-1">Build</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="models" className="min-h-0 overflow-auto">{selection}</TabsContent>
          <TabsContent value="preview" className="min-h-0">{preview}</TabsContent>
          <TabsContent value="build" className="min-h-0 overflow-auto">{inspector}</TabsContent>
        </Tabs>

        <div className="hidden min-h-0 flex-1 grid-cols-[240px_minmax(360px,1fr)_320px] md:grid">
          <aside className="flex min-h-0 flex-col border-r border-border bg-muted/35">
            <div className="flex min-h-[48px] shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
              <h2 className="text-sm font-medium">Models</h2>
              <Badge variant="outline">{data.models.length}</Badge>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">{selection}</div>
            <AgentActivity
              rows={activityRows}
              status={String(activityStatus)}
              activeCount={workingRuns.length}
              onOpen={openAgent}
            />
          </aside>
          <div className="flex min-h-0 flex-col">{preview}</div>
          <aside className="flex min-h-0 flex-col border-l border-border bg-card">{inspector}</aside>
        </div>
      </main>
    </div>
  );
}

function AgentActivity({
  rows,
  status,
  activeCount,
  onOpen,
}: {
  rows: ActivityRow[];
  status: string;
  activeCount: number;
  onOpen: (terminalId: string) => void;
}) {
  return (
    <section className="flex shrink-0 flex-col gap-2 border-t border-border p-3">
      <div className="flex items-center gap-2">
        <Activity className="size-3.5 opacity-[0.72]" strokeWidth={1.7} />
        <h2 className="text-sm font-medium">Agent activity</h2>
        <Badge variant="outline">{activeCount}</Badge>
      </div>
      {status === "loading" ? (
        <Skeleton className="h-10 w-full" />
      ) : rows.length ? (
        rows.slice(0, 2).map((row, index) => (
          <button
            key={row.id ?? index}
            type="button"
            className="grid min-h-[42px] grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[7px] px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--w-hover-wash-soft)]"
            onClick={() => row.terminalId && onOpen(row.terminalId)}
          >
            <Bot className="size-3.5 opacity-[0.72]" strokeWidth={1.7} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{row.title || row.agentId || "Codex agent"}</span>
              <span className="block truncate text-xs text-muted-foreground">{row.state || row.summary || "Active"}</span>
            </span>
          </button>
        ))
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No active CAD agents.
        </p>
      )}
    </section>
  );
}

async function reconcileGenerationPreview(
  generation: EntityRecord<CadGeneration>,
  model: EntityRecord<CadModel>,
) {
  const catalog = await getCadCatalog();
  let previewRef = cachedPreviewRefForWorkspace(
    model.data.previewRef,
    generation.data.workspaceKey,
    catalog.entries,
  );
  let rehydrated = false;
  if (!previewRef) {
    const name = previewArtifactName(generation.data.artifactNames);
    if (!name) return;
    const bytes = await readPublishedArtifact(generation.data, name);
    const processed = await processCadArtifact({
      workspaceKey: generation.data.workspaceKey,
      name,
      mimeType: mimeForName(name),
      bytes,
    });
    previewRef = processed.preview?.url ?? null;
    if (!previewRef) return;
    rehydrated = true;
  }

  const now = new Date().toISOString();
  const modelPatch: Partial<CadModel> = {};
  if (model.data.previewRef !== previewRef) {
    modelPatch.previewRef = previewRef;
  }
  if (generation.data.status === "completed" && model.data.status !== "ready") {
    modelPatch.status = "ready";
  }
  if (Object.keys(modelPatch).length) {
    modelPatch.updatedAt = now;
  }

  await Promise.all([
    Object.keys(modelPatch).length
      ? entities.update<CadModel>(
      MODEL_TYPE,
      model.id,
      modelPatch,
    )
      : Promise.resolve(),
    generation.data.status !== "completed" || generation.data.completedAt
      ? Promise.resolve()
      : entities.update<CadGeneration>(
        GENERATION_TYPE,
        generation.id,
        {
          completedAt: now,
          updatedAt: now,
        },
      ),
  ]);
  return rehydrated;
}

function createImportKey() {
  const suffix = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 12)
    ?? Math.random().toString(36).slice(2, 14);
  return `import-${Date.now().toString(36)}-${suffix}`.slice(0, 96);
}

function titleFromFile(name: string) {
  const stem = name.replace(/\.(step|stp|stl|glb)$/i, "").replace(/[-_]+/g, " ").trim();
  return stem ? stem.slice(0, 256) : "Imported CAD model";
}

function dataUrlBytes(dataUrl: string) {
  const encoded = dataUrl.split(",", 2)[1];
  if (!encoded || !dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("The CAD viewer returned an invalid PNG snapshot.");
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function notify(title: string, body: string) {
  await ui.notify({ title, body }).catch(() => undefined);
}
