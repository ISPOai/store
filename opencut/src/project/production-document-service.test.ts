import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	setSystemTime,
	test,
} from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	entities,
	files,
	ProjectRpcError,
	type EntityCreateOptions,
	type EntityQuery,
	type EntityRecord,
	type EntityUpdateOptions,
	type FilesListEntry,
	type FilesPublishArgs,
} from "@ispo/sdk";
import * as wasmGlue from "../../node_modules/opencut-wasm/opencut_wasm_bg.js";
import type { SerializedProject } from "@/services/storage/types";
import type { StoredEntityValue } from "@/services/storage/sdk-adapter";
import {
	EditRevisionConflictError,
	type StoredProductionDocument,
} from "./production-types";
import {
	ProductionDocumentLosslessJsonError,
	ProductionDocumentService,
	toLosslessJson,
} from "./production-document-service";

const wasmModule = new WebAssembly.Module(
	readFileSync(
		new URL(
			"../../node_modules/opencut-wasm/opencut_wasm_bg.wasm",
			import.meta.url,
		),
	),
);
const wasmInstance = new WebAssembly.Instance(wasmModule, {
	"./opencut_wasm_bg.js": wasmGlue,
});
wasmGlue.__wbg_set_wasm(wasmInstance.exports);
const startWasm = wasmInstance.exports.__wbindgen_start;
if (startWasm instanceof Function) startWasm();
mock.module("opencut-wasm", () => wasmGlue);

interface IndexedDbFixtureRequest<T> {
	result: T;
	onsuccess: (() => void) | null;
}

function indexedDbRequest<T>(result: T) {
	const request: IndexedDbFixtureRequest<T> = {
		result,
		onsuccess: null,
	};
	queueMicrotask(() => request.onsuccess?.());
	return request;
}

Object.assign(globalThis, {
	indexedDB: {
		deleteDatabase: () => indexedDbRequest(undefined),
		open: () =>
			indexedDbRequest({
				transaction: () => ({
					objectStore: () => ({ getAll: () => indexedDbRequest([]) }),
				}),
			}),
	},
});

const { EditorCore } = await import("@/core");
const { useEditorStore } = await import("@/editor/editor-store");

interface EntityRow {
	id: string;
	type: string;
	dataJson: string;
	version: number;
}

interface FileRow {
	id: string;
	path: string;
	name: string;
	mimeType: string;
	content: Uint8Array;
}

interface Subscription {
	type: string;
	storageKey: string | null;
	onChange: () => void;
}

type FixtureEntityData = StoredEntityValue<
	SerializedProject | StoredProductionDocument
>;

const cleanupPaths: string[] = [];

afterEach(async () => {
	await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true })));
});

