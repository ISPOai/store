import { ProductionDocumentService } from "@/project/production-document-service";
import { SdkAdapter, SdkBinaryAdapter } from "@/services/storage/sdk-adapter";
import type { EntityStorageApi, FilesStorageApi } from "@/services/storage/sdk-adapter";
import type { MediaAssetData, SerializedProject } from "@/services/storage/types";
import { mediaTimeFromSeconds } from "@/wasm";
import { runProductionPlacement } from "@/timeline/production-placement";
import type { ProductionPlacementInput } from "@/timeline/production-placement";
import { ProductionRenderOperation } from "@/export/production-render-operation";
import type { ProductionRenderSdk } from "@/export/production-render-operation";

const EDIT_ID = "w5-still-rough-cut";
const WIDTH = 320;
const HEIGHT = 180;
const SHOT_DURATION_SECONDS = 3;
const DATE = "2026-09-10T00:00:00.000Z";
let currentStage = "bootstrap";

interface FixtureRow {
	id: string;
	type: string;
	data: { storageKey: string; value: unknown };
	version: number;
}

interface FixtureFile {
	publicId: string;
	path: string;
	name: string;
	mimeType: string;
	size: number;
	url: string;
	bytes: Uint8Array;
}

function record<T>(row: FixtureRow): Record<string, unknown> & { data: { storageKey: string; value: T } } {
	return {
		id: row.id,
		type: row.type,
		data: row.data as { storageKey: string; value: T },
		version: row.version,
		createdBy: { kind: "project", id: "w5-fixture" },
		updatedBy: { kind: "project", id: "w5-fixture" },
		createdAt: DATE,
		updatedAt: DATE,
	};
}

function createFixtureSdk(): ProductionRenderSdk {
	const rows = new Map<string, FixtureRow>();
	const published = new Map<string, FixtureFile>();
	let nextFileId = 1;
	const entities: EntityStorageApi = {
		async query<T>(type: string, query = {}) {
			const storageKey = (query as { where?: { storageKey?: string } }).where?.storageKey;
			const records = [...rows.values()]
				.filter((row) => row.type === type && (storageKey === undefined || row.data.storageKey === storageKey))
				.map((row) => record<T>(row));
			return { records, cursor: null };
		},
		async create<T>(type: string, data: { storageKey: string; value: T }, options = {}) {
			const id = (options as { id?: string }).id ?? crypto.randomUUID();
			const row: FixtureRow = { id, type, data, version: 1 };
			rows.set(id, row);
			return record<T>(row);
		},
		async update<T>(type: string, id: string, patch: Partial<{ storageKey: string; value: T }>, options = {}) {
			const row = rows.get(id);
			if (!row || row.type !== type) throw new Error(`Missing fixture entity ${id}`);
			const expectedVersion = (options as { expectedVersion?: number }).expectedVersion;
			if (expectedVersion !== row.version) throw new Error("Fixture entity version conflict");
			row.data = { ...row.data, ...patch } as FixtureRow["data"];
			row.version += 1;
			return record<T>(row);
		},
		async delete<T>(_type: string, id: string) {
			const row = rows.get(id);
			if (!row) throw new Error(`Missing fixture entity ${id}`);
			rows.delete(id);
			return record<T>(row);
		},
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const files: FilesStorageApi = {
		async publish(args) {
			const bytes = args.content instanceof Uint8Array ? args.content : new Uint8Array(args.content);
			const publicId = `w5-file-${nextFileId++}`;
			const name = args.name ?? `${publicId}.bin`;
			const mimeType = args.mimeType ?? "application/octet-stream";
			const copy = new Uint8Array(bytes);
			const file: FixtureFile = {
				publicId,
				path: `${args.folder ?? "Renders"}/${name}`,
				name,
				mimeType,
				size: copy.byteLength,
				url: URL.createObjectURL(new Blob([copy], { type: mimeType })),
				bytes: copy,
			};
			published.set(publicId, file);
			(window as Window & { __w5RenderBytes?: Uint8Array }).__w5RenderBytes = copy;
			return file;
		},
		async list() {
			return [...published.values()];
		},
	};
	return { entities, files };
}

async function imageFile(name: string, color: string, label: string): Promise<File> {
	const canvas = document.createElement("canvas");
	canvas.width = WIDTH;
	canvas.height = HEIGHT;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas 2D context is unavailable");
	context.fillStyle = color;
	context.fillRect(0, 0, WIDTH, HEIGHT);
	context.fillStyle = "#ffffff";
	context.font = "bold 32px sans-serif";
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillText(label, WIDTH / 2, HEIGHT / 2);
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode fixture still")), "image/png");
	});
	return new File([blob], name, { type: "image/png", lastModified: 1 });
}

