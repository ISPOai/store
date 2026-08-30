import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MAX_BODY_BYTES = 64 * 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;
export const WORKSPACES_DIR = "workspaces";

const PROJECT_DESCRIPTOR_URL = new URL("../.ispo/project.json", import.meta.url);
const PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const WORKSPACE_KEY = /^[a-z0-9](?:[a-z0-9-]{0,94}[a-z0-9])?$/;
const ARTIFACT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;
const SUPPORTED_EXTENSIONS = new Set([
  ".step",
  ".stp",
  ".glb",
  ".stl",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".py",
]);

export function createRuntimeWorkspaceRoot({
  projectId = resolveRuntimeProjectId(),
  tempRoot = resolveRuntimeTempRoot(),
} = {}) {
  const parent = runtimeWorkspaceParent(projectId, tempRoot);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
  const root = fs.mkdtempSync(path.join(parent, "cad-"));
  fs.mkdirSync(path.join(root, WORKSPACES_DIR), { recursive: true });
  return root;
}

export function resolveRuntimeTempRoot({
  env = process.env,
  platform = process.platform,
  fallback = os.tmpdir(),
} = {}) {
  for (const candidate of [env.ISPO_RUNTIME_TMPDIR, env.TMPDIR]) {
    const resolved = absoluteDirectory(candidate);
    if (resolved) return resolved;
  }

  const resolvedFallback = path.resolve(fallback);
  if (platform === "darwin" && resolvedFallback === "/tmp") {
    throw new CadBoundaryError(
      "runtime-temp-unavailable",
      "The sealed runtime did not receive TMPDIR or ISPO_RUNTIME_TMPDIR; it cannot locate the host-approved project temp root.",
    );
  }

  return resolvedFallback;
}

export function runtimeWorkspaceParent(projectId, tempRoot = os.tmpdir()) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!PROJECT_ID.test(normalizedProjectId)) {
    throw new CadBoundaryError("invalid-project", "Runtime project ID is invalid.");
  }
  return path.join(path.resolve(tempRoot), "ispo", normalizedProjectId);
}

function absoluteDirectory(value) {
  const candidate = String(value || "").trim();
  return candidate && path.isAbsolute(candidate) ? path.resolve(candidate) : null;
}

export function resolveRuntimeProjectId() {
  const injected = String(process.env.ISPO_PROJECT || "").trim();
  if (injected) {
    runtimeWorkspaceParent(injected);
    return injected;
  }
  try {
    const descriptor = JSON.parse(fs.readFileSync(PROJECT_DESCRIPTOR_URL, "utf8"));
    const projectId = String(descriptor?.projectId || "").trim();
    runtimeWorkspaceParent(projectId);
    return projectId;
  } catch (error) {
    if (error instanceof CadBoundaryError) throw error;
    throw new CadBoundaryError("invalid-project", "Project descriptor is unavailable.");
  }
}

export function normalizeWorkspaceKey(value) {
  const key = String(value || "").trim();
  if (!WORKSPACE_KEY.test(key)) {
    throw new CadBoundaryError("invalid-workspace", "Workspace key is invalid.");
  }
  return key;
}

export function normalizeArtifactName(value) {
  const name = String(value || "").trim();
  if (
    !ARTIFACT_NAME.test(name) ||
    name.includes("\0") ||
    name.includes("/") ||
    name.includes("\\") ||
    path.basename(name) !== name
  ) {
    throw new CadBoundaryError("invalid-name", "Artifact name is invalid.");
  }
  const extension = extensionForName(name);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new CadBoundaryError("unsupported-extension", `Unsupported artifact extension: ${extension || "(none)"}.`);
  }
  return name;
}

export function extensionForName(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".step.glb")) return ".glb";
  return path.extname(lower);
}

export function workspaceDirectory(root, workspaceKey) {
  const key = normalizeWorkspaceKey(workspaceKey);
  const directory = path.join(root, WORKSPACES_DIR, key);
  fs.mkdirSync(directory, { recursive: true });
  assertInsideRoot(root, directory);
  return directory;
}

export function resolveWorkspaceArtifact(root, workspaceKey, artifactName) {
  const directory = workspaceDirectory(root, workspaceKey);
  const name = normalizeArtifactName(artifactName);
  const resolved = path.resolve(directory, name);
  assertInsideRoot(directory, resolved);
  assertNoSymlinkChain(directory, resolved);
  return resolved;
}

