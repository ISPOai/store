import { commands } from "@ispo/sdk";

import {
  startCadGeneration,
  startCadInspection,
  type CadSdk,
} from "@/features/generations/generation-service";

export const generateCadCommand = commands.define(
  {
    id: "generate-cad",
    label: "Generate CAD",
    description: "Start one bounded STEP-first CAD generation in this project.",
    agent: "codex",
    caution: "confirm",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["task", "title", "prompt"],
      properties: {
        task: { const: "generate-cad" },
        title: { type: "string", minLength: 1, maxLength: 256 },
        prompt: { type: "string", minLength: 1, maxLength: 8192 },
      },
    },
    resultSchema: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "runId", "artifacts"],
      properties: {
        kind: { const: "agent-run" },
        runId: { type: "string", minLength: 1, maxLength: 512 },
        artifacts: {
          type: "array",
          maxItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["channel", "ref"],
            properties: {
              channel: { const: "entities" },
              ref: { type: "string", minLength: 1, maxLength: 512 },
            },
          },
        },
      },
    },
    invocationMode: "agent-task",
    resultChannels: ["agent-run"],
  },
  async (input, ctx) => {
    const result = await startCadGeneration(input, ctx.sdk as unknown as CadSdk);
    return {
      kind: "agent-run" as const,
      runId: result.terminalId || result.generation.id,
      artifacts: [{ channel: "entities" as const, ref: result.generation.id }],
    };
  },
);

export const inspectCadCommand = commands.define(
  {
    id: "inspect-cad",
    label: "Inspect CAD",
    description: "Start one bounded inspection for an existing CAD model.",
    agent: "codex",
    caution: "confirm",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["task", "modelId", "request"],
      properties: {
        task: { const: "inspect-cad" },
        modelId: { type: "string", minLength: 1, maxLength: 512 },
        request: { type: "string", minLength: 1, maxLength: 4096 },
      },
    },
    resultSchema: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "runId", "artifacts"],
      properties: {
        kind: { const: "agent-run" },
        runId: { type: "string", minLength: 1, maxLength: 512 },
        artifacts: {
          type: "array",
          maxItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["channel", "ref"],
            properties: {
              channel: { const: "entities" },
              ref: { type: "string", minLength: 1, maxLength: 512 },
            },
          },
        },
      },
    },
    invocationMode: "agent-task",
    resultChannels: ["agent-run"],
  },
  async (input, ctx) => {
    const result = await startCadInspection(input, ctx.sdk as unknown as CadSdk);
    return {
      kind: "agent-run" as const,
      runId: result.terminalId || result.generation.id,
      artifacts: [{ channel: "entities" as const, ref: result.generation.id }],
    };
  },
);

export const cadProjectCommands = commands.expose([
  generateCadCommand,
  inspectCadCommand,
]);

export function markCadCommandsReady() {
  cadProjectCommands.ready();
}