function writeAscii(view: DataView, offset: number, value: string): void {
	for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function narrationFile(): File {
	const sampleRate = 48_000;
	const sampleCount = sampleRate * 9;
	const buffer = new ArrayBuffer(44 + sampleCount * 2);
	const view = new DataView(buffer);
	writeAscii(view, 0, "RIFF");
	view.setUint32(4, buffer.byteLength - 8, true);
	writeAscii(view, 8, "WAVEfmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeAscii(view, 36, "data");
	view.setUint32(40, sampleCount * 2, true);
	for (let index = 0; index < sampleCount; index += 1) {
		const value = Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 0.12;
		view.setInt16(44 + index * 2, value * 0x7fff, true);
	}
	return new File([buffer], "narration.pcm.wav", { type: "audio/wav", lastModified: 1 });
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 32_768) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
	}
	return btoa(binary);
}

function project(): SerializedProject {
	return {
		metadata: {
			id: EDIT_ID,
			name: "Three still rough cut",
			duration: mediaTimeFromSeconds({ seconds: 0 }),
			createdAt: DATE,
			updatedAt: DATE,
		},
		scenes: [{
			id: "scene-main",
			name: "Main scene",
			isMain: true,
			tracks: {
				main: { id: "main", name: "Main", type: "video", elements: [], muted: false, hidden: false },
				overlay: [],
				audio: [],
			},
			bookmarks: [],
			createdAt: DATE,
			updatedAt: DATE,
		}],
		currentSceneId: "scene-main",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: WIDTH, height: HEIGHT },
			background: { type: "color", color: "#101522" },
			production: {
				formatVersion: 1,
				accepted: {
					reference: { editId: EDIT_ID, documentIntentRevision: "1", productionRevisionId: "production-w5", contentDigest: "fixture-content" },
					script: "A three-still rough cut with narration.",
					shots: ["one", "two", "three"].map((shotId, index) => ({
						shotId, revision: 1, narration: `Narration for ${shotId}`, visualBrief: `Still ${index + 1}`, durationMs: 3_000,
					})),
					targetDurationMs: 9_000,
					canvas: { width: WIDTH, height: HEIGHT },
					fps: { numerator: 30, denominator: 1 },
				},
				acceptanceReceipts: [],
				actionIntents: [],
			},
		},
		version: 32,
	};
}

