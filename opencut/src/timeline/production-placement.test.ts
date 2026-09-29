import { afterEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	entities as sdkEntities,
	ProjectRpcError,
	files as sdkFiles,
	type EntityCreateOptions,
	type EntityQuery,
	type EntityRecord,
	type EntityUpdateOptions,
	type FilesListEntry,
	type FilesPublishArgs,
} from "@ispo/sdk";
import * as wasmGlue from "../../node_modules/opencut-wasm/opencut_wasm_bg.js";
import type { ProductionDocumentSdk } from "@/project/production-document-service";
import type {
	AcceptedProductionRevision,
	LoadedProductionDocument,
} from "@/project/production-types";
import type { SerializedProject } from "@/services/storage/types";
import type {
	ProductionPlacementInput,
	ProductionPlacementResult,
} from "./production-placement";

// Both suites share wasm-bindgen's module-level memory caches.
try {
	wasmGlue.TICKS_PER_SECOND();
} catch {
	const wasmModule = new WebAssembly.Module(
		readFileSync(
			new URL("../../node_modules/opencut-wasm/opencut_wasm_bg.wasm", import.meta.url),
		),
	);
	const wasmInstance = new WebAssembly.Instance(wasmModule, {
		"./opencut_wasm_bg.js": wasmGlue,
	});
	wasmGlue.__wbg_set_wasm(wasmInstance.exports);
	const startWasm = wasmInstance.exports.__wbindgen_start;
	if (startWasm instanceof Function) startWasm();
}
mock.module("opencut-wasm", () => wasmGlue);

const { mediaTimeFromSeconds, mediaTimeToSeconds } = await import("@/wasm");
const { ProductionDocumentService } = await import(
	"@/project/production-document-service"
);
const { ProductionService } = await import("@/project/production-service");
const { ProductionPlacementService } = await import("./production-placement");
const { arrangeTimelineCommand } = await import("@/services/project-commands");
const { buildScene } = await import("@/services/renderer/scene-builder");
const { ImageNode } = await import("@/services/renderer/nodes/image-node");
const { TextNode } = await import("@/services/renderer/nodes/text-node");

interface EntityRow {
	id: string;
	type: string;
	dataJson: string;
	version: number;
}

const cleanupPaths: string[] = [];

afterEach(async () => {
	await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true })));
});

function record<T>(row: EntityRow): EntityRecord<T> {
	return {
		id: row.id,
		type: row.type,
		data: JSON.parse(row.dataJson),
		version: row.version,
		createdBy: { kind: "project", id: "opencut" },
		updatedBy: { kind: "project", id: "opencut" },
		createdAt: "2026-09-10T00:00:00.000Z",
		updatedAt: "2026-09-10T00:00:00.000Z",
	};
}

