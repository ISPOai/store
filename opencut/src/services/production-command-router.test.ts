import { describe, expect, test } from "bun:test";
import type {
	EntityCreateOptions,
	EntityQuery,
	EntityQueryResult,
	EntityRecord,
	EntityUpdateOptions,
	FilesListEntry,
	FilesPublishArgs,
} from "@ispo/sdk";
import { ProductionDocumentService } from "@/project/production-document-service";
import type {
	EditRevision,
	AcceptedProductionRevision,
	ProductionImageCandidate,
	StoredProductionDocument,
} from "@/project/production-types";
import type {
	EntityStorageApi,
	FilesStorageApi,
	StoredEntityValue,
} from "@/services/storage/sdk-adapter";
import type { SerializedProject } from "@/services/storage/types";
import { ProductionCommandRouter } from "./production-command-router";

type ProjectValue = StoredEntityValue<
	SerializedProject | StoredProductionDocument
>;

interface StoredRow {
	id: string;
	type: string;
	dataJson: string;
	version: number;
}

function entityRecord<T>(row: StoredRow): EntityRecord<T> {
	return {
		id: row.id,
		type: row.type,
		data: JSON.parse(row.dataJson),
		version: row.version,
		createdBy: { kind: "project", id: "opencut" },
		updatedBy: { kind: "project", id: "opencut" },
		createdAt: "2026-09-09T00:00:00.000Z",
		updatedAt: "2026-09-09T00:00:00.000Z",
	};
}

function project(editId: string, name: string): SerializedProject {
	return {
		metadata: {
			id: editId,
			name,
			duration: 12_000,
			createdAt: "2026-09-09T00:00:00.000Z",
			updatedAt: "2026-09-09T00:00:00.000Z",
		},
		scenes: [
			{
				id: `${editId}-scene`,
				name: "Main scene",
				isMain: true,
				tracks: {
					overlay: [],
					main: {
						id: `${editId}-main`,
						name: "Main",
						type: "video",
						elements: [],
						muted: false,
						hidden: false,
					},
					audio: [],
				},
				bookmarks: [],
				createdAt: "2026-09-09T00:00:00.000Z",
				updatedAt: "2026-09-09T00:00:00.000Z",
			},
		],
		currentSceneId: `${editId}-scene`,
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
		},
		version: 32,
	};
}

function projectWithMedia(editId: string, name: string): SerializedProject {
	const result = project(editId, name);
	const reference = {
		editId,
		documentIntentRevision: "1",
		productionRevisionId: "production-1",
		contentDigest: "production-digest",
	};
	const candidate: ProductionImageCandidate = {
		kind: "storyboard-image",
		idempotencyKey: "candidate-1",
		acceptedRevision: reference,
		shotId: "shot-1",
		shotRevision: 1,
		resource: {
			kind: "files",
			publicId: "candidate-public-id",
			path: "OpenCut/edit-media/storyboards/candidate.png",
			digest: "candidate-digest",
			byteLength: 321,
			mimeType: "image/png",
			dimensions: { width: 1_280, height: 720 },
		},
	};
	const accepted: AcceptedProductionRevision = {
		reference,
		script: "A one-shot production script.",
		shots: [{
			shotId: "shot-1",
			revision: 1,
			narration: "Narration",
			visualBrief: "Visual",
			durationMs: 4_000,
			imageVersion: {
				mediaId: "accepted-public-id",
				mediaRevision: "accepted-revision",
				name: "accepted.png",
				mediaType: "image",
				mimeType: "image/png",
				digest: "accepted-digest",
				byteLength: 123,
				sourceDurationSeconds: 4,
				filesRef: { publicId: "accepted-public-id", path: "Media/accepted.png", revision: "7" },
				dimensions: { width: 1_920, height: 1_080 },
			},
			imageCandidates: [candidate],
		}],
		targetDurationMs: 4_000,
		canvas: { width: 1_920, height: 1_080 },
		fps: { numerator: 30, denominator: 1 },
	};
	result.settings.production = {
		formatVersion: 1,
		accepted,
		acceptanceReceipts: [],
		actionIntents: [],
	};
	return result;
}

