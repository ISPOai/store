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
import { ProductionDocumentService } from "./production-document-service";
import { runProductionScriptCommand } from "./production-script-command";
import { ProductionService } from "./production-service";
import type { SerializedProject } from "@/services/storage/types";
import type {
	EntityStorageApi,
	FilesStorageApi,
} from "@/services/storage/sdk-adapter";

type Row = { id: string; type: string; dataJson: string; version: number };

function record<T>(row: Row): EntityRecord<T> {
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

function fixture() {
	const rows = new Map<string, Row>();
	const entities: EntityStorageApi = {
		query<T>(type: string, query: EntityQuery = {}): Promise<EntityQueryResult<T>> {
			const storageKey = query.where?.storageKey;
			const records = [...rows.values()]
				.filter((row) => row.type === type && (storageKey === undefined || JSON.parse(row.dataJson).storageKey === storageKey))
				.slice(0, query.limit)
				.map((row) => record<T>(row));
			return Promise.resolve({ records, cursor: null });
		},
		create<T>(type: string, data: T, options: EntityCreateOptions = {}) {
			const id = options.id ?? crypto.randomUUID();
			if (rows.has(id)) throw new Error(`Entity ${id} already exists`);
			const row: Row = { id, type, dataJson: JSON.stringify(data), version: 1 };
			rows.set(id, row);
			return Promise.resolve(record<T>(row));
		},
		update<T>(type: string, id: string, patch: Partial<T>, options: EntityUpdateOptions = {}) {
			const current = rows.get(id);
			if (!current || current.type !== type) throw new Error(`Missing entity ${id}`);
			if (options.expectedVersion !== undefined && options.expectedVersion !== current.version) throw new Error("Entity version conflict");
			const row: Row = { ...current, dataJson: JSON.stringify({ ...JSON.parse(current.dataJson), ...patch }), version: current.version + 1 };
			rows.set(id, row);
			return Promise.resolve(record<T>(row));
		},
		delete<T>(_type: string, id: string) {
			const row = rows.get(id);
			if (!row) throw new Error(`Missing entity ${id}`);
			rows.delete(id);
			return Promise.resolve(record<T>(row));
		},
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const files: FilesStorageApi = {
		list(): Promise<FilesListEntry[]> { return Promise.resolve([]); },
		publish(_args: FilesPublishArgs) { return Promise.reject(new Error("Fixture does not publish")); },
	};
	return { entities, files };
}

function project(): SerializedProject {
	return {
		metadata: { id: "edit-script", name: "Script", duration: 0, createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z" },
		scenes: [],
		currentSceneId: "",
		settings: { fps: { numerator: 30, denominator: 1 }, canvasSize: { width: 1920, height: 1080 }, background: { type: "color", color: "#000000" } },
		version: 32,
	};
}

function sixShots() {
	return Array.from({ length: 6 }, (_, index) => ({
		narration: `Narration ${index + 1}`,
		visualBrief: `Visual ${index + 1}`,
		targetDurationSeconds: index + 1,
	}));
}

async function setup() {
	const sdk = fixture();
	const documents = new ProductionDocumentService(sdk);
	const created = await documents.save({ editId: "edit-script", project: project(), expectedRevision: null });
	return { sdk, documents, created };
}

describe("production-script command", () => {
	test("reads the most recently updated edit when editId is omitted", async () => {
		const { sdk, created } = await setup();
		const read = await runProductionScriptCommand({ operation: "read" }, sdk);
		expect(read.data).toMatchObject({ status: "completed", editId: created.revision.editId });
	});

	test("reads, drafts six shots, accepts, reads accepted state, and replays idempotently", async () => {
		const { sdk, created } = await setup();
		const readEmpty = await runProductionScriptCommand({ operation: "read", editId: "edit-script" }, sdk);
		expect(readEmpty.data.status).toBe("completed");
		expect(readEmpty.data.draft).toBeUndefined();
		expect(readEmpty.data.accepted).toBeUndefined();

		const draft = await runProductionScriptCommand({
			operation: "save-draft",
			editId: "edit-script",
			expectedRevision: created.revision,
			script: "Six shots make the story.",
			shots: sixShots(),
		}, sdk);
		expect(draft.data.draft?.shots).toHaveLength(6);
		expect(draft.data.draft?.shots[0]?.motionBrief).toBe(draft.data.draft?.shots[0]?.visualBrief);
		expect(draft.data.draft?.totalDurationSeconds).toBe(21);
		const draftRevision = draft.data.revision!;

		const accepted = await runProductionScriptCommand({ operation: "accept", editId: "edit-script", expectedRevision: draftRevision, idempotencyKey: "accept-six" }, sdk);
		expect(accepted.data.summary).toEqual({ shotCount: 6, totalDurationSeconds: 21, aspectRatio: "16:9" });
		expect(accepted.data.acceptedRevision).toEqual(accepted.data.accepted && (await runProductionScriptCommand({ operation: "read", editId: "edit-script" }, sdk)).data.acceptedRevision);

		const afterAccept = await runProductionScriptCommand({ operation: "read", editId: "edit-script" }, sdk);
		expect(afterAccept.data.accepted?.shots).toHaveLength(6);
		expect(afterAccept.data.accepted?.shots[0]?.motionBrief).toBe(afterAccept.data.accepted?.shots[0]?.visualBrief);
		expect(afterAccept.data.accepted?.shots.map((shot) => shot.revision)).toEqual(["1", "1", "1", "1", "1", "1"]);
		expect(afterAccept.data.draft).toBeUndefined();

		const replay = await runProductionScriptCommand({ operation: "accept", editId: "edit-script", expectedRevision: accepted.data.revision!, idempotencyKey: "accept-six" }, sdk);
		expect(replay).toEqual(accepted);
	});

	test("preserves surviving identities through reorder/removal and keeps old history", async () => {
		const { sdk, created } = await setup();
		const firstDraft = await runProductionScriptCommand({ operation: "save-draft", editId: "edit-script", expectedRevision: created.revision, script: "First", shots: sixShots() }, sdk);
		const firstAccepted = await runProductionScriptCommand({ operation: "accept", editId: "edit-script", expectedRevision: firstDraft.data.revision!, idempotencyKey: "accept-first" }, sdk);
		const firstIds = firstAccepted.data.accepted!.shots.map((shot) => shot.shotId);
		const secondDraft = await runProductionScriptCommand({
			operation: "save-draft", editId: "edit-script", expectedRevision: firstAccepted.data.revision!, script: "Second",
			shots: [
				{ ...sixShots()[4]!, shotId: firstIds[4] },
				{ ...sixShots()[1]!, shotId: firstIds[1] },
			],
		}, sdk);
		const secondAccepted = await runProductionScriptCommand({ operation: "accept", editId: "edit-script", expectedRevision: secondDraft.data.revision!, idempotencyKey: "accept-second" }, sdk);
		expect(secondAccepted.data.accepted!.shots.map((shot) => shot.shotId)).toEqual([firstIds[4], firstIds[1]]);
		const snapshot = await new ProductionService(new ProductionDocumentService(sdk)).load("edit-script");
		expect(snapshot?.acceptedHistory?.map((revision) => revision.reference)).toEqual([firstAccepted.data.acceptedRevision]);
	});

	test("refuses stale writes, empty shots, and accepting without a draft", async () => {
		const { sdk, created } = await setup();
		const empty = await runProductionScriptCommand({ operation: "save-draft", editId: "edit-script", expectedRevision: created.revision, script: "No shots", shots: [] }, sdk);
		expect(empty.data).toMatchObject({ status: "refused", reason: "input-invalid" });
		const noDraft = await runProductionScriptCommand({ operation: "accept", editId: "edit-script", expectedRevision: created.revision, idempotencyKey: "missing-draft" }, sdk);
		expect(noDraft.data).toMatchObject({ status: "refused", reason: "draft-required" });
		const stale = await runProductionScriptCommand({ operation: "save-draft", editId: "edit-script", expectedRevision: { ...created.revision, digest: "stale" }, script: "Stale", shots: sixShots().slice(0, 1) }, sdk);
		expect(stale.data).toMatchObject({ status: "refused", reason: "revision-conflict" });
	});
});
