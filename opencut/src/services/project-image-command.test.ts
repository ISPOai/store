import { describe, expect, test } from "bun:test";
import type { EntityCreateOptions, EntityQuery, EntityQueryResult, EntityRecord, EntityUpdateOptions, FilesListEntry, FilesPublishArgs, HostApi } from "@ispo/sdk";
import type { EntityStorageApi, FilesStorageApi, StoredEntityValue } from "@/services/storage/sdk-adapter";
import type { SerializedProject } from "@/services/storage/types";
import type { StoredProductionDocument } from "@/project/production-types";
import type { ProductionMediaImport, ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import { ProductionDocumentService } from "@/project/production-document-service";
import { ProductionService } from "@/project/production-service";
import { runProductionImageCommand, selectImagePendingJob, type ProductionImageSdk } from "./project-image-command";
import type { ProductionImageInput } from "./project-command-types";

const revision = { editId: "edit-images", storageCasRevision: "1", intentRevision: "1", digest: "edit-digest" };
const acceptedRevision = { editId: "edit-images", documentIntentRevision: "1", productionRevisionId: "production-1", contentDigest: "production-digest" };

function file(publicId: string, name = `${publicId}.png`): FilesListEntry {
	return { publicId, path: `OpenCut/references/${name}`, name, mimeType: "image/png", size: 10, folder: "OpenCut/references", url: `assets://${publicId}` };
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const value = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fixture(): ProductionImageSdk & { stored(): StoredProductionDocument; calls: Array<Parameters<ProductionImageSdk["host"]["storyboardImage"]["generate"]>[0]> } {
	const accepted = {
		reference: acceptedRevision,
		script: "Three shots",
		shots: [
			{ shotId: "shot-1", revision: 1, narration: "One", visualBrief: "One", durationMs: 1_000, imageVersion: { mediaId: "accepted-1", mediaRevision: "r1", name: "one.png", mediaType: "image" as const, mimeType: "image/png" as const, digest: "r1", byteLength: 10, sourceDurationSeconds: 1 } },
			{ shotId: "shot-2", revision: 1, narration: "Two", visualBrief: "Two", durationMs: 1_000, imageVersion: { mediaId: "accepted-2", mediaRevision: "r2", name: "two.png", mediaType: "image" as const, mimeType: "image/png" as const, digest: "r2", byteLength: 10, sourceDurationSeconds: 1 } },
			{ shotId: "shot-3", revision: 1, narration: "Three", visualBrief: "Three", durationMs: 1_000 },
		],
		targetDurationMs: 3_000,
		canvas: { width: 1_920, height: 1_080 },
		fps: { numerator: 30, denominator: 1 },
	};
	const project: SerializedProject = {
		metadata: { id: revision.editId, name: "Images", duration: 3, createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" },
		scenes: [], currentSceneId: "", version: 32,
		settings: { fps: { numerator: 30, denominator: 1 }, canvasSize: { width: 1_920, height: 1_080 }, background: { type: "color", color: "#000000" }, production: { formatVersion: 1, accepted, acceptanceReceipts: [], actionIntents: [] } },
	};
	let row: StoredProductionDocument = { ...project, kind: "opencut.production-document", formatVersion: 1, editId: revision.editId, currentIntentRevision: "1", snapshots: [{ intentRevision: "1", digest: revision.digest, project }] };
	let entityVersion = 1;
	const entities: EntityStorageApi = {
		query<T>(type: string, query: EntityQuery = {}): Promise<EntityQueryResult<T>> {
			const records = type === "opencut.project" && query.where?.storageKey === revision.editId ? [{ id: "project-row", type, version: entityVersion, data: { storageKey: revision.editId, value: row }, createdBy: { kind: "project", id: "test" }, updatedBy: { kind: "project", id: "test" }, createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" } as EntityRecord<T>] : [];
			return Promise.resolve({ records, cursor: null });
		},
		create<T>(_type: string, data: T, _options: EntityCreateOptions = {}): Promise<EntityRecord<T>> { throw new Error(`Unexpected create: ${JSON.stringify(data)}`); },
		update<T>(_type: string, _id: string, patch: Partial<T>, _options: EntityUpdateOptions = {}): Promise<EntityRecord<T>> {
			const value = (patch as Partial<StoredEntityValue<StoredProductionDocument>>).value;
			if (!value) throw new Error("Expected a complete production document");
			expect(JSON.parse(JSON.stringify(value))).toEqual(value);
			row = value;
			entityVersion += 1;
			return Promise.resolve({ id: "project-row", type: "opencut.project", version: entityVersion, data: { storageKey: revision.editId, value: row } } as EntityRecord<T>);
		},
		delete<T>(_type: string, _id: string): Promise<EntityRecord<T>> { throw new Error("Unexpected delete"); },
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const entries = [file("style-a", "portrait.png"), file("style-b", "palette.png"), file("folder-c", "folder.png")];
	const calls: Array<Parameters<ProductionImageSdk["host"]["storyboardImage"]["generate"]>[0]> = [];
	const files: FilesStorageApi = {
		list: async () => entries,
		publish: async (_args: FilesPublishArgs) => ({ publicId: "published", path: "OpenCut/published" }),
	};
	return {
		entities,
		files,
		calls,
		stored: () => structuredClone(row),
		host: { storyboardImage: { generate: async (input) => { calls.push(input); return { resource: { kind: "files", publicId: `generated-${calls.length}`, path: `OpenCut/generated-${calls.length}.png`, digest: `generated-digest-${calls.length}`, byteLength: 10, mimeType: "image/png", dimensions: { width: 1_920, height: 1_080 } } }; } } },
	};
}

function input(overrides: Partial<ProductionImageInput> = {}): ProductionImageInput {
	return { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-3"], attempt: 1, ...overrides };
}

describe("reference-conditioned storyboard images", () => {
	test("selects newer active image job over older failed job", () => {
		const base = { role: "visual" as const, acceptedRevision, shotId: "shot-3", shotRevision: 1, pendingSince: 1, model: { modelKey: "flux", modelVersion: "1" } };
		const selected = selectImagePendingJob([{ ...base, status: "failed", jobRef: "old", idempotencyKey: "old" }, { ...base, status: "pending", jobRef: "new", idempotencyKey: "new", pendingSince: 2 }], { shotId: "shot-3", revision: 1 }, acceptedRevision, base.model);
		expect(selected?.jobRef).toBe("new");
	});
	test("recognizes direct, nested, and legacy message pending host errors", async () => {
		const errors: unknown[] = [
			{ code: "pending", jobRef: "direct-image-job" },
			{ rpcError: { code: "pending", jobRef: "nested-image-job" } },
			new Error("Error invoking remote method 'project-call': Storyboard image generation is still running as managed Cloud job 'message-image-job'; resume it."),
		];
		for (const error of errors) {
			const sdk = fixture();
			sdk.host.storyboardImage.generate = async () => { throw error; };
			const result = await runProductionImageCommand(input(), sdk);
			expect(result.data.status).toBe("pending");
			expect(result.data.message).not.toContain("Error invoking remote method");
		}
	});

	test("turns an unmatched IPC host error into a typed host-authored refusal", async () => {
		const sdk = fixture();
		sdk.host.storyboardImage.generate = async () => { throw new Error("Error invoking remote method 'project-call': provider exploded"); };
		const result = await runProductionImageCommand(input(), sdk);
		expect(result.data).toMatchObject({ status: "refused", reason: "producer-failed", message: "Storyboard image collection failed: Error: provider exploded" });
		expect(result.data.message).not.toContain("Error invoking remote method");
		expect(result.data.message).not.toContain("stack");
	});

	test("selects accepted previous images in shot order and records safe names", async () => {
		const sdk = fixture();
		const result = await runProductionImageCommand(input({ references: { mode: "previous" } }), sdk);
		expect(result.data.status).toBe("completed");
		expect(sdk.calls[0]?.referencePublicIds).toEqual(["accepted-1", "accepted-2"]);
		expect(result.data.shots?.[0]?.references).toEqual([{ name: "one.png" }, { name: "two.png" }]);
		expect(sdk.stored().settings.production?.accepted?.shots[2]?.imageCandidates?.[0]?.references).toEqual([
			{ publicId: "accepted-1", name: "one.png" },
			{ publicId: "accepted-2", name: "two.png" },
		]);
	});

	test("applies and persists a style anchor, with deterministic random and explicit selection", async () => {
		const sdk = fixture();
		const styleAnchor = { styleSentence: "Soft editorial film grain with warm daylight.", referencePublicIds: ["style-a", "style-b"] };
		const first = await runProductionImageCommand(input({ attempt: 2, styleAnchor, references: { mode: "random", count: 1, pool: "style-anchor" } }), sdk);
		expect(first.data.status).toBe("completed");
		expect(sdk.calls[0]?.prompt).toContain(styleAnchor.styleSentence);
		expect(sdk.calls[0]?.referencePublicIds).toHaveLength(1);
		expect(sdk.stored().settings.production?.styleAnchor?.references.map(({ publicId }) => publicId)).toEqual(["style-a", "style-b"]);
		const explicit = await runProductionImageCommand(input({ expectedRevision: first.data.revision!, attempt: 3, references: { mode: "explicit", publicIds: ["style-b"] } }), sdk);
		expect(explicit.data.status).toBe("completed");
		expect(sdk.calls[1]?.referencePublicIds).toEqual(["style-b"]);
		expect(explicit.data.shots?.[0]?.references).toEqual([{ name: "palette.png" }]);
	});

	test("polls a typed pending image job and records its settled Files artifact", async () => {
		const sdk = fixture();
		const bytes = new Uint8Array(10);
		const digest = await sha256(bytes);
		sdk.files = { ...sdk.files, list: async () => [{ ...file("job-image"), url: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}` }] };
		let now = 0;
		let polls = 0;
		const delays: number[] = [];
		const succeeded = {
			state: "succeeded",
			model: { modelKey: "image-model", modelVersion: "2026-09" },
			artifacts: [{
				kind: "image",
				sha256: digest,
				byteLength: 10,
				artifactRef: "job-image-artifact",
				mediaType: "image/png",
				dimensions: { width: 1_920, height: 1_080 },
			}],
			files: { state: "completed", artifacts: [{ publicId: "job-image", path: "OpenCut/references/job-image.png", mimeType: "image/png", digest, byteLength: 10 }] },
		} as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		const states = [
			{ state: "awaiting-consent" },
			{ state: "running" },
			succeeded,
		] as Array<Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>>;
		sdk.host = {
			...sdk.host,
			cloudJobs: { get: async ({ jobRef }) => { polls += 1; expect(jobRef).toBe("job-image-1"); return states.shift()!; }, cancel: async () => ({ state: "cancelled" } as Awaited<ReturnType<HostApi["cloudJobs"]["cancel"]>> ) },
		};
		const observed: Array<[string, string]> = [];
		sdk.pendingJobPoll = { fastPath: false, now: () => now, waitForPoll: async (delayMs) => { delays.push(delayMs); now += delayMs; }, onState: (state, message) => observed.push([state, message]) };
		let generations = 0;
		sdk.host.storyboardImage.generate = async (input) => {
			sdk.calls.push(input);
			generations += 1;
			if (generations === 1) throw Object.assign(new Error("host.storyboardImage.generate timed out after 30000ms"), { code: "timeout" });
			throw { name: "StoryboardImagePendingError", code: "pending", jobRef: "job-image-1", message: "Error invoking remote method 'project-call': StoryboardImagePendingError: pending" };
		};

		const result = await runProductionImageCommand(input(), sdk);

		expect(result.data.status).toBe("completed");
		expect(polls).toBe(3);
		expect(delays).toEqual([3_000, 10_000, 3_000]);
		expect(observed).toEqual([["awaiting-consent", "waiting for your approval"], ["running", "Cloud job is running"], ["succeeded", "Cloud job is succeeded"]]);
		expect(sdk.calls).toHaveLength(2);
		expect(sdk.calls[0]?.timeoutMs).toBe(30_000);
		expect(sdk.calls[1]?.timeoutMs).toBe(30_000);
		expect(sdk.calls[1]?.idempotencyKey).toBe(sdk.calls[0]?.idempotencyKey);
		expect(result.data.shots?.[0]).toMatchObject({ publicId: "job-image" });
		expect(result.data.message).not.toContain("Error invoking remote method");
		expect(sdk.stored().settings.production?.accepted?.shots[2]?.imageCandidates?.[0]?.model).toEqual({ modelKey: "image-model", modelVersion: "2026-09" });
	});

	test("returns a typed plain refusal when the recovery timeout also escapes", async () => {
		const sdk = fixture();
		sdk.host.storyboardImage.generate = async (request) => {
			sdk.calls.push(request);
			throw Object.assign(new Error("Error invoking remote method 'project-call': timed out after 30000ms"), { code: "timeout" });
		};

		const result = await runProductionImageCommand(input(), sdk);

		expect(result.data).toMatchObject({ status: "refused", reason: "producer-timeout", message: "The media producer timed out before returning a result. Please try again." });
		expect(result.data.message).not.toContain("Error invoking remote method");
		expect(sdk.calls).toHaveLength(2);
	});

	test("keeps the existing pending result after the bounded poll window expires", async () => {
		const sdk = fixture();
		let now = 0;
		let polls = 0;
		sdk.host = {
			...sdk.host,
			cloudJobs: { get: async () => { polls += 1; return { state: "running" } as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>; }, cancel: async () => ({ state: "cancelled" } as Awaited<ReturnType<HostApi["cloudJobs"]["cancel"]>> ) },
		};
		sdk.pendingJobPoll = { fastPath: false, now: () => now, maxWaitMs: 6_000, waitForPoll: async () => { now += 3_000; } };
		sdk.host.storyboardImage.generate = async () => {
			const error = new Error("pending");
			error.name = "StoryboardImagePendingError";
			Object.assign(error, { code: "pending", jobRef: "job-image-2" });
			throw error;
		};

		const result = await runProductionImageCommand(input(), sdk);

		expect(result.data).toMatchObject({
			supported: true,
			status: "pending",
			operation: "production-image",
			editId: revision.editId,
			message: "Storyboard image generation is still in progress; the Cloud job continues on the host. Re-run this command to collect it.",
		});
		expect(result.data.revision).toBeDefined();
		expect(polls).toBe(2);
	});

	test("retries a pending job with a different attempt without another host generation", async () => {
		const sdk = fixture();
		const bytes = new Uint8Array(10);
		const digest = await sha256(bytes);
		sdk.files = { ...sdk.files, list: async () => [{ ...file("retry-image"), url: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}` }] };
		let generations = 0;
		sdk.host.storyboardImage.generate = async (request) => {
			sdk.calls.push(request);
			generations += 1;
			if (generations === 1) {
				const error = new Error("pending");
				error.name = "StoryboardImagePendingError";
				Object.assign(error, { code: "pending", jobRef: "retry-image-job" });
				throw error;
			}
			throw new Error("retry started another generation");
		};
		const first = await runProductionImageCommand(input({ model: { modelKey: "flux-schnell", modelVersion: "2026-09-12" } }), { ...sdk, pendingJobPoll: { maxWaitMs: 0 } });
		expect(first.data.status).toBe("pending");
		const pending = sdk.stored().settings.production?.accepted?.pendingJobs?.[0];
		expect(pending).toMatchObject({ role: "visual", shotId: "shot-3", shotRevision: 1, jobRef: "retry-image-job" });
		expect(pending?.idempotencyKey).toBe(sdk.calls[0]?.idempotencyKey);
		expect(pending && "styleAnchorRevision" in pending).toBe(false);
		expect(pending && "strength" in pending).toBe(false);
		// SAFETY: this fixture is shaped as the successful Cloud job snapshot consumed by the poller.
		const succeeded = { state: "succeeded", model: { modelKey: "image-model", modelVersion: "2026-09" }, artifacts: [{ kind: "image", artifactRef: "retry-image-artifact", sha256: digest, byteLength: 10, mediaType: "image/png", dimensions: { width: 1_920, height: 1_080 } }], files: { state: "completed", artifacts: [{ publicId: "retry-image", path: "OpenCut/references/retry-image.png", mimeType: "image/png", digest, byteLength: 10 }] } } as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		let polls = 0;
		sdk.host.cloudJobs = { get: async ({ jobRef }) => { polls += 1; expect(jobRef).toBe("retry-image-job"); return succeeded; } };
		const retry = await runProductionImageCommand(input({ attempt: 99, model: { modelKey: "flux-dev", modelVersion: "2026-09-13" }, expectedRevision: first.data.revision! }), { ...sdk, pendingJobPoll: { maxWaitMs: 3_000, waitForPoll: async () => undefined } });
		expect(retry.data.status).toBe("completed");
		expect(generations).toBe(1);
		expect(sdk.calls).toHaveLength(1);
		expect(polls).toBe(1);
	});

	test("recovers a failed pending job from its verified Files image without generating again", async () => {
		const bytes = new Uint8Array(10);
		const bytesDigest = await sha256(bytes);
		const sdk = fixture();
		let generations = 0;
		sdk.host.storyboardImage.generate = async (request) => {
			sdk.calls.push(request);
			generations += 1;
			const error = new Error("pending");
			error.name = "StoryboardImagePendingError";
			Object.assign(error, { code: "pending", jobRef: "failed-image-job" });
			throw error;
		};
		sdk.pendingJobPoll = { maxWaitMs: 0 };
		const first = await runProductionImageCommand(input(), sdk);
		expect(first.data.status).toBe("pending");
		const pending = sdk.stored().settings.production?.accepted?.pendingJobs?.[0];
		expect(pending).toMatchObject({ role: "visual", jobRef: "failed-image-job" });
		expect(pending?.status).toBeUndefined();
		expect(first.data.revision).toBeDefined();

		const failed = await new ProductionService(new ProductionDocumentService(sdk)).markPendingJobFailed({
			reference: acceptedRevision,
			expectedRevision: first.data.revision!,
			idempotencyKey: pending!.idempotencyKey,
			reason: "producer-failed",
			message: "Cloud image job failed",
		});
		expect(failed.accepted.pendingJobs?.[0]).toMatchObject({ status: "failed", jobRef: "failed-image-job" });
		sdk.files = { ...sdk.files, list: async () => [{ ...file("failed-image"), url: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}` }] };
		// SAFETY: this fixture is shaped as the successful Cloud job snapshot consumed by the poller.
		const succeeded = {
			state: "succeeded",
			model: { modelKey: "image-model", modelVersion: "2026-09" },
			artifacts: [{ kind: "image", artifactRef: "failed-image-artifact", sha256: bytesDigest, byteLength: bytes.byteLength, mediaType: "image/png", dimensions: { width: 1_920, height: 1_080 } }],
			files: { state: "completed", artifacts: [{ publicId: "failed-image", path: "OpenCut/references/failed-image.png", mimeType: "image/png", digest: bytesDigest, byteLength: bytes.byteLength }] },
		} as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		sdk.host.cloudJobs = { get: async ({ jobRef }) => { expect(jobRef).toBe("failed-image-job"); return succeeded; } };
		sdk.pendingJobPoll = { fastPath: true, maxWaitMs: 3_000 };
		const recovered = await runProductionImageCommand(input({ expectedRevision: failed.documentRevision, attempt: 99 }), sdk);

		expect(recovered.data.status).toBe("completed");
		expect(generations).toBe(1);
		expect(sdk.calls).toHaveLength(1);
		expect(recovered.data.shots?.[0]).toMatchObject({ publicId: "failed-image", digest: bytesDigest });
		expect(sdk.stored().settings.production?.accepted?.pendingJobs).toBeUndefined();
	});

	test("collects the newer pending image job after retaining an older failed row", async () => {
		for (const removeOldJobRef of [false, true]) {
			const bytes = new Uint8Array(10);
			const bytesDigest = await sha256(bytes);
			const sdk = fixture();
			sdk.host.storyboardImage.generate = async (request) => {
				sdk.calls.push(request);
				const jobRef = sdk.calls.length === 1 ? "old-image-job" : "new-image-job";
				const error = new Error("pending");
				error.name = "StoryboardImagePendingError";
				Object.assign(error, { code: "pending", jobRef });
				throw error;
			};
			sdk.pendingJobPoll = { maxWaitMs: 0 };
			const first = await runProductionImageCommand(input(), sdk);
			const oldPending = sdk.stored().settings.production?.accepted?.pendingJobs?.[0];
			const failed = await new ProductionService(new ProductionDocumentService(sdk)).markPendingJobFailed({ reference: acceptedRevision, expectedRevision: first.data.revision!, idempotencyKey: oldPending!.idempotencyKey, reason: "producer-failed", message: "Old image job failed" });
			if (removeOldJobRef) {
				const persisted = sdk.stored();
				for (const project of [persisted, ...persisted.snapshots.map((snapshot) => snapshot.project)]) {
					const oldJob = project.settings.production?.accepted?.pendingJobs?.[0];
					if (oldJob) Reflect.deleteProperty(oldJob, "jobRef");
				}
				await sdk.entities.update<StoredEntityValue<StoredProductionDocument>>("opencut.project", "project-row", { value: persisted });
			}
			const newer = await runProductionImageCommand(input({ attempt: 2, newVersion: true, expectedRevision: failed.documentRevision }), sdk);
			expect(newer.data.status).toBe("pending");
			const newPending = sdk.stored().settings.production?.accepted?.pendingJobs?.find((job) => job.jobRef === "new-image-job");
			expect(newPending).toMatchObject({ jobRef: "new-image-job" });
			expect(newPending?.status).toBeUndefined();
			sdk.files = { ...sdk.files, list: async () => [{ ...file("new-image"), url: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}` }] };
			// SAFETY: this fixture is shaped as the successful Cloud job snapshot consumed by the poller.
			const succeeded = { state: "succeeded", model: { modelKey: "image-model", modelVersion: "2026-09" }, artifacts: [{ kind: "image", artifactRef: "new-image-artifact", sha256: bytesDigest, byteLength: bytes.byteLength, mediaType: "image/png", dimensions: { width: 1_920, height: 1_080 } }], files: { state: "completed", artifacts: [{ publicId: "new-image", path: "OpenCut/references/new-image.png", mimeType: "image/png", digest: bytesDigest, byteLength: bytes.byteLength }] } } as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
			sdk.host.cloudJobs = { get: async ({ jobRef }) => { expect(jobRef).toBe("new-image-job"); return succeeded; } };
			sdk.pendingJobPoll = { fastPath: true, maxWaitMs: 3_000 };
			const recovered = await runProductionImageCommand(input({ expectedRevision: newer.data.revision! }), sdk);

			expect(recovered.data.status).toBe("completed");
			expect(sdk.calls).toHaveLength(2);
			expect(recovered.data.shots?.[0]).toMatchObject({ publicId: "new-image", digest: bytesDigest });
		}
	});

	test("starts every requested shot even when each producer returns pending", async () => {
		const sdk = fixture();
		sdk.host.storyboardImage.generate = async (request) => {
			sdk.calls.push(request);
			const error = new Error("pending");
			error.name = "StoryboardImagePendingError";
			Object.assign(error, { code: "pending", jobRef: `pending-shot-${sdk.calls.length}` });
			throw error;
		};
		const result = await runProductionImageCommand(input({ shotIds: ["shot-1", "shot-2", "shot-3"] }), { ...sdk, pendingJobPoll: { maxWaitMs: 0 } });
		expect(result.data.status).toBe("pending");
		expect(sdk.calls).toHaveLength(3);
		expect(sdk.stored().settings.production?.accepted?.pendingJobs?.map((job) => job.shotId)).toEqual(["shot-1", "shot-2", "shot-3"]);
	});

	test("starts a new image job when newVersion is explicit", async () => {
		const sdk = fixture();
		let generations = 0;
		sdk.host.storyboardImage.generate = async () => {
			generations += 1;
			if (generations === 1) {
				const error = new Error("pending");
				error.name = "StoryboardImagePendingError";
				Object.assign(error, { code: "pending", jobRef: "old-image-job" });
				throw error;
			}
			return { resource: { kind: "files" as const, publicId: "new-image", path: "OpenCut/new-image.png", digest: "new-image-digest", byteLength: 10, mimeType: "image/png" as const, dimensions: { width: 1_920, height: 1_080 } } };
		};
		const first = await runProductionImageCommand(input(), { ...sdk, pendingJobPoll: { maxWaitMs: 0 } });
		const second = await runProductionImageCommand(input({ attempt: 2, newVersion: true, expectedRevision: first.data.revision! }), sdk);
		expect(second.data.status).toBe("completed");
		expect(generations).toBe(2);
	});

	test("adds a completed generated image to the mounted media library", async () => {
		const sdk = fixture();
		const bytes = new Uint8Array([1, 2, 3]);
		const digestBuffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
		const digest = Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
		sdk.files = {
			...sdk.files,
			list: async () => [{ publicId: "generated-media", path: "OpenCut/generated.png", name: "generated.png", mimeType: "image/png", size: bytes.byteLength, folder: "OpenCut", url: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}` }],
		};
		const imported: ProductionMediaImport[] = [];
		const mediaLibrary: ProductionMediaLibrary = {
			import: async (value) => {
				imported.push(value);
				return { id: value.mediaId, name: value.name, type: "image", file: value.file, width: value.width, height: value.height };
			},
		};
		sdk.host.storyboardImage.generate = async () => ({
			resource: { kind: "files", publicId: "generated-media", path: "OpenCut/generated.png", digest, byteLength: bytes.byteLength, mimeType: "image/png", dimensions: { width: 1_920, height: 1_080 } },
		});

		const result = await runProductionImageCommand(input(), sdk, mediaLibrary);

		expect(result.data.status).toBe("completed");
		expect(imported).toHaveLength(1);
		expect(imported[0]).toMatchObject({ editId: revision.editId, role: "visual", mediaRevision: digest, mimeType: "image/png", width: 1_920, height: 1_080 });
		expect(imported[0]?.mediaId).toMatch(/^production-media-/);
	});
});