async function sqliteFixture() {
	const directory = await mkdtemp(join(tmpdir(), "opencut-p10-"));
	cleanupPaths.push(directory);
	const databasePath = join(directory, "owner.sqlite");
	let database = new Database(databasePath, { create: true });
	database.exec("CREATE TABLE entities (id TEXT PRIMARY KEY, type TEXT, dataJson TEXT, version INTEGER)");
	const effects = { creates: 0, updates: 0 };
	const entities = {
		query<T>(type: string, query: EntityQuery = {}) {
			const rows = database
				.query<EntityRow, [string]>(
					"SELECT id, type, dataJson, version FROM entities WHERE type = ? ORDER BY id",
				)
				.all(type);
			const storageKey = query.where?.storageKey;
			return Promise.resolve({
					records: rows
					.filter((row) => storageKey === undefined ||
						JSON.parse(row.dataJson).storageKey === storageKey)
					.map((row) => record<T>(row)),
				cursor: null,
			});
		},
		create<T>(type: string, data: T, options: EntityCreateOptions = {}) {
			const id = options.id ?? crypto.randomUUID();
			effects.creates += 1;
			database.query(
				"INSERT INTO entities (id, type, dataJson, version) VALUES (?, ?, ?, 1)",
			).run(id, type, JSON.stringify(data));
			return Promise.resolve(record<T>({ id, type, dataJson: JSON.stringify(data), version: 1 }));
		},
		update<T>(
			type: string,
			id: string,
			patch: Partial<T>,
			options: EntityUpdateOptions = {},
		) {
			const row = database.query<EntityRow, [string, string]>(
				"SELECT id, type, dataJson, version FROM entities WHERE type = ? AND id = ?",
			).get(type, id);
			if (!row) throw new Error("Missing fixture entity");
			if (options.expectedVersion !== row.version) {
				throw new ProjectRpcError({ code: "entity-version-conflict", message: "Entity version conflict" });
			}
			const data = { ...JSON.parse(row.dataJson), ...patch };
			const version = row.version + 1;
			effects.updates += 1;
			database.query(
				"UPDATE entities SET dataJson = ?, version = ? WHERE id = ?",
			).run(JSON.stringify(data), version, id);
			return Promise.resolve(record<T>({ id, type, dataJson: JSON.stringify(data), version }));
		},
		delete<T>(): Promise<EntityRecord<T>> {
			throw new Error("Unexpected delete");
		},
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const files = {
		list(): Promise<FilesListEntry[]> {
			return Promise.resolve([]);
		},
		publish(_args: FilesPublishArgs) {
			return Promise.reject(new Error("Unexpected publish"));
		},
	};
	const sdk: ProductionDocumentSdk = { entities, files };
	return {
		sdk,
		effects,
		close: () => database.close(),
		reopen: () => {
			database.close();
			database = new Database(databasePath);
		},
	};
}

function project(editId: string): SerializedProject {
	return {
		metadata: {
			id: editId,
			name: "Three-shot edit",
			duration: mediaTimeFromSeconds({ seconds: 9 }),
			createdAt: "2026-09-10T00:00:00.000Z",
			updatedAt: "2026-09-10T00:00:00.000Z",
		},
		scenes: [{
			id: "scene-main",
			name: "Main scene",
			isMain: true,
			tracks: {
				main: {
					id: "manual-main",
					name: "Main",
					type: "video",
					elements: [{
						id: "manual-visual",
						name: "Manual slate",
						type: "image",
						mediaId: "manual-media",
						duration: mediaTimeFromSeconds({ seconds: 1 }),
						startTime: mediaTimeFromSeconds({ seconds: 20 }),
						trimStart: mediaTimeFromSeconds({ seconds: 0 }),
						trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
						params: {},
					}],
					muted: false,
					hidden: false,
				},
				overlay: [],
				audio: [],
			},
			bookmarks: [],
			createdAt: "2026-09-10T00:00:00.000Z",
			updatedAt: "2026-09-10T00:00:00.000Z",
		}],
		currentSceneId: "scene-main",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
		},
		version: 32,
	};
}

async function acceptedFixture() {
	const fixture = await sqliteFixture();
	const documents = new ProductionDocumentService(fixture.sdk);
	const created = await documents.save({
		editId: "edit-p10",
		project: project("edit-p10"),
		expectedRevision: null,
	});
	const accepted = await new ProductionService(documents).acceptRevision({
		editId: "edit-p10",
		expectedRevision: created.revision,
		baseAcceptedReference: null,
		idempotencyKey: "accept-three-shots",
		script: "Open, explain, close.",
		shots: [0, 1, 2].map((index) => ({
			clientKey: `shot-${index}`,
			narration: `Narration ${index + 1}`,
			visualBrief: `Picture ${index + 1}`,
			durationMs: 3_000,
		})),
	});
	return { ...fixture, documents, accepted };
}

