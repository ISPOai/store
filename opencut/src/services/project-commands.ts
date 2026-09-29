import { editTimeline, type EditTimelineInput } from "./project-edit-timeline";
import { SdkAdapter } from "./storage/sdk-adapter";
import type { MediaAssetData } from "./storage/types";
import { generateImage, generateVideo, type GenerateImageInput, type GenerateVideoInput, type GeneratedMediaResult } from "./project-generate-media";
import { convertPng } from "./project-convert-png";
import { createContactSheet } from "./project-contact-sheet";
import { addOriginalMusic } from "./project-music";
import { addExplosion } from "./project-explosion";
import { addSoundEffect } from "./project-sound-effects";
import { adjustProductionTimeline } from "./project-timeline-adjust";
import type * as CommandTypes from "./project-command-types";
export type * from "./project-command-types";
import { commands, type CommandResourceDelivery } from "@ispo/sdk";
import { ProductionDocumentService } from "@/project/production-document-service";
import {
	runProductionPlacement,
	type ProductionPlacementInput,
	type ProductionPlacementResult,
} from "@/timeline/production-placement";
import type { ProductionShotPlacementInput } from "@/timeline/types";

import { runProductionCommand } from "./project-command-runtime";
import { runTranscribeMediaCommand } from "./transcription/transcribe-media-command";
import { runProductionImageCommand, type ProductionImageSdk } from "./project-image-command";
import { runProductionNarrationCommand, type ProductionNarrationSdk } from "./project-narration-command";
import { runProductionImportCommand } from "@/media/production-import";
import { runProductionAnimateCommand, type ProductionAnimationSdk } from "@/project/production-animation-command";
import { EditorCore } from "@/core";
import { MountedProductionMediaLibrary, SdkProductionMediaLibrary, type ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import type {
	ProductionImageInput,
	ProductionNarrationInput,
	ProductionImportCommandInput,
	ProductionImportCommandResult,
	ProductionMediaCommandResult,
	ProductionAcceptVersionCommandInput,
	ProductionAcceptVersionCommandResult,
	ProductionRegenerateInput,
	ProductionRegenerateCommandResult,
	ProductionTargetInput,
	ProductionTargetsCommandResult,
	ProductionScriptInput,
	ProductionScriptCommandResult,
	ProductionAnimateInput,
	ProductionAnimateCommandResult,
} from "./project-command-types";
import { canonicalEditRevision, canonicalProductionRevisionReference } from "./project-command-types";

import type {
	ProductionCommandInput,
	ProductionCommandResult,
} from "./production-command-router";
import { ProductionCommandRouter } from "./production-command-router";
import { ProductionRegenerationService } from "@/project/production-regeneration";
import { ProductionService } from "@/project/production-service";
import { runProductionScriptCommand } from "@/project/production-script-command";
import { importAudio } from "@/services/project-import-audio";
import { setClipSpeed, type SetClipSpeedInput } from "./project-set-clip-speed";
import { setClipAdjust, type SetClipAdjustInput } from "./project-set-clip-adjust";
import { setClipCrop, type SetClipCropInput } from "./project-set-clip-crop";
import { setTextAnimation, type SetTextAnimationInput } from "./project-set-text-animation";
import { setClipFade, type SetClipFadeInput } from "./project-set-clip-fade";
import { normalizeLoudness, type NormalizeLoudnessInput } from "./project-normalize-loudness";
import { setClipLut, type SetClipLutInput } from "./project-set-clip-lut";
import { listLuts, type ListLutsResult } from "./project-list-luts";
import { setClipChromaKey, type SetClipChromaKeyInput } from "./project-set-clip-chroma-key";
import { setClipEffect, type SetClipEffectInput } from "./project-set-clip-effect";
import { listEffects } from "./project-list-effects";
import { setClipFilter, type SetClipFilterInput } from "./project-set-clip-filter";
import { listFilters, type ListFiltersResult } from "./project-list-filters";

type MountedProductionSdk = ConstructorParameters<typeof SdkProductionMediaLibrary>[0];

function mountedProductionMediaLibrary(sdk: MountedProductionSdk, editId: string): ProductionMediaLibrary | undefined {
	const editor = EditorCore.getInstance();
	if (editor.project.getActiveOrNull()?.metadata.id !== editId) return undefined;
	return new MountedProductionMediaLibrary(new SdkProductionMediaLibrary(sdk), editor.media);
}

async function runHeadlessExport(
	input: ProductionCommandInput,
	sdk: Parameters<typeof runProductionCommand>[1],
): Promise<ProductionCommandResult> {
	const { ProductionRenderOperation } = await import(
		"@/export/production-render-operation"
	);
	const documents = new ProductionDocumentService(sdk);
	return new ProductionCommandRouter(
		documents,
		new ProductionRenderOperation(documents, sdk),
	).run(input);
}

function filesResultRef(
	input: ProductionImportCommandInput,
	resources: readonly CommandResourceDelivery[],
	resultRef?: { publicId: string; path?: string },
): { publicId: string; path?: string } {
	if (resultRef) return resultRef;
	const owner = resources.find((delivery) => delivery.slot === "media")?.media?.[0]?.transfer.resource.owner;
	if (owner) {
		return {
			publicId: owner.resourceRef,
		};
	}
	if (input.publishedFiles) return { publicId: input.publishedFiles.publicId, ...(input.publishedFiles.path ? { path: input.publishedFiles.path } : {}) };
	if (input.sourcePublicId) return { publicId: input.sourcePublicId };
	return { publicId: input.editId };
}

export async function runExposedProductionImport(
	input: ProductionImportCommandInput,
	ctx: { sdk: Parameters<typeof runProductionImportCommand>[1]; resources: readonly CommandResourceDelivery[]; mediaLibrary?: ProductionMediaLibrary },
): Promise<ProductionImportCommandResult> {
	const result = await runProductionImportCommand({
		...input,
		expectedRevision: canonicalEditRevision(input.expectedRevision),
		acceptedRevision: canonicalProductionRevisionReference(input.acceptedRevision),
		shotRevision: Number(input.shotRevision),
	}, ctx.sdk, ctx.resources, ctx.mediaLibrary);
	const data: ProductionImportCommandResult["data"] = {
		supported: true,
		status: result.data.status === "completed" && result.data.media ? "completed" : "refused",
		operation: "production-import",
		editId: input.editId,
		message: result.data.message || "The production import was refused.",
		filesRef: filesResultRef(input, ctx.resources, result.data.filesRef),
	};
	if (result.data.reason !== undefined) data.reason = result.data.reason;
	if (result.data.revision !== undefined) data.revision = result.data.revision;
	if (result.data.media !== undefined) data.media = result.data.media;
	if (data.status === "refused" && data.reason === undefined) data.reason = "producer-failed";
	return {
		kind: "json",
		data,
	};
}

export function runExposedProductionNarration(
	input: ProductionNarrationInput,
	ctx: { sdk: ProductionNarrationSdk; resources: readonly CommandResourceDelivery[]; mediaLibrary?: ProductionMediaLibrary; signal?: AbortSignal },
): Promise<ProductionMediaCommandResult> {
	return runProductionNarrationCommand(input, ctx.sdk, ctx.resources, ctx.mediaLibrary, ctx.signal);
}

type CommandPlacementShot = Omit<ProductionShotPlacementInput, "shotRevision" | "narration"> & {
	shotRevision: string;
	narration?: Omit<NonNullable<ProductionShotPlacementInput["narration"]>, "acceptedShotRevision"> & { acceptedShotRevision: string };
};

type CommandPlacementInput = Omit<ProductionPlacementInput, "shots"> & { shots: CommandPlacementShot[] };

function commandPlacementInput(input: CommandPlacementInput): ProductionPlacementInput {
	return {
		...input,
		expectedRevision: canonicalEditRevision(input.expectedRevision),
		acceptedRevision: canonicalProductionRevisionReference(input.acceptedRevision),
		shots: input.shots.map((shot) => ({
			...shot,
			shotRevision: Number(shot.shotRevision),
			narration: shot.narration
				? { ...shot.narration, acceptedShotRevision: Number(shot.narration.acceptedShotRevision) }
				: undefined,
		})),
	};
}

// The build analyzer requires every literal commands.define and the sole
// commands.expose call in one module. Mounted-editor-only implementations are
// loaded by their command handler so catalog discovery stays lightweight.

export const productionEditCommand = commands.define<
	ProductionCommandInput,
	ProductionCommandResult
>(
	{
		id: "production-edit",
		label: "Inspect or update an edit",
		description:
			"List OpenCut edits or inspect, rename, or render one edit with revision protection.",
		usage:
			"Run this command in the chat. Start with list-edits, or inspect-edit without editId, to find the current edit and revision. Use list-media on a named edit to read accepted and candidate media without mounting the editor. Pass that revision to rename, arrange, or export; mutations require an explicit editId. Export returns a validated video artifact in Files. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
		preconditions: [
			{ summary: "Use list-edits or inspect-edit without editId to find the current edit. Rename, arrange, and export require an explicit editId and the exact revision returned by a read. Create a Task only for a multi-step production run left running across turns or explicitly in the background." },
		],
		inputSchema: {
			type: "object",
			additionalProperties: false,
				required: ["operation"],
			properties: {
				operation: {
					type: "string",
					enum: [
						"inspect-edit",
						"list-edits",
						"rename-edit",
						"list-media",
						"arrange-timeline",
						"export-project",
					],
				},
				editId: { type: "string", minLength: 1, maxLength: 256 },
				expectedRevision: {
					type: "object",
					additionalProperties: false,
					required: [
						"editId",
						"storageCasRevision",
						"intentRevision",
						"digest",
					],
					properties: {
						editId: { type: "string", minLength: 1, maxLength: 256 },
						storageCasRevision: {
							type: "string",
							minLength: 1,
							maxLength: 64,
						},
						intentRevision: {
							type: "string",
							minLength: 1,
							maxLength: 64,
						},
						digest: { type: "string", minLength: 1, maxLength: 256 },
					},
				},
					name: { type: "string", minLength: 1, maxLength: 200 },
					format: { type: "string", enum: ["mp4", "webm", "mov", "gif", "mp3", "wav"] },
					quality: { type: "string", enum: ["low", "medium", "high", "very_high"] },
					includeAudio: { type: "boolean" },
					resolution: {
						type: "object",
						additionalProperties: false,
						required: ["width", "height"],
						properties: {
							width: { type: "integer", minimum: 2, maximum: 4096 },
							height: { type: "integer", minimum: 2, maximum: 4096 },
						},
					},
					fps: { type: "number", minimum: 1, maximum: 120 },
					bitrate: { type: "integer", minimum: 100000, maximum: 800000000 },
					movCodec: { type: "string", enum: ["h264", "prores"] },
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
					required: [
						"supported",
						"status",
						"operation",
						"editId",
						"message",
					],
					properties: {
						supported: { type: "boolean" },
						status: { type: "string", enum: ["completed", "refused"] },
						operation: {
							type: "string",
							enum: [
								"inspect-edit",
								"list-edits",
								"rename-edit",
								"list-media",
								"arrange-timeline",
								"export-project",
							],
						},
						editId: { type: "string", maxLength: 256 },
						message: { type: "string", maxLength: 600 },
						reason: {
							type: "string",
							enum: [
								"capability-unavailable",
								"edit-not-found",
								"expected-revision-required",
								"input-invalid",
									"legacy-revision-required",
									"revision-conflict",
									"render-failed",
							],
						},
						revision: {
							type: "object",
							additionalProperties: false,
							required: [
								"editId",
								"storageCasRevision",
								"intentRevision",
								"digest",
							],
							properties: {
								editId: { type: "string", maxLength: 256 },
									storageCasRevision: { type: "string", maxLength: 64 },
									intentRevision: { type: "string", maxLength: 64 },
									digest: { type: "string", maxLength: 256 },
								},
						},
						legacyStorageCasRevision: { type: "string", maxLength: 64 },
						operationId: { type: "string", maxLength: 256 },
						artifact: {
							type: "object", additionalProperties: false,
							required: ["publicId", "path", "byteLength", "sha256", "duration", "width", "height", "format"],
							properties: {
								publicId: { type: "string", maxLength: 256 }, path: { type: "string", maxLength: 1_000_000 },
								byteLength: { type: "number" }, sha256: { type: "string", maxLength: 256 }, duration: { type: "number" },
								width: { type: "number" }, height: { type: "number" }, format: { type: "string", enum: ["mp4", "webm", "mov", "gif", "mp3", "wav"] },
							},
						},
						edit: {
							type: "object",
							additionalProperties: false,
							required: [
								"name",
								"sceneCount",
								"timelineElementCount",
								"duration",
								"canvasWidth",
								"canvasHeight",
								"fpsNumerator",
								"fpsDenominator",
							],
							properties: {
								name: { type: "string", maxLength: 1_000_000 },
								sceneCount: { type: "number" },
								timelineElementCount: { type: "number" },
								duration: { type: "number" },
								canvasWidth: { type: "number" },
								canvasHeight: { type: "number" },
								fpsNumerator: { type: "number" },
								fpsDenominator: { type: "number" },
							},
						},
						edits: {
							type: "array",
							maxItems: 50,
							items: {
								type: "object",
								additionalProperties: false,
								required: ["editId", "name", "updatedAt", "active"],
								properties: {
									editId: { type: "string", minLength: 1, maxLength: 256 },
									name: { type: "string", maxLength: 1_000_000 },
									updatedAt: { type: "string", maxLength: 128 },
									active: { type: "boolean" },
								},
							},
						},
						activeEditSource: { type: "string", enum: ["storage", "most-recent"] },
						media: {
							type: "array",
							maxItems: 200,
							items: {
								type: "object",
								additionalProperties: true,
								required: ["shotId", "shotRevision", "role", "candidates"],
								properties: {
									shotId: { type: "string", maxLength: 256 },
									shotRevision: { type: "string", maxLength: 64 },
									role: { type: "string", enum: ["visual", "narration"] },
									candidates: { type: "array", maxItems: 512, items: { type: "object", additionalProperties: true } },
								},
							},
						},
					},
				},
			},
		},
		invocationMode: "iframe-action",
		resultChannels: ["json"],
		confirmation: "confirm",
	},
	(input, ctx) => input.operation === "export-project"
		? runHeadlessExport(input, ctx.sdk)
		: runProductionCommand(input, ctx.sdk, ctx.signal),
);


