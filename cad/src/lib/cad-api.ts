export type RuntimeHealth = {
  ok: boolean;
  service: string;
  sealed: boolean;
  pythonReady: boolean;
  workspaceReady: boolean;
};

export type CadCatalogEntry = {
  file: string;
  kind: string;
  url: string;
  hash?: string;
  bytes?: number;
  sourceKind?: string;
  artifact?: {
    ok?: boolean;
    error?: { code?: string; message?: string };
  };
};

export type CadCatalog = {
  schemaVersion: number;
  entries: CadCatalogEntry[];
};

export type ProcessedArtifact = {
  ok: true;
  workspaceKey: string;
  file: string;
  source: ArtifactRef;
  preview: ArtifactRef | null;
  validation: unknown;
  updatedAt: string;
};

export type ArtifactRef = {
  file: string;
  url: string;
  mimeType: string;
  size: number;
};

export async function getRuntimeHealth(signal?: AbortSignal): Promise<RuntimeHealth> {
  return fetchJson<RuntimeHealth>("/api/health", { signal });
}

export async function getCadCatalog(signal?: AbortSignal): Promise<CadCatalog> {
  return fetchJson<CadCatalog>("/api/catalog", { signal });
}

export async function processCadArtifact(input: {
  workspaceKey: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  signal?: AbortSignal;
}): Promise<ProcessedArtifact> {
  const requestBytes = new Uint8Array(input.bytes.byteLength);
  requestBytes.set(input.bytes);
  const params = new URLSearchParams({
    file: input.name,
    workspace: input.workspaceKey,
  });
  const response = await fetch(`/api/step-artifact?${params.toString()}`, {
    method: "POST",
    headers: {
      "content-type": input.mimeType || "application/octet-stream",
    },
    body: requestBytes.buffer,
    signal: input.signal,
  });
  if (!response.ok) {
    throw await responseError(response, "The CAD runtime could not process this artifact.");
  }
  return response.json() as Promise<ProcessedArtifact>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });
  if (!response.ok) {
    throw await responseError(response, `CAD runtime request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

async function responseError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { message?: string; code?: string };
    const error = new Error(payload.message || fallback) as Error & { code?: string };
    error.code = payload.code;
    return error;
  } catch {
    return new Error(fallback);
  }
}