async function main(): Promise<void> {
	let stage = "create SDK";
	currentStage = stage;
	const sdk = createFixtureSdk();
	const documents = new ProductionDocumentService(sdk);
	const metadata = new SdkAdapter<MediaAssetData>({ entityType: "opencut.media-metadata", keyPrefix: `${EDIT_ID}:`, entityApi: sdk.entities });
	const binary = new SdkBinaryAdapter({ entityType: "opencut.media-file", keyPrefix: `${EDIT_ID}:`, folder: "Media", entityApi: sdk.entities, filesApi: sdk.files });
	stage = "encode still fixtures";
	currentStage = stage;
	const stills = await Promise.all([
		imageFile("still-1.png", "#165d91", "ONE"),
		imageFile("still-2.png", "#8b3d65", "TWO"),
		imageFile("still-3.png", "#a36b28", "THREE"),
	]);
	const media = stills.map((file, index) => ({ id: `still-${index + 1}`, name: file.name, type: "image" as const, size: file.size, lastModified: file.lastModified, width: WIDTH, height: HEIGHT }));
	for (const [index, file] of stills.entries()) {
		await metadata.set({ key: media[index]!.id, value: media[index]! });
		await binary.set({ key: media[index]!.id, value: file });
	}
	stage = "publish media fixtures";
	currentStage = stage;
	const narration = narrationFile();
	const narrationData: MediaAssetData = { id: "narration", name: narration.name, type: "audio", size: narration.size, lastModified: narration.lastModified, duration: 9, hasAudio: true };
	await metadata.set({ key: narrationData.id, value: narrationData });
	await binary.set({ key: narrationData.id, value: narration });

	stage = "save accepted edit";
	currentStage = stage;
	const initial = await documents.save({ editId: EDIT_ID, project: project(), expectedRevision: null });
	const acceptedRevision = project().settings.production!.accepted!.reference;
	const placement: ProductionPlacementInput = {
		editId: EDIT_ID,
		expectedRevision: initial.revision,
		acceptedRevision,
		idempotencyKey: "arrange-w5-still-rough-cut",
		shots: ["one", "two", "three"].map((shotId, index) => ({
			shotId,
			shotRevision: 1,
			startSeconds: index * SHOT_DURATION_SECONDS,
			durationSeconds: SHOT_DURATION_SECONDS,
			visual: { mediaId: `still-${index + 1}`, mediaRevision: "1", mediaType: "image", name: stills[index]!.name, sourceDurationSeconds: SHOT_DURATION_SECONDS, trimStartSeconds: 0, trimEndSeconds: 0 },
			narration: {
				mediaId: narrationData.id,
				mediaRevision: "1",
				acceptedShotId: shotId,
				acceptedShotRevision: 1,
				name: narration.name,
				sourceDurationSeconds: SHOT_DURATION_SECONDS,
				trimStartSeconds: 0,
				trimEndSeconds: 0,
				timelineOffsetSeconds: 0,
				alignment: { mediaId: narrationData.id, mediaRevision: "1", segments: [{ text: `Caption ${index + 1}`, start: 0, end: SHOT_DURATION_SECONDS }] },
			},
		})),
	};
	stage = "arrange-timeline";
	currentStage = stage;
	const arranged = await runProductionPlacement(placement, sdk);
	if (arranged.data.status !== "completed") throw new Error(`arrange-timeline refused: ${arranged.data.message}`);
	const operation = new ProductionRenderOperation(documents, sdk);
	stage = "export-project/render operation";
	currentStage = stage;
	const rendered = await operation.run({ editId: EDIT_ID, expectedRevision: arranged.data.revision, format: "mp4", quality: "low", includeAudio: true, name: "w5-still-rough-cut" });
	const renderBytes = (window as Window & { __w5RenderBytes: Uint8Array }).__w5RenderBytes;
	const result = {
		arranged,
		rendered,
		captionTiming: [0, 3, 6].map((startSeconds, index) => ({ shotId: ["one", "two", "three"][index], text: `Caption ${index + 1}`, startSeconds, endSeconds: startSeconds + 3 })),
		streams: { video: true, audio: true },
		bytesBase64: bytesToBase64(renderBytes),
	};
	await fetch("/__w5-output", { method: "POST", body: renderBytes });
	await fetch("/__w5-result", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ arranged, rendered, captionTiming: result.captionTiming, streams: result.streams }) });
	(window as Window & { __w5Result?: typeof result }).__w5Result = result;
}

void main().catch((error: unknown) => {
	(window as Window & { __w5Error?: string }).__w5Error = error instanceof Error ? `${currentStage}: ${error.name}: ${error.message}\n${error.stack ?? ""}` : `${currentStage}: ${String(error)}`;
});