export const transcribeMediaCommand = commands.define<
	CommandTypes.TranscribeMediaInput,
	CommandTypes.TranscribeMediaResult
>(
	{
		id: "transcribe-media",
		label: "Transcribe media",
		description:
			"Transcribe one loaded audio or video clip to a word-timed transcript using the host's managed speech producer, returning the full text and per-segment timings for captions.",
		usage:
			"Run this command in the chat to transcribe a clip that is already loaded in the mounted editor's media library. Pass mediaName to pick one when several are loaded, and optionally a language code; the result's segments drive the Captions tab. Re-run the same clip to collect a transcript that outlived the command's timeout.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				mediaName: { type: "string", minLength: 1, maxLength: 500 },
				language: { type: "string", minLength: 1, maxLength: 32 },
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
					required: ["text", "language", "segments"],
					properties: {
						text: { type: "string" },
						language: { type: "string" },
						segments: {
							type: "array",
							items: {
								type: "object",
								additionalProperties: false,
								required: ["start", "end", "text"],
								properties: {
									start: { type: "number" },
									end: { type: "number" },
									text: { type: "string" },
								},
							},
						},
						segmentsTruncated: { type: "boolean" },
					},
				},
			},
		},
		invocationMode: "iframe-action",
		resultChannels: ["json"],
		confirmation: "confirm",
		preconditions: [
			{ summary: "The mounted editor must be ready and have the audio or video clip loaded in its media library before transcribing." },
		],
	},
	(input, ctx) =>
		runTranscribeMediaCommand(input, { host: ctx.sdk.host, files: ctx.sdk.files }),
);

export const createProjectCommand = commands.define<
	CommandTypes.CreateProjectInput,
	CommandTypes.CreateProjectResult
>(
	{
		id: "create-project",
		label: "Create project",
		description:
			"Create a new edit through the mounted editor and navigate to it. Use this when the requested aspect ratio or production target differs from the current edit.",
		usage:
			"Run this command in the chat to create a new edit in the mounted editor and navigate to it. Use it when the requested aspect ratio or production target differs from the current edit; pass an optional name for the new edit.",
		preconditions: [
			{ summary: "The mounted editor must be ready. Use this when no existing edit matches the requested aspect ratio and production target." },
		],
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				name: { type: "string", minLength: 1, maxLength: 200 },
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
					required: ["projectId", "name"],
					properties: {
						projectId: { type: "string" },
						name: { type: "string" },
					},
				},
			},
		},
		invocationMode: "iframe-action",
		resultChannels: ["json"],
		confirmation: "confirm",
	},
	async (input) => {
		const { runCreateProject } = await import("@/project/create-project");
		return {
			kind: "json" as const,
			data: await runCreateProject(input),
		};
	},
);

