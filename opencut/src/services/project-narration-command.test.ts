import { describe, expect, test } from "bun:test";
import type { EntityCreateOptions, EntityQuery, EntityQueryResult, EntityRecord, EntityUpdateOptions, FilesListEntry, HostApi } from "@ispo/sdk";
import type { EntityStorageApi, FilesStorageApi, StoredEntityValue } from "@/services/storage/sdk-adapter";
import type { SerializedProject } from "@/services/storage/types";
import type { StoredProductionDocument } from "@/project/production-types";
import type { ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import { ProductionDocumentService } from "@/project/production-document-service";
import { ProductionService } from "@/project/production-service";
import { runProductionNarrationCommand, selectNarrationPendingJob, type ProductionNarrationSdk } from "./project-narration-command";
import type { ProductionNarrationInput } from "./project-command-types";

const revision = { editId: "edit-narration", storageCasRevision: "1", intentRevision: "1", digest: "edit-digest" };
const acceptedRevision = { editId: "edit-narration", documentIntentRevision: "1", productionRevisionId: "production-1", contentDigest: "production-digest" };

function pcmWavBytes(durationMs: number): Uint8Array {
	const sampleRate = 48_000;
	const dataSize = sampleRate * 2 * durationMs / 1_000;
	const bytes = new Uint8Array(44 + dataSize);
	const view = new DataView(bytes.buffer);
	const write = (offset: number, value: string) => [...value].forEach((character, index) => { bytes[offset + index] = character.charCodeAt(0); });
	write(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, dataSize, true);
	return bytes;
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fixture(bytes: Uint8Array): ProductionNarrationSdk & { stored: () => StoredProductionDocument; calls: Array<Record<string, unknown>> } {
	const accepted = { reference: acceptedRevision, script: "Narration", shots: [{ shotId: "shot-1", revision: 1, narration: "Hello world", visualBrief: "A frame", durationMs: 1_500 }], targetDurationMs: 1_500, canvas: { width: 1_920, height: 1_080 }, fps: { numerator: 30, denominator: 1 } };
	const project: SerializedProject = { metadata: { id: revision.editId, name: "Narration", duration: 1.5, createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" }, scenes: [], currentSceneId: "", version: 32, settings: { fps: { numerator: 30, denominator: 1 }, canvasSize: { width: 1_920, height: 1_080 }, background: { type: "color", color: "#000000" }, production: { formatVersion: 1, accepted, acceptanceReceipts: [], actionIntents: [] } } };
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
	const entry: FilesListEntry = { publicId: "narration-file", path: "OpenCut/narration/shot-1.wav", name: "shot-1.wav", mimeType: "audio/wav", size: bytes.byteLength, folder: "OpenCut/narration", kind: "audio", url: `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}` };
	const files: FilesStorageApi = { list: async () => [entry], publish: async () => ({ publicId: "published", path: "OpenCut/published" }) };
	const calls: Array<Record<string, unknown>> = [];
	return {
		entities,
		files: { ...files, media: { read: async () => { throw new Error("Unexpected media read"); } } },
		calls,
		stored: () => structuredClone(row),
		host: {
			narration: { generate: async (input) => { calls.push(input); throw { name: "NarrationPendingError", code: "pending", jobRef: "narration-job-1", message: "Error invoking remote method 'project-call': NarrationPendingError: pending" }; } },
		},
	};
}

describe("pollable narration generation", () => {
	test("selects newer active narration job over older failed job", () => {
		const base = { role: "narration" as const, acceptedRevision, shotId: "shot-1", shotRevision: 1, pendingSince: 1, voice: "warm" as const };
		const selected = selectNarrationPendingJob([{ ...base, status: "failed", jobRef: "old", idempotencyKey: "old" }, { ...base, status: "pending", jobRef: "new", idempotencyKey: "new", pendingSince: 2 }], { shotId: "shot-1", revision: 1 }, acceptedRevision, "warm");
		expect(selected?.jobRef).toBe("new");
	});
	test("recognizes direct, nested, and legacy message pending host errors", async () => {
		const errors: unknown[] = [
			{ code: "pending", jobRef: "direct-narration-job" },
			{ rpcError: { code: "pending", jobRef: "nested-narration-job" } },
			new Error("Error invoking remote method 'project-call': Narration generation is still running as managed Cloud job 'message-narration-job'; resume it."),
		];
		for (const error of errors) {
			const sdk = fixture(pcmWavBytes(1_500));
			sdk.host.narration.generate = async () => { throw error; };
			const input: ProductionNarrationInput = { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"], attempt: 1, voice: "warm" };
			const result = await runProductionNarrationCommand(input, sdk, [], undefined);
			expect(result.data.status).toBe("pending");
			expect(result.data.message).not.toContain("Error invoking remote method");
		}
	});

	test("turns an unmatched IPC host error into a typed host-authored refusal", async () => {
		const sdk = fixture(pcmWavBytes(1_500));
		sdk.host.narration.generate = async () => { throw new Error("Error invoking remote method 'project-call': provider exploded"); };
		const input: ProductionNarrationInput = { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"], attempt: 1, voice: "warm" };
		const result = await runProductionNarrationCommand(input, sdk, [], undefined);
		expect(result.data).toMatchObject({ status: "refused", reason: "producer-failed", message: "Narration generation failed on the host. Please try again." });
		expect(result.data.message).not.toContain("Error invoking remote method");
	});

	test("collects a consented Cloud result and imports the same Files identity", async () => {
		const bytes = pcmWavBytes(1_500);
		const digest = await sha256(bytes);
		const sdk = fixture(bytes);
		const mediaLibrary: ProductionMediaLibrary = {
			import: async (value) => ({ id: value.mediaId, name: value.name, type: "audio", file: value.file, duration: value.duration, filesRef: { publicId: "narration-file", path: "OpenCut/narration/shot-1.wav" } }),
		};
		const succeeded = {
			state: "succeeded",
			model: { modelKey: "speech-model", modelVersion: "2026-09" },
			output: { alignment: { words: [{ word: "Hello", startMs: 0, endMs: 750 }, { word: "world", startMs: 750, endMs: 1_500 }] } },
			artifacts: [{ kind: "audio", artifactRef: "narration-artifact", sha256: digest, byteLength: bytes.byteLength, mediaType: "audio/wav" }],
			files: { state: "completed", artifacts: [{ publicId: "narration-file", path: "OpenCut/narration/shot-1.wav", mimeType: "audio/wav", digest, byteLength: bytes.byteLength }] },
		} as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		const states = [{ state: "awaiting-consent" }, { state: "running" }, succeeded] as Array<Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>>;
		let now = 0;
		const observed: string[] = [];
		sdk.host.cloudJobs = { get: async () => states.shift()!, cancel: async () => ({ state: "cancelled" } as Awaited<ReturnType<HostApi["cloudJobs"]["cancel"]>> ) };
		sdk.pendingJobPoll = { fastPath: false, now: () => now, waitForPoll: async (delayMs) => { now += delayMs; }, onState: (state) => observed.push(state) };
		const input: ProductionNarrationInput = { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"], attempt: 1, voice: "warm" };
		let generations = 0;
		sdk.host.narration.generate = async (request) => {
			sdk.calls.push(request);
			generations += 1;
			if (generations === 1) throw Object.assign(new Error("host.narration.generate timed out after 30000ms"), { code: "timeout" });
			throw { name: "NarrationPendingError", code: "pending", jobRef: "narration-job-1", message: "Error invoking remote method 'project-call': NarrationPendingError: pending" };
		};

		const result = await runProductionNarrationCommand(input, sdk, [], mediaLibrary);

		expect(result.data).toMatchObject({ status: "completed" });
		expect(result.data.message).not.toContain("Error invoking remote method");
		expect(observed).toEqual(["awaiting-consent", "running", "succeeded"]);
		expect(sdk.calls).toHaveLength(2);
		expect(sdk.calls[0]?.timeoutMs).toBe(30_000);
		expect(sdk.calls[1]?.timeoutMs).toBe(30_000);
		expect(sdk.calls[1]?.idempotencyKey).toBe(sdk.calls[0]?.idempotencyKey);
		expect(sdk.stored().settings.production?.accepted?.shots[0]?.narrationVersion).toMatchObject({ publishedFiles: { publicId: "narration-file" }, alignment: [{ text: "Hello", start: 0, end: 0.75 }, { text: "world", start: 0.75, end: 1.5 }] });
	});

	test("recovers a failed pending job from its verified Files narration without generating again", async () => {
		const bytes = pcmWavBytes(1_500);
		const bytesDigest = await sha256(bytes);
		const sdk = fixture(bytes);
		let generations = 0;
		sdk.host.narration.generate = async (request) => {
			sdk.calls.push(request);
			generations += 1;
			throw { name: "NarrationPendingError", code: "pending", jobRef: "failed-narration-job", message: "pending" };
		};
		sdk.pendingJobPoll = { maxWaitMs: 0 };
		const commandInput: ProductionNarrationInput = { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"], attempt: 1, voice: "warm" };
		const first = await runProductionNarrationCommand(commandInput, sdk, [], undefined);
		expect(first.data.status).toBe("pending");
		const pending = sdk.stored().settings.production?.accepted?.pendingJobs?.[0];
		expect(pending).toMatchObject({ role: "narration", jobRef: "failed-narration-job" });
		expect(pending?.status).toBeUndefined();
		expect(first.data.revision).toBeDefined();

		const failed = await new ProductionService(new ProductionDocumentService(sdk)).markPendingJobFailed({
			reference: acceptedRevision,
			expectedRevision: first.data.revision!,
			idempotencyKey: pending!.idempotencyKey,
			reason: "producer-failed",
			message: "Cloud narration job failed",
		});
		expect(failed.accepted.pendingJobs?.[0]).toMatchObject({ status: "failed", jobRef: "failed-narration-job" });
		// SAFETY: this fixture is shaped as the successful Cloud job snapshot consumed by the poller.
		const succeeded = {
			state: "succeeded",
			model: { modelKey: "speech-model", modelVersion: "2026-09" },
			output: { alignment: { words: [{ word: "Hello", startMs: 0, endMs: 750 }, { word: "world", startMs: 750, endMs: 1_500 }] } },
			artifacts: [{ kind: "audio", artifactRef: "failed-narration-artifact", sha256: bytesDigest, byteLength: bytes.byteLength, mediaType: "audio/wav" }],
			files: { state: "completed", artifacts: [{ publicId: "narration-file", path: "OpenCut/narration/shot-1.wav", mimeType: "audio/wav", digest: bytesDigest, byteLength: bytes.byteLength }] },
		} as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
		sdk.host.cloudJobs = { get: async ({ jobRef }) => { expect(jobRef).toBe("failed-narration-job"); return succeeded; } };
		sdk.pendingJobPoll = { fastPath: true, maxWaitMs: 3_000 };
		const mediaLibrary: ProductionMediaLibrary = {
			import: async (value) => {
				return { id: value.mediaId, name: value.name, type: "audio", file: value.file, duration: value.duration, filesRef: { publicId: "narration-file", path: "OpenCut/narration/shot-1.wav" } };
			},
		};
		const recovered = await runProductionNarrationCommand({ ...commandInput, expectedRevision: failed.documentRevision, attempt: 99 }, sdk, [], mediaLibrary);

		expect(recovered.data.status).toBe("completed");
		expect(generations).toBe(1);
		expect(sdk.calls).toHaveLength(1);
		expect(recovered.data.shots?.[0]).toMatchObject({ publicId: "narration-file", digest: bytesDigest });
		expect(sdk.stored().settings.production?.accepted?.shots[0]?.narrationVersion?.publishedFiles?.publicId).toBe("narration-file");
		expect(sdk.stored().settings.production?.accepted?.pendingJobs).toBeUndefined();
	});

	test("collects the newer pending narration job after retaining an older failed row", async () => {
		for (const removeOldJobRef of [false, true]) {
			const bytes = pcmWavBytes(1_500);
			const bytesDigest = await sha256(bytes);
			const sdk = fixture(bytes);
			sdk.host.narration.generate = async (request) => {
				sdk.calls.push(request);
				const jobRef = sdk.calls.length === 1 ? "old-narration-job" : "new-narration-job";
				throw { name: "NarrationPendingError", code: "pending", jobRef, message: "pending" };
			};
			sdk.pendingJobPoll = { maxWaitMs: 0 };
			const commandInput: ProductionNarrationInput = { editId: revision.editId, expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"], attempt: 1, voice: "warm" };
			const first = await runProductionNarrationCommand(commandInput, sdk, [], undefined);
			const oldPending = sdk.stored().settings.production?.accepted?.pendingJobs?.[0];
			const failed = await new ProductionService(new ProductionDocumentService(sdk)).markPendingJobFailed({ reference: acceptedRevision, expectedRevision: first.data.revision!, idempotencyKey: oldPending!.idempotencyKey, reason: "producer-failed", message: "Old narration job failed" });
			if (removeOldJobRef) {
				const persisted = sdk.stored();
				for (const project of [persisted, ...persisted.snapshots.map((snapshot) => snapshot.project)]) {
					const oldJob = project.settings.production?.accepted?.pendingJobs?.[0];
					if (oldJob) Reflect.deleteProperty(oldJob, "jobRef");
				}
				await sdk.entities.update<StoredEntityValue<StoredProductionDocument>>("opencut.project", "project-row", { value: persisted });
			}
			const newer = await runProductionNarrationCommand({ ...commandInput, attempt: 2, newVersion: true, expectedRevision: failed.documentRevision }, sdk, [], undefined);
			expect(newer.data.status).toBe("pending");
			const newPending = sdk.stored().settings.production?.accepted?.pendingJobs?.find((job) => job.jobRef === "new-narration-job");
			expect(newPending).toMatchObject({ jobRef: "new-narration-job" });
			expect(newPending?.status).toBeUndefined();
			// SAFETY: this fixture is shaped as the successful Cloud job snapshot consumed by the poller.
			const succeeded = { state: "succeeded", model: { modelKey: "speech-model", modelVersion: "2026-09" }, output: { alignment: { words: [{ word: "Hello", startMs: 0, endMs: 750 }, { word: "world", startMs: 750, endMs: 1_500 }] } }, artifacts: [{ kind: "audio", artifactRef: "new-narration-artifact", sha256: bytesDigest, byteLength: bytes.byteLength, mediaType: "audio/wav" }], files: { state: "completed", artifacts: [{ publicId: "narration-file", path: "OpenCut/narration/shot-1.wav", mimeType: "audio/wav", digest: bytesDigest, byteLength: bytes.byteLength }] } } as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
			sdk.host.cloudJobs = { get: async ({ jobRef }) => { expect(jobRef).toBe("new-narration-job"); return succeeded; } };
			sdk.pendingJobPoll = { fastPath: true, maxWaitMs: 3_000 };
			const mediaLibrary: ProductionMediaLibrary = { import: async (value) => ({ id: value.mediaId, name: value.name, type: "audio", file: value.file, duration: value.duration, filesRef: { publicId: "narration-file", path: "OpenCut/narration/shot-1.wav" } }) };
			const recovered = await runProductionNarrationCommand({ ...commandInput, expectedRevision: newer.data.revision!, attempt: 99 }, sdk, [], mediaLibrary);

			expect(recovered.data.status).toBe("completed");
			expect(sdk.calls).toHaveLength(2);
			expect(recovered.data.shots?.[0]).toMatchObject({ publicId: "narration-file", digest: bytesDigest });
		}
	});
});
