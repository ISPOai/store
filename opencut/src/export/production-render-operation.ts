import type { FilesStorageApi } from "@/services/storage/sdk-adapter";
import {
	SdkAdapter,
	SdkBinaryAdapter,
	type EntityStorageApi,
} from "@/services/storage/sdk-adapter";
import {
	projectFolderRef,
	resolveProjectFolder,
	rememberProjectName,
} from "@/services/storage/project-folder";
import type { MediaAsset } from "@/media/types";
import type { MediaAssetData } from "@/services/storage/types";
import type {
	EditRevision,
	LoadedProductionDocument,
} from "@/project/production-types";
import type { SerializedProject } from "@/services/storage/types";
import { createTimelineAudioBuffer } from "@/media/audio";
import { mediaTime, mediaTimeToSeconds } from "@/wasm";
import { buildScene } from "@/services/renderer/scene-builder";
import { SceneExporter } from "@/services/renderer/scene-exporter";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import {
	initializeGpuRenderer,
	isGpuAvailable,
} from "@/services/renderer/gpu-renderer";
import {
	getExportFileName,
	getExportMimeType,
	isAudioOnlyExportFormat,
	type ExportFormat,
	type ExportMovCodec,
	type ExportQuality,
	type ExportResolution,
} from "@/export";
import { applyExportResolution } from "@/export/resolution";
import { floatToFrameRate } from "@/fps/utils";
import {
	ProductionRenderValidationError,
	validateAudioOnlyRender,
	validateGifRender,
	validateProductionRender,
	type ProductionCaptionProbe,
} from "./production-render-validate";

const MEDIA_METADATA_ENTITY_TYPE = "opencut.media-metadata";
const MEDIA_FILE_ENTITY_TYPE = "opencut.media-file";
const MAX_RENDER_NAME_LENGTH = 200;

export interface ProductionRenderInput {
	editId: string;
	expectedRevision: EditRevision;
	format: ExportFormat;
	quality: ExportQuality;
	includeAudio: boolean;
	name?: string;
	resolution?: ExportResolution;
	fps?: number;
	bitrate?: number;
	movCodec?: ExportMovCodec;
}

export interface ProductionRenderArtifact {
	publicId: string;
	path: string;
	byteLength: number;
	sha256: string;
	duration: number;
	width: number;
	height: number;
	format: ExportFormat;
}

export interface ProductionRenderResult {
	operationId: string;
	status: "completed";
	revision: EditRevision;
	artifact: ProductionRenderArtifact;
}

export interface ProductionRenderDocuments {
	readCurrent(editId: string): Promise<
		{ kind: "document"; document: LoadedProductionDocument } |
		{ kind: "legacy"; editId: string; storageCasRevision: string; project: SerializedProject } |
		null
	>;
	readRevision(args: {
		editId: string;
		intentRevision: string;
	}): Promise<LoadedProductionDocument | null>;
}

export interface ProductionRenderSdk {
	entities: EntityStorageApi;
	files: FilesStorageApi;
}

export class ProductionRenderOperationError extends Error {
	readonly reason = "render-failed" as const;

	constructor(message: string) {
		super(message);
		this.name = "ProductionRenderOperationError";
	}
}