export function resolveAssetPath(root, relativePath) {
  const value = String(relativePath || "").trim();
  if (!value || value.includes("\0") || value.includes("\\") || path.isAbsolute(value)) {
    throw new CadBoundaryError("invalid-path", "Asset path is invalid.");
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    !normalized.startsWith(`${WORKSPACES_DIR}/`)
  ) {
    throw new CadBoundaryError("path-escape", "Asset path leaves the CAD workspace.");
  }
  const resolved = path.resolve(root, normalized);
  assertInsideRoot(root, resolved);
  assertNoSymlinkChain(root, resolved);
  return resolved;
}

export function relativeAssetPath(root, absolutePath) {
  const resolved = path.resolve(absolutePath);
  assertInsideRoot(root, resolved);
  return path.relative(root, resolved).split(path.sep).join("/");
}

export function assertArtifactBytes(name, bytes, declaredMimeType = "") {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new CadBoundaryError("empty-body", "Artifact body is empty.");
  }
  if (bytes.byteLength > MAX_ARTIFACT_BYTES) {
    throw new CadBoundaryError("artifact-too-large", "Artifact exceeds the size limit.");
  }
  const extension = extensionForName(name);
  const mimeType = String(declaredMimeType || "").split(";", 1)[0].trim().toLowerCase();
  const allowedMimes = mimeTypesForExtension(extension);
  if (mimeType && !allowedMimes.has(mimeType)) {
    throw new CadBoundaryError("mime-mismatch", "Artifact MIME type does not match its extension.");
  }

  if (extension === ".step" || extension === ".stp") {
    const prefix = Buffer.from(bytes.subarray(0, 64)).toString("utf8").trimStart();
    if (!prefix.startsWith("ISO-10303-21")) {
      throw new CadBoundaryError("magic-mismatch", "STEP signature is invalid.");
    }
  } else if (extension === ".glb") {
    if (bytes.byteLength < 12 || Buffer.from(bytes.subarray(0, 4)).toString("ascii") !== "glTF") {
      throw new CadBoundaryError("magic-mismatch", "GLB signature is invalid.");
    }
  } else if (extension === ".png") {
    const expected = "89504e470d0a1a0a";
    if (Buffer.from(bytes.subarray(0, 8)).toString("hex") !== expected) {
      throw new CadBoundaryError("magic-mismatch", "PNG signature is invalid.");
    }
  } else if (extension === ".jpg" || extension === ".jpeg") {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
      throw new CadBoundaryError("magic-mismatch", "JPEG signature is invalid.");
    }
  } else if (extension === ".webp") {
    const buffer = Buffer.from(bytes.subarray(0, 12));
    if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
      throw new CadBoundaryError("magic-mismatch", "WebP signature is invalid.");
    }
  } else if (extension === ".json") {
    try {
      JSON.parse(Buffer.from(bytes).toString("utf8"));
    } catch {
      throw new CadBoundaryError("magic-mismatch", "JSON artifact is invalid.");
    }
  }
}

export function contentTypeForPath(filePath) {
  const extension = extensionForName(filePath);
  return {
    ".step": "model/step",
    ".stp": "model/step",
    ".glb": "model/gltf-binary",
    ".stl": "model/stl",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".py": "text/x-python",
  }[extension] || "application/octet-stream";
}

export async function readBoundedBody(request, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new CadBoundaryError("body-too-large", "Request body exceeds the size limit.");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new CadBoundaryError("body-too-large", "Request body exceeds the size limit.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

export class CadBoundaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CadBoundaryError";
    this.code = code;
  }
}

function mimeTypesForExtension(extension) {
  const common = new Set(["application/octet-stream"]);
  const values = {
    ".step": ["model/step", "application/step", "text/plain"],
    ".stp": ["model/step", "application/step", "text/plain"],
    ".glb": ["model/gltf-binary"],
    ".stl": ["model/stl", "application/sla"],
    ".json": ["application/json", "text/json"],
    ".png": ["image/png"],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".webp": ["image/webp"],
    ".py": ["text/x-python", "text/plain"],
  }[extension] || [];
  for (const value of values) common.add(value);
  return common;
}

function assertInsideRoot(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new CadBoundaryError("path-escape", "Path leaves the CAD workspace.");
  }
}

function assertNoSymlinkChain(root, candidate) {
  const rootPath = path.resolve(root);
  const relative = path.relative(rootPath, path.resolve(candidate));
  let current = rootPath;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new CadBoundaryError("symlink-escape", "Symbolic links are not allowed in CAD workspaces.");
      }
    } catch (error) {
      if (error instanceof CadBoundaryError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
  }
}