function fixture() {
	const rows = new Map<string, StoredRow>();
	const effects = { creates: 0, updates: 0, deletes: 0, files: 0 };
	const entities: EntityStorageApi = {
		query<T>(type: string, query: EntityQuery = {}): Promise<EntityQueryResult<T>> {
			const storageKey = query.where?.storageKey;
			const records = [...rows.values()]
				.filter((row) => {
					const data: ProjectValue = JSON.parse(row.dataJson);
					return (
						row.type === type &&
						(storageKey === undefined || data.storageKey === storageKey)
					);
				})
				.slice(0, query.limit)
				.map((row) => entityRecord<T>(row));
			return Promise.resolve({ records, cursor: null });
		},
		create<T>(type: string, data: T, options: EntityCreateOptions = {}) {
			effects.creates += 1;
			const id = options.id ?? crypto.randomUUID();
			if (rows.has(id)) throw new Error(`Entity ${id} already exists`);
			const row = { id, type, dataJson: JSON.stringify(data), version: 1 };
			rows.set(id, row);
			return Promise.resolve(entityRecord<T>(row));
		},
		update<T>(
			type: string,
			id: string,
			patch: Partial<T>,
			options: EntityUpdateOptions = {},
		) {
			effects.updates += 1;
			const current = rows.get(id);
			if (!current || current.type !== type) throw new Error(`Missing entity ${id}`);
			if (
				options.expectedVersion !== undefined &&
				options.expectedVersion !== current.version
			) {
				throw new Error("Entity version conflict");
			}
			const row = {
				...current,
				dataJson: JSON.stringify({ ...JSON.parse(current.dataJson), ...patch }),
				version: current.version + 1,
			};
			rows.set(id, row);
			return Promise.resolve(entityRecord<T>(row));
		},
		delete<T>(_type: string, id: string) {
			effects.deletes += 1;
			const row = rows.get(id);
			if (!row) throw new Error(`Missing entity ${id}`);
			rows.delete(id);
			return Promise.resolve(entityRecord<T>(row));
		},
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const files: FilesStorageApi = {
		list(): Promise<FilesListEntry[]> {
			return Promise.resolve([]);
		},
		publish(_args: FilesPublishArgs) {
			effects.files += 1;
			return Promise.reject(new Error("Fixture does not publish"));
		},
	};
	return { effects, entities, files, rows };
}

function effectCount(effects: ReturnType<typeof fixture>["effects"]): number {
	return effects.creates + effects.updates + effects.deletes + effects.files;
}

async function seed(
	documents: ProductionDocumentService,
	editId: string,
	name: string,
) {
	return documents.save({
		editId,
		project: project(editId, name),
		expectedRevision: null,
	});
}

function expectedRevision(revision: EditRevision): EditRevision {
	return structuredClone(revision);
}

async function intentDigest(project: SerializedProject): Promise<string> {
	const { thumbnail: _thumbnail, updatedAt: _updatedAt, ...metadata } = project.metadata;
	const { timelineViewState: _timelineViewState, ...intentValue } = project;
	const intent = { ...intentValue, metadata };
	const canonical = JSON.stringify(intent, (_key, nested) => {
		if (nested === null || Array.isArray(nested) || typeof nested !== "object") return nested;
		return Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)));
	});
	const bytes = new TextEncoder().encode(canonical);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Buffer.from(digest).toString("hex");
}