function placementInput(
	accepted: AcceptedProductionRevision,
	expectedRevision: LoadedProductionDocument["revision"],
): ProductionPlacementInput {
	return {
		editId: "edit-p10",
		expectedRevision,
		acceptedRevision: accepted.reference,
		idempotencyKey: "place-three-shots",
		shots: accepted.shots.map((shot, index) => ({
			shotId: shot.shotId,
			shotRevision: shot.revision,
			startSeconds: index * 3,
			durationSeconds: 3,
			visual: {
				mediaId: `image-${index + 1}`,
				mediaRevision: `image-${index + 1}-v1`,
				mediaType: "image",
				name: `Picture ${index + 1}`,
				sourceDurationSeconds: 3,
				trimStartSeconds: 0,
				trimEndSeconds: 0,
			},
			narration: {
				mediaId: `audio-${index + 1}`,
				mediaRevision: `audio-${index + 1}-v1`,
				acceptedShotId: shot.shotId,
				acceptedShotRevision: shot.revision,
				name: `Narration ${index + 1}`,
				sourceDurationSeconds: 4,
				trimStartSeconds: 0.5,
				trimEndSeconds: 0.5,
				timelineOffsetSeconds: 0,
				alignment: {
					mediaId: `audio-${index + 1}`,
					mediaRevision: `audio-${index + 1}-v1`,
					segments: [{ text: `Line ${index + 1}`, start: 0.75, end: 1.75 }],
				},
			},
		})),
	};
}

function completed(result: ProductionPlacementResult) {
	if (result.data.status !== "completed") throw new Error(result.data.message);
	return result.data;
}

function productionTracks(document: LoadedProductionDocument) {
	const scene = document.project.scenes.find((candidate) => candidate.isMain);
	if (!scene) throw new Error("Missing main scene");
	return {
		scene,
		visual: scene.tracks.overlay.find((track) => track.production?.role === "visual"),
		audio: scene.tracks.audio.find((track) => track.production?.role === "narration"),
		captions: scene.tracks.overlay.find((track) => track.production?.role === "caption"),
	};
}

