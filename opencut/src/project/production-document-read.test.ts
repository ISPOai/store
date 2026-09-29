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
import type {
	EntityStorageApi,
	FilesStorageApi,
	StoredEntityValue,
} from "@/services/storage/sdk-adapter";
import type { SerializedProject } from "@/services/storage/types";
import type { StoredProductionDocument } from "./production-types";
import {
	EditRevisionConflictError,
	LegacyEditRevisionConflictError,
	ProductionDraftStaleError,
} from "./production-types";
import { ProductionDocumentService } from "./production-document-service";
import { ProductionService } from "./production-service";

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

function project(): SerializedProject {
	return {
		metadata: {
			id: "legacy-edit",
			name: "Legacy edit",
			duration: 0,
			createdAt: "2026-09-09T00:00:00.000Z",
			updatedAt: "2026-09-09T00:00:00.000Z",
		},
		scenes: [],
		currentSceneId: "",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
		},
		version: 32,
	};
}

function fixture() {
	let row: StoredRow = {
		id: "legacy-edit",
		type: "opencut.project",
		dataJson: JSON.stringify({ storageKey: "legacy-edit", value: project() }),
		version: 7,
	};
	const effects = { creates: 0, updates: 0, deletes: 0, files: 0 };
	const entities: EntityStorageApi = {
		query<T>(
			type: string,
			query: EntityQuery = {},
		): Promise<EntityQueryResult<T>> {
			const data: ProjectValue = JSON.parse(row.dataJson);
			const matches =
				row.type === type &&
				(query.where?.storageKey === undefined ||
					query.where.storageKey === data.storageKey);
			return Promise.resolve({
				records: matches ? [entityRecord<T>(row)] : [],
				cursor: null,
			});
		},
		create<T>(
			type: string,
			data: T,
			options: EntityCreateOptions = {},
		): Promise<EntityRecord<T>> {
			effects.creates += 1;
			row = {
				id: options.id ?? "created",
				type,
				dataJson: JSON.stringify(data),
				version: 1,
			};
			return Promise.resolve(entityRecord<T>(row));
		},
		update<T>(
			type: string,
			id: string,
			patch: Partial<T>,
			options: EntityUpdateOptions = {},
		): Promise<EntityRecord<T>> {
			effects.updates += 1;
			if (type !== row.type || id !== row.id) throw new Error("Entity not found");
			if (
				options.expectedVersion !== undefined &&
				options.expectedVersion !== row.version
			) {
				throw new Error("Entity version conflict");
			}
			row = {
				...row,
				dataJson: JSON.stringify({ ...JSON.parse(row.dataJson), ...patch }),
				version: row.version + 1,
			};
			return Promise.resolve(entityRecord<T>(row));
		},
		delete<T>(): Promise<EntityRecord<T>> {
			effects.deletes += 1;
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
			return Promise.reject(new Error("Fixture does not publish files"));
		},
	};
	return { effects, entities, files, stored: () => entityRecord<ProjectValue>(row) };
}

function effectCount(effects: ReturnType<typeof fixture>["effects"]): number {
	return effects.creates + effects.updates + effects.deletes + effects.files;
}

function legacyAcceptanceInput() {
	return {
		editId: "legacy-edit",
		expectedRevision: null,
		expectedLegacyStorageCasRevision: "7",
		baseAcceptedReference: null,
		idempotencyKey: "accept-legacy-retry",
		script: "Explicitly accepted legacy script",
		shots: [
			{
				clientKey: "opening",
				narration: "Open the story.",
				visualBrief: "A wide opening view.",
				durationMs: 4_000,
			},
		],
	};
}

