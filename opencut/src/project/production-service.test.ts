import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ProjectRpcError,
	type EntityCreateOptions,
	type EntityQuery,
	type EntityQueryResult,
	type EntityRecord,
	type EntityUpdateOptions,
	type FilesListEntry,
	type FilesPublishArgs,
} from "@ispo/sdk";
import { ProductionDocumentService } from "./production-document-service";
import { deriveAcceptedPlacementInput, ProductionService } from "./production-service";
import {
	ProductionIdempotencyError,
	ProductionRevisionSupersededError,
	type ProductionAnimationCandidate,
	type ProductionShotInput,
	type StoredProductionDocument,
} from "./production-types";
import type { SerializedProject } from "@/services/storage/types";
import type {
	EntityStorageApi,
	FilesStorageApi,
	StoredEntityValue,
} from "@/services/storage/sdk-adapter";

interface EntityRow {
	id: string;
	type: string;
	dataJson: string;
	version: number;
}

interface FixtureCounters {
	queries: number;
	creates: number;
	updates: number;
	deletes: number;
	files: number;
}

type ProjectEntityValue = StoredEntityValue<
	SerializedProject | StoredProductionDocument
>;

const cleanupPaths: string[] = [];

afterEach(async () => {
	await Promise.all(
		cleanupPaths.splice(0).map((path) => rm(path, { recursive: true })),
	);
});