describe("production command router", () => {
	test("lists two edits and flags the persisted active edit with its revision", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		const first = await seed(documents, "edit-a", "Alpha");
		await seed(documents, "edit-b", "Beta");
		const originalStorage = globalThis.localStorage;
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: { getItem: (key: string) => key === "opencut.active-project-id" ? "edit-a" : null },
		});
		try {
			const result = await new ProductionCommandRouter(documents).run({ operation: "list-edits" });
			expect(result).toMatchObject({
				kind: "json",
				data: {
					operation: "list-edits",
					editId: "edit-a",
					activeEditSource: "storage",
					revision: first.revision,
					edits: [
						{ editId: "edit-b", name: "Beta", active: false },
						{ editId: "edit-a", name: "Alpha", active: true },
					],
				},
			});
		} finally {
			if (originalStorage === undefined) delete (globalThis as { localStorage?: Storage }).localStorage;
			else Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
		}
	});

	test("resolves inspect-edit without editId and preserves unknown edit refusal", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		const initial = await seed(documents, "edit-a", "Alpha");
		const router = new ProductionCommandRouter(documents);
		const resolved = await router.run({ operation: "inspect-edit" });
		expect(resolved.data).toMatchObject({ operation: "inspect-edit", editId: "edit-a", revision: initial.revision });
		const missing = await router.run({ operation: "inspect-edit", editId: "missing" });
		expect(missing.data).toMatchObject({ status: "refused", reason: "edit-not-found", editId: "missing" });
	});

	test("inspects one explicit edit without producer or Entity mutation", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		const initial = await seed(documents, "edit-a", "Alpha");
		const before = effectCount(sdk.effects);
		const result = await new ProductionCommandRouter(documents).run({
			operation: "inspect-edit",
			editId: "edit-a",
		});

		expect(result).toMatchObject({
			kind: "json",
			data: {
				supported: true,
				status: "completed",
				operation: "inspect-edit",
				editId: "edit-a",
				revision: initial.revision,
				edit: {
					name: "Alpha",
					sceneCount: 1,
					timelineElementCount: 0,
					canvasWidth: 1920,
					canvasHeight: 1080,
					fpsNumerator: 30,
					fpsDenominator: 1,
				},
			},
		});
		expect(effectCount(sdk.effects)).toBe(before);
	});

	test("renames through the owner, reads back the commit, and retry converges", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		const initial = await seed(documents, "edit-a", "Alpha");
		const router = new ProductionCommandRouter(documents);
		const input = {
			operation: "rename-edit" as const,
			editId: "edit-a",
			expectedRevision: expectedRevision(initial.revision),
			name: "Renamed",
		};
		const result = await router.run(input);
		const updatesAfterCommit = sdk.effects.updates;
		const reloaded = await new ProductionDocumentService(sdk).load("edit-a");

		expect(result.data).toMatchObject({
			supported: true,
			status: "completed",
			operation: "rename-edit",
			editId: "edit-a",
			revision: reloaded?.revision,
			edit: { name: "Renamed" },
		});
		expect(reloaded?.project.metadata.name).toBe("Renamed");
		const reconstructed = new ProductionCommandRouter(
			new ProductionDocumentService(sdk),
		);
		expect(await reconstructed.run(input)).toEqual(result);
		expect(sdk.effects.updates).toBe(updatesAfterCommit);
	});

	test("wrong-digest, stale, and other-edit revisions refuse without touching either edit", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		const editA = await seed(documents, "edit-a", "Alpha");
		const editB = await seed(documents, "edit-b", "Beta");
		const competingProject = project("edit-b", "Competitor");
		competingProject.settings.canvasSize.width = 1280;
		const competitor = await documents.save({
			editId: "edit-b",
			project: competingProject,
			expectedRevision: editB.revision,
		});
		const before = effectCount(sdk.effects);
		const router = new ProductionCommandRouter(documents);

		const wrongDigest = await router.run({
			operation: "rename-edit",
			editId: "edit-a",
			expectedRevision: { ...editA.revision, digest: "f".repeat(64) },
			name: "Wrong digest",
		});
		const otherEdit = await router.run({
			operation: "rename-edit",
			editId: "edit-b",
			expectedRevision: editA.revision,
			name: "Competitor",
		});
		const missingExpectation = await router.run({
			operation: "rename-edit",
			editId: "edit-b",
			name: "Unrevisioned overwrite",
		});
		const stale = await router.run({
			operation: "rename-edit",
			editId: "edit-b",
			expectedRevision: editB.revision,
			name: "Competitor",
		});

		expect(wrongDigest.data).toMatchObject({
			supported: true,
			status: "refused",
			reason: "revision-conflict",
			revision: editA.revision,
		});
		expect(otherEdit.data).toMatchObject({
			supported: true,
			status: "refused",
			reason: "revision-conflict",
			revision: competitor.revision,
		});
		expect(stale.data).toMatchObject({
			supported: true,
			status: "refused",
			reason: "revision-conflict",
			revision: competitor.revision,
		});
		expect(missingExpectation.data).toMatchObject({
			supported: true,
			status: "refused",
			reason: "expected-revision-required",
			revision: competitor.revision,
		});
		expect(effectCount(sdk.effects)).toBe(before);
		expect((await documents.load("edit-a"))?.project.metadata.name).toBe("Alpha");
		expect((await documents.load("edit-b"))?.project.metadata.name).toBe("Competitor");
		expect(
			(await documents.load("edit-b"))?.project.settings.canvasSize.width,
		).toBe(1280);
	});

	test("inspects an owner-admitted long name without truncation or effects", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		const name = "n".repeat(201);
		const initial = await seed(documents, "edit-long-name", name);
		const before = effectCount(sdk.effects);
		const result = await new ProductionCommandRouter(documents).run({
			operation: "inspect-edit",
			editId: "edit-long-name",
		});

		expect(result.data).toMatchObject({
			supported: true,
			status: "completed",
			revision: initial.revision,
			edit: { name },
		});
		expect(result.data.edit?.name).toHaveLength(201);
		expect(effectCount(sdk.effects)).toBe(before);
	});

	test("lists accepted and candidate media from the durable edit without effects", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		const saved = await documents.save({
			editId: "edit-media",
			project: projectWithMedia("edit-media", "Media edit"),
			expectedRevision: null,
		});
		const before = effectCount(sdk.effects);
		const result = await new ProductionCommandRouter(documents).run({
			operation: "list-media",
			editId: "edit-media",
		});

		expect(result).toMatchObject({
			kind: "json",
			data: {
				supported: true,
				status: "completed",
				operation: "list-media",
				editId: "edit-media",
				revision: saved.revision,
				media: [{
					shotId: "shot-1",
					shotRevision: "1",
					role: "visual",
					accepted: {
						versionId: "accepted-revision",
						mediaId: "accepted-public-id",
						mediaRevision: "accepted-revision",
						name: "accepted.png",
						filesRef: { publicId: "accepted-public-id", path: "Media/accepted.png", revision: "7" },
						dimensions: { width: 1_920, height: 1_080 },
						durationSeconds: 4,
					},
					candidates: [{
						candidateId: "candidate-1",
						versionId: "candidate-digest",
						mediaId: "candidate-public-id",
						mediaRevision: "candidate-digest",
						name: "candidate.png",
						filesRef: { publicId: "candidate-public-id", path: "OpenCut/edit-media/storyboards/candidate.png" },
						dimensions: { width: 1_280, height: 720 },
						durationSeconds: 4,
					}],
				}],
			},
		});
		expect(effectCount(sdk.effects)).toBe(before);
	});

	test("refuses an unknown edit when listing media", async () => {
		const sdk = fixture();
		const result = await new ProductionCommandRouter(new ProductionDocumentService(sdk)).run({
			operation: "list-media",
			editId: "missing-media-edit",
		});
		expect(result).toMatchObject({
			data: {
				supported: true,
				status: "refused",
				operation: "list-media",
				reason: "edit-not-found",
				media: [],
			},
		});
	});

	test("reports an accepted video clip media type", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		const videoProject = projectWithMedia("edit-video-media", "Video media edit");
		const imageVersion = videoProject.settings.production!.accepted!.shots[0]!.imageVersion!;
		imageVersion.mediaType = "video";
		imageVersion.mimeType = "video/mp4";
		imageVersion.name = "clip.mp4";
		imageVersion.sourceDurationSeconds = 1.5;
		const saved = await documents.save({ editId: "edit-video-media", project: videoProject, expectedRevision: null });
		const result = await new ProductionCommandRouter(documents).run({ operation: "list-media", editId: "edit-video-media" });

		expect(result.data).toMatchObject({
			status: "completed",
			revision: saved.revision,
			media: [{ accepted: { name: "clip.mp4", mediaType: "video", durationSeconds: 1.5 } }],
		});
	});

	test("raw legacy and unavailable operations refuse without conversion or effects", async () => {
		const sdk = fixture();
		await sdk.entities.create<ProjectValue>(
			"opencut.project",
			{ storageKey: "legacy", value: project("legacy", "Legacy") },
			{ id: "legacy" },
		);
		const documents = new ProductionDocumentService(sdk);
		const router = new ProductionCommandRouter(documents);
		const before = effectCount(sdk.effects);
		const legacy = await router.run({
			operation: "rename-edit",
			editId: "legacy",
			expectedRevision: {
				editId: "legacy",
				storageCasRevision: "1",
				intentRevision: "1",
				digest: "unknown",
			},
			name: "Must not migrate",
		});
		const unavailable = await router.run({
			operation: "list-media",
			editId: "legacy",
		});

		expect(legacy.data).toMatchObject({
			supported: true,
			status: "refused",
			reason: "legacy-revision-required",
			legacyStorageCasRevision: "1",
		});
		expect(unavailable.data).toMatchObject({
			supported: true,
			status: "refused",
			reason: "legacy-revision-required",
			legacyStorageCasRevision: "1",
		});
		expect(effectCount(sdk.effects)).toBe(before);
		const stored = sdk.rows.get("legacy");
		expect(stored?.version).toBe(1);
		expect(stored && "kind" in JSON.parse(stored.dataJson).value).toBe(false);
	});

	test("routes export through an injected render operation and returns its validated artifact", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		const initial = await seed(documents, "edit-render", "Render me");
		let received: unknown;
		const router = new ProductionCommandRouter(documents, {
			run: async (input) => {
				received = input;
				return {
					operationId: "render-operation-1",
					status: "completed",
					revision: input.expectedRevision,
					artifact: {
						publicId: "file-1",
						path: "/Render me.mp4",
						byteLength: 12,
						sha256: "a".repeat(64),
						duration: 12,
						width: 1920,
						height: 1080,
						format: "mp4",
					},
				};
			},
		});

		const result = await router.run({
			operation: "export-project",
			editId: "edit-render",
			expectedRevision: initial.revision,
			format: "mp4",
			quality: "high",
			includeAudio: false,
		});

		expect(received).toEqual({
			editId: "edit-render",
			expectedRevision: initial.revision,
			format: "mp4",
			quality: "high",
			includeAudio: false,
		});
		expect(result).toMatchObject({
			kind: "json",
			data: {
				supported: true,
				status: "completed",
				operation: "export-project",
				operationId: "render-operation-1",
				artifact: { publicId: "file-1", byteLength: 12, sha256: "a".repeat(64) },
				revision: initial.revision,
			},
		});
	});

	test("exports with the pre-compaction revision after an intent-neutral load", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		await seed(documents, "edit-compaction", "Revision 0");
		const row = sdk.rows.get("edit-compaction");
		if (!row) throw new Error("Compaction fixture row is missing");
		const snapshots = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
			const snapshotProject = project("edit-compaction", `Revision ${index + 1}`);
			return {
				intentRevision: String(index + 1),
				digest: await intentDigest(snapshotProject),
				project: snapshotProject,
			};
		}));
		const currentProject = snapshots[6]!.project;
		const document: StoredProductionDocument = {
			...currentProject,
			kind: "opencut.production-document",
			formatVersion: 1,
			editId: "edit-compaction",
			currentIntentRevision: "7",
			snapshots,
		};
		row.dataJson = JSON.stringify({ storageKey: "edit-compaction", value: document });
		const preCompaction = await documents.readCurrent("edit-compaction");
		if (!preCompaction || preCompaction.kind !== "document") {
			throw new Error("Compaction fixture did not produce a document revision");
		}
		const router = new ProductionCommandRouter(documents, {
			run: async (input) => ({
				operationId: "compaction-render",
				status: "completed",
				revision: input.expectedRevision,
				artifact: {
					publicId: "file-compaction",
					path: "renders/compaction.mp4",
					mimeType: "video/mp4",
					byteLength: 12,
					sha256: "a".repeat(64),
					width: 1920,
					height: 1080,
					format: "mp4",
				},
			}),
		});
		const loaded = await documents.load("edit-compaction");
		expect(loaded?.revision.intentRevision).toBe(preCompaction.document.revision.intentRevision);
		expect(loaded?.revision.digest).toBe(preCompaction.document.revision.digest);
		expect(loaded?.revision.storageCasRevision).not.toBe(preCompaction.document.revision.storageCasRevision);

		const result = await router.run({
			operation: "export-project",
			editId: "edit-compaction",
			expectedRevision: preCompaction.document.revision,
		});
		expect(result.data.status).toBe("completed");
		expect(result.data.reason).toBeUndefined();
	});
});