export const arrangeTimelineCommand = commands.define<CommandPlacementInput, ProductionPlacementResult>(
	{
		id: "arrange-timeline",
		label: "Place accepted production media",
		description:
			"Place revision-bound visual, narration, and caption media for accepted shots in one durable edit revision. Requires exact edit, accepted-production, media, request-digest, and source identities. Unrelated tracks and manual edits are preserved.",
		usage:
			"Run this command in the chat. Place selected accepted visual, video-clip, narration, and caption media. Stills take the shot duration; video clips are trimmed to it and leave a gap if shorter, with narration beneath the picture. Pass the returned revision to export. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
		preconditions: [
			{ summary: "In the chat, provide the accepted script revision and selected media versions before arranging the timeline. Create a Task only for a multi-step production run left running across turns or explicitly in the background.", requiresInput: "acceptedRevision" },
		],
		inputSchema: {
			type: "object",
			additionalProperties: false,
			required: ["editId", "expectedRevision", "acceptedRevision", "idempotencyKey", "shots"],
			properties: {
				editId: { type: "string", minLength: 1, maxLength: 256 },
				expectedRevision: {
					type: "object",
					additionalProperties: false,
					required: ["editId", "storageCasRevision", "intentRevision", "digest"],
					properties: {
						editId: { type: "string", minLength: 1, maxLength: 256 },
						storageCasRevision: { type: "string", minLength: 1, maxLength: 64 },
						intentRevision: { type: "string", minLength: 1, maxLength: 64 },
						digest: { type: "string", minLength: 1, maxLength: 256 },
					},
				},
				acceptedRevision: {
					type: "object",
					additionalProperties: false,
					required: ["editId", "documentIntentRevision", "productionRevisionId", "contentDigest"],
					properties: {
						editId: { type: "string", minLength: 1, maxLength: 256 },
						documentIntentRevision: { type: "string", minLength: 1, maxLength: 64 },
						productionRevisionId: { type: "string", minLength: 1, maxLength: 256 },
						contentDigest: { type: "string", minLength: 1, maxLength: 256 },
					},
				},
				idempotencyKey: { type: "string", minLength: 1, maxLength: 256 },
				shots: {
					type: "array",
					minItems: 1,
					maxItems: 100,
					items: {
						type: "object",
						additionalProperties: false,
						required: ["shotId", "shotRevision", "startSeconds", "durationSeconds"],
						properties: {
							shotId: { type: "string", minLength: 1, maxLength: 256 },
							shotRevision: { type: "string", minLength: 1, maxLength: 64 },
							startSeconds: { type: "number", minimum: 0, maximum: 86_400 },
							durationSeconds: { type: "number", minimum: 0, maximum: 86_400 },
							visual: {
								type: "object", additionalProperties: false,
								required: ["mediaId", "mediaRevision", "mediaType", "name", "sourceDurationSeconds", "trimStartSeconds", "trimEndSeconds"],
								properties: {
									mediaId: { type: "string", minLength: 1, maxLength: 256 },
									mediaRevision: { type: "string", minLength: 1, maxLength: 256 },
									mediaType: { type: "string", enum: ["image", "video"] },
									name: { type: "string", minLength: 1, maxLength: 500 },
									sourceDurationSeconds: { type: "number", minimum: 0, maximum: 86_400 },
									trimStartSeconds: { type: "number", minimum: 0, maximum: 86_400 },
									trimEndSeconds: { type: "number", minimum: 0, maximum: 86_400 },
								},
							},
							narration: {
								type: "object", additionalProperties: false,
								required: ["mediaId", "mediaRevision", "acceptedShotId", "acceptedShotRevision", "name", "sourceDurationSeconds", "trimStartSeconds", "trimEndSeconds", "timelineOffsetSeconds", "alignment"],
								properties: {
									mediaId: { type: "string", minLength: 1, maxLength: 256 },
									mediaRevision: { type: "string", minLength: 1, maxLength: 256 },
									acceptedShotId: { type: "string", minLength: 1, maxLength: 256 },
									acceptedShotRevision: { type: "string", minLength: 1, maxLength: 64 },
									name: { type: "string", minLength: 1, maxLength: 500 },
									sourceDurationSeconds: { type: "number", minimum: 0, maximum: 86_400 },
									trimStartSeconds: { type: "number", minimum: 0, maximum: 86_400 },
									trimEndSeconds: { type: "number", minimum: 0, maximum: 86_400 },
									timelineOffsetSeconds: { type: "number", minimum: 0, maximum: 86_400 },
									alignment: {
										type: "object", additionalProperties: false,
										required: ["mediaId", "mediaRevision", "segments"],
										properties: {
											mediaId: { type: "string", minLength: 1, maxLength: 256 },
											mediaRevision: { type: "string", minLength: 1, maxLength: 256 },
											segments: {
												type: "array", maxItems: 20_000,
												items: {
													type: "object", additionalProperties: false,
													required: ["text", "start", "end"],
													properties: {
														text: { type: "string", minLength: 1, maxLength: 4_000 },
														start: { type: "number", minimum: 0, maximum: 86_400 },
														end: { type: "number", minimum: 0, maximum: 86_400 },
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
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
					required: ["status", "editId", "message"],
					properties: {
						status: { type: "string", enum: ["completed", "refused"] },
						editId: { type: "string", maxLength: 256 },
						message: { type: "string", maxLength: 600 },
						reason: {
							type: "string",
							enum: ["accepted-source-mismatch", "edit-not-found", "idempotency-reused", "input-invalid", "invalid-bounds", "legacy-revision-required", "revision-conflict"],
						},
						revision: {
							type: "object", additionalProperties: false,
							required: ["editId", "storageCasRevision", "intentRevision", "digest"],
							properties: {
								editId: { type: "string", maxLength: 256 },
								storageCasRevision: { type: "string", maxLength: 64 },
								intentRevision: { type: "string", maxLength: 64 },
								digest: { type: "string", maxLength: 256 },
							},
						},
						elements: {
							type: "array",
							items: {
								type: "object",
								additionalProperties: false,
								required: ["shotId", "role", "trackId", "elementId"],
								properties: {
									shotId: { type: "string", maxLength: 256 },
									role: { type: "string", enum: ["visual", "narration", "caption"] },
									trackId: { type: "string", maxLength: 256 },
									elementId: { type: "string", maxLength: 256 },
								},
							},
						},
					},
				},
			},
		},
		invocationMode: "iframe-action",
		resultChannels: ["json"],
		confirmation: "confirm",
	},
	(input, ctx) => runProductionPlacement(commandPlacementInput(input), ctx.sdk),
);

export const exportProjectCommand = commands.define<
	CommandTypes.ExportProjectInput,
	ProductionCommandResult
>(
	{
		id: "export-project",
		label: "Export project",
		description:
			"Render an immutable, explicitly revisioned OpenCut edit without a mounted editor, validate the published container, and return its Files artifact and operation reference.",
		usage:
			"Run this command in the chat. Render the current arranged edit at its exact expected revision, validate the video, and publish the finished artifact to Files for the production result. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
		preconditions: [
			{ summary: "In the chat, arrange accepted media first and pass the current edit revision returned by that step or a later read. Create a Task only for a multi-step production run left running across turns or explicitly in the background.", requiresInput: "expectedRevision" },
		],
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				editId: { type: "string", minLength: 1, maxLength: 256 },
				expectedRevision: {
					type: "object",
					additionalProperties: false,
					required: ["editId", "storageCasRevision", "intentRevision", "digest"],
					properties: {
						editId: { type: "string", minLength: 1, maxLength: 256 },
						storageCasRevision: { type: "string", minLength: 1, maxLength: 64 },
						intentRevision: { type: "string", minLength: 1, maxLength: 64 },
						digest: { type: "string", minLength: 1, maxLength: 256 },
					},
				},
				format: { type: "string", enum: ["mp4", "webm", "mov", "gif", "mp3", "wav"] },
				quality: {
					type: "string",
					enum: ["low", "medium", "high", "very_high"],
				},
				includeAudio: { type: "boolean" },
				name: { type: "string", minLength: 1, maxLength: 200 },
				resolution: {
					type: "object",
					additionalProperties: false,
					required: ["width", "height"],
					properties: {
						width: { type: "integer", minimum: 2, maximum: 4096 },
						height: { type: "integer", minimum: 2, maximum: 4096 },
					},
				},
				fps: { type: "number", minimum: 1, maximum: 120 },
				bitrate: { type: "integer", minimum: 100000, maximum: 800000000 },
				movCodec: { type: "string", enum: ["h264", "prores"] },
			},
			required: ["editId", "expectedRevision"],
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
					required: ["supported", "status", "operation", "editId", "message"],
					properties: {
						supported: { type: "boolean" },
						status: { type: "string", enum: ["completed", "refused"] },
						operation: { const: "export-project" },
						editId: { type: "string", maxLength: 256 },
						message: { type: "string", maxLength: 600 },
						reason: { type: "string", enum: ["capability-unavailable", "edit-not-found", "expected-revision-required", "input-invalid", "legacy-revision-required", "render-failed", "revision-conflict"] },
						revision: {
							type: "object", additionalProperties: false,
							required: ["editId", "storageCasRevision", "intentRevision", "digest"],
							properties: {
								editId: { type: "string", maxLength: 256 },
								storageCasRevision: { type: "string", maxLength: 64 },
								intentRevision: { type: "string", maxLength: 64 },
								digest: { type: "string", maxLength: 256 },
							},
						},
						operationId: { type: "string", maxLength: 256 },
						artifact: {
							type: "object", additionalProperties: false,
							required: ["publicId", "path", "byteLength", "sha256", "duration", "width", "height", "format"],
							properties: {
								publicId: { type: "string", maxLength: 256 }, path: { type: "string", maxLength: 1_000_000 },
								byteLength: { type: "number" }, sha256: { type: "string", maxLength: 256 }, duration: { type: "number" },
								width: { type: "number" }, height: { type: "number" }, format: { type: "string", enum: ["mp4", "webm", "mov", "gif", "mp3", "wav"] },
							},
						},
					},
				},
			},
		},
		invocationMode: "iframe-action",
		resultChannels: ["json"],
		confirmation: "confirm",
	},
	(input, ctx) => runHeadlessExport({ operation: "export-project", ...input }, ctx.sdk),
);

function selectiveRegeneration(sdk: Parameters<typeof runProductionCommand>[1] & ProductionImageSdk, mediaLibrary?: ProductionMediaLibrary) {
	const documents = new ProductionDocumentService(sdk);
	return new ProductionRegenerationService(documents, {
		generate: async (request) => {
			const current = await new ProductionService(documents).load(request.editId);
			if (!current?.documentRevision) throw new Error("The edit revision is unavailable");
			const result = await runProductionImageCommand({
				editId: request.editId,
				expectedRevision: current.documentRevision,
				acceptedRevision: request.acceptedRevision,
				shotIds: [request.shotId],
				attempt: request.attempt,
				visualBrief: request.brief,
				...(request.model ? { model: request.model } : {}),
				...(request.strength !== undefined ? { strength: request.strength } : {}),
				...(request.references ? { references: request.references } : {}),
				...(request.styleAnchor ? { styleAnchor: request.styleAnchor } : {}),
			}, sdk, mediaLibrary);
			if (result.data.status !== "completed") throw new ProductionRunnerResultError(result.data);
			const publicId = result.data.shots?.[0]?.publicId;
			const latest = await new ProductionService(documents).load(request.editId);
			return latest?.accepted?.shots.find((shot) => shot.shotId === request.shotId)?.imageCandidates?.find((candidate) => candidate.resource.publicId === publicId) ?? null;
		},
	});
}

class ProductionRunnerResultError extends Error {
	constructor(readonly result: ProductionMediaCommandResult["data"]) {
		super(result.message);
		this.name = "ProductionRunnerResultError";
	}
}

export async function runExposedProductionRegenerate(
	input: ProductionRegenerateInput,
	sdk: Parameters<typeof runProductionCommand>[1] & ProductionImageSdk,
): Promise<ProductionRegenerateCommandResult> {
	try {
		return await selectiveRegeneration(sdk, mountedProductionMediaLibrary(sdk, input.editId)).regenerate(input);
	} catch (error) {
		if (!(error instanceof ProductionRunnerResultError)) throw error;
		const data: ProductionRegenerateCommandResult["data"] = {
			supported: true, status: error.result.status === "pending" ? "pending" : "refused",
			operation: "production-regenerate", editId: input.editId, message: error.message,
		};
		if (error.result.reason) data.reason = error.result.reason;
		if (error.result.revision) data.revision = error.result.revision;
		return { kind: "json", data };
	}
}

export function runExposedProductionImage(
	input: ProductionImageInput,
	sdk: Parameters<typeof runProductionImageCommand>[1],
	mediaLibrary?: ProductionMediaLibrary,
	signal?: AbortSignal,
): Promise<ProductionMediaCommandResult> {
	return runProductionImageCommand(input, sdk, mediaLibrary, signal);
}








export const productionTimelineAdjustCommand = commands.define({
  id: "production-timeline-adjust",
  label: "Adjust shot framing and timing",
  description: "Inspect saved timeline elements, or adjust shot scale, caption height, and narration start together with its aligned captions. Preserves media and word timing.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    inspectSourceFrame: { type: "boolean" },
    previewSeconds: { type: "number", minimum: 0, maximum: 86400 },
    shots: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, required: ["shotId"], properties: { shotId: { type: "string", minLength: 1, maxLength: 256 }, scale: { type: "number", minimum: 0.1, maximum: 10 }, visualDurationSeconds: { type: "number", minimum: 0.01, maximum: 3600 }, captionY: { type: "number", minimum: -4000, maximum: 4000 }, captionBackground: { type: "boolean" }, narrationStartSeconds: { type: "number", minimum: 0, maximum: 86400 } } } },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: true } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => adjustProductionTimeline(input, ctx.sdk));

export const productionExplosionCommand = commands.define({
  id: "production-add-explosion", label: "Add explosion sound",
  description: "Synthesize and place or replace one editable explosion sound at an exact timeline time, preserving other clips.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "startSeconds"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    replaceExisting: { type: "boolean" },
    mellow: { type: "boolean" },
    startSeconds: { type: "number", minimum: 0, maximum: 86400 },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: true } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => addExplosion(input, ctx.sdk, mountedProductionMediaLibrary(ctx.sdk, input.editId)));

export const productionSoundEffectCommand = commands.define({
  id: "production-add-sound-effect", label: "Add sound effect",
  description: "Synthesize and place one editable sound effect (whoosh, swoosh, riser, pop, crack, click, ding, boom) at an exact timeline time, preserving other clips.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "effect", "startSeconds"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    effect: { type: "string", enum: ["whoosh", "swoosh", "riser", "pop", "crack", "click", "ding", "boom"] },
    startSeconds: { type: "number", minimum: 0, maximum: 86400 },
    seconds: { type: "number", minimum: 0.03, maximum: 30 },
    volumeDb: { type: "number", minimum: -60, maximum: 12 },
    seed: { type: "integer", minimum: 0, maximum: 4294967295 },
    name: { type: "string", minLength: 1, maxLength: 120 },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: true } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => addSoundEffect(input, ctx.sdk, mountedProductionMediaLibrary(ctx.sdk, input.editId)));

export const productionMusicCommand = commands.define({
  id: "production-add-music", label: "Produce original background music",
  description: "Synthesize original atmospheric techno as verified stereo PCM WAV and add an editable music track with volume fades to one exact edit revision.",
  usage: "Mutates only the named edit on invocation. Read production-edit first and pass its exact revision. Duration 1–30 seconds; suggested volumeDb -22, fadeInSeconds 2, fadeOutSeconds 3. Deterministic seed defaults to 7208. Hazy pads, soft syncopated percussion and warm bass synthesized without recordings or copied melodies. Publishes WAV, reads back and checks format, signal and SHA-256 before revision-protected placement. Retains generator/settings/source revision and file identity in edit settings. Refuses stale revisions or an existing music track in the scene. A save conflict can leave an unattached published asset; refresh before retrying.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "durationSeconds", "volumeDb", "fadeInSeconds", "fadeOutSeconds"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string", minLength: 1, maxLength: 256 }, storageCasRevision: { type: "string", minLength: 1, maxLength: 256 }, intentRevision: { type: "string", minLength: 1, maxLength: 256 }, digest: { type: "string", minLength: 1, maxLength: 256 } } },
    durationSeconds: { type: "number", minimum: 1, maximum: 30 },
    volumeDb: { type: "number", minimum: -40, maximum: -6 },
    fadeInSeconds: { type: "number", minimum: 0, maximum: 10 },
    fadeOutSeconds: { type: "number", minimum: 0, maximum: 10 },
    startSeconds: { type: "number", minimum: 0, maximum: 86400 },
    seed: { type: "integer", minimum: 0, maximum: 4294967295 }
  } },
  resultSchema: {"type": "object", "additionalProperties": false, "required": ["kind", "data"], "properties": {"kind": {"const": "json"}, "data": {"type": "object", "additionalProperties": false, "required": ["editId", "revision", "provenance", "audio", "verifiedBytes"], "properties": {"editId": {"type": "string", "minLength": 1, "maxLength": 256}, "revision": {"type": "object", "additionalProperties": false, "required": ["editId", "storageCasRevision", "intentRevision", "digest"], "properties": {"editId": {"type": "string", "minLength": 1, "maxLength": 256}, "storageCasRevision": {"type": "string", "minLength": 1, "maxLength": 256}, "intentRevision": {"type": "string", "minLength": 1, "maxLength": 256}, "digest": {"type": "string", "minLength": 1, "maxLength": 256}}}, "provenance": {"type": "object", "additionalProperties": false, "required": ["generator", "seed", "bpm", "source", "sha256", "mediaId", "trackId", "elementId", "artifact", "byteLength", "durationSeconds", "volumeDb", "fadeInSeconds", "fadeOutSeconds", "startSeconds", "sourceRevision"], "properties": {"generator": {"type": "string", "minLength": 1, "maxLength": 100}, "seed": {"type": "integer"}, "bpm": {"type": "number"}, "source": {"type": "string", "minLength": 1, "maxLength": 200}, "sha256": {"type": "string", "minLength": 1, "maxLength": 64}, "mediaId": {"type": "string", "minLength": 1, "maxLength": 100}, "trackId": {"type": "string", "minLength": 1, "maxLength": 100}, "elementId": {"type": "string", "minLength": 1, "maxLength": 100}, "artifact": {"type": "object", "additionalProperties": false, "required": ["publicId", "path"], "properties": {"publicId": {"type": "string", "minLength": 1, "maxLength": 1024}, "path": {"type": "string", "minLength": 1, "maxLength": 1024}}}, "byteLength": {"type": "integer"}, "durationSeconds": {"type": "number"}, "volumeDb": {"type": "number"}, "fadeInSeconds": {"type": "number"}, "fadeOutSeconds": {"type": "number"}, "startSeconds": {"type": "number"}, "sourceRevision": {"type": "object", "additionalProperties": false, "required": ["editId", "storageCasRevision", "intentRevision", "digest"], "properties": {"editId": {"type": "string", "minLength": 1, "maxLength": 256}, "storageCasRevision": {"type": "string", "minLength": 1, "maxLength": 256}, "intentRevision": {"type": "string", "minLength": 1, "maxLength": 256}, "digest": {"type": "string", "minLength": 1, "maxLength": 256}}}}}, "audio": {"type": "object", "additionalProperties": false, "required": ["sampleRate", "channels", "bitsPerSample", "rms", "peak"], "properties": {"sampleRate": {"type": "number"}, "channels": {"type": "number"}, "bitsPerSample": {"type": "number"}, "rms": {"type": "number"}, "peak": {"type": "number"}}}, "verifiedBytes": {"const": true}}}}},
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => addOriginalMusic(input, ctx.sdk, mountedProductionMediaLibrary(ctx.sdk, input.editId)));

