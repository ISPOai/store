import { describe, expect, test } from "bun:test";
import {
	ProjectRpcError,
	type CommandResourceDelivery,
	type EntityCreateOptions,
	type EntityQuery,
	type EntityQueryResult,
	type EntityRecord,
	type EntityUpdateOptions,
	type FilesListEntry,
	type FilesPublishArgs,
	type FilesPublishResult,
} from "@ispo/sdk";
import type {
	EntityStorageApi,
	FilesStorageApi,
	StoredEntityValue,
} from "@/services/storage/sdk-adapter";
import type { ProductionImportSdk } from "@/media/production-import";
import {
	runProductionImportCommand,
	parseProductionImportBinding,
	sameProductionRevisionReference,
} from "@/media/production-import";
import { ProductionDocumentService } from "@/project/production-document-service";
import { deriveAcceptedPlacementInput, ProductionService } from "@/project/production-service";
import { ProductionRegenerationService } from "@/project/production-regeneration";
import type { SerializedProject } from "@/services/storage/types";
import type { StoredProductionDocument } from "@/project/production-types";
import {
	SdkProductionMediaLibrary,
	MountedProductionMediaLibrary,
	type ProductionMediaImport,
	type MountedMediaStore,
} from "@/services/storage/production-media-adapter";

const DECLARED_ENTITY_TYPES = new Set([
	"opencut.project",
	"opencut.media-metadata",
	"opencut.media-file",
	"opencut.saved-sounds",
	"opencut.migration",
]);

interface EntityRow {
	id: string;
	type: string;
	data: unknown;
	version: number;
}

function entityRecord<T>(row: EntityRow): EntityRecord<T> {
	return {
		id: row.id,
		type: row.type,
		// SAFETY: every test row is created by the typed EntityStorageApi methods below.
		data: row.data as T,
		version: row.version,
		createdBy: { kind: "project", id: "opencut" },
		updatedBy: { kind: "project", id: "opencut" },
		createdAt: "2026-09-10T00:00:00.000Z",
		updatedAt: "2026-09-10T00:00:00.000Z",
	};
}