function asRecord(row: EntityRow): EntityRecord<FixtureEntityData> {
	return {
		id: row.id,
		type: row.type,
		data: JSON.parse(row.dataJson),
		version: row.version,
		createdBy: { kind: "project", id: "opencut" },
		updatedBy: { kind: "project", id: "opencut" },
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

function versionConflict(expectedVersion: number, actualVersion: number) {
	return new ProjectRpcError({
		code: "entity-version-conflict",
		message: `Expected ${expectedVersion}; actual ${actualVersion}`,
	});
}

function createSqliteSdk(path: string, subscriptions: Set<Subscription>) {
	const database = new Database(path, { create: true });
	database.exec(`
		CREATE TABLE IF NOT EXISTS entities (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			dataJson TEXT NOT NULL,
			version INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS files (
			id TEXT PRIMARY KEY,
			path TEXT NOT NULL,
			name TEXT NOT NULL,
			mimeType TEXT NOT NULL,
			content BLOB NOT NULL
		);
	`);
	const notify = (type: string, storageKey: string) => {
		for (const subscription of subscriptions) {
			if (
				subscription.type === type &&
				(subscription.storageKey === null || subscription.storageKey === storageKey)
			) {
				queueMicrotask(subscription.onChange);
			}
		}
	};
	const assertDeclaredProjectValue = (type: string, data: FixtureEntityData) => {
		if (type !== "opencut.project") return;
		const value = data.value;
		const metadata = value.metadata;
		expect(metadata.id.length).toBeGreaterThan(0);
		expect(metadata.name.length).toBeGreaterThan(0);
		expect(metadata.createdAt.length).toBeGreaterThan(0);
		expect(metadata.updatedAt.length).toBeGreaterThan(0);
		expect(Array.isArray(value.scenes)).toBe(true);
		expect(value.currentSceneId).toBeDefined();
		expect(value.settings).not.toBeNull();
		expect(Number.isFinite(value.version)).toBe(true);
	};
	const entities = {
		query(type: string, query: EntityQuery = {}) {
			const rows = database
				.query<EntityRow, [string]>(
					"SELECT id, type, dataJson, version FROM entities WHERE type = ? ORDER BY id",
				)
				.all(type);
			const storageKey = query.where?.storageKey;
			const records = rows
				.map((row) => asRecord(row))
				.filter(
					(record) =>
						storageKey === undefined ||
						record.data.storageKey === storageKey,
				)
				.slice(0, query.limit);
			return Promise.resolve({ records, cursor: null });
		},
		create(type: string, data: FixtureEntityData, options: EntityCreateOptions = {}) {
			assertDeclaredProjectValue(type, data);
			const id = options.id ?? crypto.randomUUID();
			try {
				database
					.query("INSERT INTO entities (id, type, dataJson, version) VALUES (?, ?, ?, 1)")
					.run(id, type, JSON.stringify(data));
			} catch {
				throw versionConflict(0, 1);
			}
			notify(type, data.storageKey);
			return Promise.resolve(
				asRecord({ id, type, dataJson: JSON.stringify(data), version: 1 }),
			);
		},
		update(
			type: string,
			id: string,
			patch: Partial<FixtureEntityData>,
			options: EntityUpdateOptions = {},
		) {
			const row = database
				.query<EntityRow, [string, string]>(
					"SELECT id, type, dataJson, version FROM entities WHERE type = ? AND id = ?",
				)
				.get(type, id);
			if (!row) throw new Error(`Missing entity ${id}`);
			if (
				options.expectedVersion !== undefined &&
				options.expectedVersion !== row.version
			) {
				throw versionConflict(options.expectedVersion, row.version);
			}
			const data = { ...JSON.parse(row.dataJson), ...patch };
			assertDeclaredProjectValue(type, data);
			const version = row.version + 1;
			const result = database
				.query(
					"UPDATE entities SET dataJson = ?, version = ? WHERE type = ? AND id = ? AND version = ?",
				)
				.run(JSON.stringify(data), version, type, id, row.version);
			if (result.changes !== 1) throw versionConflict(row.version, version);
			notify(type, data.storageKey);
			return Promise.resolve(
				asRecord({ id, type, dataJson: JSON.stringify(data), version }),
			);
		},
		delete(type: string, id: string) {
			const row = database
				.query<EntityRow, [string, string]>(
					"SELECT id, type, dataJson, version FROM entities WHERE type = ? AND id = ?",
				)
				.get(type, id);
			if (!row) throw new Error(`Missing entity ${id}`);
			database.query("DELETE FROM entities WHERE type = ? AND id = ?").run(type, id);
			return Promise.resolve(asRecord(row));
		},
		subscribeQuery(
			type: string,
			query: EntityQuery,
			onChange: () => void,
		) {
			const storageKey = String(query.where?.storageKey ?? "");
			const subscription = {
				type,
				storageKey: storageKey || null,
				onChange,
			};
			subscriptions.add(subscription);
			return {
				close: () => subscriptions.delete(subscription),
				getRecoveryCursor: () => undefined,
			};
		},
	};
	const files = {
		async publish(args: FilesPublishArgs) {
			if (!("content" in args)) throw new Error("Fixture requires direct content");
			const id = `file-${crypto.randomUUID()}`;
			const name = args.name;
			const mimeType = args.mimeType ?? "application/octet-stream";
			const content = new Uint8Array(
				await new Blob([args.content]).arrayBuffer(),
			);
			const path = `${args.folder ?? ""}/${name}`;
			database
				.query("INSERT INTO files (id, path, name, mimeType, content) VALUES (?, ?, ?, ?, ?)")
				.run(id, path, name, mimeType, content);
			return { publicId: id, path };
		},
		list(): Promise<FilesListEntry[]> {
			const rows = database
				.query<FileRow, []>("SELECT id, path, name, mimeType, content FROM files ORDER BY id")
				.all();
			return Promise.resolve(
				rows.map((row) => ({
					publicId: row.id,
					path: row.path,
					name: row.name,
					mimeType: row.mimeType,
					size: row.content.byteLength,
					folder: "OpenCut revisions",
					kind: "data",
					url: `data:${row.mimeType};base64,${Buffer.from(row.content).toString("base64")}`,
				})),
			);
		},
	};
	return {
		database,
		entities,
		files,
		seed: (
			type: string,
			id: string,
			data: StoredEntityValue<Partial<StoredProductionDocument>>,
		) => {
			database
				.query("INSERT INTO entities (id, type, dataJson, version) VALUES (?, ?, ?, 1)")
				.run(id, type, JSON.stringify(data));
		},
	};
}

function project(name: string, version = 31): SerializedProject {
	return {
		metadata: {
			id: "edit-1",
			name,
			duration: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
		scenes: [],
		currentSceneId: "",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
		},
		version,
	};
}

function projectWithPlacementReceipt(name: string): SerializedProject {
	const value = project(name, 32);
	value.scenes = [{
		id: "scene-main",
		name: "Main scene",
		isMain: true,
		tracks: {
			main: {
				id: "main-track",
				name: "Main",
				type: "video",
				elements: [],
				muted: false,
				hidden: false,
			},
			overlay: [],
			audio: [],
		},
		bookmarks: [],
		productionPlacementReceipts: [{
			idempotencyKey: "placement-1",
			requestDigest: "request-digest",
			expectedIntentRevision: "1",
			documentIntentRevision: "2",
			tracks: [{ role: "visual", trackId: "production-visual" }],
			elements: [{
				shotId: "shot-1",
				role: "visual",
				trackId: "production-visual",
				elementId: "element-1",
			}],
		}],
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	}];
	value.currentSceneId = "scene-main";
	return value;
}

function jsonNodeCount(value: unknown): number {
	if (value === null || typeof value !== "object") return 1;
	if (Array.isArray(value)) {
		return 1 + value.reduce((total, item) => total + jsonNodeCount(item), 0);
	}
	return (
		1 +
		Object.entries(value).reduce(
			(total, [key, item]) => total + 1 + jsonNodeCount(key) + jsonNodeCount(item),
			0,
		)
	);
}

function jsonMetrics(value: unknown): { nodes: number; bytes: number } {
	return {
		nodes: jsonNodeCount(value),
		bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength,
	};
}

async function projectDigest(value: SerializedProject): Promise<string> {
	const { thumbnail: _thumbnail, updatedAt: _updatedAt, ...metadata } = value.metadata;
	const { timelineViewState: _timelineViewState, ...intentValue } = value;
	const intent = { ...intentValue, metadata };
	const canonical = JSON.stringify(intent, (_key, nested) => {
		if (nested === null || Array.isArray(nested) || typeof nested !== "object") return nested;
		return Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)));
	});
	const bytes = new TextEncoder().encode(canonical);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Buffer.from(digest).toString("hex");
}

