import { describe, expect, test } from "bun:test";
import type { EntityCreateOptions, EntityQuery, EntityQueryResult, EntityRecord, EntityUpdateOptions, FilesListEntry, HostApi } from "@ispo/sdk";
import type { EntityStorageApi, FilesStorageApi, StoredEntityValue } from "@/services/storage/sdk-adapter";
import type { SerializedProject } from "@/services/storage/types";
import type { StoredProductionDocument } from "./production-types";
import type { ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import { ProductionDocumentService } from "./production-document-service";
import { ProductionService } from "./production-service";
import { runProductionAnimateCommand, selectAnimationPendingJob, type ProductionAnimationSdk } from "./production-animation-command";
import type { ProductionAnimateInput } from "@/services/project-command-types";

const revision = { editId: "edit-animation", storageCasRevision: "1", intentRevision: "1", digest: "edit-digest" };
const acceptedRevision = { editId: "edit-animation", documentIntentRevision: "1", productionRevisionId: "production-1", contentDigest: "production-digest" };

async function digest(bytes: Uint8Array): Promise<string> {
	const value = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fixture(bytes: Uint8Array, durationMs = 3_000): ProductionAnimationSdk & { stored: () => StoredProductionDocument; calls: Array<Record<string, unknown>> } {
	const accepted = {
		reference: acceptedRevision,
		script: "One shot",
		shots: [{ shotId: "shot-1", revision: 1, narration: "One", visualBrief: "One", motionBrief: "Slow pan", durationMs, imageVersion: { mediaId: "still-1", mediaRevision: "still-revision", name: "still.png", mediaType: "image" as const, mimeType: "image/png" as const, digest: "still-digest", byteLength: 10, sourceDurationSeconds: 1, filesRef: { publicId: "still-file" } } }],
		targetDurationMs: durationMs,
		canvas: { width: 1_920, height: 1_080 },
		fps: { numerator: 30, denominator: 1 },
	};
	const project: SerializedProject = { metadata: { id: revision.editId, name: "Animation", duration: durationMs / 1_000, createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" }, scenes: [], currentSceneId: "", version: 32, settings: { fps: { numerator: 30, denominator: 1 }, canvasSize: { width: 1_920, height: 1_080 }, background: { type: "color", color: "#000000" }, production: { formatVersion: 1, accepted, acceptanceReceipts: [], actionIntents: [] } } };
	let row: StoredProductionDocument = { ...project, kind: "opencut.production-document", formatVersion: 1, editId: revision.editId, currentIntentRevision: "1", snapshots: [{ intentRevision: "1", digest: revision.digest, project }] };
	let version = 1;
	const entities: EntityStorageApi = {
		query<T>(type: string, query: EntityQuery = {}): Promise<EntityQueryResult<T>> {
			const records = type === "opencut.project" && query.where?.storageKey === revision.editId ? [{ id: "project-row", type, version, data: { storageKey: revision.editId, value: row }, createdBy: { kind: "project", id: "test" }, updatedBy: { kind: "project", id: "test" }, createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" } as EntityRecord<T>] : [];
			return Promise.resolve({ records, cursor: null });
		},
		create<T>(_type: string, _data: T, _options: EntityCreateOptions = {}): Promise<EntityRecord<T>> { throw new Error("Unexpected create"); },
		update<T>(_type: string, _id: string, patch: Partial<T>, _options: EntityUpdateOptions = {}): Promise<EntityRecord<T>> {
			const value = (patch as Partial<StoredEntityValue<StoredProductionDocument>>).value;
			if (!value) throw new Error("Expected a production document");
			row = value;
			version += 1;
			return Promise.resolve({ id: "project-row", type: "opencut.project", version, data: { storageKey: revision.editId, value: row } } as EntityRecord<T>);
		},
		delete<T>(_type: string, _id: string): Promise<EntityRecord<T>> { throw new Error("Unexpected delete"); },
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const entry: FilesListEntry = { publicId: "animation-file", path: "OpenCut/animation/shot-1.mp4", name: "shot-1.mp4", mimeType: "video/mp4", size: bytes.byteLength, folder: "OpenCut/animation", kind: "video", url: `data:video/mp4;base64,${btoa(String.fromCharCode(...bytes))}` };
	const calls: Array<Record<string, unknown>> = [];
	const files: FilesStorageApi & { media: { read: () => Promise<never> } } = { list: async () => [entry], publish: async () => ({ publicId: "published", path: "OpenCut/published" }), media: { read: async () => { throw new Error("Unexpected media read"); } } };
	return { entities, files, calls, stored: () => structuredClone(row), host: { sceneVideo: { generate: async (input) => { calls.push(input); throw { code: "pending", jobRef: "animation-job-1", message: "Error invoking remote method 'project-call': pending" }; } } } };
}

describe("pollable scene animation generation", () => {
	test("selects a newer active job over an older failed retained job", () => {
		const base = { role: "animation" as const, acceptedRevision, shotId: "shot-1", shotRevision: 1, pendingSince: 1 };
		const selected = selectAnimationPendingJob([
			{ ...base, status: "failed", jobRef: "old-failed", idempotencyKey: "old", failureReason: "producer-failed" },
			{ ...base, status: "pending", jobRef: "new-pending", idempotencyKey: "new", pendingSince: 2 },
		], { shotId: "shot-1", revision: 1 }, acceptedRevision);
		expect(selected?.jobRef).toBe("new-pending");
	});
	test("recognizes direct, nested, and legacy message pending host errors", async () => {
		const errors: unknown[] = [
			{ code: "pending", jobRef: "direct-animation-job" },
			{ rpcError: { code: "pending", jobRef: "nested-animation-job" } },
			new Error("Error invoking remote method 'project-call': Scene animation generation is still running as managed Cloud job 'message-animation-job'; resume it."),
		];
		for (const error of errors) {
			const sdk = fixture(new Uint8Array([1, 2, 3, 4]));
			sdk.host.sceneVideo.generate = async () => { throw error; };
			const input: ProductionAnimateInput = { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"] };
			const result = await runProductionAnimateCommand(input, sdk);
			expect(result.data.status).toBe("pending");
			expect(result.data.message).not.toContain("Error invoking remote method");
		}
	});

	test("preserves a bounded producer diagnostic without the IPC wrapper", async () => {
		const sdk = fixture(new Uint8Array([1, 2, 3, 4]));
		sdk.host.sceneVideo.generate = async () => { throw new Error("Error invoking remote method 'project-call': provider exploded"); };
		const input: ProductionAnimateInput = { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"] };
		const result = await runProductionAnimateCommand(input, sdk);
		expect(result.data).toMatchObject({ status: "refused", reason: "producer-failed", message: "Scene animation failed: provider exploded" });
		expect(result.data.message).not.toContain("Error invoking remote method");
	});

	test("retains the structured terminal job identity without changing the edit", async () => {
		const sdk = fixture(new Uint8Array([1, 2, 3, 4]));
		const before = sdk.stored();
		sdk.host.sceneVideo.generate = async () => { throw { rpcError: { code: "producer-failed", jobRef: "failed-animation-job", message: "Invalid source image" } }; };
		const result = await runProductionAnimateCommand({ editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"] }, sdk);
		expect(result.data).toMatchObject({ status: "refused", jobRef: "failed-animation-job", message: "Scene animation failed: Invalid source image Code: producer-failed." });
		expect(sdk.stored()).toEqual(before);
	});

	test("collects an awaiting-consent Cloud result and imports the same Files identity", async () => {
		const bytes = await Bun.file(new URL("./fixtures/cloud-animation-3s.mp4", import.meta.url)).bytes();
		const bytesDigest = await digest(bytes);
		const sdk = fixture(bytes);
		const succeeded = { state: "succeeded", model: { modelKey: "video-model", modelVersion: "2026-09" }, artifacts: [{ kind: "video", artifactRef: "animation-artifact", sha256: bytesDigest, byteLength: bytes.byteLength, mediaType: "video/mp4" }], files: { state: "completed", artifacts: [{ publicId: "animation-file", path: "OpenCut/animation/shot-1.mp4", mimeType: "video/mp4", digest: bytesDigest, byteLength: bytes.byteLength }] } } as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		const states = [{ state: "awaiting-consent" }, { state: "running" }, succeeded] as Array<Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>>;
		let now = 0;
		const observed: string[] = [];
		sdk.host.cloudJobs = { get: async ({ jobRef }) => { expect(jobRef).toBe("animation-job-1"); return states.shift()!; }, cancel: async () => ({ state: "cancelled" } as Awaited<ReturnType<HostApi["cloudJobs"]["cancel"]>> ) };
		sdk.pendingJobPoll = { fastPath: false, now: () => now, waitForPoll: async (delayMs) => { now += delayMs; }, onState: (state) => observed.push(state) };
		const imported: string[] = [];
		const mediaLibrary: ProductionMediaLibrary = { import: async (value) => { imported.push(value.mediaId); return { id: value.mediaId, name: value.name, type: "video", file: value.file, width: value.width, height: value.height, duration: value.duration }; } };
		const input: ProductionAnimateInput = { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"] };
		let generations = 0;
		sdk.host.sceneVideo.generate = async (request) => {
			sdk.calls.push(request);
			generations += 1;
			if (generations === 1) throw Object.assign(new Error("host.sceneVideo.generate timed out after 30000ms"), { code: "timeout" });
			throw { code: "pending", jobRef: "animation-job-1", message: "Error invoking remote method 'project-call': pending" };
		};

		const result = await runProductionAnimateCommand(input, sdk, mediaLibrary);

		expect(result.data.status).toBe("completed");
		expect(result.data.message).not.toContain("Error invoking remote method");
		expect(observed).toEqual(["awaiting-consent", "running", "succeeded"]);
		expect(imported).toHaveLength(1);
		expect(sdk.calls).toHaveLength(2);
		expect(sdk.calls[0]?.timeoutMs).toBe(30_000);
		expect(sdk.calls[1]?.timeoutMs).toBe(30_000);
		expect(sdk.calls[1]?.idempotencyKey).toBe(sdk.calls[0]?.idempotencyKey);
		expect(result.data.shots?.[0]).toMatchObject({ publicId: "animation-file", digest: bytesDigest, durationSeconds: 3 });
		expect(sdk.stored().settings.production?.accepted?.shots[0]?.animationCandidates?.[0]).toMatchObject({ candidateId: sdk.stored().settings.production?.accepted?.shots[0]?.animationCandidates?.[0]?.idempotencyKey, mediaId: expect.any(String), version: { mediaRevision: bytesDigest } });
		expect(sdk.stored().settings.production?.accepted?.shots[0]?.animationCandidates?.[0]?.resource.publicId).toBe("animation-file");
		expect(sdk.stored().settings.production?.accepted?.shots[0]?.animationCandidates?.[0]?.dimensions).toEqual({ width: 128, height: 72 });
	});

	test("recovers a failed pending job from its verified Files animation without generating again", async () => {
		const bytes = await Bun.file(new URL("./fixtures/cloud-animation-3s.mp4", import.meta.url)).bytes();
		const bytesDigest = await digest(bytes);
		const sdk = fixture(bytes);
		let generations = 0;
		sdk.host.sceneVideo.generate = async (request) => {
			sdk.calls.push(request);
			generations += 1;
			throw { code: "pending", jobRef: "failed-animation-job", message: "pending" };
		};
		sdk.pendingJobPoll = { maxWaitMs: 0 };
		const commandInput: ProductionAnimateInput = { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"] };
		const first = await runProductionAnimateCommand(commandInput, sdk);
		expect(first.data.status).toBe("pending");
		const pending = sdk.stored().settings.production?.accepted?.pendingJobs?.[0];
		expect(pending).toMatchObject({ role: "animation", jobRef: "failed-animation-job" });
		expect(pending?.status).toBeUndefined();
		expect(first.data.revision).toBeDefined();

		const failed = await new ProductionService(new ProductionDocumentService(sdk)).markPendingJobFailed({
			reference: acceptedRevision,
			expectedRevision: first.data.revision!,
			idempotencyKey: pending!.idempotencyKey,
			reason: "producer-failed",
			message: "Cloud animation job failed",
		});
		expect(failed.accepted.pendingJobs?.[0]).toMatchObject({ status: "failed", jobRef: "failed-animation-job" });
		// SAFETY: this fixture is shaped as the successful Cloud job snapshot consumed by the poller.
		const succeeded = { state: "succeeded", model: { modelKey: "video-model", modelVersion: "2026-09" }, artifacts: [{ kind: "video", artifactRef: "failed-animation-artifact", sha256: bytesDigest, byteLength: bytes.byteLength, mediaType: "video/mp4" }], files: { state: "completed", artifacts: [{ publicId: "animation-file", path: "OpenCut/animation/shot-1.mp4", mimeType: "video/mp4", digest: bytesDigest, byteLength: bytes.byteLength }] } } as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		sdk.host.cloudJobs = { get: async ({ jobRef }) => { expect(jobRef).toBe("failed-animation-job"); return succeeded; } };
		sdk.pendingJobPoll = { fastPath: true, maxWaitMs: 3_000 };
		const imported: string[] = [];
		const mediaLibrary: ProductionMediaLibrary = {
			import: async (value) => {
				imported.push(value.name);
				return { id: value.mediaId, name: value.name, type: "video", file: value.file, width: value.width, height: value.height, duration: value.duration };
			},
		};
		const recovered = await runProductionAnimateCommand({ ...commandInput, expectedRevision: failed.documentRevision }, sdk, mediaLibrary);

		expect(recovered.data.status).toBe("completed");
		expect(generations).toBe(1);
		expect(sdk.calls).toHaveLength(1);
		expect(imported).toEqual(["shot-1.mp4"]);
		expect(recovered.data.shots?.[0]).toMatchObject({ publicId: "animation-file", digest: bytesDigest, durationSeconds: 3 });
		expect(sdk.stored().settings.production?.accepted?.pendingJobs).toBeUndefined();
		expect(sdk.stored().settings.production?.accepted?.shots[0]?.animationCandidates?.[0]?.resource.publicId).toBe("animation-file");
		expect(sdk.stored().settings.production?.accepted?.shots[0]?.animationCandidates?.[0]?.dimensions).toEqual({ width: 128, height: 72 });
	});

	test("collects the newer pending animation job after retaining an older failed row", async () => {
		for (const removeOldJobRef of [false, true]) {
			const bytes = await Bun.file(new URL("./fixtures/cloud-animation-3s.mp4", import.meta.url)).bytes();
			const bytesDigest = await digest(bytes);
			const sdk = fixture(bytes);
			sdk.host.sceneVideo.generate = async (request) => {
				sdk.calls.push(request);
				const jobRef = sdk.calls.length === 1 ? "old-animation-job" : "new-animation-job";
				throw { code: "pending", jobRef, message: "pending" };
			};
			sdk.pendingJobPoll = { maxWaitMs: 0 };
			const commandInput: ProductionAnimateInput = { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"] };
			const first = await runProductionAnimateCommand(commandInput, sdk);
			const oldPending = sdk.stored().settings.production?.accepted?.pendingJobs?.[0];
			const failed = await new ProductionService(new ProductionDocumentService(sdk)).markPendingJobFailed({ reference: acceptedRevision, expectedRevision: first.data.revision!, idempotencyKey: oldPending!.idempotencyKey, reason: "producer-failed", message: "Old animation job failed" });
			if (removeOldJobRef) {
				const persisted = sdk.stored();
				for (const project of [persisted, ...persisted.snapshots.map((snapshot) => snapshot.project)]) {
					const oldJob = project.settings.production?.accepted?.pendingJobs?.[0];
					if (oldJob) Reflect.deleteProperty(oldJob, "jobRef");
				}
				await sdk.entities.update<StoredEntityValue<StoredProductionDocument>>("opencut.project", "project-row", { value: persisted });
			}
			const newer = await runProductionAnimateCommand({ ...commandInput, newVersion: true, expectedRevision: failed.documentRevision }, sdk);
			expect(newer.data.status).toBe("pending");
			const newPending = sdk.stored().settings.production?.accepted?.pendingJobs?.find((job) => job.jobRef === "new-animation-job");
			expect(newPending).toMatchObject({ jobRef: "new-animation-job" });
			expect(newPending?.status).toBeUndefined();
			// SAFETY: this fixture is shaped as the successful Cloud job snapshot consumed by the poller.
			const succeeded = { state: "succeeded", model: { modelKey: "video-model", modelVersion: "2026-09" }, artifacts: [{ kind: "video", artifactRef: "new-animation-artifact", sha256: bytesDigest, byteLength: bytes.byteLength, mediaType: "video/mp4" }], files: { state: "completed", artifacts: [{ publicId: "animation-file", path: "OpenCut/animation/shot-1.mp4", mimeType: "video/mp4", digest: bytesDigest, byteLength: bytes.byteLength }] } } as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
			sdk.host.cloudJobs = { get: async ({ jobRef }) => { expect(jobRef).toBe("new-animation-job"); return succeeded; } };
			sdk.pendingJobPoll = { fastPath: true, maxWaitMs: 3_000 };
			const mediaLibrary: ProductionMediaLibrary = { import: async (value) => ({ id: value.mediaId, name: value.name, type: "video", file: value.file, width: value.width, height: value.height, duration: value.duration }) };
			const recovered = await runProductionAnimateCommand({ ...commandInput, expectedRevision: newer.data.revision! }, sdk, mediaLibrary);

			expect(recovered.data.status).toBe("completed");
			expect(sdk.calls).toHaveLength(2);
			expect(recovered.data.shots?.[0]).toMatchObject({ publicId: "animation-file", digest: bytesDigest, durationSeconds: 3 });
		}
	});

	test("rejects a Cloud animation whose verified bytes have the wrong duration or invalid MP4 metadata", async () => {
		const validBytes = await Bun.file(new URL("./fixtures/cloud-animation-3s.mp4", import.meta.url)).bytes();
		const cases = [
			{ durationMs: 5_000, bytes: validBytes },
			{ durationMs: 3_000, bytes: new Uint8Array([1, 2, 3, 4]) },
		] as const;
		for (const [index, candidate] of cases.entries()) {
			const bytesDigest = await digest(candidate.bytes);
			const sdk = fixture(candidate.bytes, candidate.durationMs);
			let generations = 0;
			sdk.host.sceneVideo.generate = async (request) => {
				sdk.calls.push(request);
				generations += 1;
				throw { code: "pending", jobRef: `invalid-animation-job-${index}` };
			};
			sdk.pendingJobPoll = { maxWaitMs: 0 };
			const first = await runProductionAnimateCommand({ editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"] }, sdk);
			expect(first.data.status).toBe("pending");
			expect(first.data.revision).toBeDefined();
			// SAFETY: this fixture is shaped as the successful Cloud job snapshot consumed by the poller.
			const succeeded = { state: "succeeded", model: { modelKey: "video-model", modelVersion: "2026-09" }, artifacts: [{ kind: "video", artifactRef: `invalid-animation-artifact-${index}`, sha256: bytesDigest, byteLength: candidate.bytes.byteLength, mediaType: "video/mp4" }], files: { state: "completed", artifacts: [{ publicId: "animation-file", path: "OpenCut/animation/shot-1.mp4", mimeType: "video/mp4", digest: bytesDigest, byteLength: candidate.bytes.byteLength }] } } as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
			sdk.host.cloudJobs = { get: async ({ jobRef }) => { expect(jobRef).toBe(`invalid-animation-job-${index}`); return succeeded; } };
			sdk.pendingJobPoll = { fastPath: true, maxWaitMs: 3_000 };
			const recovered = await runProductionAnimateCommand({ editId: revision.editId, expectedRevision: first.data.revision!, acceptedRevision, shotIds: ["shot-1"] }, sdk);

			expect(recovered.data).toMatchObject({ status: "refused", reason: "producer-failed" });
			expect(generations).toBe(1);
			expect(sdk.calls).toHaveLength(1);
		}
	});
});
