import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";

import { commands } from "@ispo/sdk";

/**
 * ISPO command catalog.
 *
 * The one code-first use case this build exposes to the host. Excalidraw keeps
 * no durable store of its own here — `ispo.ts` explains that Files is the only
 * export surface — so the useful headless verb is the producing one: turn a
 * list of labels into a real `.excalidraw` scene and hand it to Files.
 *
 * The scene is built from element skeletons rather than from the live canvas,
 * so the handler never touches the mounted editor and serves a host call
 * identically whether or not the app is on screen. `files.save` is the same
 * grantless powerbox the app's own export uses: the picker is the consent
 * surface, so this needs no standing grant beyond `requests.files: ["pick"]`.
 */

const MAX_LABELS = 50;
const LABEL_SPACING_Y = 60;

const sanitizeFileName = (name: string) =>
  (name || "scene").replace(/[\\/:*?"<>|]/g, "_").trim() || "scene";

const sceneFileName = (name: string) => {
  const sanitized = sanitizeFileName(name);
  return sanitized.toLowerCase().endsWith(".excalidraw")
    ? sanitized
    : `${sanitized}.excalidraw`;
};

export const createSceneCommand = commands.define(
  {
    id: "create-scene",
    label: "Create scene from labels",
    description:
      "Create a new Excalidraw scene file in Files with one text element per label, stacked top to bottom.",
    promptExamples: ["Sketch a scene with these steps…", "Make an Excalidraw scene"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["labels"],
      properties: {
        labels: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: { type: "string", minLength: 1, maxLength: 512 },
        },
        name: { type: "string", minLength: 1, maxLength: 128 },
      },
    },
    resultSchema: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "data"],
      properties: {
        kind: { const: "json" },
        data: {
          type: "object",
          additionalProperties: false,
          required: ["saved"],
          properties: {
            saved: { type: "boolean" },
            path: { type: "string", maxLength: 1024 },
            elementCount: { type: "number" },
          },
        },
      },
    },
    invocationMode: "iframe-action",
    resultChannels: ["json"],
    aliases: ["new excalidraw scene"],
  },
  async (input, ctx) => {
    const labels = input.labels.slice(0, MAX_LABELS);
    const elements = convertToExcalidrawElements(
      labels.map((text, index) => ({
        type: "text" as const,
        x: 0,
        y: index * LABEL_SPACING_Y,
        text,
      })),
    );
    const scene = serializeAsJSON(elements, getDefaultAppState(), {}, "local");

    // The user picks the destination — or cancels, which is an ordinary
    // outcome here, not a failure: report `saved: false` and leave Files alone.
    const saved = await ctx.sdk.files.save({
      content: scene,
      name: sceneFileName(input.name ?? "scene"),
      accept: ["application/json", ".excalidraw"],
    });

    if (!saved) return { kind: "json" as const, data: { saved: false } };
    return {
      kind: "json" as const,
      data: { saved: true, path: saved.path, elementCount: elements.length },
    };
  },
);

export const projectCommands = commands.expose([createSceneCommand]);

// Scene construction and the Files powerbox are both available as soon as this
// module has registered the handler; nothing in the editor has to mount first.
projectCommands.ready();
