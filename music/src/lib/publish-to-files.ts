// Publish an exported bounce into the home Files app as a `files.file` entity.
//
// There is no `files.publish` SDK method — the documented + proven recipe (see
// morpher/src/lib/files.ts) is: write a JSON payload to shared storage carrying
// the bytes as a base64 data-url, then create a `files.file` entity that points
// at it. The home Files browser lists the entity and reads the payload back to
// preview it.
//
// Best-effort by contract: the `files.file` grant is owned by the Files app and
// may not be issued, so callers should treat a throw as "not added to Files"
// rather than a failed export.

import { entities, shared } from "@ispo/sdk"

const FILES_DIR = "files/v1"
const DEFAULT_FOLDER = "/Music"

// Chunked base64 — String.fromCharCode(...wholeArray) overflows the call stack
// for multi-MB buffers (a WAV bounce is several MB), so feed it 32KB at a time.
function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

// Register `bytes` in the home Files app. Throws if the files.file entity can't
// be created (e.g. grant not issued) — the caller decides how soft that is.
export async function publishToFiles(
  bytes: Uint8Array,
  name: string,
  mime: string,
  folder: string = DEFAULT_FOLDER,
): Promise<{ path: string }> {
  const publicId = `music-${crypto.randomUUID()}`
  const path = `${folder}/${name}`
  const storagePath = `${FILES_DIR}/${publicId}.json`
  const now = new Date().toISOString()

  // (1) The entity the Files app lists — metadata only, matches the canonical
  //     files.file schema (all fields required). This is the grant-gated call,
  //     so do it FIRST: if the files.file grant isn't issued it throws here,
  //     before we waste a ~MB payload write on an orphaned file.
  await entities.create("files.file", {
    schemaVersion: 1,
    publicId,
    name,
    path,
    folderPath: folder,
    extension: `.${name.split(".").pop() ?? ""}`,
    mimeType: mime,
    size: bytes.length,
    storagePath,
    storageEncoding: "data-url",
    previewText: "",
    favorite: false,
    createdAt: now,
    updatedAt: now,
  })

  // (2) The payload the Files preview reads — bytes ride as a data-url in JSON.
  await shared.write(
    storagePath,
    JSON.stringify({
      schemaVersion: 1,
      publicId,
      name,
      path,
      mimeType: mime,
      size: bytes.length,
      encoding: "data-url",
      content: bytesToDataUrl(bytes, mime),
      savedAt: now,
    }),
  )

  return { path }
}