function asRecord<T>(row: EntityRow): EntityRecord<T> {
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

function conflict(expectedVersion: number, actualVersion: number): ProjectRpcError {
	return new ProjectRpcError({
		code: "entity-version-conflict",
		message: `Expected ${expectedVersion}; actual ${actualVersion}`,
	});
}

function assertLosslessJson<T>(value: T): void {
	let encoded: string | undefined;
	try {
		encoded = JSON.stringify(value, (_key, nested) => {
			if (nested === undefined) throw new Error("undefined value");
			return nested;
		});
	} catch (error) {
		throw new Error(`Entity update payload is not lossless JSON: ${String(error)}`);
	}
	if (encoded === undefined) throw new Error("Entity update payload is not JSON");
	expect(JSON.parse(encoded)).toEqual(value);
}

function fixtureSdk(path: string, options: { enforceLossless?: boolean } = {}) {
	const fixtureOptions = options;
	const database = new Database(path, { create: true });
	database.exec(`
		CREATE TABLE entities (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			dataJson TEXT NOT NULL,
			version INTEGER NOT NULL
		);
	`);
	const counters: FixtureCounters = {
		queries: 0,
		creates: 0,
		updates: 0,
		deletes: 0,
		files: 0,
	};
	let loseUpdateReply = false;
	const entities: EntityStorageApi = {
		query<T>(type: string, query: EntityQuery = {}): Promise<EntityQueryResult<T>> {
			counters.queries += 1;
			const storageKey = query.where?.storageKey;
			const records = database
				.query<EntityRow, [string]>(
					"SELECT id, type, dataJson, version FROM entities WHERE type = ? ORDER BY id",
				)
				.all(type)
				.filter((row) => {
					if (storageKey === undefined) return true;
					const data: ProjectEntityValue = JSON.parse(row.dataJson);
					return data.storageKey === storageKey;
				})
				.map((row) => asRecord<T>(row))
				.slice(0, query.limit);
			return Promise.resolve({ records, cursor: null });
		},
		create<T>(
			type: string,
			data: T,
			options: EntityCreateOptions = {},
		): Promise<EntityRecord<T>> {
			if (fixtureOptions.enforceLossless) assertLosslessJson(data);
			counters.creates += 1;
			const id = options.id ?? crypto.randomUUID();
			try {
				database
					.query(
						"INSERT INTO entities (id, type, dataJson, version) VALUES (?, ?, ?, 1)",
					)
					.run(id, type, JSON.stringify(data));
			} catch {
				throw conflict(0, 1);
			}
			return Promise.resolve(
				asRecord<T>({
					id,
					type,
					dataJson: JSON.stringify(data),
					version: 1,
				}),
			);
		},
		update<T>(
			type: string,
			id: string,
			patch: Partial<T>,
			options: EntityUpdateOptions = {},
		): Promise<EntityRecord<T>> {
			if (fixtureOptions.enforceLossless) assertLosslessJson(patch);
			counters.updates += 1;
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
				throw conflict(options.expectedVersion, row.version);
			}
			const data = { ...JSON.parse(row.dataJson), ...patch };
			const version = row.version + 1;
			const result = database
				.query(
					"UPDATE entities SET dataJson = ?, version = ? WHERE type = ? AND id = ? AND version = ?",
				)
				.run(JSON.stringify(data), version, type, id, row.version);
			if (result.changes !== 1) throw conflict(row.version, version);
			if (loseUpdateReply) {
				loseUpdateReply = false;
				throw new Error("Entity update reply was lost");
			}
			return Promise.resolve(
				asRecord<T>({ id, type, dataJson: JSON.stringify(data), version }),
			);
		},
		delete<T>(type: string, id: string): Promise<EntityRecord<T>> {
			counters.deletes += 1;
			const row = database
				.query<EntityRow, [string, string]>(
					"SELECT id, type, dataJson, version FROM entities WHERE type = ? AND id = ?",
				)
				.get(type, id);
			if (!row) throw new Error(`Missing entity ${id}`);
			database.query("DELETE FROM entities WHERE type = ? AND id = ?").run(type, id);
			return Promise.resolve(asRecord<T>(row));
		},
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const files: FilesStorageApi = {
		list(): Promise<FilesListEntry[]> {
			return Promise.resolve([]);
		},
		publish(_args: FilesPublishArgs) {
			counters.files += 1;
			return Promise.reject(new Error("Production script fixture publishes no files"));
		},
	};
	return {
		counters,
		entities,
		files,
		loseNextUpdateReply: () => {
			loseUpdateReply = true;
		},
	};
}

function project(): SerializedProject {
	return {
		metadata: {
			id: "edit-1",
			name: "Explainer",
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

function shots(): ProductionShotInput[] {
	return [
		{
			clientKey: "opening",
			narration: "Meet the problem.",
			visualBrief: "A cluttered desk before sunrise.",
			durationMs: 4_000,
		},
		{
			clientKey: "turn",
			narration: "Then the workflow becomes clear.",
			visualBrief: "The desk resolves into an ordered timeline.",
			durationMs: 5_000,
		},
		{
			clientKey: "close",
			narration: "Finish with confidence.",
			visualBrief: "A polished export fills the screen.",
			durationMs: 6_000,
		},
	];
}

async function setup(options: { enforceLossless?: boolean } = { enforceLossless: true }) {
	const directory = await mkdtemp(join(tmpdir(), "opencut-production-service-"));
	cleanupPaths.push(directory);
	const sdk = fixtureSdk(join(directory, "production.sqlite"), options);
	const documents = new ProductionDocumentService(sdk);
	const created = await documents.save({
		editId: "edit-1",
		project: project(),
		expectedRevision: null,
	});
	return { ...sdk, documents, created };
}

function writeCount(counters: FixtureCounters): number {
	return counters.creates + counters.updates + counters.deletes + counters.files;
}

describe("production service", () => {
	test("accepts an empty narration placeholder while retaining visual validation", async () => {
		const fixture = await setup();
		const service = new ProductionService(fixture.documents);
		const draft = await service.saveScriptDraft({
			editId: "edit-1",
			expectedRevision: fixture.created.revision,
			script: "A visual-first script.",
			shots: [{ ...shots()[0]!, narration: "" }],
		});
		const accepted = await service.acceptScriptDraft({
			editId: "edit-1",
			expectedRevision: draft.documentRevision,
			idempotencyKey: "accept-empty-narration",
		});

		expect(accepted.accepted.shots[0]?.narration).toBe("");
	});

	test("script draft writes and acceptance use lossless JSON payloads", async () => {
		const fixture = await setup({ enforceLossless: true });
		const service = new ProductionService(fixture.documents);
		const draft = await service.saveScriptDraft({
			editId: "edit-1",
			expectedRevision: fixture.created.revision,
			script: "A lossless script.",
			shots: [
				{
					narration: "The payload stays JSON.",
					visualBrief: "A clean production plan.",
					durationMs: 4_000,
				},
			],
		});
		const accepted = await service.acceptScriptDraft({
			editId: "edit-1",
			expectedRevision: draft.documentRevision,
			idempotencyKey: "accept-lossless-script",
		});
		const graph = await service.recordDependencyGraph({
			reference: accepted.accepted.reference,
			expectedRevision: accepted.documentRevision,
			graph: {
				acceptedRevision: accepted.accepted.reference,
				edges: [{
					from: { kind: "script", id: "script", versionId: undefined },
					to: { kind: "render", id: "render", versionId: undefined },
				}],
				placements: [],
				renders: [{ renderId: "render", artifactId: undefined, operationId: undefined }],
			},
		});
		const media = await service.attachMediaVersion({
			reference: accepted.accepted.reference,
			expectedRevision: graph.documentRevision,
			shotId: accepted.accepted.shots[0]!.shotId,
			shotRevision: accepted.accepted.shots[0]!.revision,
			role: "visual",
			idempotencyKey: "lossless-image",
			version: {
				idempotencyKey: undefined,
				mediaId: "lossless-image",
				mediaRevision: "lossless-image-revision",
				name: "lossless.png",
				mediaType: "image",
				mimeType: "image/png",
				digest: "c".repeat(64),
				byteLength: 10,
				sourceDurationSeconds: 4,
			},
		});
		const regeneration = await service.commitRegenerationCandidates({
			reference: accepted.accepted.reference,
			expectedRevision: media.documentRevision,
			requestDigest: "lossless-regeneration-request",
			idempotencyKey: "lossless-regeneration",
			candidates: [{
				candidateId: "lossless-regeneration-candidate",
				acceptedRevision: accepted.accepted.reference,
				shotId: accepted.accepted.shots[0]!.shotId,
				shotRevision: accepted.accepted.shots[0]!.revision,
				role: "visual",
				brief: undefined,
				version: {
					idempotencyKey: undefined,
					mediaId: "regenerated-image",
					mediaRevision: "regenerated-image-revision",
					name: "regenerated.png",
					mediaType: "image",
					mimeType: "image/png",
					digest: "d".repeat(64),
					byteLength: 10,
					sourceDurationSeconds: 4,
				},
			}],
		});
		const acceptedVersion = await service.acceptRegenerationVersion({
			reference: accepted.accepted.reference,
			expectedRevision: regeneration.documentRevision,
			shotId: accepted.accepted.shots[0]!.shotId,
			shotRevision: accepted.accepted.shots[0]!.revision,
			role: "visual",
			idempotencyKey: "accept-lossless-regeneration",
			candidateId: "lossless-regeneration-candidate",
		});
		expect(accepted.accepted.script).toBe("A lossless script.");
		expect(media.accepted.shots[0]?.imageVersion?.idempotencyKey).toBeUndefined();
		expect(acceptedVersion.accepted.shots[0]?.imageVersion?.mediaId).toBe("regenerated-image");
	});

		test("derives a parallel three-shot placement plan from accepted media versions", async () => {
		const fixture = await setup();
		const service = new ProductionService(fixture.documents);
		const accepted = (await service.acceptRevision({
			editId: "edit-1",
			expectedRevision: fixture.created.revision,
			idempotencyKey: "accept-placement-plan",
			script: "Three shots.",
			shots: shots(),
		})).accepted;
		for (const shot of accepted.shots) {
			shot.imageVersion = {
				mediaId: `image-${shot.shotId}`,
				mediaRevision: `image-revision-${shot.shotId}`,
				name: `${shot.shotId}.png`,
				mediaType: "image",
				mimeType: "image/png",
				digest: "a".repeat(64),
				byteLength: 10,
				sourceDurationSeconds: shot.durationMs / 1000,
			};
			shot.narrationVersion = {
				...shot.imageVersion,
				mediaId: `audio-${shot.shotId}`,
				mediaRevision: `audio-revision-${shot.shotId}`,
				name: `${shot.shotId}.wav`,
				mediaType: "audio",
				mimeType: "audio/wav",
				sourceDurationSeconds: shot.durationMs / 1000,
				source: "voicebox",
				voiceboxGenerationRef: `voicebox-${shot.shotId}`,
				publishedFiles: { publicId: `files-${shot.shotId}` },
				acceptedRevision: accepted.reference,
				acceptedShotId: shot.shotId,
				acceptedShotRevision: shot.revision,
				alignment: [{ text: shot.narration, start: 0, end: shot.durationMs / 1000 }],
			};
		}
		const animatedShot = accepted.shots[0]!;
		animatedShot.animationVersion = {
			mediaId: "video-shot-one",
			mediaRevision: "video-revision-shot-one",
			name: "shot-one.mp4",
			mediaType: "video",
			mimeType: "video/mp4",
			digest: "v".repeat(64),
			byteLength: 20,
			sourceDurationSeconds: 8,
			motionBrief: "A slow push in.",
			sourceImage: {
				mediaId: animatedShot.imageVersion!.mediaId,
				mediaRevision: animatedShot.imageVersion!.mediaRevision,
				publicId: "still-one",
				digest: "a".repeat(64),
			},
		};
		const plan = deriveAcceptedPlacementInput({
			editId: "edit-1",
			expectedRevision: fixture.created.revision,
			accepted,
			idempotencyKey: "place-derived-plan",
		});
		expect(plan.shots.map((shot) => shot.startSeconds)).toEqual([0, 4, 9]);
		expect(plan.shots.every((shot) => shot.visual && shot.narration)).toBe(true);
		expect(plan.shots[0]?.visual).toMatchObject({ mediaId: "video-shot-one", mediaType: "video", sourceDurationSeconds: 8, trimEndSeconds: 4 });
		expect(plan.shots.map((shot) => shot.narration?.alignment.segments[0]?.text)).toEqual([
			"Meet the problem.",
			"Then the workflow becomes clear.",
			"Finish with confidence.",
		]);
	});

	test("attaches one revision-bound media version and replays the same idempotency key", async () => {
		const fixture = await setup();
		const service = new ProductionService(fixture.documents);
		const acceptedResult = await service.acceptRevision({
			editId: "edit-1",
			expectedRevision: fixture.created.revision,
			idempotencyKey: "accept-media",
			script: "One shot.",
			shots: [shots()[0]!],
		});
		const shot = acceptedResult.accepted.shots[0]!;
		const version = {
			idempotencyKey: "import-image-once",
			mediaId: "production-media-image",
			mediaRevision: "image-digest",
			name: "shot.png",
			mediaType: "image" as const,
			mimeType: "image/png" as const,
			digest: "b".repeat(64),
			byteLength: 12,
			sourceDurationSeconds: shot.durationMs / 1000,
		};
		const attached = await service.attachMediaVersion({
			reference: acceptedResult.accepted.reference,
			expectedRevision: acceptedResult.documentRevision,
			shotId: shot.shotId,
			shotRevision: shot.revision,
			role: "visual",
			version,
			idempotencyKey: "import-image-once",
		});
		const writes = fixture.counters.updates;
		const replay = await service.attachMediaVersion({
			reference: acceptedResult.accepted.reference,
			expectedRevision: acceptedResult.documentRevision,
			shotId: shot.shotId,
			shotRevision: shot.revision,
			role: "visual",
			version,
			idempotencyKey: "import-image-once",
		});
		expect(attached.accepted.shots[0]?.imageVersion).toEqual(version);
		expect(replay.documentRevision).toEqual(attached.documentRevision);
		expect(fixture.counters.updates).toBe(writes);
	});

	test("records and accepts an animation candidate only for its accepted still", async () => {
		const fixture = await setup();
		const service = new ProductionService(fixture.documents);
		const accepted = await service.acceptRevision({
			editId: "edit-1",
			expectedRevision: fixture.created.revision,
			idempotencyKey: "accept-animation",
			script: "One animated shot.",
			shots: [shots()[0]!],
		});
		const shot = accepted.accepted.shots[0]!;
		const imageVersion = {
			mediaId: "still-media",
			mediaRevision: "still-revision",
			name: "still.png",
			mediaType: "image" as const,
			mimeType: "image/png" as const,
			digest: "s".repeat(64),
			byteLength: 10,
			sourceDurationSeconds: shot.durationMs / 1000,
			filesRef: { publicId: "still-public-id", revision: "still-files-revision" },
		};
		const withImage = await service.attachMediaVersion({
			reference: accepted.accepted.reference,
			expectedRevision: accepted.documentRevision,
			shotId: shot.shotId,
			shotRevision: shot.revision,
			role: "visual",
			idempotencyKey: "attach-still",
			version: imageVersion,
		});
		const candidate: ProductionAnimationCandidate = {
			kind: "scene-video",
			idempotencyKey: "animate-once",
			motionBrief: "A slow push in.",
			sourceImage: { mediaId: imageVersion.mediaId, mediaRevision: imageVersion.mediaRevision, publicId: "still-public-id", revision: "still-files-revision", digest: imageVersion.digest },
			mediaId: "video-media",
			mediaRevision: "video-revision",
			dimensions: { width: 1920, height: 1080 },
			acceptedRevision: accepted.accepted.reference,
			shotId: shot.shotId,
			shotRevision: shot.revision,
			resource: { kind: "files", publicId: "video-public-id", path: "/video.mp4", digest: "v".repeat(64), byteLength: 20, mimeType: "video/mp4", durationSeconds: 4, dimensions: { width: 1920, height: 1080 } },
		};
		const recorded = await service.recordAnimationCandidates({ reference: accepted.accepted.reference, expectedRevision: withImage.documentRevision, candidates: [candidate] });
		const acceptedVideo = await service.acceptAnimationVersion({ reference: accepted.accepted.reference, expectedRevision: recorded.documentRevision, shotId: shot.shotId, shotRevision: shot.revision, idempotencyKey: "accept-animation-once", candidateId: candidate.idempotencyKey });
		expect(acceptedVideo.accepted.shots[0]?.animationVersion).toMatchObject({ mediaId: "video-media", mediaType: "video", motionBrief: "A slow push in.", sourceImage: candidate.sourceImage });
	});

	test("accepted revisions persist with stable shot identities and exact read-only history", async () => {
		const fixture = await setup();
		const service = new ProductionService(fixture.documents);
		const first = await service.acceptRevision({
			editId: "edit-1",
			expectedRevision: fixture.created.revision,
			idempotencyKey: "accept-v1",
			script: "A concise three-shot explainer.",
			shots: shots(),
		});
		expect(first.accepted.targetDurationMs).toBe(15_000);
		expect(first.accepted.shots.map((shot) => shot.shotId)).toHaveLength(3);

		const [opening, turn, close] = first.accepted.shots;
		const revised = await service.acceptRevision({
			editId: "edit-1",
			expectedRevision: first.documentRevision,
			idempotencyKey: "accept-v2",
			script: "A concise three-shot explainer.",
			shots: [
				{ ...shots()[2], shotId: close.shotId },
				{
					...shots()[1],
					shotId: turn.shotId,
					visualBrief: "The timeline snaps into a calm, ordered sequence.",
				},
				{ ...shots()[0], shotId: opening.shotId },
			],
		});
		expect(revised.accepted.shots.map((shot) => shot.shotId)).toEqual([
			close.shotId,
			turn.shotId,
			opening.shotId,
		]);
		expect(revised.accepted.shots.map((shot) => shot.revision)).toEqual([1, 2, 1]);

		const writesBeforeDiscussion = writeCount(fixture.counters);
		const current = await service.load("edit-1");
		const historical = await service.readAcceptedRevision(first.accepted.reference);
		expect(current?.accepted).toEqual(revised.accepted);
		expect(historical).toEqual(first.accepted);
		expect(writeCount(fixture.counters)).toBe(writesBeforeDiscussion);

		const replacement = new ProductionService(
			new ProductionDocumentService({
				entities: fixture.entities,
				files: fixture.files,
			}),
		);
		expect((await replacement.load("edit-1"))?.accepted).toEqual(revised.accepted);
	});

	test("accept and submit replay after a lost reply without another durable effect", async () => {
		const fixture = await setup();
		const service = new ProductionService(fixture.documents);
		fixture.loseNextUpdateReply();
		const accepted = await service.acceptRevision({
			editId: "edit-1",
			expectedRevision: fixture.created.revision,
			idempotencyKey: "accept-after-loss",
			script: "Persist this accepted script.",
			shots: shots(),
		});
		const updatesAfterAccept = fixture.counters.updates;
		const acceptedRetry = await service.acceptRevision({
			editId: "edit-1",
			expectedRevision: fixture.created.revision,
			idempotencyKey: "accept-after-loss",
			script: "Persist this accepted script.",
			shots: shots(),
		});
		expect(acceptedRetry.accepted).toEqual(accepted.accepted);
		expect(fixture.counters.updates).toBe(updatesAfterAccept);

		fixture.loseNextUpdateReply();
		const submitted = await service.submitProductionIntent({
			reference: accepted.accepted.reference,
			expectedRevision: accepted.documentRevision,
			idempotencyKey: "submit-production",
			unresolvedQuestionRefs: ["question-camera", "question-tone", "question-camera"],
		});
		expect(submitted.intent.unresolvedQuestionRefs).toEqual([
			"question-camera",
			"question-tone",
		]);
		const updatesAfterSubmit = fixture.counters.updates;
		const retry = await service.submitProductionIntent({
			reference: accepted.accepted.reference,
			expectedRevision: accepted.documentRevision,
			idempotencyKey: "submit-production",
			unresolvedQuestionRefs: ["question-tone", "question-camera"],
		});
		expect(retry.intent).toEqual(submitted.intent);
		expect(fixture.counters.updates).toBe(updatesAfterSubmit);
		expect((await service.load("edit-1"))?.actionIntents).toEqual([
			submitted.intent,
		]);

		await expect(
			service.submitProductionIntent({
				reference: accepted.accepted.reference,
				expectedRevision: accepted.documentRevision,
				idempotencyKey: "submit-production",
				unresolvedQuestionRefs: ["question-different"],
			}),
		).rejects.toBeInstanceOf(ProductionIdempotencyError);
		expect(fixture.counters.updates).toBe(updatesAfterSubmit);
	});

	test("a superseded accepted reference is refused before the producer runs", async () => {
		const fixture = await setup();
		const service = new ProductionService(fixture.documents);
		const first = await service.acceptRevision({
			editId: "edit-1",
			expectedRevision: fixture.created.revision,
			idempotencyKey: "accept-original",
			script: "Original script.",
			shots: shots(),
		});
		const revisedShots = first.accepted.shots.map((shot, index) => ({
			...shots()[index],
			shotId: shot.shotId,
		}));
		const second = await service.acceptRevision({
			editId: "edit-1",
			expectedRevision: first.documentRevision,
			idempotencyKey: "accept-current",
			script: "Current script.",
			shots: revisedShots,
		});
		let producerCalls = 0;
		const writesBeforeGuard = writeCount(fixture.counters);
		await expect(
			service.runWithAcceptedRevision({
				reference: first.accepted.reference,
				run: () => {
					producerCalls += 1;
				},
			}),
		).rejects.toBeInstanceOf(ProductionRevisionSupersededError);
		expect(producerCalls).toBe(0);
		expect(writeCount(fixture.counters)).toBe(writesBeforeGuard);

		const result = await service.runWithAcceptedRevision({
			reference: second.accepted.reference,
			run: (revision) => {
				producerCalls += 1;
				return revision.reference.productionRevisionId;
			},
		});
		expect(result).toBe(second.accepted.reference.productionRevisionId);
		expect(producerCalls).toBe(1);
	});
});
