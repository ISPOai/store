import { files } from "@ispo/sdk";

import { processCadArtifact, type ProcessedArtifact } from "./cad-api";
import type { CadGeneration, PublishedArtifact } from "@/features/generations/generation-model";

const ACCEPTED_INPUTS = [
  ".step",
  ".stp",
  ".stl",
  ".glb",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export async function pickAndProcessCadArtifact(workspaceKey: string): Promise<{
  name: string;
  mimeType: string;
  processed: ProcessedArtifact;
  publishedArtifact: PublishedArtifact;
} | null> {
  const picked = await files.pick({
    accept: ACCEPTED_INPUTS,
    multiple: false,
  });
  const selected = Array.isArray(picked) ? picked[0] : picked;
  if (!selected) return null;
  if (!selected.url) {
    throw new Error("The selected file did not include a readable reference.");
  }
  const bytes = await readSelectedUrl(selected.url);
  const name = safeArtifactName(selected.name);
  const mimeType = selected.mimeType || mimeForName(name);
  const processed = await processCadArtifact({
    workspaceKey,
    name,
    mimeType,
    bytes,
  });
  const publishedArtifact = await publishArtifact(bytes, name, mimeType);
  return { name, mimeType, processed, publishedArtifact };
}

export async function publishArtifact(
  content: Uint8Array,
  name: string,
  mimeType = mimeForName(name),
): Promise<PublishedArtifact> {
  const safeName = safeArtifactName(name);
  const published = await files.publish({ content, name: safeName, mimeType });
  const listing = await files.list();
  const row = listing.find((entry) => entry.publicId === published.publicId);
  if (!row) throw new Error("The artifact was published but could not be verified in Files.");
  return {
    name: safeName,
    kind: artifactKind(safeName),
    mimeType,
    size: row.size,
    filesPath: row.path,
    filesRef: row.publicId,
  };
}

export async function readPublishedArtifact(
  generation: Pick<CadGeneration, "publishedArtifacts">,
  name: string,
): Promise<Uint8Array> {
  const artifact = generation.publishedArtifacts.find(
    (candidate) => candidate.name === name && candidate.filesRef,
  );
  if (!artifact?.filesRef) {
    throw new Error(`The CAD artifact has not been published to Files: ${name}`);
  }
  const listing = await files.list();
  const row = listing.find((entry) => entry.publicId === artifact.filesRef);
  if (!row) throw new Error(`The CAD artifact is unavailable in Files: ${name}`);
  const response = await fetch(row.url);
  if (!response.ok) throw new Error(`Could not read the CAD artifact (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function saveCopyFromUrl(url: string, name: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read the preview (${response.status}).`);
  return files.save({
    content: new Uint8Array(await response.arrayBuffer()),
    name,
  });
}

export function safeArtifactName(value: string) {
  const base = value.split(/[\\/]/).pop()?.replace(/[^A-Za-z0-9._-]+/g, "-") || "artifact.step";
  return base.slice(0, 256);
}

export function mimeForName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".step") || lower.endsWith(".stp")) return "model/step";
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".stl")) return "model/stl";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".py")) return "text/x-python";
  if (lower.endsWith(".md")) return "text/markdown";
  return "application/octet-stream";
}

function artifactKind(name: string): PublishedArtifact["kind"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".py")) return "source";
  if (/\.(?:step|stp|stl)$/.test(lower)) return "step";
  if (lower.endsWith(".glb")) return "glb";
  if (/\.(?:png|jpe?g|webp)$/.test(lower)) return "snapshot";
  if (lower.includes("validation") || lower.includes("inspection")) return "validation";
  if (lower.includes("topology")) return "topology";
  return "other";
}

async function readSelectedUrl(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read the selected file (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}