export const convertPngCommand = commands.define({
 id: "convert-image-png", label: "Convert image to PNG",
 description: "Decode an image owned by OpenCut Files, publish a genuine PNG copy, and verify its signature, dimensions and digest. Preserves the source and all edits.",
 inputSchema: { type: "object", additionalProperties: false, required: ["sourcePublicId", "name", "operationKey"], properties: { sourcePublicId: { type: "string", minLength: 1, maxLength: 256 }, name: { type: "string", minLength: 1, maxLength: 200 }, operationKey: { type: "string", minLength: 1, maxLength: 200 } } },
 resultSchema: {"type": "object", "additionalProperties": false, "required": ["kind", "data"], "properties": {"kind": {"const": "json"}, "data": {"type": "object", "additionalProperties": false, "required": ["sourcePublicId", "sourceMimeType", "sourceByteLength", "sourceSha256", "publicId", "path", "mimeType", "byteLength", "sha256", "width", "height", "signature", "verifiedBytes"], "properties": {"sourcePublicId": {"type": "string", "maxLength": 1024}, "sourceMimeType": {"type": "string", "maxLength": 1024}, "sourceByteLength": {"type": "number"}, "sourceSha256": {"type": "string", "maxLength": 1024}, "publicId": {"type": "string", "maxLength": 1024}, "path": {"type": "string", "maxLength": 1024}, "mimeType": {"type": "string", "maxLength": 1024}, "byteLength": {"type": "number"}, "sha256": {"type": "string", "maxLength": 1024}, "width": {"type": "number"}, "height": {"type": "number"}, "signature": {"type": "string", "maxLength": 1024}, "verifiedBytes": {"const": true}}}}},
 invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => convertPng(input, ctx.sdk.files));

export const contactSheetCommand = commands.define({
 id: "preview-contact-sheet", label: "Create still review contact sheet",
 description: "Publish a JPEG contact sheet of one to six ordered OpenCut Files images under Reviews, below 1 MiB. Preserves originals and all edit data. Returns verified readback pixels for review.",
 inputSchema: { type: "object", additionalProperties: false, required: ["sourcePublicIds", "name", "operationKey"], properties: { sourcePublicIds: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", minLength: 1, maxLength: 256 } }, name: { type: "string", minLength: 1, maxLength: 200 }, operationKey: { type: "string", minLength: 1, maxLength: 200 } } },
 resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["publicId", "path", "mimeType", "byteLength", "width", "height", "sha256", "verifiedBytes", "previewBase64"], properties: { publicId: { type: "string", maxLength: 1024 }, path: { type: "string", maxLength: 1024 }, mimeType: { const: "image/jpeg" }, byteLength: { type: "number", maximum: 1048575 }, width: { type: "number" }, height: { type: "number" }, sha256: { type: "string", maxLength: 64 }, verifiedBytes: { const: true }, previewBase64: { type: "string", maxLength: 1398104 } } } } },
 invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => createContactSheet(input, ctx.sdk.files));

export const generateImageCommand = commands.define<GenerateImageInput, GeneratedMediaResult>({
  id: "generate-image", label: "Generate image",
  description: "Generate an image from prompt text and optional image references. Returns the generated image directly as a Files result.",
  usage: "Pass the user's prompt directly. No script, shots, draft, acceptance, or edit revision is needed. Reuse requestKey only to recover the same generation. Return the image to the user.",
  inputSchema: { type: "object", additionalProperties: false, required: ["prompt", "name", "requestKey"], properties: {
    prompt: { type: "string", minLength: 1, maxLength: 8000 }, name: { type: "string", minLength: 1, maxLength: 120 },
    requestKey: { type: "string", minLength: 1, maxLength: 128 },
    aspectRatio: { type: "string", enum: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"] },
    referencePublicIds: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 128 } },
    model: { type: "object", additionalProperties: false, required: ["modelKey", "modelVersion"], properties: { modelKey: { type: "string", maxLength: 128 }, modelVersion: { type: "string", maxLength: 128 } } },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "refs"], properties: { kind: { const: "files" }, refs: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", additionalProperties: false, required: ["publicId", "path"], properties: { publicId: { type: "string", maxLength: 256 }, path: { type: "string", maxLength: 512 } } } } } },
  invocationMode: "iframe-action", resultChannels: ["files"],
}, (input, ctx) => generateImage(input, ctx.sdk, ctx.signal));

export const generateVideoCommand = commands.define<GenerateVideoInput, GeneratedMediaResult>({
  id: "generate-video", label: "Generate video",
  description: "Generate a video from prompt text, optionally starting from an image. Returns the generated playable video directly as a Files result.",
  usage: "Pass the prompt, duration, and optional starting image directly. No script, shots, draft, acceptance, or edit revision is needed. Reuse requestKey only to recover the same generation. Return the video to the user.",
  inputSchema: { type: "object", additionalProperties: false, required: ["prompt", "name", "requestKey", "durationSeconds"], properties: {
    prompt: { type: "string", minLength: 1, maxLength: 2500 }, name: { type: "string", minLength: 1, maxLength: 120 },
    requestKey: { type: "string", minLength: 1, maxLength: 128 },
    durationSeconds: { type: "integer", minimum: 3, maximum: 15 },
    aspectRatio: { type: "string", enum: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"] },
    startImagePublicId: { type: "string", minLength: 1, maxLength: 128 }, generateAudio: { type: "boolean" },
    model: { type: "object", additionalProperties: false, required: ["modelKey", "modelVersion"], properties: { modelKey: { type: "string", maxLength: 128 }, modelVersion: { type: "string", maxLength: 128 } } },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "refs"], properties: { kind: { const: "files" }, refs: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", additionalProperties: false, required: ["publicId", "path"], properties: { publicId: { type: "string", maxLength: 256 }, path: { type: "string", maxLength: 512 } } } } } },
  invocationMode: "iframe-action", resultChannels: ["files"],
}, (input, ctx) => generateVideo(input, ctx.sdk, ctx.signal));

export const filesAssetsCommand = commands.define({
  id: "files-assets", label: "Find and import saved image assets",
  description: "List existing owned images or link selected originals into the active edit Assets panel, verifying decoded bytes and persisted records. Does not generate or republish images.",
  inputSchema: { type: "object", additionalProperties: false, required: ["operation"], properties: {
    operation: { type: "string", enum: ["list", "import", "verify"] },
    query: { type: "string", maxLength: 120 }, editId: { type: "string", maxLength: 256 },
    publicIds: { type: "array", maxItems: 4, items: { type: "string", maxLength: 256 } },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: {
    kind: { const: "json" }, data: { type: "object", additionalProperties: true },
  } }, invocationMode: "iframe-action", resultChannels: ["json"],
}, async (input, ctx) => {
  const entries = (await ctx.sdk.files.list()).filter(entry => entry.mimeType.startsWith("image/"));
  if (input.operation === "list") return { kind: "json" as const, data: { files: entries.filter(entry => !input.query || `${entry.name} ${entry.path}`.toLowerCase().includes(input.query.toLowerCase())).slice(0, 150).map(({ publicId, name, path, size, mimeType }) => ({ publicId, name, path, size, mimeType })) } };
  const editor = EditorCore.getInstance();
  const active = editor.project.getActive();
  if (!input.editId || active.metadata.id !== input.editId) throw new Error("Select the intended active edit before importing.");
  if (!input.publicIds?.length) throw new Error("Select existing image files.");
  const metadata = new SdkAdapter<MediaAssetData>({ entityType: "opencut.media-metadata", keyPrefix: `${input.editId}:`, entityApi: ctx.sdk.entities });
  const links = new SdkAdapter<{ storageKey: string; publicId: string; name: string; mimeType: string; size: number; lastModified: number }>({ entityType: "opencut.media-file", keyPrefix: `${input.editId}:`, entityApi: ctx.sdk.entities });
  const results = [];
  for (const publicId of input.publicIds) {
    const source = entries.find(entry => entry.publicId === publicId);
    if (!source || source.size > 32 * 1024 * 1024) throw new Error("Owned image is missing or exceeds 32 MiB.");
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`Cannot read original ${source.name}.`);
    const blob = await response.blob();
    if (!blob.size || blob.size !== source.size) throw new Error("Original byte length differs from its saved record.");
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width, height = bitmap.height;
    const preview = new OffscreenCanvas(480, Math.round(480 * height / width));
    preview.getContext("2d")!.drawImage(bitmap, 0, 0, preview.width, preview.height);
    const previewBytes = new Uint8Array(await (await preview.convertToBlob({ type: "image/jpeg", quality: 0.8 })).arrayBuffer());
    let previewBinary = "";
    for (let offset = 0; offset < previewBytes.length; offset += 8192) previewBinary += String.fromCharCode(...previewBytes.subarray(offset, offset + 8192));
    const previewBase64 = btoa(previewBinary);
    bitmap.close();
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("");
    const assetId = `files-${publicId}`;
    if (input.operation === "import") {
      if (!await links.get(assetId)) await links.set({ key: assetId, value: { storageKey: `${input.editId}:${assetId}`, publicId, name: source.name, mimeType: source.mimeType, size: blob.size, lastModified: 0 } });
      if (!await metadata.get(assetId)) await metadata.set({ key: assetId, value: { id: assetId, name: source.name, type: "image", size: blob.size, lastModified: 0, width, height } });
    }
    const record = await metadata.readRecord(assetId);
    const link = await links.readRecord(assetId);
    if (!record || !link || link.data.value.publicId !== publicId || record.data.value.size !== blob.size) throw new Error(`Saved asset verification failed for ${source.name}.`);
    results.push({ assetId, name: source.name, publicId, metadataRecordId: record.id, fileRecordId: link.id, width, height, byteLength: blob.size, sha256, previewBase64 });
  }
  await editor.media.loadProjectMedia({ projectId: input.editId });
  if (results.some(result => !editor.media.getAssets().some(asset => asset.id === result.assetId))) throw new Error("Saved images did not appear in the active Assets panel.");
  return { kind: "json" as const, data: { editId: input.editId, editName: active.metadata.name, assets: results, persisted: true, mounted: true } };
});

export const editTimelineCommand = commands.define<EditTimelineInput, Awaited<ReturnType<typeof editTimeline>>>({
  id: "edit-timeline", label: "Inspect and edit imported media",
  description: "Inspect Assets and timeline IDs, then place or update imported clips, captions, transitions, and text styles at exact times. Audio and video clips also carry a volume level, a keyframed volume envelope (fades and crossfades), and a convolution reverb send. No production acceptance records are required. Other elements are preserved.",
  usage: "Call with editId to open the saved edit and inspect it. For edits pass the returned expectedRevision and clips/captions/transitions/textStyles with stable unique element IDs and track IDs. Use an existing video track or a new track ID. Import media using the Assets Import button first. Source ranges must fit the actual asset duration. Transitions attach to a main-track clip edge (\"in\" or \"out\") by elementId. Text styles apply stroke/shadow/glow to a text element by elementId. For audio shaping on a clip: volumeDb sets a flat level; fadeInSeconds/fadeOutSeconds set a non-destructive fade envelope on the clip's edge that composes with the volume; volumeKeyframes sets an explicit volume envelope with times measured from the clip start (pass an empty array to clear it). reverbWet (0 dry, 1 full send) plus reverbDecaySeconds put a clip in a synthesized room; clips sharing a decay share one reverb bus. A track-level mute silences every clip on it regardless of clip volume, so pass tracks: [{ id, muted }] to clear or set it; the returned tracks echo muted for video and audio tracks. removeElements lists element IDs to delete before placements apply; to swap an element's media, remove it and place a clip with a new ID. The returned elements echo volumeDb, volumeKeyframeCount, reverbWet, reverbDecaySeconds, fadeInSeconds, and fadeOutSeconds so writes can be verified. Replay the same invocation key to recover a pending result; refresh after a revision conflict.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    clips: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, required: ["id", "assetId", "trackId", "startSeconds", "durationSeconds"], properties: {
      id: { type: "string", minLength: 1, maxLength: 256 }, assetId: { type: "string", minLength: 1, maxLength: 256 }, trackId: { type: "string", minLength: 1, maxLength: 256 },
      startSeconds: { type: "number", minimum: 0, maximum: 86400 }, durationSeconds: { type: "number", minimum: 0.00001, maximum: 86400 }, sourceStartSeconds: { type: "number", minimum: 0, maximum: 86400 }, volumeDb: { type: "number", minimum: -60, maximum: 12 }, sourceAudioEnabled: { type: "boolean" },
      volumeKeyframes: { type: "array", maxItems: 64, items: { type: "object", additionalProperties: false, required: ["timeSeconds", "volumeDb"], properties: { timeSeconds: { type: "number", minimum: 0, maximum: 86400 }, volumeDb: { type: "number", minimum: -60, maximum: 20 }, segmentToNext: { type: "string", enum: ["linear", "step", "bezier"] } } } },
      fadeInSeconds: { type: "number", minimum: 0, maximum: 60 }, fadeOutSeconds: { type: "number", minimum: 0, maximum: 60 },
      reverbWet: { type: "number", minimum: 0, maximum: 1 }, reverbDecaySeconds: { type: "number", minimum: 0.1, maximum: 10 }
    } } },
    captions: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, required: ["id", "trackId", "text", "startSeconds", "durationSeconds"], properties: {
      id: { type: "string", minLength: 1, maxLength: 256 }, trackId: { type: "string", minLength: 1, maxLength: 256 }, text: { type: "string", minLength: 1, maxLength: 2000 },
      startSeconds: { type: "number", minimum: 0, maximum: 86400 }, durationSeconds: { type: "number", minimum: 0.00001, maximum: 86400 }, fontSizePx: { type: "number", minimum: 8, maximum: 300 }, positionY: { type: "number", minimum: -4000, maximum: 4000 }
    } } },
    transitions: { type: "array", maxItems: 200, items: { type: "object", additionalProperties: false, required: ["elementId", "edge", "type"], properties: {
      elementId: { type: "string", minLength: 1, maxLength: 256 }, edge: { type: "string", enum: ["in", "out"] }, type: { type: "string", enum: ["cross-dissolve", "dip-to-black", "dip-to-white", "slide-left", "slide-right", "slide-up", "slide-down", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "zoom", "blur"] }, durationSeconds: { type: "number", minimum: 0.01, maximum: 5 }
    } } },
    tracks: { type: "array", maxItems: 50, items: { type: "object", additionalProperties: false, required: ["id"], properties: {
      id: { type: "string", minLength: 1, maxLength: 256 }, muted: { type: "boolean" }
    } } },
    removeElements: { type: "array", maxItems: 200, items: { type: "string", minLength: 1, maxLength: 256 } },
    textStyles: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, required: ["elementId"], properties: {
      elementId: { type: "string", minLength: 1, maxLength: 256 },
      stroke: { type: "object", additionalProperties: false, properties: {
        color: { type: "string", minLength: 1, maxLength: 32 }, width: { type: "number", minimum: 0, maximum: 100 }
      } },
      shadow: { type: "object", additionalProperties: false, properties: {
        color: { type: "string", minLength: 1, maxLength: 32 }, x: { type: "number", minimum: -100, maximum: 100 }, y: { type: "number", minimum: -100, maximum: 100 }, blur: { type: "number", minimum: 0, maximum: 100 }
      } },
      glow: { type: "object", additionalProperties: false, properties: {
        color: { type: "string", minLength: 1, maxLength: 32 }, radius: { type: "number", minimum: 0, maximum: 100 }
      } }
    } } }
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "assets", "tracks", "elements"], properties: {
    revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    assets: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "name", "type"], properties: { id: { type: "string" }, name: { type: "string" }, type: { enum: ["image", "video", "audio"] }, durationSeconds: { type: "number" } } } },
    tracks: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "type"], properties: { id: { type: "string" }, type: { enum: ["video", "audio", "text", "graphic", "effect"] }, muted: { type: "boolean" } } } },
    elements: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "trackId", "type", "startSeconds", "durationSeconds", "sourceStartSeconds"], properties: { id: { type: "string" }, trackId: { type: "string" }, type: { enum: ["video", "image", "audio", "text", "sticker", "graphic", "effect"] }, startSeconds: { type: "number" }, durationSeconds: { type: "number" }, sourceStartSeconds: { type: "number" }, assetId: { type: "string" }, text: { type: "string" }, volumeDb: { type: "number" }, volumeKeyframeCount: { type: "number" }, reverbWet: { type: "number" }, reverbDecaySeconds: { type: "number" }, fadeInSeconds: { type: "number" }, fadeOutSeconds: { type: "number" } } } }
  } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => editTimeline(input, ctx.sdk));