describe("production document service", () => {
	test("strips undefined object keys from the live pending-job shape", () => {
		const normalized = toLosslessJson({
			settings: {
				production: {
					accepted: {
						pendingJobs: [{ styleAnchorRevision: undefined }],
					},
				},
			},
		});

		expect(normalized).toEqual({
			settings: {
				production: {
					accepted: {
						pendingJobs: [{}],
					},
				},
			},
		});
		expect(toLosslessJson({ values: [1, , undefined, 2] })).toEqual({ values: [1, 2] });
	});

	test("rejects non-lossless JSON values with their document path", () => {
		const invalidValues: unknown[] = [
			() => undefined,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			BigInt(1),
			new Date("2026-01-01T00:00:00.000Z"),
			new Map(),
			new Set(),
		];
		for (const value of invalidValues) {
			expect(() => toLosslessJson({ settings: { production: { value } } })).toThrow(ProductionDocumentLosslessJsonError);
			expect(() => toLosslessJson({ settings: { production: { value } } })).toThrow("$.settings.production.value");
		}

		const cyclic: { settings?: { production?: { value?: unknown } } } = {};
		cyclic.settings = { production: { value: cyclic } };
		expect(() => toLosslessJson(cyclic)).toThrow(ProductionDocumentLosslessJsonError);
		expect(() => toLosslessJson(cyclic)).toThrow("$.settings.production.value");
	});

	test("derived editor echo saves preserve receipts and the intent revision", async () => {
		const directory = await mkdtemp(join(tmpdir(), "opencut-echo-save-"));
		cleanupPaths.push(directory);
		const sdk = createSqliteSdk(join(directory, "documents.sqlite"), new Set());
		const service = new ProductionDocumentService(sdk);
		const initial = await service.save({
			editId: "edit-1",
			project: projectWithPlacementReceipt("Initial"),
			expectedRevision: null,
		});
		const loaded = await service.load("edit-1");
		if (!loaded) throw new Error("Missing initial edit");
		const thumbnailRefresh: SerializedProject = {
			...loaded.project,
			metadata: {
				...loaded.project.metadata,
				name: "Frame echo that is not an intent edit",
				thumbnail: "data:image/png;base64,derived",
				updatedAt: "2026-01-02T00:00:00.000Z",
			},
		};

		const echo = await service.save({
			editId: "edit-1",
			project: thumbnailRefresh,
			expectedRevision: loaded.revision,
			intent: "derived",
		});
		expect(echo.revision.intentRevision).toBe(initial.revision.intentRevision);
		expect(echo.revision.digest).toBe(initial.revision.digest);
		expect(echo.revision.storageCasRevision).not.toBe(initial.revision.storageCasRevision);
		expect(echo.project.metadata.name).toBe("Initial");
		expect(echo.project.scenes[0]?.productionPlacementReceipts).toHaveLength(1);

		const edited = await service.save({
			editId: "edit-1",
			project: {
				...thumbnailRefresh,
				metadata: { ...thumbnailRefresh.metadata, name: "User edit" },
			},
			expectedRevision: echo.revision,
		});
		expect(edited.revision.intentRevision).toBe("2");
		expect(edited.revision.digest).not.toBe(initial.revision.digest);
		expect(edited.project.scenes[0]?.productionPlacementReceipts).toHaveLength(1);
	});

	test("intent-equivalent saves with reordered fields do not write", async () => {
		const directory = await mkdtemp(join(tmpdir(), "opencut-document-no-op-"));
		cleanupPaths.push(directory);
		const sdk = createSqliteSdk(join(directory, "documents.sqlite"), new Set());
		const service = new ProductionDocumentService(sdk);
		const initialProject = project("Initial", 32);
		initialProject.settings.production = {
			formatVersion: 1,
			accepted: null,
			acceptanceReceipts: [],
			actionIntents: [],
		};
		initialProject.timelineViewState = {
			playheadTime: 0,
			scrollLeft: 0,
			zoomLevel: 5,
		};
		const initial = await service.save({
			editId: "edit-1",
			project: initialProject,
			expectedRevision: null,
		});
		const loaded = await service.load("edit-1");
		if (!loaded) throw new Error("Missing initial edit");
		const reordered: SerializedProject = {
			...loaded.project,
			metadata: {
				updatedAt: "2026-01-02T00:00:00.000Z",
				createdAt: loaded.project.metadata.createdAt,
				duration: loaded.project.metadata.duration,
				name: loaded.project.metadata.name,
				id: loaded.project.metadata.id,
			},
			settings: {
				background: loaded.project.settings.background,
				canvasSize: loaded.project.settings.canvasSize,
				fps: loaded.project.settings.fps,
				production: loaded.project.settings.production,
			},
		};

		const saved = await service.save({
			editId: "edit-1",
			project: reordered,
			expectedRevision: loaded.revision,
		});
		expect(saved.revision).toEqual(initial.revision);
		expect(saved.project.timelineViewState).toEqual(initialProject.timelineViewState);
		const record = (await sdk.entities.query("opencut.project", {
			where: { storageKey: "edit-1" },
			limit: 1,
		})).records[0];
		expect(record?.version).toBe(1);
		const stored = record?.data.value as StoredProductionDocument | undefined;
		expect(stored?.timelineViewState).toBeUndefined();
		expect(stored?.derived?.timelineViewState).toEqual(initialProject.timelineViewState);
	});

	test("bounds fifty thumbnail revisions and stores the thumbnail outside snapshots", async () => {
		const directory = await mkdtemp(join(tmpdir(), "opencut-document-budget-"));
		cleanupPaths.push(directory);
		const sdk = createSqliteSdk(join(directory, "documents.sqlite"), new Set());
		const service = new ProductionDocumentService(sdk);
		const thumbnail = `data:image/png;base64,${"A".repeat(50_000)}`;
		let current = await service.save({
			editId: "edit-1",
			project: { ...project("Revision 0", 32), metadata: { ...project("Revision 0", 32).metadata, thumbnail } },
			expectedRevision: null,
		});
		for (let revision = 1; revision <= 50; revision += 1) {
			const next = project(`Revision ${revision}`, 32);
			next.metadata.thumbnail = thumbnail;
			current = await service.save({
				editId: "edit-1",
				project: next,
				expectedRevision: current.revision,
			});
		}

		const record = (await sdk.entities.query("opencut.project", {
			where: { storageKey: "edit-1" },
			limit: 1,
		})).records[0];
		if (!record) throw new Error("Budget fixture document is missing");
		const stored = record.data.value as StoredProductionDocument;
		const after = jsonMetrics(stored);
		const before = jsonMetrics({
			...stored,
			snapshots: Array.from({ length: 51 }, (_, index) => ({
				intentRevision: String(index + 1),
				digest: `digest-${index + 1}`,
				project: { ...project(`Revision ${index}`, 32), metadata: { ...project(`Revision ${index}`, 32).metadata, thumbnail } },
			})),
		});
		expect(stored.snapshots).toHaveLength(5);
		expect(stored.metadata.thumbnail).toBeUndefined();
		expect(stored.snapshots.every((snapshot) => snapshot.project.metadata.thumbnail === undefined)).toBe(true);
		expect(after.nodes).toBeLessThan(1_000);
		expect(after.bytes).toBeLessThan(100_000);
		expect(before.nodes).toBeGreaterThan(after.nodes * 5);
		expect(before.bytes).toBeGreaterThan(after.bytes * 10);
		expect(stored.derived?.thumbnail).toBe(thumbnail);
	});

	test("compacts an oversized existing envelope during load with an intent-neutral write", async () => {
		const directory = await mkdtemp(join(tmpdir(), "opencut-document-compaction-"));
		cleanupPaths.push(directory);
		const sdk = createSqliteSdk(join(directory, "documents.sqlite"), new Set());
		const thumbnail = `data:image/png;base64,${"B".repeat(50_000)}`;
		const acceptedReference = {
			editId: "edit-1",
			documentIntentRevision: "2",
			productionRevisionId: "production-2",
			contentDigest: "production-digest-2",
		};
		const snapshots = await Promise.all(Array.from({ length: 51 }, async (_, index) => {
			const next = project(`Legacy ${index}`, 32);
			next.metadata.thumbnail = thumbnail;
			if (index >= 1) {
				next.settings.production = {
					formatVersion: 1,
					accepted: {
						reference: acceptedReference,
						script: "Accepted legacy script",
						shots: [],
						targetDurationMs: 0,
						canvas: { width: 1920, height: 1080 },
						fps: { numerator: 30, denominator: 1 },
					},
					acceptanceReceipts: [],
					actionIntents: [],
				};
			}
			return { intentRevision: String(index + 1), digest: await projectDigest(next), project: next };
		}));
		const oversized: StoredProductionDocument = {
			...snapshots[50]!.project,
			kind: "opencut.production-document",
			formatVersion: 1,
			editId: "edit-1",
			currentIntentRevision: "51",
			snapshots,
		};
		sdk.seed("opencut.project", "oversized", { storageKey: "edit-1", value: oversized });

		const service = new ProductionDocumentService(sdk);
		const before = await service.readCurrent("edit-1");
		if (!before || before.kind !== "document") throw new Error("Compaction fixture is missing");
		const loaded = await service.load("edit-1");
		expect(loaded?.revision).toMatchObject({ storageCasRevision: "2", intentRevision: "51", digest: before.document.revision.digest });
		expect(loaded?.revision.intentRevision).toBe(before.document.revision.intentRevision);
		expect(loaded?.project.metadata.thumbnail).toBe(thumbnail);
		const record = (await sdk.entities.query("opencut.project", {
			where: { storageKey: "edit-1" },
			limit: 1,
		})).records[0];
		if (!record) throw new Error("Compacted document is missing");
		const compacted = record.data.value as StoredProductionDocument;
		expect(compacted.snapshots).toHaveLength(6);
		expect(compacted.snapshots.map((snapshot) => snapshot.intentRevision)).toEqual(["2", "47", "48", "49", "50", "51"]);
		expect(compacted.snapshots.every((snapshot) => snapshot.project.metadata.thumbnail === undefined)).toBe(true);
		expect(compacted.metadata.thumbnail).toBeUndefined();
		expect((await service.readRevision({ editId: "edit-1", intentRevision: "2" }))?.project.settings.production?.accepted?.reference).toEqual(acceptedReference);
	});

	test("two SQLite-backed writers conflict and accepted revisions survive replacement", async () => {
		const directory = await mkdtemp(join(tmpdir(), "opencut-document-"));
		cleanupPaths.push(directory);
		const path = join(directory, "documents.sqlite");
		const subscriptions = new Set<Subscription>();
		const leftSdk = createSqliteSdk(path, subscriptions);
		const rightSdk = createSqliteSdk(path, subscriptions);
		const left = new ProductionDocumentService(leftSdk);
		const right = new ProductionDocumentService(rightSdk);

		const initial = await left.save({
			editId: "edit-1",
			project: project("Initial"),
			expectedRevision: null,
		});
		const stale = await right.load("edit-1");
		expect(stale?.revision).toEqual(initial.revision);

		const accepted = await left.save({
			editId: "edit-1",
			project: project("Accepted", 32),
			expectedRevision: initial.revision,
		});
		await expect(
			right.save({
				editId: "edit-1",
				project: project("Stale overwrite", 32),
				expectedRevision: stale?.revision ?? null,
			}),
		).rejects.toBeInstanceOf(EditRevisionConflictError);

		const retry = await right.save({
			editId: "edit-1",
			project: project("Accepted", 32),
			expectedRevision: stale?.revision ?? null,
		});
		expect(retry.revision).toEqual(accepted.revision);
		expect(retry.revision.intentRevision).toBe("2");

		const replacement = new ProductionDocumentService(
			createSqliteSdk(path, subscriptions),
		);
		expect((await replacement.load("edit-1"))?.project.metadata.name).toBe(
			"Accepted",
		);
		expect(
			(await replacement.readRevision({ editId: "edit-1", intentRevision: "1" }))
				?.project.metadata.name,
		).toBe("Initial");

		let refreshedIntentRevision: string | null = null;
		const subscription = replacement.subscribe("edit-1", (value) => {
			refreshedIntentRevision = value.revision.intentRevision;
		});
		const final = await left.save({
			editId: "edit-1",
			project: project("Final", 32),
			expectedRevision: accepted.revision,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(refreshedIntentRevision).toBe("3");
		subscription.close();

		const published = await Promise.all([
			left.publishRevision({ editId: "edit-1", intentRevision: "2" }),
			left.publishRevision({ editId: "edit-1", intentRevision: "3" }),
		]);
		expect(published.every(Boolean)).toBe(true);
		const listed = await leftSdk.files.list();
		expect(listed).toHaveLength(2);
		const decoded = await Promise.all(
			listed.map(async (entry) => JSON.parse(await (await fetch(entry.url)).text())),
		);
		decoded.sort(
			(left, right) =>
				Number(left.revision.intentRevision) -
				Number(right.revision.intentRevision),
		);
		expect(decoded.map((value) => value.project.metadata.name)).toEqual([
			"Accepted",
			"Final",
		]);
		for (const value of decoded) {
			expect(await projectDigest(value.project)).toBe(value.revision.digest);
		}
		expect(
			(await replacement.readRevision({
				editId: "edit-1",
				intentRevision: final.revision.intentRevision,
			}))?.project.metadata.name,
		).toBe("Final");
	});

	test("lazily migrates a legacy Entity row through compare-and-set", async () => {
		const directory = await mkdtemp(join(tmpdir(), "opencut-migration-"));
		cleanupPaths.push(directory);
		const sdk = createSqliteSdk(join(directory, "documents.sqlite"), new Set());
		await sdk.entities.create(
			"opencut.project",
			{ storageKey: "edit-1", value: project("Legacy") },
			{ id: "legacy-row" },
		);

		const loaded = await new ProductionDocumentService(sdk).load("edit-1");
		expect(loaded?.project.version).toBe(32);
		expect(loaded?.revision).toMatchObject({
			editId: "edit-1",
			storageCasRevision: "2",
			intentRevision: "1",
		});
	});

	test("repairs the prior production envelope into the declared project shape", async () => {
		const directory = await mkdtemp(join(tmpdir(), "opencut-envelope-repair-"));
		cleanupPaths.push(directory);
		const sdk = createSqliteSdk(join(directory, "documents.sqlite"), new Set());
		const legacyProject = project("Legacy envelope", 32);
		const legacyDocument = {
			kind: "opencut.production-document" as const,
			formatVersion: 1 as const,
			editId: "edit-1",
			currentIntentRevision: "1",
			snapshots: [{
				intentRevision: "1",
				digest: await projectDigest(legacyProject),
				project: legacyProject,
			}],
		};
		sdk.seed("opencut.project", "legacy-envelope", {
			storageKey: "edit-1",
			value: legacyDocument,
		});

		const loaded = await new ProductionDocumentService(sdk).load("edit-1");
		expect(loaded?.project.metadata.name).toBe("Legacy envelope");
		expect(loaded?.revision.storageCasRevision).toBe("2");
		const repaired = (await sdk.entities.query("opencut.project", {
			where: { storageKey: "edit-1" },
			limit: 1,
		})).records[0]?.data.value;
		if (!repaired) throw new Error("Repaired entity is missing");
		expect(repaired.metadata).toEqual(legacyProject.metadata);
		expect(repaired.scenes).toEqual(legacyProject.scenes);
		expect(repaired.settings).toEqual(legacyProject.settings);
		expect(repaired.version).toBe(32);
	});
});

const defaultEntityApi = { ...entities };
const defaultFilesApi = { ...files };

async function drainNotifications(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

async function requireDocument(
	service: ProductionDocumentService,
	editId: string,
) {
	const loaded = await service.load(editId);
	if (!loaded) throw new Error(`Missing edit ${editId}`);
	return loaded;
}

describe("composed editor document settlement", () => {
	let editor: ReturnType<typeof EditorCore.getInstance>;
	let sdk: ReturnType<typeof createSqliteSdk>;
	let directory: string;
	let documents: ProductionDocumentService;

	async function seed(editId: string) {
		const payload = project(editId, 32);
		payload.metadata.id = editId;
		payload.metadata.thumbnail = "data:image/png;base64,fixture";
		return documents.save({
			editId,
			project: payload,
			expectedRevision: null,
		});
	}

	function holdNextUpdate({ fail = false }: { fail?: boolean } = {}) {
		const entered = deferred<void>();
		const release = deferred<void>();
		const original = sdk.entities.update;
		let held = false;
		entities.update = async (...args: Parameters<typeof original>) => {
			if (!held) {
				held = true;
				entered.resolve();
				await release.promise;
				if (fail) throw new Error("Controlled storage failure");
			}
			return original(...args);
		};
		return { entered: entered.promise, release: () => release.resolve() };
	}

	function holdAcknowledgement() {
		const entered = deferred<void>();
		const release = deferred<void>();
		const original = sdk.entities.update;
		let held = false;
		entities.update = async (...args: Parameters<typeof original>) => {
			const result = await original(...args);
			if (!held) {
				held = true;
				entered.resolve();
				await release.promise;
			}
			return result;
		};
		return { entered: entered.promise, release: () => release.resolve() };
	}

	async function rivalRename(name: string) {
		const rival = new ProductionDocumentService(sdk);
		const base = await requireDocument(rival, "edit-1");
		return rival.save({
			editId: "edit-1",
			project: {
				...base.project,
				metadata: { ...base.project.metadata, name },
			},
			expectedRevision: base.revision,
		});
	}

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "opencut-composed-"));
		sdk = createSqliteSdk(join(directory, "owner.sqlite"), new Set());
		Object.assign(entities, sdk.entities);
		Object.assign(files, sdk.files);
		documents = new ProductionDocumentService();
		EditorCore.reset();
		editor = EditorCore.getInstance();
		await seed("edit-1");
		await seed("edit-2");
		await editor.project.loadProject({ id: "edit-1" });
	});

	afterEach(async () => {
		setSystemTime();
		editor.save.stop();
		editor.project.closeProject();
		editor.audio.dispose();
		EditorCore.reset();
		sdk.database.close();
		Object.assign(entities, defaultEntityApi);
		Object.assign(files, defaultFilesApi);
		await rm(directory, { recursive: true, force: true });
	});

	test("save acknowledgement preserves and then persists a newer settings edit", async () => {
		const gate = holdNextUpdate();
		const flush = editor.save.flush();
		await gate.entered;
		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1280, height: 720 } },
		});

		gate.release();
		await flush;
		expect(editor.project.getActive().settings.canvasSize.width).toBe(1280);
		await editor.save.flush();
		expect(
			(await requireDocument(documents, "edit-1")).project.settings.canvasSize
				.width,
		).toBe(1280);
		expect(useEditorStore.getState().documentSaveStatus.kind).toBe("clean");
	});

	test("flush waits until the draft requested during an active write is durable", async () => {
		const gate = holdNextUpdate();
		const firstFlush = editor.save.flush();
		await gate.entered;
		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1280, height: 720 } },
		});
		const latestFlush = editor.save.flush();

		gate.release();
		await firstFlush;
		await latestFlush;
		const durable = await requireDocument(documents, "edit-1");
		expect(durable.project.settings.canvasSize.width).toBe(1280);
		expect(editor.save.getIsDirty()).toBe(false);

		editor.project.closeProject();
		await editor.project.loadProject({ id: "edit-1" });
		expect(editor.project.getActive().settings.canvasSize.width).toBe(1280);
	});

	for (const externalRefresh of [false, true]) {
		test(`late older success preserves newer accepted state (external refresh=${externalRefresh})`, async () => {
			setSystemTime(new Date("2031-02-03T04:05:06.000Z"));
			const gate = holdAcknowledgement();
			const firstFlush = editor.save.flush();
			await gate.entered;
			const secondFlush = editor.save.flush();
			await editor.project.renameProject({
				id: "edit-1",
				name: editor.project.getActive().metadata.name,
			});
			const accepted = await requireDocument(documents, "edit-1");
			expect(accepted.revision.storageCasRevision).toBe("2");
			expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
				kind: "clean",
				revision: accepted.revision,
			});
			const latest = externalRefresh
				? await rivalRename("External after acceptance")
				: accepted;
			if (externalRefresh) await drainNotifications();

			gate.release();
			await firstFlush;
			await secondFlush;
			await drainNotifications();
			expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
				kind: "clean",
				revision: latest.revision,
			});
			expect(editor.project.getActive().metadata.name).toBe(
				latest.project.metadata.name,
			);
			expect(editor.save.getIsDirty()).toBe(false);
		});
	}

	test("uncovered flush cannot borrow acceptance from a switched edit lifetime", async () => {
		const gate = holdNextUpdate();
		const firstFlush = editor.save.flush();
		await gate.entered;
		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1280, height: 720 } },
		});
		const uncoveredFlush = editor.save.flush().catch((error) => error);
		await editor.project.loadProject({ id: "edit-2" });

		gate.release();
		await firstFlush;
		const error = await uncoveredFlush;
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe(
			"Project changed before the requested draft was saved",
		);
		expect(
			(await requireDocument(documents, "edit-1")).project.settings.canvasSize
				.width,
		).toBe(1920);
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: { editId: "edit-2" },
		});
	});

	test("uncovered flush rejects after a failed write and same-ID reopen", async () => {
		const gate = holdNextUpdate({ fail: true });
		const failedFlush = editor.save.flush().catch((error) => error);
		await gate.entered;
		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1280, height: 720 } },
		});
		const uncoveredFlush = editor.save.flush().catch((error) => error);
		await editor.project.loadProject({ id: "edit-2" });
		await editor.project.loadProject({ id: "edit-1" });

		gate.release();
		expect((await failedFlush).message).toBe("Controlled storage failure");
		const error = await uncoveredFlush;
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe(
			"Project changed before the requested draft was saved",
		);
		expect(editor.project.getActive().settings.canvasSize.width).toBe(1920);
		expect(editor.save.getIsDirty()).toBe(false);
	});

	test("older save failure cannot poison a superseding accepted checkpoint", async () => {
		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1280, height: 720 } },
		});
		const gate = holdNextUpdate();
		const oldFlush = editor.save.flush().catch((error) => error);
		await gate.entered;
		await editor.project.renameProject({
			id: "edit-1",
			name: "Accepted current draft",
		});
		const accepted = await requireDocument(documents, "edit-1");
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: accepted.revision,
		});

		gate.release();
		expect(await oldFlush).toBeInstanceOf(EditRevisionConflictError);
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: accepted.revision,
		});
		expect(editor.save.getIsDirty()).toBe(false);

		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1440, height: 810 } },
		});
		await editor.save.flush();
		const later = await requireDocument(documents, "edit-1");
		expect(later.project.metadata.name).toBe("Accepted current draft");
		expect(later.project.settings.canvasSize.width).toBe(1440);
	});

	test("successful settlement for an old edit leaves the switched edit clean and reopens durably", async () => {
		const gate = holdNextUpdate();
		const flush = editor.save.flush();
		await gate.entered;
		await editor.project.loadProject({ id: "edit-2" });

		gate.release();
		await flush;
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: { editId: "edit-2" },
		});
		expect(editor.save.getIsDirty()).toBe(false);

		await editor.project.loadProject({ id: "edit-1" });
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: { editId: "edit-1", intentRevision: "2" },
		});
	});

	test("successful save settlement cannot lower the revision of a reopened edit", async () => {
		const gate = holdAcknowledgement();
		const flush = editor.save.flush();
		await gate.entered;
		await editor.project.loadProject({ id: "edit-2" });
		const third = await rivalRename("Third");
		await editor.project.loadProject({ id: "edit-1" });
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: third.revision,
		});

		gate.release();
		await flush;
		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1280, height: 720 } },
		});
		await editor.save.flush();

		const durable = await requireDocument(documents, "edit-1");
		expect(durable.project.settings.canvasSize.width).toBe(1280);
		expect(Number(durable.revision.storageCasRevision)).toBeGreaterThan(
			Number(third.revision.storageCasRevision),
		);
	});

	test("failed settlement for an old edit cannot conflict the switched edit", async () => {
		const gate = holdNextUpdate();
		const flush = editor.save.flush().catch((error) => error);
		await gate.entered;
		await editor.project.loadProject({ id: "edit-2" });
		const rival = new ProductionDocumentService(sdk);
		const base = await requireDocument(rival, "edit-1");
		await rival.save({
			editId: "edit-1",
			project: {
				...base.project,
				metadata: { ...base.project.metadata, name: "Concurrent" },
			},
			expectedRevision: base.revision,
		});

		gate.release();
		expect(await flush).toBeInstanceOf(EditRevisionConflictError);
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: { editId: "edit-2" },
		});
		expect(editor.save.getIsDirty()).toBe(false);
	});

	test("failed settlement from a prior lifetime cannot conflict a reopened edit", async () => {
		const gate = holdNextUpdate();
		const flush = editor.save.flush().catch((error) => error);
		await gate.entered;
		await editor.project.loadProject({ id: "edit-2" });
		await editor.project.loadProject({ id: "edit-1" });
		const rival = new ProductionDocumentService(sdk);
		const base = await requireDocument(rival, "edit-1");
		const accepted = await rival.save({
			editId: "edit-1",
			project: {
				...base.project,
				metadata: { ...base.project.metadata, name: "Accepted after reopen" },
			},
			expectedRevision: base.revision,
		});
		await drainNotifications();

		gate.release();
		expect(await flush).toBeInstanceOf(EditRevisionConflictError);
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: accepted.revision,
		});
		expect(editor.project.getActive().metadata.name).toBe(
			"Accepted after reopen",
		);
	});

	test("active rename persists dirty settings through the same document revision", async () => {
		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1280, height: 720 } },
		});
		expect(editor.save.getIsDirty()).toBe(true);
		await editor.project.renameProject({ id: "edit-1", name: "Renamed" });

		const durable = await requireDocument(documents, "edit-1");
		expect(editor.project.getActive().settings.canvasSize.width).toBe(1280);
		expect(durable.project.settings.canvasSize.width).toBe(1280);
		expect(durable.project.metadata.name).toBe("Renamed");
		expect(editor.save.getIsDirty()).toBe(false);
	});

	test("rename acknowledgement preserves a mutation made after draft capture", async () => {
		const gate = holdNextUpdate();
		const renaming = editor.project.renameProject({
			id: "edit-1",
			name: "Renamed",
		});
		await gate.entered;
		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1280, height: 720 } },
		});

		gate.release();
		await renaming;
		expect(editor.project.getActive().settings.canvasSize.width).toBe(1280);
		expect(editor.save.getIsDirty()).toBe(true);
		await editor.save.flush();

		const durable = await requireDocument(documents, "edit-1");
		expect(durable.project.metadata.name).toBe("Renamed");
		expect(durable.project.settings.canvasSize.width).toBe(1280);
		expect(useEditorStore.getState().documentSaveStatus.kind).toBe("clean");
	});

	test("failed older rename cannot poison a newer accepted rename", async () => {
		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1280, height: 720 } },
		});
		const gate = holdNextUpdate();
		const olderRename = editor.project.renameProject({
			id: "edit-1",
			name: "Older intent",
		});
		await gate.entered;
		await editor.project.renameProject({
			id: "edit-1",
			name: "Newer accepted intent",
		});
		const accepted = await requireDocument(documents, "edit-1");

		gate.release();
		await olderRename;
		expect(editor.project.getActive().metadata.name).toBe(
			"Newer accepted intent",
		);
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: accepted.revision,
		});
		expect(editor.save.getIsDirty()).toBe(false);

		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1440, height: 810 } },
		});
		await editor.save.flush();
		expect(
			(await requireDocument(documents, "edit-1")).project.settings.canvasSize
				.width,
		).toBe(1440);
	});

	test("failed rename settlement cannot conflict the switched edit", async () => {
		const gate = holdNextUpdate();
		const renaming = editor.project.renameProject({
			id: "edit-1",
			name: "Renamed",
		});
		await gate.entered;
		await editor.project.loadProject({ id: "edit-2" });
		await rivalRename("Rival");

		gate.release();
		await renaming;
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: { editId: "edit-2" },
		});
		expect(editor.save.getIsDirty()).toBe(false);
	});

	test("failed rename settlement cannot conflict a reopened edit lifetime", async () => {
		const gate = holdNextUpdate();
		const renaming = editor.project.renameProject({
			id: "edit-1",
			name: "Renamed",
		});
		await gate.entered;
		await editor.project.loadProject({ id: "edit-2" });
		await editor.project.loadProject({ id: "edit-1" });
		const rival = await rivalRename("Rival");
		await drainNotifications();

		gate.release();
		await renaming;
		expect(editor.project.getActive().metadata.name).toBe("Rival");
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: rival.revision,
		});
		expect(editor.save.getIsDirty()).toBe(false);
	});

	test("successful rename settlement cannot replace a reopened edit lifetime", async () => {
		const gate = holdAcknowledgement();
		const renaming = editor.project.renameProject({
			id: "edit-1",
			name: "Older rename",
		});
		await gate.entered;
		await editor.project.loadProject({ id: "edit-2" });
		const third = await rivalRename("Third");
		await editor.project.loadProject({ id: "edit-1" });

		gate.release();
		await renaming;
		expect(editor.project.getActive().metadata.name).toBe("Third");
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: third.revision,
		});
	});

	test("legacy migration returns the first SDK denial without recursive writes", async () => {
		const legacy = project("Legacy", 31);
		legacy.metadata.id = "legacy";
		await sdk.entities.create(
			"opencut.project",
			{ storageKey: "legacy", value: legacy },
			{ id: "legacy" },
		);
		let updates = 0;
		const denial = new ProjectRpcError({
			code: "not-granted",
			message: "Update denied",
		});
		const deniedSdk = {
			entities: {
				...sdk.entities,
				query: (...args: Parameters<typeof sdk.entities.query>) => {
					if (updates >= 5) throw new Error("Recursive migration write");
					return sdk.entities.query(...args);
				},
				update: () => {
					updates += 1;
					return Promise.reject(denial);
				},
			},
			files: sdk.files,
		};

		let error: Error | null = null;
		try {
			await new ProductionDocumentService(deniedSdk).load("legacy");
		} catch (reason) {
			error = reason instanceof Error ? reason : new Error("Unknown denial");
		}
		expect(updates).toBe(1);
		expect(error).toBe(denial);
	});

	test("clean external refresh hydrates the accepted revision", async () => {
		const rival = new ProductionDocumentService(sdk);
		const base = await requireDocument(rival, "edit-1");
		const accepted = await rival.save({
			editId: "edit-1",
			project: {
				...base.project,
				metadata: { ...base.project.metadata, name: "Remote" },
			},
			expectedRevision: base.revision,
		});
		await drainNotifications();

		expect(editor.project.getActive().metadata.name).toBe("Remote");
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: accepted.revision,
		});
		expect(editor.command.canUndo()).toBe(false);
	});

	test("dirty external refresh retains local settings and reports conflict", async () => {
		await editor.project.updateSettings({
			settings: { canvasSize: { width: 1280, height: 720 } },
		});
		const rival = new ProductionDocumentService(sdk);
		const base = await requireDocument(rival, "edit-1");
		const accepted = await rival.save({
			editId: "edit-1",
			project: {
				...base.project,
				metadata: { ...base.project.metadata, name: "Remote" },
			},
			expectedRevision: base.revision,
		});
		await drainNotifications();

		expect(editor.project.getActive().settings.canvasSize.width).toBe(1280);
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "conflict",
			actual: accepted.revision,
		});
		expect(editor.save.getIsDirty()).toBe(true);
	});

	test("out-of-order refresh completion cannot regress a clean editor", async () => {
		const rival = new ProductionDocumentService(sdk);
		const base = await requireDocument(rival, "edit-1");
		const entered = deferred<void>();
		const release = deferred<void>();
		const original = sdk.entities.query;
		let queries = 0;
		entities.query = async (...args: Parameters<typeof original>) => {
			const result = await original(...args);
			if (
				args[0] === "opencut.project" &&
				args[1]?.where?.storageKey === "edit-1"
			) {
				queries += 1;
				if (queries === 2) {
					entered.resolve();
					await release.promise;
				}
			}
			return result;
		};
		const second = await rival.save({
			editId: "edit-1",
			project: {
				...base.project,
				metadata: { ...base.project.metadata, name: "Second" },
			},
			expectedRevision: base.revision,
		});
		await entered.promise;
		const third = await rival.save({
			editId: "edit-1",
			project: {
				...second.project,
				metadata: { ...second.project.metadata, name: "Third" },
			},
			expectedRevision: second.revision,
		});
		await drainNotifications();
		expect(editor.project.getActive().metadata.name).toBe("Third");

		release.resolve();
		await drainNotifications();
		expect(editor.project.getActive().metadata.name).toBe("Third");
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: third.revision,
		});
	});

	test("pending refresh remains monotonic while save settlement blocks hydration", async () => {
		const acknowledgement = holdAcknowledgement();
		const readEntered = deferred<void>();
		const readRelease = deferred<void>();
		const original = sdk.entities.query;
		let revisionTwoReads = 0;
		entities.query = async (...args: Parameters<typeof original>) => {
			const result = await original(...args);
			if (
				args[0] === "opencut.project" &&
				args[1]?.where?.storageKey === "edit-1" &&
				result.records[0]?.version === 2
			) {
				revisionTwoReads += 1;
				if (revisionTwoReads === 2) {
					readEntered.resolve();
					await readRelease.promise;
				}
			}
			return result;
		};

		const flush = editor.save.flush();
		await acknowledgement.entered;
		await readEntered.promise;
		const third = await rivalRename("Third");
		await drainNotifications();
		readRelease.resolve();
		await drainNotifications();
		acknowledgement.release();
		await flush;
		await drainNotifications();

		expect(editor.project.getActive().metadata.name).toBe("Third");
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "clean",
			revision: third.revision,
		});
	});
});
