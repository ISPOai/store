import { describe, expect, test } from "bun:test";
import type { EntityCreateOptions, EntityQuery, EntityQueryResult, EntityRecord, EntityUpdateOptions, FilesListEntry, HostApi } from "@ispo/sdk";
import type { EntityStorageApi, FilesStorageApi, StoredEntityValue } from "@/services/storage/sdk-adapter";
import type { SerializedProject } from "@/services/storage/types";
import type { ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import type { ProductionPendingJobPollerSdk } from "./production-pending-job-poller";
import { ProductionPendingJobPoller } from "./production-pending-job-poller";
import { ProductionDocumentService } from "./production-document-service";
import { ProductionService } from "./production-service";
import type { StoredProductionDocument } from "./production-types";

const editId = "poller-edit";
const acceptedRevision = { editId, documentIntentRevision: "1", productionRevisionId: "production-1", contentDigest: "production-digest" };
const revision = { editId, storageCasRevision: "1", intentRevision: "1", digest: "edit-digest" };

function imageFile(bytes: Uint8Array): FilesListEntry {
	return {
		publicId: "poller-image",
		path: "OpenCut/poller/shot-1.png",
		name: "shot-1.png",
		mimeType: "image/png",
		size: bytes.byteLength,
		folder: "OpenCut/poller",
		kind: "image",
		url: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`,
	};
}

function sdkFixture(
	states: Array<Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>>,
	pendingJobs = [{ role: "visual" as const, status: "pending" as const, jobRef: "poller-job", idempotencyKey: "poller-idempotency", pendingSince: "1970-01-01T00:00:00.000Z", acceptedRevision, shotId: "shot-1", shotRevision: 1, visualBrief: "One" }],
	shotIds: string[] = [],
): { sdk: ProductionPendingJobPollerSdk; stored: () => StoredProductionDocument; calls: () => number } {
	const accepted = {
		reference: acceptedRevision,
		script: "One shot",
		shots: [...new Set(["shot-1", ...shotIds, ...pendingJobs.map((job) => job.shotId)])].map((shotId) => ({ shotId, revision: 1, narration: shotId, visualBrief: shotId, durationMs: 1_000 })),
		targetDurationMs: 1_000,
		canvas: { width: 1_920, height: 1_080 },
		fps: { numerator: 30, denominator: 1 },
		pendingJobs,
	};
	const project: SerializedProject = {
		metadata: { id: editId, name: "Poller", duration: 1, createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" },
		scenes: [], currentSceneId: "", version: 32,
		settings: { fps: accepted.fps, canvasSize: accepted.canvas, background: { type: "color", color: "#000000" }, production: { formatVersion: 1, accepted, acceptanceReceipts: [], actionIntents: [] },
		},
	};
	let row: StoredProductionDocument = { ...project, kind: "opencut.production-document", formatVersion: 1, editId, currentIntentRevision: "1", snapshots: [{ intentRevision: "1", digest: revision.digest, project }] };
	let entityVersion = 1;
	const entities: EntityStorageApi = {
		query<T>(type: string, query: EntityQuery = {}): Promise<EntityQueryResult<T>> {
			const records = type === "opencut.project" && query.where?.storageKey === editId
				? [{ id: "poller-row", type, version: entityVersion, data: { storageKey: editId, value: row }, createdBy: { kind: "project", id: "test" }, updatedBy: { kind: "project", id: "test" }, createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" } as EntityRecord<T>]
				: [];
			return Promise.resolve({ records, cursor: null });
		},
		create<T>(_type: string, _data: T, _options: EntityCreateOptions = {}): Promise<EntityRecord<T>> { throw new Error("Unexpected create"); },
		update<T>(_type: string, _id: string, patch: Partial<T>, _options: EntityUpdateOptions = {}): Promise<EntityRecord<T>> {
			const value = (patch as Partial<StoredEntityValue<StoredProductionDocument>>).value;
			if (!value) throw new Error("Expected a complete production document");
			row = value;
			entityVersion += 1;
			return Promise.resolve({ id: "poller-row", type: "opencut.project", version: entityVersion, data: { storageKey: editId, value: row } } as EntityRecord<T>);
		},
		delete<T>(_type: string, _id: string): Promise<EntityRecord<T>> { throw new Error("Unexpected delete"); },
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const bytes = new Uint8Array([1, 2, 3, 4]);
	const digest = "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a";
	const files: FilesStorageApi = { list: async () => [imageFile(bytes)], publish: async () => ({ publicId: "published", path: "OpenCut/published" }) };
	let calls = 0;
	const sdk = {
		entities,
		files,
		host: {
			cloudJobs: { get: async () => { calls += 1; return states.shift()!; } },
			storyboardImage: { generate: async () => { throw new Error("The poller should resume the persisted job"); } },
			narration: { generate: async () => { throw new Error("Unexpected narration generation"); } },
			sceneVideo: { generate: async () => { throw new Error("Unexpected animation generation"); } },
		},
	} as ProductionPendingJobPollerSdk;
	return { sdk, stored: () => structuredClone(row), calls: () => calls };
}

describe("mounted production pending-job poller", () => {
	test("resumes a persisted image job after reload, imports Files, and clears pending", async () => {
		const states = [{ state: "awaiting-consent" }, {
			state: "succeeded",
			model: { modelKey: "image-model", modelVersion: "2026-09" },
			artifacts: [{ kind: "image", sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a", byteLength: 4, resource: { owner: { store: "files", resourceRef: "poller-image" }, mediaType: "image/png", byteLength: 4, sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a", dimensions: { width: 1_920, height: 1_080 } } }],
		} as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>];
		const { sdk, stored, calls } = sdkFixture(states);
		const imported: string[] = [];
		const media: ProductionMediaLibrary = { import: async (input) => { imported.push(input.mediaId); return { id: input.mediaId, name: input.name, type: "image", file: input.file, width: input.width, height: input.height }; } };
		const poller = new ProductionPendingJobPoller(sdk, media, { wakeDelayMs: 60_000, now: () => 0, waitForPoll: async () => undefined });
		const stop = poller.start(editId);
		for (let attempt = 0; attempt < 1_000 && (stored().settings.production?.accepted?.shots[0]?.imageCandidates?.length !== 1 || stored().settings.production?.accepted?.pendingJobs !== undefined); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
		stop();
		expect(calls()).toBe(2);
		expect(imported).toHaveLength(1);
		const candidate = stored().settings.production?.accepted?.shots[0]?.imageCandidates?.[0];
		expect(candidate).toMatchObject({ candidateId: "poller-idempotency", mediaId: expect.stringMatching(/^production-media-/), version: { mediaRevision: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a" } });
		expect(stored().settings.production?.accepted?.pendingJobs).toBeUndefined();
	});

	test("terminalizes a typed refusal and logs its shot and Cloud job details", async () => {
		const digest = "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a";
		const succeeded = {
			state: "succeeded",
			model: { modelKey: "image-model", modelVersion: "2026-09" },
			artifacts: [{ kind: "image", sha256: digest, byteLength: 4, resource: { owner: { store: "files", resourceRef: "poller-image" }, mediaType: "image/png", byteLength: 4, sha256: digest, dimensions: { width: 1_920, height: 1_080 } } }],
		} as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		const { sdk, stored } = sdkFixture([succeeded], [{ role: "visual", status: "pending", jobRef: "shot-02-job", idempotencyKey: "shot-02-key", pendingSince: Date.now(), acceptedRevision, shotId: "shot-2", shotRevision: 1, visualBrief: "Two" }]);
		sdk.files.list = async () => [];
		const failureMessage = "Storyboard image collection failed: Error: Cloud image job succeeded without a readable Files image.";
		const logs: Array<Record<string, unknown>> = [];
		const originalInfo = console.info;
		console.info = (...args: Parameters<typeof console.info>) => {
			const fields = args[1];
			if (fields && typeof fields === "object" && !Array.isArray(fields)) logs.push(fields as Record<string, unknown>);
		};
		const poller = new ProductionPendingJobPoller(sdk, { import: async () => { throw new Error("The refused job must not import"); } }, { wakeDelayMs: 60_000, waitForPoll: async () => undefined });
		try {
			poller.start(editId);
			for (let attempt = 0; attempt < 1_000 && stored().settings.production?.accepted?.pendingJobs?.[0]?.status !== "failed"; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
		} finally {
			poller.stop();
			console.info = originalInfo;
		}
		const failed = stored().settings.production?.accepted?.pendingJobs?.[0];
		expect(failed).toMatchObject({ status: "failed", failureReason: "producer-failed", failureMessage: failureMessage });
		const collectLog = logs.find((fields) => fields.outcome === "failed" && fields.shotId === "shot-2");
		expect(collectLog).toMatchObject({ shotId: "shot-2", jobRef: "shot-02-job", reason: "producer-failed", message: failureMessage });
		const loopLog = logs.find((fields) => fields.lastError && typeof fields.lastError === "object");
		expect(loopLog).toMatchObject({ lastError: { shotId: "shot-2", jobRef: "shot-02-job", reason: "producer-failed" } });
	});

	test("collects shot-01 and shot-02 sequentially from the same document", async () => {
		const digest = "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a";
		const succeeded = {
			state: "succeeded",
			model: { modelKey: "image-model", modelVersion: "2026-09" },
			artifacts: [{ kind: "image", sha256: digest, byteLength: 4, resource: { owner: { store: "files", resourceRef: "poller-image" }, mediaType: "image/png", byteLength: 4, sha256: digest, dimensions: { width: 1_920, height: 1_080 } } }],
		} as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		const pendingJobs = ["shot-1", "shot-2"].map((shotId) => ({ role: "visual" as const, status: "pending" as const, jobRef: `${shotId}-job`, idempotencyKey: `${shotId}-key`, pendingSince: Date.now(), acceptedRevision, shotId, shotRevision: 1, visualBrief: shotId }));
		const { sdk, stored, calls } = sdkFixture([succeeded, succeeded], pendingJobs);
		const imported: string[] = [];
		const poller = new ProductionPendingJobPoller(sdk, { import: async (input) => { imported.push(input.mediaId); return { id: input.mediaId, name: input.name, type: "image", file: input.file, width: input.width, height: input.height }; } }, { wakeDelayMs: 60_000, waitForPoll: async () => undefined });
		const stop = poller.start(editId);
		for (let attempt = 0; attempt < 1_000 && stored().settings.production?.accepted?.pendingJobs !== undefined; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
		stop();
		expect(calls()).toBe(2);
		expect(imported).toHaveLength(2);
		expect(stored().settings.production?.accepted?.shots[0]?.imageCandidates).toHaveLength(1);
		expect(stored().settings.production?.accepted?.shots[1]?.imageCandidates).toHaveLength(1);
		expect(stored().settings.production?.accepted?.pendingJobs).toBeUndefined();
	});

	test("collects one bound duplicate and clears the other pending record", async () => {
		const succeeded = {
			state: "succeeded",
			model: { modelKey: "flux-schnell", modelVersion: "2026-09-12" },
			artifacts: [{ kind: "image", sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a", byteLength: 4, resource: { owner: { store: "files", resourceRef: "poller-image" }, mediaType: "image/png", byteLength: 4, sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a", dimensions: { width: 1_920, height: 1_080 } } }],
		} as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		const duplicate = { role: "visual" as const, status: "pending" as const, jobRef: "duplicate-job", idempotencyKey: "duplicate-idempotency", pendingSince: "1970-01-01T00:00:00.000Z", acceptedRevision, shotId: "shot-1", shotRevision: 1, visualBrief: "Changed retry wording" };
		const { sdk, stored, calls } = sdkFixture([succeeded], [
			{ role: "visual", status: "pending", jobRef: "poller-job", idempotencyKey: "poller-idempotency", pendingSince: "1970-01-01T00:00:00.000Z", acceptedRevision, shotId: "shot-1", shotRevision: 1, visualBrief: "One" },
			duplicate,
		]);
		const imported: string[] = [];
		const media: ProductionMediaLibrary = { import: async (input) => { imported.push(input.mediaId); return { id: input.mediaId, name: input.name, type: "image", file: input.file, width: input.width, height: input.height }; } };
		const poller = new ProductionPendingJobPoller(sdk, media, { wakeDelayMs: 60_000, now: () => 0, waitForPoll: async () => undefined });
		const stop = poller.start(editId);
		for (let attempt = 0; attempt < 1_000 && stored().settings.production?.accepted?.pendingJobs !== undefined; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
		stop();
		expect(calls()).toBe(1);
		expect(imported).toHaveLength(1);
		expect(stored().settings.production?.accepted?.shots[0]?.imageCandidates).toHaveLength(1);
		expect(stored().settings.production?.accepted?.pendingJobs).toBeUndefined();
	});

	test("backs off pending consent checks from 3 seconds to 15 seconds", async () => {
		const awaitingConsent = { state: "awaiting-consent" } as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		const { sdk } = sdkFixture([awaitingConsent, awaitingConsent, awaitingConsent, awaitingConsent]);
		const delays: number[] = [];
		const poller = new ProductionPendingJobPoller(sdk, { import: async () => { throw new Error("Unexpected import"); } }, {
			now: () => 0,
			waitForPoll: async () => { throw new Error("Stop this single consent observation"); },
			waitForWake: async (delayMs) => {
				delays.push(delayMs);
				if (delays.length === 4) poller.stop();
			},
		});
		poller.start(editId);
		for (let attempt = 0; attempt < 1_000 && delays.length < 4; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
		expect(delays).toEqual([3_000, 6_000, 12_000, 15_000]);
	});

	test("a fresh document service reads pending jobs written by another service instance", async () => {
		const pendingJobs = ["shot-01", "shot-02", "shot-03"].map((shotId, index) => ({
			role: "visual" as const,
			status: "pending" as const,
			jobRef: `job-${shotId}`,
			idempotencyKey: `key-${shotId}`,
			pendingSince: "2026-09-13T06:59:07.000Z",
			acceptedRevision,
			shotId,
			shotRevision: 1,
			visualBrief: `Shot ${index + 1}`,
		}));
		const { sdk } = sdkFixture([], [], ["shot-01", "shot-02", "shot-03"]);
		const initialReader = new ProductionService(new ProductionDocumentService(sdk));
		expect((await initialReader.load(editId))?.accepted?.pendingJobs).toHaveLength(0);
		const writer = new ProductionService(new ProductionDocumentService(sdk));
		let expectedRevision = revision;
		for (const pendingJob of pendingJobs) {
			const saved = await writer.recordPendingJob({ reference: acceptedRevision, expectedRevision, pendingJob });
			expectedRevision = saved.documentRevision;
		}
		const freshReader = new ProductionService(new ProductionDocumentService(sdk));
		expect((await freshReader.load(editId))?.accepted?.pendingJobs).toHaveLength(3);
	});

	test("start on a new edit aborts the previous loop", async () => {
		const { sdk } = sdkFixture([], []);
		let firstWakeSignal: AbortSignal | undefined;
		const poller = new ProductionPendingJobPoller(sdk, { import: async () => { throw new Error("Unexpected import"); } }, {
			waitForWake: async (_delayMs, signal) => {
				if (!firstWakeSignal) firstWakeSignal = signal;
				await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
			},
		});
		poller.start(editId);
		for (let attempt = 0; attempt < 1_000 && !firstWakeSignal; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
		poller.start("another-edit");
		expect(firstWakeSignal?.aborted).toBe(true);
		poller.stop();
	});
});