export const setClipSpeedCommand = commands.define<SetClipSpeedInput, Awaited<ReturnType<typeof setClipSpeed>>>({  id: "set-clip-speed", label: "Set clip speed or velocity curve",
  description: "Set a constant speed or a velocity curve (speed ramp) on a video or audio clip. Speed curves define how playback rate varies across the clip: source time is the integral of the rate curve. Pass a preset name or explicit keyframes.",
  usage: "Call with editId and the exact expectedRevision from a prior read. Name the trackId and elementId of an existing video or audio clip. Provide either speed (a constant rate) or curve (preset or keyframes), not both. Keyframe times are normalized to [0,1] of the clip and rates are positive multipliers.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "trackId", "elementId"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    trackId: { type: "string", minLength: 1, maxLength: 256 },
    elementId: { type: "string", minLength: 1, maxLength: 256 },
    speed: { type: "object", additionalProperties: false, required: ["rate"], properties: { rate: { type: "number", minimum: 0.01, maximum: 5 }, maintainPitch: { type: "boolean" } } },
    curve: { type: "object", additionalProperties: false, properties: {
      preset: { type: "string", enum: ["montage", "hero", "bullet", "jump-cut", "flash-in", "flash-out"] },
      keyframes: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["time", "rate"], properties: { time: { type: "number", minimum: 0, maximum: 1 }, rate: { type: "number", minimum: 0.01, maximum: 5 }, segmentToNext: { type: "string", enum: ["linear", "step", "bezier"] } } } }
    } }
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "elementId", "trackId", "durationSeconds"], properties: { revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } }, elementId: { type: "string" }, trackId: { type: "string" }, durationSeconds: { type: "number" }, retime: { type: "object", additionalProperties: true } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => setClipSpeed(input, ctx.sdk));