function fixture() {
	const rows = new Map<string, EntityRow>();
	const seenTypes = new Set<string>();
	const files = new Map<string, FilesListEntry>();
	let publishedCount = 0;
	const entities: EntityStorageApi = {
		query<T>(type: string, query: EntityQuery = {}): Promise<EntityQueryResult<T>> {
			seenTypes.add(type);
			const storageKey = query.where?.storageKey;
			const records = [...rows.values()]
				.filter((row) => {
					// SAFETY: adapter rows always wrap values in { storageKey, value }.
					return row.type === type && (storageKey === undefined || (row.data as StoredEntityValue<unknown>).storageKey === storageKey);
				})
				.slice(0, query.limit)
				.map((row) => entityRecord<T>(row));
			return Promise.resolve({ records, cursor: null });
		},
		create<T>(type: string, data: T, options: EntityCreateOptions = {}): Promise<EntityRecord<T>> {
			seenTypes.add(type);
			const id = options.id ?? `${type}-${rows.size + 1}`;
			const row = { id, type, data, version: 1 };
			rows.set(id, row);
			return Promise.resolve(entityRecord<T>(row));
		},
		update<T>(type: string, id: string, patch: Partial<T>, _options: EntityUpdateOptions = {}): Promise<EntityRecord<T>> {
			seenTypes.add(type);
			const current = rows.get(id);
			if (!current || current.type !== type) throw new Error(`Missing entity ${id}`);
			const row = { ...current, data: Object.assign({}, current.data, patch), version: current.version + 1 };
			rows.set(id, row);
			return Promise.resolve(entityRecord<T>(row));
		},
		delete<T>(type: string, id: string): Promise<EntityRecord<T>> {
			seenTypes.add(type);
			const current = rows.get(id);
			if (!current || current.type !== type) throw new Error(`Missing entity ${id}`);
			rows.delete(id);
			return Promise.resolve(entityRecord<T>(current));
		},
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const filesApi: FilesStorageApi = {
		list(): Promise<FilesListEntry[]> {
			return Promise.resolve([...files.values()]);
		},
		publish(args: FilesPublishArgs): Promise<FilesPublishResult> {
			if (!("content" in args)) throw new Error("Fixture requires byte publication");
			const content = args.content instanceof Uint8Array ? args.content : new TextEncoder().encode(args.content);
			const publicId = `file-${publishedCount + 1}`;
			publishedCount += 1;
			const mimeType = args.mimeType ?? "application/octet-stream";
			const name = args.name;
			const path = `${args.folder ?? ""}/${name}`;
			const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : "other";
			const url = `data:${mimeType};base64,${btoa(String.fromCharCode(...content))}`;
			files.set(publicId, { publicId, path, name, mimeType, size: content.byteLength, folder: args.folder ?? "", kind, url });
			return Promise.resolve({ publicId, path });
		},
	};
	return {
		entities,
		files: filesApi,
		seenTypes,
		seedProject(document: StoredProductionDocument) {
			rows.set("project-1", { id: "project-1", type: "opencut.project", data: { storageKey: "edit-1", value: document }, version: 1 });
		},
		get publishedFiles() { return files; },
		get publishedCount() { return publishedCount; },
	};
}

const acceptedReference = {
	editId: "edit-1",
	documentIntentRevision: "1",
	productionRevisionId: "production-1",
	contentDigest: "production-digest",
};

function acceptedDocument(): StoredProductionDocument {
	const project: SerializedProject = {
		metadata: { id: "edit-1", name: "Production import", duration: 2, createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" },
		scenes: [],
		currentSceneId: "",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
			production: {
				formatVersion: 1,
				accepted: {
					reference: acceptedReference,
					script: "Narration",
					shots: [{ shotId: "shot-1", revision: 1, narration: "Narration", visualBrief: "Visual", durationMs: 2_000 }],
					targetDurationMs: 2_000,
					canvas: { width: 1920, height: 1080 },
					fps: { numerator: 30, denominator: 1 },
				},
				acceptanceReceipts: [],
				actionIntents: [],
			},
		},
		version: 32,
	};
	return {
		...project,
		kind: "opencut.production-document",
		formatVersion: 1,
		editId: "edit-1",
		currentIntentRevision: "1",
		snapshots: [{ intentRevision: "1", digest: "document-digest", project }],
	};
}

async function wavDelivery(): Promise<CommandResourceDelivery> {
	const bytes = pcmWavBytes(1_500);
	const digestBuffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	const digest = Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
	const resource = {
		contractVersion: 1 as const,
		owner: { projectId: "proj_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", store: "files" as const, resourceRef: "voice-wav-1", resourceRevision: "wav-revision-1" },
		producer: { projectId: "proj_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", producerId: "voicebox", producerVersion: "voicebox-1" },
		source: { kind: "media" as const, sourceId: "voice-wav-1", revision: "wav-revision-1", sha256: digest },
		mediaType: "audio/wav" as const,
		container: "pcm-wav" as const,
		byteLength: bytes.byteLength,
		sha256: digest,
		durationMs: 1_500,
		audio: { sampleRate: 48_000, channels: 1 },
	};
	return {
		slot: "media",
		items: [],
		media: [{
			name: "narration.wav",
			mediaType: "audio/wav",
			digest,
			transfer: {
				contractVersion: 1,
				resource,
				expectation: { ownerProjectId: resource.owner.projectId, resourceRevision: resource.owner.resourceRevision, sha256: digest, authorityRevision: "authority-1", authorityState: "active" },
				transfer: { kind: "inline", observedByteLength: bytes.byteLength, observedSha256: digest },
			},
		}],
	};
}

async function videoDelivery(durationMs = 1_500, dimensions = { width: 1_280, height: 720 }): Promise<CommandResourceDelivery> {
	const bytes = new Uint8Array([0, 0, 0, 1, 102, 116, 121, 112]);
	const digestBuffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	const digest = Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
	const resource = {
		contractVersion: 1 as const,
		owner: { projectId: "proj_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", store: "files" as const, resourceRef: "video-1", resourceRevision: "video-revision-1" },
		producer: { projectId: "proj_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", producerId: "user-input", producerVersion: "video-1" },
		source: { kind: "media" as const, sourceId: "video-1", revision: "video-revision-1", sha256: digest },
		mediaType: "video/mp4" as const,
		container: "mp4" as const,
		byteLength: bytes.byteLength,
		sha256: digest,
		durationMs,
		dimensions,
	};
	return {
		slot: "media",
		items: [],
		media: [{
			name: "clip.mp4",
			mediaType: "video/mp4",
			digest,
			transfer: {
				contractVersion: 1,
				resource,
				expectation: { ownerProjectId: resource.owner.projectId, resourceRevision: resource.owner.resourceRevision, sha256: digest, authorityRevision: "authority-1", authorityState: "active" },
				transfer: { kind: "inline", observedByteLength: bytes.byteLength, observedSha256: digest },
			},
		}],
	};
}

function pcmWavBytes(durationMs: number): Uint8Array {
	const sampleRate = 48_000;
	const channels = 1;
	const bitsPerSample = 16;
	const blockAlign = channels * bitsPerSample / 8;
	const byteRate = sampleRate * blockAlign;
	const dataSize = byteRate * durationMs / 1_000;
	const bytes = new Uint8Array(44 + dataSize);
	const view = new DataView(bytes.buffer);
	const writeText = (offset: number, value: string) => value.split("").forEach((character, index) => { bytes[offset + index] = character.charCodeAt(0); });
	writeText(0, "RIFF");
	view.setUint32(4, bytes.byteLength - 8, true);
	writeText(8, "WAVE");
	writeText(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitsPerSample, true);
	writeText(36, "data");
	view.setUint32(40, dataSize, true);
	return bytes;
}

function pngBytes(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width, false);
	view.setUint32(20, height, false);
	return bytes;
}

