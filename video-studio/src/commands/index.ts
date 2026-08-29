// Typed project commands: the same durable-state use cases the UI performs,
// exposed for host dispatch. Every handler is a thin envelope over the
// headless core in `./handlers.ts` (or, for the render path, the headless
// render service) — all mediated leaves travel through `ctx.sdk`, and the
// UI reuses these bindings' `.run()` paths where the workflow is
// durable-state-first (`newProject` → create-composition, export →
// export-video). Live-session workflows whose value is undo history and
// first-paint feedback (powerbox import, inspector edits) keep the session
// path and share the same pure clip builders the command uses. All metadata
// and schemas are inline and literal by contract: a computed schema drops
// the command from the build catalog.
import { commands } from '@ispo/sdk'
import { projectIdFromLocation } from '../app/project-id.ts'
import { publishExportPhase, setExportCancelHandle } from '../app/export-status.ts'
import { probeExportCapabilities } from '../capabilities/probes.ts'
import { CompositionService } from '../domain/compositions.ts'
import { ExportJobService } from '../domain/export-jobs.ts'
import { ProjectService } from '../domain/projects.ts'
import { runExport } from '../editor/export.ts'
import { filesDelivery } from '../editor/export-delivery.ts'
import { renderPreviewFrame } from '../editor/render-preview.ts'
import { sessionAssetLibrary, sessionFontSources } from '../editor/engine-singletons.ts'
import {
  applyTimelinePatch,
  createComposition,
  importMediaIntoComposition,
  inspectCompositionTimeline,
  requestExport,
  type CommandPorts,
} from './handlers.ts'

const PROJECT_ID = projectIdFromLocation()

function ports(sdk: {
  entities: CommandPorts['entities']
  files: CommandPorts['files']
  dialog: CommandPorts['dialog']
}): CommandPorts {
  return { projectId: PROJECT_ID, entities: sdk.entities, files: sdk.files, dialog: sdk.dialog }
}

export const createCompositionCommand = commands.define(
  {
    id: 'create-composition',
    label: 'Create composition',
    description: 'Create a new offline video composition with one empty scene placeholder.',
    promptExamples: ['Create a composition called Launch teaser', 'New 1080p composition at 24 fps'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 80 },
        width: { type: 'integer', minimum: 16, maximum: 7680 },
        height: { type: 'integer', minimum: 16, maximum: 4320 },
        fps: { type: 'integer', minimum: 1, maximum: 120 },
      },
    },
    resultSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'refs'],
      properties: {
        kind: { const: 'entities' },
        refs: {
          type: 'array',
          minItems: 1,
          maxItems: 2,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['projectId', 'type', 'id'],
            properties: {
              projectId: { type: 'string', minLength: 1, maxLength: 128 },
              type: { enum: ['video.project', 'video.composition'] },
              id: { type: 'string', minLength: 1, maxLength: 512 },
            },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['entities'],
  },
  async (input, ctx) => {
    const result = await createComposition(ports(ctx.sdk), input)
    return {
      kind: 'entities' as const,
      refs: [
        { projectId: result.projectId, type: 'video.project' as const, id: result.projectId },
        { projectId: result.projectId, type: 'video.composition' as const, id: result.compositionId },
      ],
    }
  },
)

export const inspectTimelineCommand = commands.define(
  {
    id: 'inspect-timeline',
    label: 'Inspect timeline',
    description: 'Read back one composition document as an addressed list of its clips.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['compositionId'],
      properties: {
        compositionId: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
    resultSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'refs', 'revision', 'rows'],
      properties: {
        kind: { const: 'entities' },
        refs: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['projectId', 'type', 'id'],
            properties: {
              projectId: { type: 'string', minLength: 1, maxLength: 128 },
              type: { const: 'video.composition' },
              id: { type: 'string', minLength: 1, maxLength: 512 },
            },
          },
        },
        revision: { type: 'integer', minimum: 0, maximum: 100000000 },
        rows: {
          type: 'array',
          maxItems: 600,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'tag'],
            properties: {
              path: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 63 }, maxItems: 12 },
              tag: { type: 'string', maxLength: 40 },
              name: { type: 'string', maxLength: 80 },
              start: { type: 'number', minimum: 0, maximum: 43200 },
              end: { type: 'number', minimum: 0, maximum: 43200 },
            },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['entities'],
  },
  async (input, ctx) => {
    const result = await inspectCompositionTimeline(ports(ctx.sdk), input)
    return {
      kind: 'entities' as const,
      refs: [{ projectId: PROJECT_ID, type: 'video.composition' as const, id: input.compositionId }],
      revision: result.revision,
      rows: result.rows,
    }
  },
)