export const setClipAdjustCommand = commands.define<SetClipAdjustInput, Awaited<ReturnType<typeof setClipAdjust>>>({
  id: "set-clip-adjust", label: "Adjust clip color",
  description: "Apply or update the color adjustment (exposure, contrast, saturation, temperature, tint, highlights, shadows, per-hue HSL, and tone curves) on a video or image clip, or remove it. Omitted parameters keep their current value.",
  usage: "Call with editId and the exact expectedRevision from a prior read. Name the trackId and elementId of an existing video or image clip. Pass the scalar parameters under adjustment (each -100..100), per-hue HSL as an 8-band array (red, orange, yellow, green, cyan, blue, purple, magenta), and tone curves as a 4-channel array (luma, red, green, blue) with up to two interior points. Pass remove: true to clear the adjustment.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "trackId", "elementId"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    trackId: { type: "string", minLength: 1, maxLength: 256 },
    elementId: { type: "string", minLength: 1, maxLength: 256 },
    adjustment: { type: "object", additionalProperties: false, properties: {
      exposure: { type: "number", minimum: -100, maximum: 100 },
      contrast: { type: "number", minimum: -100, maximum: 100 },
      saturation: { type: "number", minimum: -100, maximum: 100 },
      temperature: { type: "number", minimum: -100, maximum: 100 },
      tint: { type: "number", minimum: -100, maximum: 100 },
      highlights: { type: "number", minimum: -100, maximum: 100 },
      shadows: { type: "number", minimum: -100, maximum: 100 },
    } },
    hsl: { type: "array", minItems: 8, maxItems: 8, items: { type: "object", additionalProperties: false, properties: {
      hue: { type: "number", minimum: -180, maximum: 180 },
      saturation: { type: "number", minimum: -100, maximum: 100 },
      lightness: { type: "number", minimum: -100, maximum: 100 },
    } } },
    curves: { type: "array", minItems: 4, maxItems: 4, items: { type: "object", additionalProperties: false, properties: {
      points: { type: "array", minItems: 1, maxItems: 2, items: { type: "object", additionalProperties: false, required: ["x", "y"], properties: {
        x: { type: "number", minimum: 0, maximum: 1 },
        y: { type: "number", minimum: 0, maximum: 1 },
      } } },
    } } },
    remove: { type: "boolean" },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "elementId", "trackId", "removed"], properties: { revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } }, elementId: { type: "string" }, trackId: { type: "string" }, effectId: { type: "string" }, removed: { type: "boolean" }, params: { type: "object", additionalProperties: true } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => setClipAdjust(input, ctx.sdk));