function sameRevision(left: EditRevision, right: EditRevision): boolean {
	return left.editId === right.editId &&
		left.intentRevision === right.intentRevision &&
		left.digest === right.digest;
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
	const digestInput = new Uint8Array(bytes.byteLength);
	digestInput.set(bytes);
	const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function operationId(input: ProductionRenderInput): Promise<string> {
	const digest = await digestBytes(
		new TextEncoder().encode(JSON.stringify({
			editId: input.editId,
			revision: input.expectedRevision,
			format: input.format,
			quality: input.quality,
			includeAudio: input.includeAudio,
			name: input.name ?? null,
			resolution: input.resolution ?? null,
			fps: input.fps ?? null,
			bitrate: input.bitrate ?? null,
			movCodec: input.movCodec ?? null,
		})),
	);
	return `render-${digest.slice(0, 32)}`;
}

function referencedMediaIds(project: SerializedProject): Set<string> {
	const ids = new Set<string>();
	for (const scene of project.scenes) {
		for (const track of [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio]) {
			for (const element of track.elements) {
				if ((element.type === "image" || element.type === "video" || element.type === "audio") &&
					"mediaId" in element) {
					ids.add(element.mediaId);
				}
			}
		}
	}
	return ids;
}

async function loadMediaAssets({
	editId,
	project,
	sdk,
}: {
	editId: string;
	project: SerializedProject;
	sdk: ProductionRenderSdk;
}): Promise<{ assets: MediaAsset[]; urls: string[] }> {
	const metadata = new SdkAdapter<MediaAssetData>({
		entityType: MEDIA_METADATA_ENTITY_TYPE,
		keyPrefix: `${editId}:`,
		entityApi: sdk.entities,
	});
	const binary = new SdkBinaryAdapter({
		entityType: MEDIA_FILE_ENTITY_TYPE,
		keyPrefix: `${editId}:`,
		folder: projectFolderRef({ editId, section: "Media", entityApi: sdk.entities }),
		entityApi: sdk.entities,
		filesApi: sdk.files,
	});
	const assets: MediaAsset[] = [];
	const urls: string[] = [];
	for (const id of referencedMediaIds(project)) {
		const [details, file] = await Promise.all([metadata.get(id), binary.get(id)]);
		if (!details || !file) {
			throw new ProductionRenderOperationError(`Media ${id} is unavailable for this edit`);
		}
		const url = URL.createObjectURL(file);
		urls.push(url);
		assets.push({ ...details, file, url });
	}
	return { assets, urls };
}

function captionProbes(project: SerializedProject): ProductionCaptionProbe[] {
	const probes: ProductionCaptionProbe[] = [];
	for (const scene of project.scenes) {
		for (const track of scene.tracks.overlay) {
			for (const element of track.elements) {
				if (track.hidden || element.type !== "text" || element.hidden) continue;
				probes.push({
					startSeconds: mediaTimeToSeconds({ time: element.startTime }),
					endSeconds: mediaTimeToSeconds({
						time: mediaTime({ ticks: element.startTime + element.duration }),
					}),
				});
			}
		}
	}
	return probes;
}

function hasAudio(project: SerializedProject): boolean {
	return project.scenes.some((scene) =>
		scene.tracks.audio.some((track) => !track.muted && track.elements.length > 0),
	);
}

function renderDuration(project: SerializedProject): number {
	return project.metadata.duration;
}

export class ProductionRenderOperation {
	constructor(
		private readonly documents: ProductionRenderDocuments,
		private readonly sdk: ProductionRenderSdk,
	) {}

	private async validateRender({
		buffer,
		format,
		expectedWidth,
		expectedHeight,
		expectedDurationSeconds,
		expectedAudio,
		captions,
	}: {
		buffer: ArrayBuffer | Uint8Array;
		format: ExportFormat;
		expectedWidth: number;
		expectedHeight: number;
		expectedDurationSeconds: number;
		expectedAudio: boolean;
		captions: ProductionCaptionProbe[];
	}): Promise<{ durationSeconds: number; width: number; height: number }> {
		try {
			if (isAudioOnlyExportFormat(format)) {
				return await validateAudioOnlyRender({
					buffer,
					format,
					expectedDurationSeconds,
				});
			}
			if (format === "gif") {
				return validateGifRender({
					buffer,
					expectedWidth,
					expectedHeight,
				});
			}
			return await validateProductionRender({
				buffer,
				format,
				expectedWidth,
				expectedHeight,
				expectedDurationSeconds,
				expectedAudio,
				captions,
			});
		} catch (error) {
			if (error instanceof ProductionRenderValidationError) throw error;
			throw new ProductionRenderValidationError(
				error instanceof Error
					? error.message
					: "The rendered container could not be validated",
			);
		}
	}

	async run(input: ProductionRenderInput): Promise<ProductionRenderResult> {
		let stage = "document load";
		const current = await this.documents.readCurrent(input.editId);
		if (!current || current.kind !== "document") {
			throw new ProductionRenderOperationError(
				current ? "Legacy edits must be admitted before rendering" : `Edit ${input.editId} was not found`,
			);
		}
		if (!sameRevision(current.document.revision, input.expectedRevision)) {
			throw new ProductionRenderOperationError("The edit changed before rendering");
		}

		stage = "historical snapshot load";
		const snapshot = await this.documents.readRevision({
			editId: input.editId,
			intentRevision: input.expectedRevision.intentRevision,
		});
		if (!snapshot || snapshot.revision.digest !== input.expectedRevision.digest) {
			throw new ProductionRenderOperationError("The accepted render snapshot is unavailable");
		}
		const project = structuredClone(snapshot.project);
		const scene = project.scenes.find((candidate) => candidate.isMain);
		const duration = renderDuration(project);
		if (!scene || duration <= 0) {
			throw new ProductionRenderOperationError("The edit has no renderable main scene or duration");
		}

		let assets: MediaAsset[] = [];
		let urls: string[] = [];
		try {
			stage = "media hydration";
			const loadedMedia = await loadMediaAssets({
				editId: input.editId,
				project,
				sdk: this.sdk,
			});
			assets = loadedMedia.assets;
			urls = loadedMedia.urls;

			const format = input.format;
			const isAudioOnly = isAudioOnlyExportFormat(format);
			if (isAudioOnly && !hasAudio(project)) {
				throw new ProductionRenderOperationError("The edit has no audio to export");
			}
			const shouldIncludeAudio = isAudioOnly || (input.includeAudio && hasAudio(project));
			const canvasSize = applyExportResolution({
				canvasSize: project.settings.canvasSize,
				resolution: input.resolution,
			});
			const fps = input.fps !== undefined
				? floatToFrameRate(input.fps)
				: project.settings.fps;

			stage = "audio decode and mix";
			const audioBuffer = shouldIncludeAudio
				? await createTimelineAudioBuffer({
						tracks: scene.tracks,
						mediaAssets: assets,
						duration,
					})
				: undefined;

			let rootNode: RootNode;
			if (!isAudioOnly) {
				stage = "GPU renderer initialization";
				await initializeGpuRenderer();
				if (!isGpuAvailable()) {
					throw new ProductionRenderOperationError("GPU renderer is unavailable");
				}
			}
			stage = "scene build";
			rootNode = buildScene({
				tracks: scene.tracks,
				mediaAssets: assets,
				duration,
				canvasSize,
				background: project.settings.background,
			});

			stage = "WebCodecs encoder and muxer setup";
			const exporter = new SceneExporter({
				width: canvasSize.width,
				height: canvasSize.height,
				fps,
				format,
				quality: input.quality,
				shouldIncludeAudio,
				audioBuffer: audioBuffer ?? undefined,
				bitrate: input.bitrate,
				movCodec: input.movCodec,
			});
			stage = "WebCodecs encoder and muxer render";
			const buffer = await exporter.export({ rootNode });
			if (!buffer) throw new ProductionRenderOperationError("The renderer produced no buffer");

			const expectedDurationSeconds = mediaTimeToSeconds({ time: mediaTime({ ticks: duration }) });
			stage = "rendered container validation";
			const validated = await this.validateRender({
				buffer,
				format,
				expectedWidth: canvasSize.width,
				expectedHeight: canvasSize.height,
				expectedDurationSeconds,
				expectedAudio: shouldIncludeAudio,
				captions: isAudioOnly ? [] : captionProbes(project),
			});

			const bytes = new Uint8Array(buffer);
			const sha256 = await digestBytes(bytes);
			const baseName = (input.name?.trim() || project.metadata.name).slice(0, MAX_RENDER_NAME_LENGTH);
			const fileName = getExportFileName({ name: baseName, format });
			stage = "Files publish";
			rememberProjectName({ editId: input.editId, name: project.metadata.name });
			const published = await this.sdk.files.publish({
				content: bytes,
				name: fileName,
			mimeType: getExportMimeType({ format }),
			folder: await resolveProjectFolder({
				editId: input.editId,
				section: "Exports",
				entityApi: this.sdk.entities,
			}),
			});
			stage = "Files publish readback";
			const publishedEntry = (await this.sdk.files.list()).find(
				(entry: { publicId: string; url: string }) =>
					entry.publicId === published.publicId,
			);
			if (!publishedEntry) throw new ProductionRenderOperationError("Published render is not readable from Files");
			const publishedResponse = await fetch(publishedEntry.url);
			if (!publishedResponse.ok) throw new ProductionRenderOperationError("Published render bytes could not be read");
			const publishedBytes = new Uint8Array(await publishedResponse.arrayBuffer());
			if (await digestBytes(publishedBytes) !== sha256) {
				throw new ProductionRenderOperationError("Published render bytes changed before validation");
			}
			stage = "published container validation";
			const publishedValidation = await this.validateRender({
				buffer: publishedBytes,
				format,
				expectedWidth: canvasSize.width,
				expectedHeight: canvasSize.height,
				expectedDurationSeconds,
				expectedAudio: shouldIncludeAudio,
				captions: isAudioOnly ? [] : captionProbes(project),
			});

			return {
				operationId: await operationId(input),
				status: "completed",
				revision: input.expectedRevision,
				artifact: {
					publicId: published.publicId,
					path: published.path,
					byteLength: publishedBytes.byteLength,
					sha256,
					duration: publishedValidation.durationSeconds,
					width: publishedValidation.width,
					height: publishedValidation.height,
					format,
				},
			};
		} catch (error) {
			if (error instanceof ProductionRenderOperationError) throw error;
			if (error instanceof ProductionRenderValidationError) {
				throw new ProductionRenderOperationError(`Render validation failed: ${error.message}`);
			}
			const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
			const failure = new ProductionRenderOperationError(`${stage}: ${message}`);
			failure.cause = error;
			throw failure;
		} finally {
			for (const url of urls) URL.revokeObjectURL(url);
		}
	}
}