describe("production timeline placement", () => {
	test.each([false, true])("captions render above visuals and preserve user tracks (repair=%s)", async (repair) => {
		const fixture = await acceptedFixture();
		try {
			const service = new ProductionPlacementService(fixture.documents);
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			if (repair) completed(await service.run(input));
			const current = await fixture.documents.load(input.editId);
			if (!current) throw new Error("Missing edit");
			const { scene, visual, captions } = productionTracks(current);
			const userTracks = ["user-top", "user-middle", "user-bottom"].map((id) => ({
				...structuredClone(scene.tracks.main), id,
			}));
			scene.tracks.overlay = repair && visual && captions
				? [userTracks[0]!, visual, userTracks[1]!, captions, userTracks[2]!]
				: userTracks;
			const saved = await fixture.documents.save({
				editId: input.editId, project: current.project, expectedRevision: current.revision,
			});
			const next = placementInput(fixture.accepted.accepted, saved.revision);
			next.idempotencyKey = "arrange-caption-stack";
			completed(await service.run(next));
			fixture.reopen();
			const after = await fixture.documents.load(input.editId);
			if (!after) throw new Error("Missing arranged edit");
			const result = productionTracks(after);
			const overlay = result.scene.tracks.overlay;
			expect(overlay.indexOf(result.captions!)).toBeLessThan(overlay.indexOf(result.visual!));
			expect(overlay.filter((track) => !track.production)).toEqual(userTracks);
			expect(overlay.filter((track) => track.production?.role === "caption")).toHaveLength(1);
			const renderScene = buildScene({
				canvasSize: after.project.settings.canvasSize,
				tracks: result.scene.tracks,
				mediaAssets: input.shots.map((shot) => ({
					id: shot.visual!.mediaId, name: shot.visual!.name, type: "image",
					file: new File([], "still.png", { type: "image/png" }), url: "fixture:still",
				})),
				duration: 9, background: after.project.settings.background,
			});
			const picture = renderScene.children.findIndex((node) => node instanceof ImageNode);
			const caption = renderScene.children.findIndex((node) => node instanceof TextNode);
			expect(picture).toBeGreaterThanOrEqual(0);
			expect(caption).toBeGreaterThan(picture);
			if (repair) expect(overlay.map((track) => track.id)).toEqual([
				"user-top", captions!.id, visual!.id, "user-middle", "user-bottom",
			]);
			const again = placementInput(fixture.accepted.accepted, after.revision);
			again.idempotencyKey = "arrange-caption-stack-again";
			completed(await service.run(again));
			expect((await fixture.documents.load(input.editId))?.project.scenes[0]?.tracks.overlay.map((track) => track.id))
				.toEqual(overlay.map((track) => track.id));
		} finally { fixture.close(); }
	});

	test("stretches a still visual to the shot duration", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			input.shots = [input.shots[0]!];
			input.shots[0]!.durationSeconds = 4.5;
			input.shots[0]!.visual!.sourceDurationSeconds = 1.5;

			const result = completed(await new ProductionPlacementService(fixture.documents).run(input));
			const document = await fixture.documents.load(input.editId);
			if (!document) throw new Error("Missing stretched still edit");
			const visual = productionTracks(document).visual?.elements[0];
			if (!visual) throw new Error("Missing stretched still visual");

			expect(result.elements).toHaveLength(3);
			expect(mediaTimeToSeconds({ time: visual.duration })).toBe(4.5);
			expect(mediaTimeToSeconds({ time: visual.sourceDuration! })).toBe(4.5);
			expect(mediaTimeToSeconds({ time: visual.trimStart })).toBe(0);
			expect(mediaTimeToSeconds({ time: visual.trimEnd })).toBe(0);
			expect(visual.fit).toBe("cover");
		} finally { fixture.close(); }
	});

	test("allows a short video visual to leave a gap after its source ends", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			input.shots = [input.shots[0]!];
			input.shots[0]!.durationSeconds = 4.5;
			input.shots[0]!.visual!.mediaType = "video";
			input.shots[0]!.visual!.sourceDurationSeconds = 1.5;

			const result = completed(await new ProductionPlacementService(fixture.documents).run(input));
			const document = await fixture.documents.load(input.editId);
		if (!document) throw new Error("Missing short video edit");
		const visual = productionTracks(document).visual?.elements[0];
		if (!visual) throw new Error("Missing short video visual");
			expect(visual.type).toBe("video");
			expect(mediaTimeToSeconds({ time: visual.duration })).toBe(4.5);
			expect(mediaTimeToSeconds({ time: visual.sourceDuration! })).toBe(1.5);
			expect(result.elements).toHaveLength(3);
			expect(fixture.effects.updates).toBe(2);
		} finally { fixture.close(); }
	});

	test("refuses trims on still visuals as input-invalid", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			input.shots = [input.shots[0]!];
			input.shots[0]!.visual!.trimStartSeconds = 0.25;

			expect((await new ProductionPlacementService(fixture.documents).run(input)).data).toMatchObject({
				status: "refused",
				reason: "input-invalid",
				message: "Visual trims are not supported for still images",
			});
			expect(fixture.effects.updates).toBe(1);
		} finally { fixture.close(); }
	});

	test("refuses narration that exceeds a shorter stretched still", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			input.shots = [input.shots[0]!];
			input.shots[0]!.durationSeconds = 2.5;
			input.shots[0]!.visual!.sourceDurationSeconds = 1.5;

			expect((await new ProductionPlacementService(fixture.documents).run(input)).data).toMatchObject({
				status: "refused",
				reason: "invalid-bounds",
				message: "Narration extends beyond its picture",
			});
			expect(fixture.effects.updates).toBe(1);
		} finally { fixture.close(); }
	});

	test("command persists three parallel shots, replays once, and replaces only one visual", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			input.shots[0]!.visual!.mediaType = "video";
			input.shots[0]!.visual!.sourceDurationSeconds = 2;
			const commandInput = {
				...input,
				shots: input.shots.map((shot) => ({
					...shot,
					shotRevision: String(shot.shotRevision),
					narration: shot.narration ? { ...shot.narration, acceptedShotRevision: String(shot.narration.acceptedShotRevision) } : undefined,
				})),
			};
			const originals = { entities: { ...sdkEntities }, files: { ...sdkFiles } };
			Object.assign(sdkEntities, fixture.sdk.entities);
			Object.assign(sdkFiles, fixture.sdk.files);
			let first: ProductionPlacementResult;
			try {
				first = await arrangeTimelineCommand.run(commandInput);
			} finally {
				Object.assign(sdkEntities, originals.entities);
				Object.assign(sdkFiles, originals.files);
			}
			const firstData = completed(first);
			const writesAfterFirst = fixture.effects.updates;
			fixture.reopen();
			const reopened = await new ProductionDocumentService(fixture.sdk).load("edit-p10");
			if (!reopened) throw new Error("Missing reopened edit");
			const tracks = productionTracks(reopened);
			expect(firstData.revision).toEqual(reopened.revision);
			expect(firstData.elements).toHaveLength(9);
			expect(tracks.visual?.elements.map((element) => mediaTimeToSeconds({
				time: element.startTime,
			}))).toEqual([0, 3, 6]);
			expect(tracks.visual?.elements[0]?.type).toBe("video");
			expect(mediaTimeToSeconds({ time: tracks.visual!.elements[0]!.sourceDuration! })).toBe(2);
			expect(tracks.visual?.elements.slice(1).every((element) => element.type === "image")).toBe(true);
			expect(tracks.audio?.elements.map((element) => mediaTimeToSeconds({
				time: element.startTime,
			}))).toEqual([0, 3, 6]);
			expect(tracks.captions?.elements.map((element) => mediaTimeToSeconds({
				time: element.startTime,
			}))).toEqual([0.25, 3.25, 6.25]);
			expect(tracks.scene.tracks.main.elements[0]?.id).toBe("manual-visual");

			const retry = await new ProductionPlacementService(
				new ProductionDocumentService(fixture.sdk),
			).run(input);
			expect(completed(retry)).toEqual(firstData);
			expect(fixture.effects.updates).toBe(writesAfterFirst);

			const shot = fixture.accepted.accepted.shots[1];
			if (!shot) throw new Error("Missing second shot");
			const before = structuredClone(productionTracks(reopened));
			const replacement = placementInput(fixture.accepted.accepted, reopened.revision);
			replacement.idempotencyKey = "replace-shot-two-visual";
			replacement.shots = [{
				...replacement.shots[1]!,
				visual: { ...replacement.shots[1]!.visual!, mediaId: "image-2-v2", mediaRevision: "image-2-v2" },
				narration: undefined,
			}];
			const replaced = completed(await new ProductionPlacementService(
				new ProductionDocumentService(fixture.sdk),
			).run(replacement));
			const afterDocument = await new ProductionDocumentService(fixture.sdk).load("edit-p10");
			if (!afterDocument) throw new Error("Missing replaced edit");
			const after = productionTracks(afterDocument);
			const oldVisual = before.visual?.elements.find((element) => element.production?.shotId === shot.shotId);
			const newVisual = after.visual?.elements.find((element) => element.production?.shotId === shot.shotId);
			expect(newVisual).toMatchObject({ id: oldVisual?.id, mediaId: "image-2-v2" });
			expect(replaced.elements).toEqual([{ shotId: shot.shotId, role: "visual", trackId: after.visual?.id, elementId: oldVisual?.id }]);
			expect(after.audio).toEqual(before.audio);
			expect(after.captions).toEqual(before.captions);
			expect(after.scene.tracks.main).toEqual(before.scene.tracks.main);
		} finally {
			fixture.close();
		}
	});

	test("recovers an owner commit whose reply was lost without a second write", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			const owner = new ProductionDocumentService(fixture.sdk);
			const lostReplyOwner = {
				readCurrent: (editId: string) => owner.readCurrent(editId),
				readRevision: (args: { editId: string; intentRevision: string }) => owner.readRevision(args),
				save: async (args: Parameters<typeof owner.save>[0]) => {
					await owner.save(args);
					throw new Error("simulated reply loss");
				},
			};
			await expect(new ProductionPlacementService(lostReplyOwner).run(input)).rejects.toThrow(
				"simulated reply loss",
			);
			const writesAfterCommit = fixture.effects.updates;
			fixture.reopen();
			const retry = await new ProductionPlacementService(
				new ProductionDocumentService(fixture.sdk),
			).run(input);
			expect(completed(retry).elements).toHaveLength(9);
			expect(fixture.effects.updates).toBe(writesAfterCommit);
		} finally {
			fixture.close();
		}
	});

	test("stale/manual and mismatched audio inputs refuse with zero writes", async () => {
		const fixture = await acceptedFixture();
		try {
			const stale = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			const manualProject = structuredClone((await fixture.documents.load("edit-p10"))!.project);
			manualProject.metadata.name = "Manual rename";
			const manual = await fixture.documents.save({
				editId: "edit-p10",
				project: manualProject,
				expectedRevision: fixture.accepted.documentRevision,
			});
			const writesBeforeRefusals = fixture.effects.updates;
			const service = new ProductionPlacementService(
				new ProductionDocumentService(fixture.sdk),
			);
			expect((await service.run(stale)).data).toMatchObject({ status: "refused", reason: "revision-conflict" });
			const mismatch = placementInput(fixture.accepted.accepted, manual.revision);
			mismatch.idempotencyKey = "mismatched-audio";
			mismatch.shots[0]!.narration!.acceptedShotRevision += 1;
			expect((await service.run(mismatch)).data).toMatchObject({ status: "refused", reason: "accepted-source-mismatch" });
			const overflow = placementInput(fixture.accepted.accepted, manual.revision);
			overflow.idempotencyKey = "overflow-audio";
			overflow.shots[0]!.narration!.timelineOffsetSeconds = 1;
			expect((await service.run(overflow)).data).toMatchObject({ status: "refused", reason: "invalid-bounds" });
			expect(fixture.effects.updates).toBe(writesBeforeRefusals);
			expect((await fixture.documents.load("edit-p10"))?.project.metadata.name).toBe("Manual rename");
		} finally {
			fixture.close();
		}
	});
	test("exact reference guards and idempotency input changes cannot write", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			const service = new ProductionPlacementService(fixture.documents);
			const before = fixture.effects.updates;
			for (const field of ["editId", "intentRevision", "digest"] as const) {
				const invalid = structuredClone(input);
				invalid.expectedRevision[field] = "wrong-reference";
				expect((await service.run(invalid)).data).toMatchObject({ status: "refused", reason: "revision-conflict" });
			}
			for (const field of ["documentIntentRevision", "productionRevisionId", "contentDigest"] as const) {
				const invalid = structuredClone(input);
				invalid.acceptedRevision[field] = "wrong-source";
				expect((await service.run(invalid)).data).toMatchObject({ status: "refused", reason: "accepted-source-mismatch" });
			}
			expect(fixture.effects.updates).toBe(before);
			const first = completed(await service.run(input));
			const reordered = structuredClone(input);
			reordered.expectedRevision = {
				digest: input.expectedRevision.digest, intentRevision: input.expectedRevision.intentRevision,
				storageCasRevision: input.expectedRevision.storageCasRevision, editId: input.editId,
			};
			expect(completed(await service.run(reordered))).toEqual(first);
			const changed = structuredClone(input);
			changed.shots[0]!.visual!.mediaRevision = "different-version";
			expect((await service.run(changed)).data).toMatchObject({ status: "refused", reason: "idempotency-reused" });
			expect(fixture.effects.updates).toBe(before + 1);
		} finally { fixture.close(); }
	});

	test("persisted narration trim and offset map precise sub-minimum captions", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			input.shots = [input.shots[1]!];
			const narration = input.shots[0]!.narration!;
			narration.trimEndSeconds = 1;
			narration.timelineOffsetSeconds = 0.5;
			narration.alignment.segments = [{ text: "Brief", start: 0.75, end: 0.85 }];
			completed(await new ProductionPlacementService(fixture.documents).run(input));
			fixture.reopen();
			const document = await new ProductionDocumentService(fixture.sdk).load("edit-p10");
			if (!document) throw new Error("Missing persisted captions");
			const tracks = productionTracks(document);
			const audio = tracks.audio!.elements[0]!;
			const caption = tracks.captions!.elements[0]!;
			expect(mediaTimeToSeconds({ time: audio.startTime })).toBe(3.5);
			expect(mediaTimeToSeconds({ time: audio.duration })).toBe(2.5);
			expect(mediaTimeToSeconds({ time: audio.trimStart })).toBe(0.5);
			expect(mediaTimeToSeconds({ time: caption.startTime })).toBe(3.75);
			expect(mediaTimeToSeconds({ time: caption.duration })).toBeCloseTo(0.1, 6);
		} finally { fixture.close(); }
	});

	test("manual element identity reuse refuses rather than replacing user work", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			completed(await new ProductionPlacementService(fixture.documents).run(input));
			const current = await fixture.documents.load("edit-p10");
			if (!current) throw new Error("Missing edit");
			const tracks = productionTracks(current);
			const element = tracks.visual!.elements[0]!;
			delete element.production;
			element.name = "Manual repurposed element";
			const manual = await fixture.documents.save({
				editId: input.editId, project: current.project, expectedRevision: current.revision,
			});
			const replacement = { ...input, expectedRevision: manual.revision, idempotencyKey: "replace-manual" };
			const before = fixture.effects.updates;
			expect((await new ProductionPlacementService(fixture.documents).run(replacement)).data.status).toBe("refused");
			expect(fixture.effects.updates).toBe(before);
			expect((await fixture.documents.load("edit-p10"))?.project).toEqual(manual.project);
		} finally { fixture.close(); }
	});

	test("an intervening edit during replay validation prevents stale success", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			completed(await new ProductionPlacementService(fixture.documents).run(input));
			const owner = fixture.documents;
			const racingOwner = {
				readCurrent: (id: string) => owner.readCurrent(id),
				save: (args: Parameters<typeof owner.save>[0]) => owner.save(args),
				readRevision: async (args: Parameters<typeof owner.readRevision>[0]) => {
					const historical = await owner.readRevision(args);
					const current = await owner.load(input.editId);
					if (!current) throw new Error("Missing current edit");
					current.project.metadata.name = "Racing manual edit";
					await owner.save({ editId: input.editId, project: current.project, expectedRevision: current.revision });
					return historical;
				},
			};
			expect((await new ProductionPlacementService(racingOwner).run(input)).data).toMatchObject({
				status: "refused", reason: "revision-conflict",
			});
			expect((await owner.load(input.editId))?.project.metadata.name).toBe("Racing manual edit");
		} finally { fixture.close(); }
	});

	test("persists all 5,001 caption segments and refuses expansion beyond the result bound", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			input.shots = [input.shots[0]!];
			const shot = input.shots[0]!;
			shot.durationSeconds = 5_001;
			shot.visual!.sourceDurationSeconds = 5_001;
			const narration = shot.narration!;
			narration.sourceDurationSeconds = 5_001;
			narration.trimStartSeconds = 0;
			narration.trimEndSeconds = 0;
			narration.alignment.segments = Array.from({ length: 5_001 }, (_, index) => ({
				text: "Word", start: index, end: index + 1,
			}));
			const done = completed(await new ProductionPlacementService(fixture.documents).run(input));
			expect(done.elements).toHaveLength(5_003);
			fixture.reopen();
			const reopened = await new ProductionDocumentService(fixture.sdk).load(input.editId);
			if (!reopened) throw new Error("Missing captioned edit");
			const captions = productionTracks(reopened).captions!;
			expect(captions.elements).toHaveLength(5_001);
			expect(mediaTimeToSeconds({ time: captions.elements.at(-1)!.startTime })).toBe(5_000);
			const overflow = structuredClone(input);
			overflow.expectedRevision = reopened.revision;
			overflow.idempotencyKey = "caption-expansion";
			overflow.shots[0]!.narration!.alignment.segments =
				Array.from({ length: 1_000 }, (_, index) => ({
					text: "word ".repeat(150).trim(), start: index, end: index + 1,
				}));
			const before = fixture.effects.updates;
			expect((await new ProductionPlacementService(fixture.documents).run(overflow)).data.status).toBe("refused");
			expect(fixture.effects.updates).toBe(before);
		} finally { fixture.close(); }
	});

	test("narration replacement keeps identities and unrelated manually added captions", async () => {
		const fixture = await acceptedFixture();
		try {
			const input = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			completed(await new ProductionPlacementService(fixture.documents).run(input));
			const current = await fixture.documents.load(input.editId);
			if (!current) throw new Error("Missing edit");
			const tracks = productionTracks(current);
			const manualCaption = structuredClone(tracks.captions!.elements[0]!);
			delete manualCaption.production;
			manualCaption.id = "manual-caption";
			tracks.captions!.elements.push(manualCaption);
			const manual = await fixture.documents.save({ editId: input.editId, project: current.project, expectedRevision: current.revision });
			const replacement = placementInput(fixture.accepted.accepted, manual.revision);
			replacement.idempotencyKey = "replace-second-narration";
			replacement.shots = [replacement.shots[1]!];
			replacement.shots[0]!.visual = undefined;
			const narration = replacement.shots[0]!.narration!;
			narration.mediaId = "replacement-audio";
			narration.mediaRevision = "replacement-v2";
			narration.alignment.mediaId = narration.mediaId;
			narration.alignment.mediaRevision = narration.mediaRevision;
			narration.alignment.segments = [{ text: "Replacement", start: 0.5, end: 1.5 }];
			completed(await new ProductionPlacementService(fixture.documents).run(replacement));
			const after = await fixture.documents.load(input.editId);
			if (!after) throw new Error("Missing replacement");
			const result = productionTracks(after);
			expect(result.visual).toEqual(tracks.visual);
			expect(result.audio!.elements.map((element) => element.id)).toEqual(tracks.audio!.elements.map((element) => element.id));
			expect(result.captions!.elements.find((element) => element.id === manualCaption.id)).toEqual(manualCaption);
			const target = replacement.shots[0]!.shotId;
			expect(result.captions!.elements.filter((element) => element.production?.shotId !== target))
				.toEqual(tracks.captions!.elements.filter((element) => element.production?.shotId !== target));
		} finally { fixture.close(); }
	});

	test("competing placements from the same CAS have one durable winner", async () => {
		const fixture = await acceptedFixture();
		try {
			const left = placementInput(fixture.accepted.accepted, fixture.accepted.documentRevision);
			const right = structuredClone(left);
			right.idempotencyKey = "competing-placement";
			right.shots[0]!.visual!.mediaId = "competing-image";
			const before = fixture.effects.updates;
			const results = await Promise.all([left, right].map((input) =>
				new ProductionPlacementService(new ProductionDocumentService(fixture.sdk)).run(input)));
			expect(results.filter((result) => result.data.status === "completed")).toHaveLength(1);
			expect(results.filter((result) => result.data.status === "refused")).toHaveLength(1);
			expect(fixture.effects.updates).toBe(before + 1);
		} finally { fixture.close(); }
	});

});