export const setClipCropCommand = commands.define<SetClipCropInput, Awaited<ReturnType<typeof setClipCrop>>>({
  id: "set-clip-crop", label: "Crop or flip a clip",
  description: "Crop the edges of a video or image clip (normalized source fractions) or flip it horizontally/vertically, preserving all other element properties and other clips.",
  usage: "Call with editId and the exact expectedRevision from a prior read. Name the trackId and elementId of an existing video or image clip. Provide crop (left/top/right/bottom in [0,1]), flipX, or flipY — any combination.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "trackId", "elementId"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    trackId: { type: "string", minLength: 1, maxLength: 256 },
    elementId: { type: "string", minLength: 1, maxLength: 256 },
    crop: { type: "object", additionalProperties: false, properties: {
      left: { type: "number", minimum: 0, maximum: 1 },
      top: { type: "number", minimum: 0, maximum: 1 },
      right: { type: "number", minimum: 0, maximum: 1 },
      bottom: { type: "number", minimum: 0, maximum: 1 },
    } },
    flipX: { type: "boolean" },
    flipY: { type: "boolean" },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "elementId", "trackId", "crop", "flipX", "flipY"], properties: { revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } }, elementId: { type: "string" }, trackId: { type: "string" }, crop: { type: "object", additionalProperties: true }, flipX: { type: "boolean" }, flipY: { type: "boolean" } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => setClipCrop(input, ctx.sdk));

export const setTextAnimationCommand = commands.define<SetTextAnimationInput, Awaited<ReturnType<typeof setTextAnimation>>>({
  id: "set-text-animation", label: "Animate text in, out, or looping",
  description: "Apply or remove an entrance, exit, or looping animation preset on a text element. Each preset expands into keyframes on the text element's animation channels (opacity, transform position/scale/rotate) and renders through the existing animation resolver.",
  usage: "Call with editId and the exact expectedRevision from a prior read. Name the trackId and elementId of an existing text element. Pass phase (in, out, or loop) and a preset name with optional durationSeconds, or set remove to true to clear the phase's animation. Presets: typewriter, fade, slide-up, slide-down, slide-left, slide-right, pop, bounce, wave, blur-in, scale.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "trackId", "elementId", "phase"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    trackId: { type: "string", minLength: 1, maxLength: 256 },
    elementId: { type: "string", minLength: 1, maxLength: 256 },
    phase: { type: "string", enum: ["in", "out", "loop"] },
    preset: { type: "string", enum: ["typewriter", "fade", "slide-up", "slide-down", "slide-left", "slide-right", "pop", "bounce", "wave", "blur-in", "scale"] },
    remove: { type: "boolean" },
    durationSeconds: { type: "number", minimum: 0.01, maximum: 10 }
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "elementId", "trackId", "phase"], properties: { revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } }, elementId: { type: "string" }, trackId: { type: "string" }, phase: { type: "string", enum: ["in", "out", "loop"] }, preset: { type: "string" }, durationSeconds: { type: "number" } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => setTextAnimation(input, ctx.sdk));

export const setClipFadeCommand = commands.define<SetClipFadeInput, Awaited<ReturnType<typeof setClipFade>>>({
  id: "set-clip-fade", label: "Set clip audio fade in / fade out",
  description: "Set a fade in and/or fade out duration on a video or audio clip's sound. Fades are applied on top of the clip's volume (and any volume keyframes) as a linear amplitude ramp from silence at the clip edge.",
  usage: "Call with editId and the exact expectedRevision from a prior read. Name the trackId and elementId of an existing video or audio clip. Provide fadeInSeconds and/or fadeOutSeconds in seconds; each is clamped to the clip duration and 0 removes the fade.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "trackId", "elementId"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    trackId: { type: "string", minLength: 1, maxLength: 256 },
    elementId: { type: "string", minLength: 1, maxLength: 256 },
    fadeInSeconds: { type: "number", minimum: 0, maximum: 86400 },
    fadeOutSeconds: { type: "number", minimum: 0, maximum: 86400 }
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "elementId", "trackId", "fadeInSeconds", "fadeOutSeconds"], properties: { revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } }, elementId: { type: "string" }, trackId: { type: "string" }, fadeInSeconds: { type: "number" }, fadeOutSeconds: { type: "number" } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => setClipFade(input, ctx.sdk));

export const normalizeLoudnessCommand = commands.define<NormalizeLoudnessInput, Awaited<ReturnType<typeof normalizeLoudness>>>({
  id: "normalize-loudness", label: "Normalize audio loudness",
  description: "Measure each selected audio or video clip's integrated loudness (EBU R128 / ITU-R BS.1770-4) in a worker and adjust its volume so the clip plays at the target loudness (-14, -16, or -23 LUFS). Batches across the given clips in one revision.",
  usage: "Call with editId and the exact expectedRevision from a prior read. Pass targets as trackId/elementId pairs for audio or video clips that carry audio, and an optional targetLufs (default -14). The command measures each clip's audible loudness and writes back new volume params in a single revision.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "targets"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    targets: { type: "array", minItems: 1, maxItems: 200, items: { type: "object", additionalProperties: false, required: ["trackId", "elementId"], properties: { trackId: { type: "string", minLength: 1, maxLength: 256 }, elementId: { type: "string", minLength: 1, maxLength: 256 } } } },
    targetLufs: { type: "number", enum: [-14, -16, -23] },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "targetLufs", "results"], properties: {
    revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    targetLufs: { type: "number" },
    results: { type: "array", items: { type: "object", additionalProperties: false, required: ["trackId", "elementId", "measuredLufs", "appliedGainDb", "previousVolumeDb", "nextVolumeDb"], properties: { trackId: { type: "string" }, elementId: { type: "string" }, measuredLufs: { type: "number" }, appliedGainDb: { type: "number" }, previousVolumeDb: { type: "number" }, nextVolumeDb: { type: "number" } } } },
  } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => normalizeLoudness(input, ctx.sdk));

export const setClipLutCommand = commands.define<SetClipLutInput, Awaited<ReturnType<typeof setClipLut>>>({
  id: "set-clip-lut", label: "Apply a LUT to a clip",
  description: "Apply or update a 3D LUT (color look) on a video or image clip, or remove it. Pass a bundled or user-imported LUT id and an optional strength in 0..1 (full strength when omitted).",
  usage: "Call with editId and the exact expectedRevision from a prior read. Name the trackId and elementId of an existing video or image clip. Use list-luts to see available LUT ids. Pass remove: true to clear the clip's LUT.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "trackId", "elementId"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    trackId: { type: "string", minLength: 1, maxLength: 256 },
    elementId: { type: "string", minLength: 1, maxLength: 256 },
    lutId: { type: "string", minLength: 1, maxLength: 256 },
    strength: { type: "number", minimum: 0, maximum: 1 },
    remove: { type: "boolean" },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "elementId", "trackId", "removed"], properties: { revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } }, elementId: { type: "string" }, trackId: { type: "string" }, effectId: { type: "string" }, lutId: { type: "string" }, removed: { type: "boolean" } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => setClipLut(input, ctx.sdk));

export const listLutsCommand = commands.define<Record<string, never>, ListLutsResult>({
  id: "list-luts", label: "List available LUTs",
  description: "List the bundled and user-imported 3D LUTs available to apply to clips, with their stable ids for set-clip-lut.",
  usage: "Call without arguments to list every bundled and user-imported LUT id and name.",
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["luts"], properties: { luts: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "name", "source"], properties: { id: { type: "string" }, name: { type: "string" }, source: { type: "string", enum: ["bundled", "user"] } } } } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (_input, ctx) => listLuts(ctx.sdk));