describe("production document current read", () => {
	test("reads raw legacy and current documents without writes while explicit load still migrates", async () => {
		const sdk = fixture();
		const service = new ProductionDocumentService(sdk);
		const beforeLegacyRead = effectCount(sdk.effects);
		const discussion = await new ProductionService(service).load("legacy-edit");
		expect(discussion).toMatchObject({
			editId: "legacy-edit",
			documentRevision: null,
			legacyStorageCasRevision: "7",
			accepted: null,
		});
		expect(effectCount(sdk.effects)).toBe(beforeLegacyRead);
		const legacy = await service.readCurrent("legacy-edit");
		expect(legacy?.kind).toBe("legacy");
		if (!legacy || legacy.kind !== "legacy") throw new Error("Expected legacy read");
		expect(legacy.storageCasRevision).toBe("7");
		expect(legacy.project).toEqual(project());
		legacy.project.metadata.name = "Caller mutation";
		expect(effectCount(sdk.effects)).toBe(beforeLegacyRead);
		expect(sdk.stored().version).toBe(7);
		expect("kind" in sdk.stored().data.value).toBe(false);

		const migrated = await service.load("legacy-edit");
		expect(migrated?.revision).toMatchObject({
			editId: "legacy-edit",
			storageCasRevision: "8",
			intentRevision: "1",
		});
		expect(sdk.effects.updates).toBe(1);
		const afterMigration = effectCount(sdk.effects);

		const current = await service.readCurrent("legacy-edit");
		expect(current).toEqual({ kind: "document", document: migrated });
		expect(effectCount(sdk.effects)).toBe(afterMigration);
		expect((await service.load("legacy-edit"))?.revision).toEqual(
			migrated?.revision,
		);
		expect(effectCount(sdk.effects)).toBe(afterMigration);
	});

	test("refuses a stale displayed acceptance even when the caller supplies fresh document CAS", async () => {
		const sdk = fixture();
		const documents = new ProductionDocumentService(sdk);
		const migrated = await documents.load("legacy-edit");
		if (!migrated) throw new Error("Expected migrated document");
		const service = new ProductionService(documents);
		const shot = {
			clientKey: "opening",
			narration: "Open the story.",
			visualBrief: "A wide opening view.",
			durationMs: 4_000,
		};
		const displayed = await service.acceptRevision({
			editId: "legacy-edit",
			expectedRevision: migrated.revision,
			baseAcceptedReference: null,
			idempotencyKey: "displayed",
			script: "Displayed script",
			shots: [shot],
		});
		const competing = await service.acceptRevision({
			editId: "legacy-edit",
			expectedRevision: displayed.documentRevision,
			baseAcceptedReference: displayed.accepted.reference,
			idempotencyKey: "competing",
			script: "Competing script",
			shots: [{ ...shot, shotId: displayed.accepted.shots[0]?.shotId }],
		});
		const writesBeforeRefusal = effectCount(sdk.effects);

		await expect(
			service.acceptRevision({
				editId: "legacy-edit",
				expectedRevision: competing.documentRevision,
				baseAcceptedReference: displayed.accepted.reference,
				idempotencyKey: "stale-draft",
				script: "Stale draft",
				shots: [{ ...shot, shotId: displayed.accepted.shots[0]?.shotId }],
			}),
		).rejects.toBeInstanceOf(ProductionDraftStaleError);
		expect(effectCount(sdk.effects)).toBe(writesBeforeRefusal);
		expect((await service.load("legacy-edit"))?.accepted).toEqual(
			competing.accepted,
		);
	});

	test("explicit acceptance converts raw legacy through the owner before its CAS write", async () => {
		const sdk = fixture();
		const service = new ProductionService(new ProductionDocumentService(sdk));
		const snapshot = await service.load("legacy-edit");
		if (!snapshot) throw new Error("Expected legacy snapshot");
		const accepted = await service.acceptRevision({
			editId: "legacy-edit",
			expectedRevision: snapshot.documentRevision,
			expectedLegacyStorageCasRevision:
				snapshot.legacyStorageCasRevision ?? undefined,
			baseAcceptedReference: null,
			idempotencyKey: "accept-legacy",
			script: "Explicitly accepted legacy script",
			shots: [
				{
					clientKey: "opening",
					narration: "Open the story.",
					visualBrief: "A wide opening view.",
					durationMs: 4_000,
				},
			],
		});
		expect(accepted.documentRevision).toMatchObject({
			storageCasRevision: "9",
			intentRevision: "2",
		});
		expect(accepted.accepted.script).toBe("Explicitly accepted legacy script");
		expect(sdk.effects).toMatchObject({
			creates: 0,
			updates: 2,
			deletes: 0,
			files: 0,
		});
		const effectsAfterAcceptance = effectCount(sdk.effects);
		expect((await service.load("legacy-edit"))?.accepted).toEqual(
			accepted.accepted,
		);
		expect(effectCount(sdk.effects)).toBe(effectsAfterAcceptance);
	});

	test("resumes the exact legacy acceptance after migration settlement is ambiguous", async () => {
		const sdk = fixture();
		const originalQuery = sdk.entities.query.bind(sdk.entities);
		const originalUpdate = sdk.entities.update.bind(sdk.entities);
		let failRecoveryRead = false;
		let updateCalls = 0;
		sdk.entities.query = async (...args) => {
			if (failRecoveryRead) {
				failRecoveryRead = false;
				throw new Error("Migration recovery read was unavailable");
			}
			return originalQuery(...args);
		};
		sdk.entities.update = async (...args) => {
			const result = await originalUpdate(...args);
			updateCalls += 1;
			if (updateCalls === 1) {
				failRecoveryRead = true;
				throw new Error("Migration update reply was lost");
			}
			return result;
		};
		const input = legacyAcceptanceInput();
		await expect(
			new ProductionService(new ProductionDocumentService(sdk)).acceptRevision(
				input,
			),
		).rejects.toThrow("Migration recovery read was unavailable");
		const migrated = await new ProductionService(
			new ProductionDocumentService(sdk),
		).load("legacy-edit");
		expect(migrated).toMatchObject({
			documentRevision: { storageCasRevision: "8", intentRevision: "1" },
			accepted: null,
		});

		const retryService = new ProductionService(new ProductionDocumentService(sdk));
		const recovered = await retryService.acceptRevision(input);
		expect(recovered.accepted.script).toBe(input.script);
		const effectsAfterRecovery = effectCount(sdk.effects);
		expect((await retryService.acceptRevision(input)).accepted).toEqual(
			recovered.accepted,
		);
		expect(effectCount(sdk.effects)).toBe(effectsAfterRecovery);
	});

	test("refuses a stale observed legacy CAS before the owner migrates", async () => {
		const sdk = fixture();
		let raced = false;
		let effectsAfterCompetitor = -1;
		class RacingDocuments extends ProductionDocumentService {
			override async readCurrent(editId: string) {
				const observed = await super.readCurrent(editId);
				if (!raced) {
					raced = true;
					const competing = project();
					competing.metadata.name = "Competing raw edit";
					await sdk.entities.update(
						"opencut.project",
						"legacy-edit",
						{ storageKey: "legacy-edit", value: competing },
						{ expectedVersion: 7 },
					);
					effectsAfterCompetitor = effectCount(sdk.effects);
				}
				return observed;
			}
		}
		await expect(
			new ProductionService(new RacingDocuments(sdk)).acceptRevision(
				legacyAcceptanceInput(),
			),
		).rejects.toBeInstanceOf(LegacyEditRevisionConflictError);
		expect(effectCount(sdk.effects)).toBe(effectsAfterCompetitor);
		expect(sdk.stored().version).toBe(8);
		expect("kind" in sdk.stored().data.value).toBe(false);
	});

	test("admits only the migration-only successor of the observed legacy CAS", async () => {
		const changedSdk = fixture();
		const changedDocuments = new ProductionDocumentService(changedSdk);
		const migrated = await changedDocuments.admitLegacy({
			editId: "legacy-edit",
			expectedStorageCasRevision: "7",
		});
		await changedDocuments.save({
			editId: "legacy-edit",
			project: {
				...migrated.project,
				metadata: { ...migrated.project.metadata, name: "Changed after migration" },
			},
			expectedRevision: migrated.revision,
		});
		const effectsAfterChange = effectCount(changedSdk.effects);
		await expect(
			new ProductionService(changedDocuments).acceptRevision(
				legacyAcceptanceInput(),
			),
		).rejects.toBeInstanceOf(EditRevisionConflictError);
		expect(effectCount(changedSdk.effects)).toBe(effectsAfterChange);

		const competingSdk = fixture();
		const competingDocuments = new ProductionDocumentService(competingSdk);
		const competingBase = await competingDocuments.admitLegacy({
			editId: "legacy-edit",
			expectedStorageCasRevision: "7",
		});
		const competingService = new ProductionService(competingDocuments);
		await competingService.acceptRevision({
			...legacyAcceptanceInput(),
			expectedRevision: competingBase.revision,
			expectedLegacyStorageCasRevision: undefined,
			idempotencyKey: "competing-acceptance",
			script: "Competing accepted script",
		});
		const effectsAfterCompetingAcceptance = effectCount(competingSdk.effects);
		await expect(
			competingService.acceptRevision(legacyAcceptanceInput()),
		).rejects.toBeInstanceOf(ProductionDraftStaleError);
		expect(effectCount(competingSdk.effects)).toBe(
			effectsAfterCompetingAcceptance,
		);
	});
});