async function inlineWavDelivery(bytes: Uint8Array): Promise<CommandResourceDelivery> {
	const digestBuffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	const digest = Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return { slot: "media", items: [{ name: "narration.wav", mediaType: "audio/wav", digest, bytes }] };
}

async function inlineImageDelivery(bytes: Uint8Array, publicId: string): Promise<CommandResourceDelivery> {
	const digestBuffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	const digest = Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return { slot: "media", items: [{ name: `${publicId}.png`, mediaType: "image/png", digest, bytes }] };
}

function input(): ProductionMediaImport {
	const file = new File([new Uint8Array([1, 2, 3, 4])], "shot.png", { type: "image/png" });
	return {
		editId: "edit-1",
		mediaId: "production-media-shot-1-visual",
		mediaRevision: "digest-1",
		role: "visual",
		name: file.name,
		mimeType: "image/png",
		digest: "digest-1",
		file,
		width: 1920,
		height: 1080,
	};
}

describe("production media import storage", () => {
	test("normalizes reordered revision keys and string shot revisions", () => {
		const parsed = parseProductionImportBinding({
			acceptedRevision: {
				contentDigest: "digest",
				productionRevisionId: "production-1",
				documentIntentRevision: "intent-1",
				editId: "edit-1",
			},
			shotRevision: "1",
		});

		expect(parsed).toEqual({
			acceptedRevision: {
				editId: "edit-1",
				documentIntentRevision: "intent-1",
				productionRevisionId: "production-1",
				contentDigest: "digest",
			},
			shotRevision: 1,
		});
		expect(sameProductionRevisionReference(parsed!.acceptedRevision, {
			editId: "edit-1",
			documentIntentRevision: "intent-1",
			productionRevisionId: "production-1",
			contentDigest: "changed-digest",
		})).toBe(false);
	});

	test("rejects numeric and malformed shot revisions at the narrow binding boundary", () => {
		expect(parseProductionImportBinding({
			acceptedRevision: { editId: "edit-1", documentIntentRevision: "intent-1", productionRevisionId: "production-1", contentDigest: "digest" },
			shotRevision: 1,
		})).toBeNull();
		expect(parseProductionImportBinding({
			acceptedRevision: { editId: "edit-1", documentIntentRevision: "intent-1", productionRevisionId: "production-1", contentDigest: "digest" },
			shotRevision: "1.5",
		})).toBeNull();
	});

	test("writes only declared media types and replays without republishing", async () => {
		const sdk = fixture();
		const library = new SdkProductionMediaLibrary(sdk);
		const first = await library.import(input());
		const replay = await library.import(input());

		expect(replay.id).toBe(first.id);
		expect(first.filesRef).toEqual({ publicId: "file-1", path: "Media/shot.png" });
		expect(replay.filesRef).toEqual(first.filesRef);
		expect(sdk.publishedCount).toBe(1);
		expect([...sdk.seenTypes].every((type) => DECLARED_ENTITY_TYPES.has(type))).toBe(true);
		expect(sdk.seenTypes.has("opencut.media-metadata")).toBe(true);
		expect(sdk.seenTypes.has("opencut.media-file")).toBe(true);
		expect(sdk.seenTypes.has("opencut.production-media-import")).toBe(false);
	});

	test("hydrates the mounted Assets store with the durable production media identity", async () => {
		const sdk = fixture();
		const assets: Array<{ id: string; name: string; type: "image" | "video" | "audio"; file: File; url: string; width?: number; height?: number; duration?: number }> = [];
		const mounted: MountedMediaStore = {
			getAssets: () => assets,
			addMediaAsset: async ({ assetId, asset }) => {
				const mountedAsset = { ...asset, id: assetId ?? "missing-id" };
				assets.push(mountedAsset);
				return mountedAsset;
			},
		};
		const library = new MountedProductionMediaLibrary(new SdkProductionMediaLibrary(sdk), mounted);

		const first = await library.import(input());
		const replay = await library.import(input());

		expect(first.id).toBe(input().mediaId);
		expect(replay.id).toBe(first.id);
		expect(assets).toHaveLength(1);
		expect(assets[0]?.id).toBe(first.id);
		expect(assets[0]?.url.startsWith("blob:")).toBe(true);
		expect(sdk.publishedCount).toBe(1);
	});

	test("records an imported still with its accepted shot duration", async () => {
		const base = fixture();
		base.seedProject(acceptedDocument());
		const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
		const digestBuffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
		const digest = Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
		const result = await runProductionImportCommand({
			editId: "edit-1",
			expectedRevision: { editId: "edit-1", storageCasRevision: "1", intentRevision: "1", digest: "document-digest" },
			acceptedRevision: acceptedReference,
			shotId: "shot-1",
			shotRevision: "1",
			role: "visual",
			idempotencyKey: "still-import-1",
		}, base, [{ slot: "media", items: [{ name: "shot.png", mediaType: "image/png", digest, bytes }] }]);

		expect(result.data).toMatchObject({ status: "completed", media: { durationMs: 2_000 } });
		const acceptedAfterImport = (await new ProductionService(new ProductionDocumentService(base)).load("edit-1"))?.accepted;
		expect(acceptedAfterImport?.shots[0]?.imageVersion?.sourceDurationSeconds).toBe(2);
	});

	test("records admitted still dimensions instead of the accepted canvas dimensions", async () => {
		const base = fixture();
		base.seedProject(acceptedDocument());
		const bytes = pngBytes(1344, 768);
		const digestBuffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
		const digest = Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
		await runProductionImportCommand({
			editId: "edit-1",
			expectedRevision: { editId: "edit-1", storageCasRevision: "1", intentRevision: "1", digest: "document-digest" },
			acceptedRevision: acceptedReference,
			shotId: "shot-1",
			shotRevision: "1",
			role: "visual",
			idempotencyKey: "still-dimensions-1",
		}, base, [{ slot: "media", items: [{ name: "shot.png", mediaType: "image/png", digest, bytes }] }]);

		const acceptedAfterImport = (await new ProductionService(new ProductionDocumentService(base)).load("edit-1"))?.accepted;
		expect(acceptedAfterImport?.shots[0]?.imageVersion?.dimensions).toEqual({ width: 1344, height: 768 });
	});

	test("imports an admitted MP4 as a video visual with host metadata and replays idempotently", async () => {
		const base = fixture();
		base.seedProject(acceptedDocument());
		const delivery = await videoDelivery();
		const bytes = new Uint8Array([0, 0, 0, 1, 102, 116, 121, 112]);
		const sdk: ProductionImportSdk = {
			entities: base.entities,
			files: {
				...base.files,
				media: {
					read: async (transfer, sink) => {
						await sink.write(bytes, { transferId: "transfer-video-1", cursor: "cursor-video-1", offset: 0, byteLength: bytes.byteLength, sha256: delivery.media![0]!.digest, final: true });
						const result = { resource: transfer.resource, byteLength: bytes.byteLength, pages: 1 };
						await sink.commit(result);
						return result;
					},
				},
			},
		};
		const input = {
			editId: "edit-1",
			expectedRevision: { editId: "edit-1", storageCasRevision: "1", intentRevision: "1", digest: "document-digest" },
			acceptedRevision: acceptedReference,
			shotId: "shot-1",
			shotRevision: "1",
			role: "video" as const,
			idempotencyKey: "video-import-1",
		};
		const first = await runProductionImportCommand(input, sdk, [delivery]);
		expect(first.data).toMatchObject({ status: "completed", media: { role: "video", durationMs: 1_500 } });
		const imported = (await new ProductionService(new ProductionDocumentService(sdk)).load("edit-1"))?.accepted?.shots[0]?.imageVersion;
		expect(imported).toMatchObject({ mediaType: "video", mimeType: "video/mp4", sourceDurationSeconds: 1.5, dimensions: { width: 1_280, height: 720 } });
		const replay = await runProductionImportCommand(input, sdk, [delivery]);
		expect(replay.data.media).toEqual(first.data.media);
		expect(base.publishedCount).toBe(1);
	});

	test("accepts a Files-backed image candidate into the library once and exposes placement-ready state", async () => {
		const base = fixture();
		const bytes = pngBytes(1920, 1080);
		const delivery = await inlineImageDelivery(bytes, "candidate-image");
		const digest = delivery.items[0]!.digest;
		const production = new ProductionService(new ProductionDocumentService(base));
		const candidate = {
			candidateId: "candidate-image-1",
			acceptedRevision: acceptedReference,
			shotId: "shot-1",
			shotRevision: 1,
			role: "visual" as const,
			version: {
				idempotencyKey: "candidate-image-key",
				mediaId: "candidate-image",
				mediaRevision: digest,
				name: "candidate-image.png",
				mediaType: "image" as const,
				mimeType: "image/png" as const,
				digest,
				byteLength: bytes.byteLength,
				sourceDurationSeconds: 0,
			},
		};
		const document = acceptedDocument();
		document.settings.production!.accepted!.shots[0]!.imageCandidates = [{
			kind: "storyboard-image",
			idempotencyKey: candidate.version.idempotencyKey!,
			acceptedRevision: acceptedReference,
			shotId: "shot-1",
			shotRevision: 1,
			resource: {
				kind: "files",
				publicId: "candidate-image",
				path: "/candidate-image.png",
				digest,
				byteLength: bytes.byteLength,
				mimeType: "image/png",
				dimensions: { width: 1920, height: 1080 },
			},
		}];
		base.seedProject(document);
		const committed = await production.commitRegenerationCandidates({
			reference: acceptedReference,
			expectedRevision: { editId: "edit-1", storageCasRevision: "1", intentRevision: "1", digest: "document-digest" },
			requestDigest: "candidate-image-request",
			idempotencyKey: "candidate-image-regeneration",
			candidates: [candidate],
		});
		const sdk: ProductionImportSdk = { entities: base.entities, files: { ...base.files, media: { read: async () => { throw new Error("Inline delivery should not use the media reader"); } } } };
		const regeneration = new ProductionRegenerationService(new ProductionDocumentService(base), undefined, { sdk, resources: [delivery] });
		const accepted = await regeneration.acceptVersion({ editId: "edit-1", expectedRevision: committed.documentRevision, acceptedRevision: acceptedReference, shotId: "shot-1", shotRevision: 1, role: "visual", candidateId: candidate.candidateId, idempotencyKey: "accept-image-1" });
		expect(accepted.data.status).toBe("completed");
		expect(base.publishedCount).toBe(1);
		const saved = await new ProductionService(new ProductionDocumentService(base)).load("edit-1");
		const imageVersion = saved?.accepted?.shots[0]?.imageVersion;
		expect(imageVersion?.mediaId).toMatch(/^production-media-/);
		const replay = await regeneration.acceptVersion({ editId: "edit-1", expectedRevision: accepted.data.revision!, acceptedRevision: acceptedReference, shotId: "shot-1", shotRevision: 1, role: "visual", candidateId: candidate.candidateId, idempotencyKey: "accept-image-2" });
		expect(replay.data.status).toBe("completed");
		expect(base.publishedCount).toBe(1);
		const targets = await regeneration.targets({ editId: "edit-1", expectedRevision: replay.data.revision!, acceptedRevision: acceptedReference });
		expect(targets.data.shots?.[0]?.image.inLibrary).toBe(true);
		const placement = saved?.accepted ? deriveAcceptedPlacementInput({ editId: "edit-1", expectedRevision: replay.data.revision!, accepted: saved.accepted, idempotencyKey: "place-after-accept" }) : undefined;
		expect(placement?.shots[0]?.visual?.mediaId).toBe(imageVersion?.mediaId);
	});

	test("accepts a Files-backed narration candidate through the same idempotent library import", async () => {
		const base = fixture();
		base.seedProject(acceptedDocument());
		const bytes = pcmWavBytes(1_500);
		const delivery = await wavDelivery();
		const digest = delivery.media![0]!.digest;
		const production = new ProductionService(new ProductionDocumentService(base));
		const candidate = {
			candidateId: "candidate-narration-1",
			acceptedRevision: acceptedReference,
			shotId: "shot-1",
			shotRevision: 1,
			role: "narration" as const,
			version: {
				idempotencyKey: "candidate-narration-key",
				mediaId: "voice-wav-1",
				mediaRevision: digest,
				name: "narration.wav",
				mediaType: "audio" as const,
				mimeType: "audio/wav" as const,
				digest,
				byteLength: bytes.byteLength,
				sourceDurationSeconds: 1.5,
				source: "voicebox" as const,
				voiceboxGenerationRef: "voicebox-generation-1",
				publishedFiles: { publicId: "voice-wav-1", revision: "wav-revision-1" },
				acceptedRevision: acceptedReference,
				acceptedShotId: "shot-1",
				acceptedShotRevision: 1,
				alignment: [{ text: "Narration", start: 0, end: 1.5 }],
			},
		};
		const committed = await production.commitRegenerationCandidates({
			reference: acceptedReference,
			expectedRevision: { editId: "edit-1", storageCasRevision: "1", intentRevision: "1", digest: "document-digest" },
			requestDigest: "candidate-narration-request",
			idempotencyKey: "candidate-narration-regeneration",
			candidates: [candidate],
		});
		const sdk: ProductionImportSdk = {
			entities: base.entities,
			files: {
				...base.files,
				media: {
					read: async (transfer, sink) => {
						await sink.write(bytes, { transferId: "transfer-1", cursor: "cursor-1", offset: 0, byteLength: bytes.byteLength, sha256: digest, final: true });
						const result = { resource: transfer.resource, byteLength: bytes.byteLength, pages: 1 };
						await sink.commit(result);
						return result;
					},
				},
			},
		};
		const regeneration = new ProductionRegenerationService(new ProductionDocumentService(base), undefined, { sdk, resources: [delivery] });
		const accepted = await regeneration.acceptVersion({ editId: "edit-1", expectedRevision: committed.documentRevision, acceptedRevision: acceptedReference, shotId: "shot-1", shotRevision: 1, role: "narration", candidateId: candidate.candidateId, idempotencyKey: "accept-narration-1" });
		expect(accepted.data.status).toBe("completed");
		expect(base.publishedCount).toBe(1);
		const saved = await new ProductionService(new ProductionDocumentService(base)).load("edit-1");
		expect(saved?.accepted?.shots[0]?.narrationVersion).toMatchObject({ mediaId: expect.stringMatching(/^production-media-/), source: "voicebox", sourceDurationSeconds: 1.5 });
		const targets = await regeneration.targets({ editId: "edit-1", expectedRevision: accepted.data.revision!, acceptedRevision: acceptedReference });
		expect(targets.data.shots?.[0]?.narration.inLibrary).toBe(true);
	});

	test("preserves the host ProjectRpcError from Files publication", async () => {
		const refusal = new ProjectRpcError({ code: "capability-denied", message: "Files publication is not granted." });
		const sdk = fixture();
		const files: FilesStorageApi = {
			...sdk.files,
			publish: () => Promise.reject(refusal),
		};
		const library = new SdkProductionMediaLibrary({ entities: sdk.entities, files });

		await expect(library.import(input())).rejects.toBe(refusal);
		await expect(library.import(input())).rejects.toMatchObject({ code: "capability-denied", message: "Files publication is not granted." });
	});

	test("imports admitted WAV narration without Voicebox identities, attaches it, and replays idempotently", async () => {
		const base = fixture();
		base.seedProject(acceptedDocument());
		const bytes = pcmWavBytes(1_500);
		const digestBuffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
		const digest = Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
		const sdk: ProductionImportSdk = {
			entities: base.entities,
			files: {
				...base.files,
				media: {
					read: async (transfer, sink) => {
						await sink.write(bytes, { transferId: "transfer-1", cursor: "cursor-1", offset: 0, byteLength: bytes.byteLength, sha256: digest, final: true });
						const result = { resource: transfer.resource, byteLength: bytes.byteLength, pages: 1 };
						await sink.commit(result);
						return result;
					},
				},
			},
		};
		const delivery = await wavDelivery();
		const input = {
			editId: "edit-1",
			expectedRevision: { editId: "edit-1", storageCasRevision: "1", intentRevision: "1", digest: "document-digest" },
			acceptedRevision: acceptedReference,
			shotId: "shot-1",
			shotRevision: "1",
			role: "narration" as const,
			idempotencyKey: "narration-import-1",
		};
		const first = await runProductionImportCommand(input, sdk, [delivery]);
		expect(first.data.status).toBe("completed");
		expect(JSON.parse(JSON.stringify(first))).toEqual(first);
		expect(first.data.media).toMatchObject({ mediaId: expect.stringMatching(/^production-media-/), mediaRevision: digest, shotId: "shot-1", role: "narration", durationMs: 1_500 });
		expect(first.data.filesRef).toEqual({ publicId: "file-1", path: "Media/narration.wav" });
		const acceptedAfterImport = (await new ProductionService(new ProductionDocumentService(sdk)).load("edit-1"))?.accepted;
		expect(acceptedAfterImport?.shots[0]?.narrationVersion).toMatchObject({ source: "files", publishedFiles: { publicId: "voice-wav-1", revision: "wav-revision-1" }, sourceDurationSeconds: 1.5 });

		const replay = await runProductionImportCommand(input, sdk, [delivery]);
		expect(replay.data.media).toEqual(first.data.media);
		expect(replay.data.filesRef).toEqual(first.data.filesRef);
		expect(base.publishedCount).toBe(1);

		const mismatch = await runProductionImportCommand({ ...input, idempotencyKey: "narration-import-mismatch", expectedRevision: first.data.revision!, voiceboxGenerationRef: "voicebox-generation-1", publishedFiles: { publicId: "wrong-files-id" } }, sdk, [delivery]);
		expect(mismatch.data).toMatchObject({ status: "refused", reason: "accepted-source-mismatch" });

		const publishedOnly = await runProductionImportCommand({ ...input, idempotencyKey: "narration-import-published-only", expectedRevision: first.data.revision!, publishedFiles: { publicId: "voice-wav-1" } }, sdk, [delivery]);
		expect(publishedOnly.data.status).toBe("completed");
		const bothIdentities = await runProductionImportCommand({ ...input, idempotencyKey: "narration-import-both-identities", expectedRevision: publishedOnly.data.revision!, voiceboxGenerationRef: "voicebox-generation-1", publishedFiles: { publicId: "voice-wav-1" } }, sdk, [delivery]);
		expect(bothIdentities.data.status).toBe("completed");
	});

	test("rejects a Voicebox generation without its published Files identity", async () => {
		const result = await runProductionImportCommand({
			editId: "edit-1",
			expectedRevision: { editId: "edit-1", storageCasRevision: "1", intentRevision: "1", digest: "document-digest" },
			acceptedRevision: acceptedReference,
			shotId: "shot-1",
			shotRevision: "1",
			role: "narration",
			idempotencyKey: "voicebox-without-files",
			voiceboxGenerationRef: "voicebox-generation-1",
		}, fixture(), []);
		expect(result.data).toMatchObject({ status: "refused", reason: "input-invalid", message: "Voicebox narration imports require both the generation and published Files identities." });
	});

	test("derives inline PCM WAV narration duration and rejects malformed WAV bytes", async () => {
		const base = fixture();
		base.seedProject(acceptedDocument());
		const sdk: ProductionImportSdk = { entities: base.entities, files: { ...base.files, media: { read: async () => { throw new Error("Inline delivery should not use the media reader"); } } } };
		const bytes = pcmWavBytes(1_000);
		const result = await runProductionImportCommand({
			editId: "edit-1",
			expectedRevision: { editId: "edit-1", storageCasRevision: "1", intentRevision: "1", digest: "document-digest" },
			acceptedRevision: acceptedReference,
			shotId: "shot-1",
			shotRevision: "1",
			role: "narration",
			idempotencyKey: "inline-narration-1",
		}, sdk, [await inlineWavDelivery(bytes)]);
		expect(result.data.status).toBe("completed");
		expect(result.data.media?.durationMs).toBe(1_000);

		const malformed = await runProductionImportCommand({
			editId: "edit-1",
			expectedRevision: result.data.revision!,
			acceptedRevision: acceptedReference,
			shotId: "shot-1",
			shotRevision: "1",
			role: "narration",
			idempotencyKey: "inline-narration-malformed",
		}, sdk, [await inlineWavDelivery(new Uint8Array([1, 2, 3, 4]))]);
		expect(malformed.data).toMatchObject({ status: "refused", reason: "input-invalid", message: "Narration durationMs is required when the admitted bytes are not a parseable PCM WAV." });
	});
});