export const applyTimelinePatchCommand = commands.define(
  {
    id: 'apply-timeline-patch',
    label: 'Apply timeline patch',
    description: 'Adjust clip timing (start/end seconds) on a saved composition document.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['compositionId', 'patches'],
      properties: {
        compositionId: { type: 'string', minLength: 1, maxLength: 128 },
        patches: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path'],
            properties: {
              path: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'integer', minimum: 0, maximum: 63 } },
              start: { type: 'number', minimum: 0, maximum: 43200 },
              end: { type: 'number', minimum: 0, maximum: 43200 },
            },
          },
        },
      },
    },
    resultSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'refs', 'revision'],
      properties: {
        kind: { const: 'entities' },
        refs: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['projectId', 'type', 'id'],
            properties: {
              projectId: { type: 'string', minLength: 1, maxLength: 128 },
              type: { const: 'video.composition' },
              id: { type: 'string', minLength: 1, maxLength: 512 },
            },
          },
        },
        revision: { type: 'integer', minimum: 0, maximum: 100000000 },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['entities'],
  },
  async (input, ctx) => {
    const result = await applyTimelinePatch(ports(ctx.sdk), input)
    return {
      kind: 'entities' as const,
      refs: [{ projectId: PROJECT_ID, type: 'video.composition' as const, id: input.compositionId }],
      revision: result.revision,
    }
  },
)

export const importMediaCommand = commands.define(
  {
    id: 'import-media',
    label: 'Import media',
    description: 'Place one persisted library asset (video.asset) onto a composition timeline.',
    usage:
      'Addresses a clip by the asset id of an imported media object. The clip lands at the end of the first scene (a scene is created when the document has none), starting at startSeconds when given.',
    promptExamples: ['Add the imported clip to my composition at 4 seconds'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['compositionId', 'assetId'],
      properties: {
        compositionId: { type: 'string', minLength: 1, maxLength: 128 },
        assetId: { type: 'string', minLength: 1, maxLength: 128 },
        startSeconds: { type: 'number', minimum: 0, maximum: 43200 },
      },
    },
    resultSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'refs', 'revision', 'clipPath'],
      properties: {
        kind: { const: 'entities' },
        refs: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['projectId', 'type', 'id'],
            properties: {
              projectId: { type: 'string', minLength: 1, maxLength: 128 },
              type: { const: 'video.composition' },
              id: { type: 'string', minLength: 1, maxLength: 512 },
            },
          },
        },
        revision: { type: 'integer', minimum: 0, maximum: 100000000 },
        clipPath: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'integer', minimum: 0, maximum: 599 },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['entities'],
  },
  async (input, ctx) => {
    const result = await importMediaIntoComposition(ports(ctx.sdk), input)
    return {
      kind: 'entities' as const,
      refs: [{ projectId: PROJECT_ID, type: 'video.composition' as const, id: input.compositionId }],
      revision: result.revision,
      clipPath: [...result.clipPath],
    }
  },
)

