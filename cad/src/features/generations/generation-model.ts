export const MODEL_TYPE = "store.cad.model";
export const GENERATION_TYPE = "store.cad.generation";

type ProjectLocation = Pick<Location, "protocol" | "hostname" | "pathname">;

const PROJECT_ID_PATTERN = /^proj_[a-f0-9]{32}$/;

export function projectIdFromLocation(location: ProjectLocation): string {
  const candidate = location.protocol === "project:"
    ? location.hostname
    : location.protocol === "apps:" && location.hostname === "workspace"
      ? location.pathname.split("/").filter(Boolean)[0] ?? ""
      : "";
  if (!PROJECT_ID_PATTERN.test(candidate)) {
    throw new Error("CAD must run from an ISPO project surface.");
  }
  return candidate;
}

export function currentProjectId(): string {
  return projectIdFromLocation(window.location);
}

export type ModelStatus = "draft" | "generating" | "ready" | "failed";
export type GenerationStatus =
  | "queued"
  | "running"
  | "waiting"
  | "processing"
  | "publishing"
  | "completed"
  | "failed"
  | "cancelled"
  | "outcome-unknown";

export type ValidationStatus = "pending" | "passed" | "failed" | "partial" | "not-run";

export type ValidationSummary = {
  status: ValidationStatus;
  summary: string;
  checkCount: number;
  passedCount: number;
  failedCount: number;
  warningCount: number;
};

export type PublishedArtifact = {
  name: string;
  kind: "source" | "step" | "glb" | "snapshot" | "validation" | "topology" | "reference" | "other";
  mimeType: string;
  size: number;
  filesPath: string | null;
  filesRef: string | null;
};

export type CadModel = {
  title: string;
  prompt: string;
  status: ModelStatus;
  activeGenerationId: string | null;
  previewRef: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CadGeneration = {
  modelId: string;
  agent: "codex";
  terminalId: string | null;
  status: GenerationStatus;
  summary: string | null;
  error: string | null;
  workspaceKey: string;
  artifactNames: string[];
  publishedArtifacts: PublishedArtifact[];
  validation: ValidationSummary | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EntityRecord<T> = {
  id: string;
  type?: string;
  version?: number;
  data: T;
  createdAt?: string;
  updatedAt?: string;
};

export function normalizeEntityRecord<T>(input: unknown): EntityRecord<T> {
  const raw = asBag(input);
  const nested = asBag(raw.data);
  const id = String(raw.id ?? raw.entityId ?? nested.id ?? "");
  if (!id) throw new Error("Entity record is missing an id.");
  const data = (Object.keys(nested).length ? nested : stripMetadata(raw)) as T;
  return {
    id,
    type: typeof raw.type === "string" ? raw.type : undefined,
    version: typeof raw.version === "number" ? raw.version : undefined,
    data,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

export function isActiveGeneration(status: GenerationStatus) {
  return ["queued", "running", "waiting", "processing", "publishing"].includes(status);
}

export function isWorkingGeneration(status: ModelStatus | GenerationStatus) {
  return ["generating", "queued", "running", "processing", "publishing"].includes(status);
}

export function visibleModelStatus(
  model: Pick<CadModel, "status" | "activeGenerationId">,
  generations: Array<{
    id: string;
    data: Pick<CadGeneration, "status">;
  }>,
): ModelStatus | GenerationStatus {
  if (!model.activeGenerationId) return model.status;
  return generations.find(
    (generation) => generation.id === model.activeGenerationId,
  )?.data.status ?? model.status;
}

export function needsCompletedGenerationReconciliation(
  generation: Pick<CadGeneration, "status" | "completedAt">,
  model: Pick<CadModel, "status" | "previewRef">,
) {
  return generation.status === "completed" && (
    !generation.completedAt ||
    model.status !== "ready" ||
    !model.previewRef
  );
}

export function previewArtifactName(artifactNames: string[]) {
  return artifactNames.find((name) => name.toLowerCase() === "model.glb")
    ?? artifactNames.find((name) => name.toLowerCase().endsWith(".glb"))
    ?? artifactNames.find((name) => /\.(step|stp)$/i.test(name))
    ?? null;
}

export function shouldReconcileGenerationPreview(
  generation: Pick<CadGeneration, "status" | "completedAt" | "artifactNames">,
  model: Pick<CadModel, "status" | "previewRef">,
) {
  return Boolean(previewArtifactName(generation.artifactNames))
    || needsCompletedGenerationReconciliation(generation, model);
}

export function cachedPreviewRefForWorkspace(
  currentPreviewRef: string | null,
  workspaceKey: string,
  entries: Array<{ file: string; url: string }>,
) {
  if (
    currentPreviewRef
    && entries.some((entry) => entry.url === currentPreviewRef)
  ) {
    return currentPreviewRef;
  }
  const workspacePrefix = `${workspaceKey.toLowerCase()}/`;
  return entries.find((entry) => {
    const file = entry.file.replace(/^workspaces\//i, "").toLowerCase();
    return file.startsWith(workspacePrefix) && file.endsWith(".glb");
  })?.url ?? null;
}

export function statusLabel(status: string) {
  return status
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function asBag(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stripMetadata(raw: Record<string, unknown>) {
  const next = { ...raw };
  for (const key of ["id", "entityId", "type", "version", "createdAt", "updatedAt", "seq", "deletedAt"]) {
    delete next[key];
  }
  return next;
}
