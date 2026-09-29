import { describe, expect, test } from "bun:test";
import {
	entities as sdkEntities,
	files as sdkFiles,
	type EntityCreateOptions,
	type EntityQuery,
	type EntityQueryResult,
	type EntityRecord,
	type EntityUpdateOptions,
	type FilesListEntry,
	type FilesPublishArgs,
} from "@ispo/sdk";
import type {
	ProductionCommandResult,
} from "./production-command-router";
import { ProductionDocumentService } from "@/project/production-document-service";
import type { StoredProductionDocument } from "@/project/production-types";
import type {
	EntityStorageApi,
	FilesStorageApi,
	StoredEntityValue,
} from "@/services/storage/sdk-adapter";
import type { SerializedProject } from "@/services/storage/types";
import {
	LegacyProjectCommandUnavailableError,
	createProjectCommandRuntime,
	runUnavailableLegacyProjectCommand,
} from "./project-command-runtime";

type ProjectValue = StoredEntityValue<
	SerializedProject | StoredProductionDocument
>;

function project(editId: string): SerializedProject {
	return {
		metadata: {
			id: editId,
			name: "Headless",
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

function runtimeFixture() {
	let row: EntityRecord<ProjectValue> | null = null;
	let writes = 0;
	const entities: EntityStorageApi = {
		query<T>(_type: string, query: EntityQuery = {}): Promise<EntityQueryResult<T>> {
			const matches =
				row !== null &&
				(query.where?.storageKey === undefined ||
					query.where.storageKey === row.data.storageKey);
			return Promise.resolve({
				records: matches ? [structuredClone(row)] : [],
				cursor: null,
			});
		},
		create<T>(type: string, data: T, options: EntityCreateOptions = {}) {
			writes += 1;
			row = {
				id: options.id ?? "edit-headless",
				type,
				data,
				version: 1,
				createdBy: { kind: "project", id: "opencut" },
				updatedBy: { kind: "project", id: "opencut" },
				createdAt: "2026-09-09T00:00:00.000Z",
				updatedAt: "2026-09-09T00:00:00.000Z",
			};
			return Promise.resolve(structuredClone(row));
		},
		update<T>(
			_type: string,
			_id: string,
			patch: Partial<T>,
			options: EntityUpdateOptions = {},
		) {
			if (!row) throw new Error("Missing fixture row");
			if (options.expectedVersion !== row.version) {
				throw new Error("Entity version conflict");
			}
			writes += 1;
			row = {
				...row,
				data: { ...row.data, ...patch },
				version: row.version + 1,
			};
			return Promise.resolve(structuredClone(row));
		},
		delete<T>() {
			throw new Error("Unexpected delete");
		},
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const files: FilesStorageApi = {
		list(): Promise<FilesListEntry[]> {
			return Promise.resolve([]);
		},
		publish(_args: FilesPublishArgs) {
			return Promise.reject(new Error("Unexpected publish"));
		},
	};
	const sdk = { entities, files };
	return {
		sdk,
		writes: () => writes,
		setRow: (value: EntityRecord<ProjectValue>) => {
			row = value;
		},
	};
}

describe("project command runtime", () => {
	test("uses only the invocation SDK and remains ready without an editor mount", async () => {
		const fixture = runtimeFixture();
		const seeded = await new ProductionDocumentService(fixture.sdk).save({
			editId: "edit-headless",
			project: project("edit-headless"),
			expectedRevision: null,
		});
		const writesAfterSeed = fixture.writes();
		const runtime = createProjectCommandRuntime(fixture.sdk);
		const result = await runtime.run({
			operation: "rename-edit",
			editId: "edit-headless",
			expectedRevision: seeded.revision,
			name: "Closed editor",
		});

		expect(result.data).toMatchObject({
			supported: true,
			status: "completed",
			edit: { name: "Closed editor" },
		});
		expect(fixture.writes()).toBe(writesAfterSeed + 1);
		expect(
			(await new ProductionDocumentService(fixture.sdk).load("edit-headless"))
				?.project.metadata.name,
		).toBe("Closed editor");
	});

	test("legacy mounted-editor commands return an exact supported refusal", async () => {
		const fixture = runtimeFixture();
		await expect(
			runUnavailableLegacyProjectCommand("arrange-timeline", fixture.sdk),
		).rejects.toBeInstanceOf(LegacyProjectCommandUnavailableError);
		expect(fixture.writes()).toBe(0);
	});

	test("production command binding validates an owner-admitted long-name result", async () => {
		const fixture = runtimeFixture();
		const longName = "n".repeat(201);
		const storedProject = project("edit-headless");
		storedProject.metadata.name = longName;
		const created = await new ProductionDocumentService(fixture.sdk).save({
			editId: "edit-headless",
			project: storedProject,
			expectedRevision: null,
		});
		const writesAfterSeed = fixture.writes();
		const originalEntities = {
			query: sdkEntities.query,
			create: sdkEntities.create,
			update: sdkEntities.update,
			delete: sdkEntities.delete,
			subscribeQuery: sdkEntities.subscribeQuery,
		};
		const originalFiles = {
			list: sdkFiles.list,
			publish: sdkFiles.publish,
		};
		Object.assign(sdkEntities, fixture.sdk.entities);
		Object.assign(sdkFiles, fixture.sdk.files);
		try {
			const { productionEditCommand } = await import("./project-commands");
			const result: ProductionCommandResult = await productionEditCommand.run({
				operation: "inspect-edit",
				editId: "edit-headless",
			});
			const reopened = await new ProductionDocumentService(fixture.sdk).load(
				"edit-headless",
			);

			expect(result.data).toMatchObject({
				status: "completed",
				revision: created.revision,
				edit: { name: longName },
			});
			expect(reopened?.project.metadata.name).toBe(longName);
			expect(fixture.writes()).toBe(writesAfterSeed);
		} finally {
			Object.assign(sdkEntities, originalEntities);
			Object.assign(sdkFiles, originalFiles);
		}
	});
});