export const renderPreviewCommand = commands.define(
  {
    id: 'render-preview',
    label: 'Render preview frame',
    description: 'Render one frame of a saved composition and return it as a bounded JPEG image.',
    usage:
      'Renders the frame at timeSeconds (default 0) through the same offline engine the editor previews with. Undecoded media is absent from the frame; shapes and text render immediately.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['compositionId'],
      properties: {
        compositionId: { type: 'string', minLength: 1, maxLength: 128 },
        timeSeconds: { type: 'number', minimum: 0, maximum: 43200 },
        maxWidth: { type: 'integer', minimum: 64, maximum: 640 },
      },
    },
    resultSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'data'],
      properties: {
        kind: { const: 'json' },
        data: {
          type: 'object',
          additionalProperties: false,
          required: ['width', 'height', 'frame', 'frameSeconds', 'image'],
          properties: {
            width: { type: 'integer', minimum: 1, maximum: 640 },
            height: { type: 'integer', minimum: 1, maximum: 4320 },
            frame: { type: 'integer', minimum: 0, maximum: 100000000 },
            frameSeconds: { type: 'number', minimum: 0, maximum: 43200 },
            image: { type: 'string', minLength: 8, maxLength: 2000000 },
          },
        },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['json'],
  },
  async (input, ctx) => {
    const sdk = ports(ctx.sdk)
    const compositions = new CompositionService(sdk.entities)
    const projects = new ProjectService(sdk.entities)
    const composition = await compositions.load(input.compositionId)
    const project = await projects.findByComposition(input.compositionId)
    const frame = await renderPreviewFrame(
      {
        library: sessionAssetLibrary(),
        fontSources: sessionFontSources(),
        fps: project?.data.fps ?? 30,
        projectId: sdk.projectId,
      },
      composition.data.document,
      input.timeSeconds ?? 0,
      input.maxWidth ?? 640,
    )
    return { kind: 'json' as const, data: frame }
  },
)

export const exportVideoCommand = commands.define(
  {
    id: 'export-video',
    label: 'Export video',
    description: 'Encode a saved composition and deliver it to a Files destination the user chooses.',
    usage:
      'Creates a durable video.export-job and starts the offline encoder. The command returns as soon as the job is pending; encode progress and the outcome land on the job record, and the delivery opens the Files save dialog for the user to choose a destination.',
    promptExamples: ['Export my composition as WebM'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['compositionId', 'format'],
      properties: {
        compositionId: { type: 'string', minLength: 1, maxLength: 128 },
        format: { type: 'string', enum: ['mp4', 'webm'] },
      },
    },
    resultSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'refs', 'state'],
      properties: {
        kind: { const: 'entities' },
        refs: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['projectId', 'type', 'id'],
            properties: {
              projectId: { type: 'string', minLength: 1, maxLength: 128 },
              type: { const: 'video.export-job' },
              id: { type: 'string', minLength: 1, maxLength: 512 },
            },
          },
        },
        state: { type: 'string', enum: ['pending', 'failed'] },
      },
    },
    invocationMode: 'iframe-action',
    resultChannels: ['entities'],
  },
  async (input, ctx) => {
    const sdk = ports(ctx.sdk)
    const result = await requestExport(sdk, input, {
      probeSupported: async () => {
        const caps = await probeExportCapabilities()
        return { supported: caps.supported, blocker: caps.blocker }
      },
      start: (args) => {
        void runExport(
          {
            library: sessionAssetLibrary(),
            fontSources: sessionFontSources(),
            jobs: new ExportJobService(sdk.entities),
            files: sdk.files,
            fps: args.fps,
            projectId: args.projectId,
            deliver: filesDelivery(sdk.files),
            destination: 'files',
          },
          args.document,
          args.format,
          args.job.id,
          publishExportPhase,
        ).then((handle) => setExportCancelHandle(handle.cancel))
      },
    })
    return {
      kind: 'entities' as const,
      refs: [{ projectId: PROJECT_ID, type: 'video.export-job' as const, id: result.jobId }],
      state: result.state,
    }
  },
)

export const projectCommands = commands.expose([
  createCompositionCommand,
  importMediaCommand,
  inspectTimelineCommand,
  applyTimelinePatchCommand,
  renderPreviewCommand,
  exportVideoCommand,
])
