import { exportToBlob } from "@excalidraw/excalidraw";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";

import { files as ispoFiles } from "@ispo/sdk";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

/**
 * ISPO export.
 *
 * This is the ONLY export surface in the ISPO-hosted build of Excalidraw.
 * Instead of writing to the local filesystem or uploading to a shareable-link
 * backend, both the editable scene and a rendered PNG are saved into ISPO Files
 * via the host Files picker (`files.save`). The picker itself is the consent
 * surface, so this only needs `requests.files: ["pick"]` in `.ispo/project.json`
 * and no standing grant.
 */

const sanitizeName = (name: string) =>
  (name || "excalidraw").replace(/[\\/:*?"<>|]/g, "_").trim() || "excalidraw";

const toBytes = (value: string | ArrayBuffer | Uint8Array) => {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  return new Uint8Array(value);
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read preview."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

const toBlobPart = (value: string | Uint8Array): BlobPart => {
  if (typeof value === "string") {
    return value;
  }
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
};

export const loadEditSessionFromISPO = async (sessionId: string) => {
  const session = await ispoFiles.editSession.read({ sessionId });
  const content = session.item.content;
  const blob = new Blob([toBlobPart(content)], {
    type: session.item.mimeType ?? "application/json",
  });
  const scene = await loadFromBlob(blob, null, null);
  return { session, scene };
};

export const saveEditSessionToISPO = async (
  sessionId: string,
  elements: readonly NonDeletedExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  name: string,
  expectedVersion?: number,
) => {
  if (elements.length === 0) {
    throw new Error("Cannot save an empty canvas.");
  }
  const serialized = serializeAsJSON(elements, appState, files, "local");
  const previewBlob = await exportToBlob({
    elements,
    appState: {
      ...appState,
      exportBackground: appState.exportBackground ?? true,
      viewBackgroundColor:
        appState.viewBackgroundColor ??
        getDefaultAppState().viewBackgroundColor,
    },
    files,
    mimeType: "image/png",
  });
  return ispoFiles.editSession.save({
    sessionId,
    content: serialized,
    preview: {
      dataUrl: await blobToDataUrl(previewBlob),
      mimeType: "image/png",
      name: `${sanitizeName(name)}.png`,
    },
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  });
};

/** Save the editable `.excalidraw` scene into ISPO Files. */
export const exportSceneToISPO = async (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  name: string,
) => {
  if (elements.length === 0) {
    throw new Error("Cannot export an empty canvas.");
  }
  const serialized = serializeAsJSON(elements, appState, files, "local");
  return ispoFiles.save({
    content: toBytes(serialized),
    name: `${sanitizeName(name)}.excalidraw`,
    accept: ["application/json", ".excalidraw"],
  });
};

/** Render the canvas to PNG and save it into ISPO Files. */
export const exportPngToISPO = async (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  name: string,
) => {
  if (elements.length === 0) {
    throw new Error("Cannot export an empty canvas.");
  }
  const blob = await exportToBlob({
    elements,
    appState: {
      ...appState,
      exportBackground: appState.exportBackground ?? true,
      viewBackgroundColor:
        appState.viewBackgroundColor ??
        getDefaultAppState().viewBackgroundColor,
    },
    files,
    mimeType: "image/png",
  });
  return ispoFiles.save({
    content: toBytes(await blob.arrayBuffer()),
    name: `${sanitizeName(name)}.png`,
    accept: ["image/png", ".png"],
  });
};