export const setClipChromaKeyCommand = commands.define<SetClipChromaKeyInput, Awaited<ReturnType<typeof setClipChromaKey>>>({
  id: "set-clip-chroma-key", label: "Apply chroma key",
  description: "Key out a color (green screen) on a video or image clip using a chroma-distance (YCbCr) matte with tolerance, softness, spill suppression, and edge feather, or enable, disable, or remove the key. Omitted parameters keep their current value.",
  usage: "Call with editId and the exact expectedRevision from a prior read. Name the trackId and elementId of an existing video or image clip. Pass keyColor as a #RRGGBB hex (default #00FF00), tolerance and softness as 0..100 percentages, spill as 0..100, feather as -100..100 (positive chokes, negative grows), and enabled to turn the key on or off. Pass remove: true to clear the chroma key.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "trackId", "elementId"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    trackId: { type: "string", minLength: 1, maxLength: 256 },
    elementId: { type: "string", minLength: 1, maxLength: 256 },
    keyColor: { type: "string", minLength: 4, maxLength: 9 },
    tolerance: { type: "number", minimum: 0, maximum: 100 },
    softness: { type: "number", minimum: 0, maximum: 100 },
    spill: { type: "number", minimum: 0, maximum: 100 },
    feather: { type: "number", minimum: -100, maximum: 100 },
    enabled: { type: "boolean" },
    remove: { type: "boolean" },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "elementId", "trackId", "removed"], properties: { revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } }, elementId: { type: "string" }, trackId: { type: "string" }, effectId: { type: "string" }, removed: { type: "boolean" }, params: { type: "object", additionalProperties: true } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => setClipChromaKey(input, ctx.sdk));

export const setClipEffectCommand = commands.define<SetClipEffectInput, Awaited<ReturnType<typeof setClipEffect>>>({
  id: "set-clip-effect", label: "Add, update, or remove a clip effect",
  description: "Add, update, or remove a named effect (glitch, vhs, pixelate, vignette, film-grain, chromatic-aberration, zoom-blur, radial-blur, sharpen, rgb-split, mirror, kaleidoscope, shake, flicker, halftone, duotone, posterize, invert, glow, noise, scanlines, fisheye, tilt-shift, old-film, neon-edge) on a video or image clip. Use list-effects to discover effect types and their parameters.",
  usage: "Call with editId and the exact expectedRevision from a prior read. Name the trackId and elementId of an existing video or image clip and the effectType id. Pass params keyed by the effect's parameter keys (omitted keys use defaults). To update a specific instance when several of the same type exist, pass effectInstanceId. Pass remove: true to clear the effect (scoped to effectInstanceId when provided).",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "trackId", "elementId", "effectType"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    trackId: { type: "string", minLength: 1, maxLength: 256 },
    elementId: { type: "string", minLength: 1, maxLength: 256 },
    effectType: { type: "string", minLength: 1, maxLength: 64 },
    params: { type: "object", additionalProperties: true },
    effectInstanceId: { type: "string", minLength: 1, maxLength: 256 },
    remove: { type: "boolean" },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "elementId", "trackId", "effectType", "removed"], properties: { revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } }, elementId: { type: "string" }, trackId: { type: "string" }, effectType: { type: "string" }, effectId: { type: "string" }, removed: { type: "boolean" }, params: { type: "object", additionalProperties: true } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => setClipEffect(input, ctx.sdk));

export const listEffectsCommand = commands.define({
  id: "list-effects", label: "List available clip effects",
  description: "List every available clip effect type with its name, search keywords, and parameter schema (key, label, type, default, and numeric range or select options). Use this before calling set-clip-effect.",
  usage: "Call with no arguments. Returns an array of effects, each with a type id and a params array describing the parameters set-clip-effect accepts for that type.",
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["effects"], properties: { effects: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "name", "keywords", "params"], properties: { type: { type: "string" }, name: { type: "string" }, keywords: { type: "array", items: { type: "string" } }, params: { type: "array", items: { type: "object", additionalProperties: true } } } } } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, () => listEffects());

export const setClipFilterCommand = commands.define<SetClipFilterInput, Awaited<ReturnType<typeof setClipFilter>>>({
  id: "set-clip-filter", label: "Apply a filter preset to a clip",
  description: "Apply or update a bundled movie-style filter preset (color adjustment + optional LUT) on a video or image clip, or remove it. The intensity slider (0..1) scales the preset's color deltas toward neutral and sets its LUT strength.",
  usage: "Call with editId and the exact expectedRevision from a prior read. Name the trackId and elementId of an existing video or image clip. Use list-filters to see available filter ids. Pass intensity in 0..1 (full strength when omitted). Pass remove: true to clear the clip's filter.",
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "trackId", "elementId"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    trackId: { type: "string", minLength: 1, maxLength: 256 },
    elementId: { type: "string", minLength: 1, maxLength: 256 },
    filterId: { type: "string", minLength: 1, maxLength: 256 },
    intensity: { type: "number", minimum: 0, maximum: 1 },
    remove: { type: "boolean" },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["revision", "elementId", "trackId", "removed"], properties: { revision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } }, elementId: { type: "string" }, trackId: { type: "string" }, effectId: { type: "string" }, filterId: { type: "string" }, intensity: { type: "number" }, removed: { type: "boolean" } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => setClipFilter(input, ctx.sdk));

export const listFiltersCommand = commands.define<Record<string, never>, ListFiltersResult>({
  id: "list-filters", label: "List available filter presets",
  description: "List the bundled movie-style filter presets available to apply to clips, with their stable ids for set-clip-filter, their categories, keywords, color-adjustment deltas, and optional LUT ids.",
  usage: "Call without arguments to list every bundled filter preset.",
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: false, required: ["filters"], properties: { filters: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "name", "category", "keywords", "adjust"], properties: { id: { type: "string" }, name: { type: "string" }, category: { type: "string" }, keywords: { type: "array", items: { type: "string" } }, adjust: { type: "object", additionalProperties: false, properties: { exposure: { type: "number" }, contrast: { type: "number" }, saturation: { type: "number" }, temperature: { type: "number" }, tint: { type: "number" }, highlights: { type: "number" }, shadows: { type: "number" } } }, lutId: { type: "string" } } } } } } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (_input, ctx) => listFilters(ctx.sdk));

export const importAudioCommand = commands.define({
  id: "import-audio", label: "Import audio and place it on the timeline",
  description: "Import host-delivered PCM WAV files (for example Voicebox sound effects or narration) into this edit and place each as an audio clip at an exact time on one audio track, preserving other elements.",
  usage: "Read production-edit first and pass its exact revision. Bind the audio files in the \"audio\" resource slot: resources: [{ slot: \"audio\", items: [{ source: { kind: \"files\", publicId } }] }], where each publicId is a files result another app's command returned to you (or one of this project's own Files). Each clip names its slot item by index and its start time in seconds. Replay the same invocation key to recover a pending result; refresh after a revision conflict.",
  resources: { inputs: [{ name: "audio", format: { mediaTypes: ["audio/wav"], maxBytes: 33554432 }, minItems: 1, maxItems: 8 }] },
  inputSchema: { type: "object", additionalProperties: false, required: ["editId", "expectedRevision", "clips"], properties: {
    editId: { type: "string", minLength: 1, maxLength: 256 },
    expectedRevision: { type: "object", additionalProperties: false, required: ["editId", "storageCasRevision", "intentRevision", "digest"], properties: { editId: { type: "string" }, storageCasRevision: { type: "string" }, intentRevision: { type: "string" }, digest: { type: "string" } } },
    trackId: { type: "string", minLength: 1, maxLength: 128 },
    trackName: { type: "string", minLength: 1, maxLength: 128 },
    clips: { type: "array", minItems: 1, maxItems: 16, items: { type: "object", additionalProperties: false, required: ["item", "startSeconds"], properties: {
      item: { type: "integer", minimum: 0, maximum: 7 }, startSeconds: { type: "number", minimum: 0, maximum: 86400 },
      name: { type: "string", minLength: 1, maxLength: 120 }, volumeDb: { type: "number", minimum: -60, maximum: 12 },
    } } },
  } },
  resultSchema: { type: "object", additionalProperties: false, required: ["kind", "data"], properties: { kind: { const: "json" }, data: { type: "object", additionalProperties: true } } },
  invocationMode: "iframe-action", resultChannels: ["json"],
}, (input, ctx) => importAudio(input, ctx.sdk, ctx.resources, mountedProductionMediaLibrary(ctx.sdk, input.editId)));

export const projectCommands = commands.expose([
  importAudioCommand,
  editTimelineCommand,
  filesAssetsCommand,
  generateImageCommand,
  generateVideoCommand,
  contactSheetCommand,
  convertPngCommand,
  productionMusicCommand,
  productionSoundEffectCommand,
  productionExplosionCommand,
	productionTimelineAdjustCommand,
	productionEditCommand,
	transcribeMediaCommand,
	createProjectCommand,
	arrangeTimelineCommand,
  exportProjectCommand,
  setClipSpeedCommand,
  setClipAdjustCommand,
  setClipCropCommand,
  setTextAnimationCommand,
  setClipFadeCommand,
  normalizeLoudnessCommand,
  setClipLutCommand,
  listLutsCommand,
  setClipChromaKeyCommand,
  setClipEffectCommand,
  listEffectsCommand,
  setClipFilterCommand,
  listFiltersCommand,
]);

projectCommands.ready();
