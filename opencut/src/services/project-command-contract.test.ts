import { describe, expect, mock, test } from "bun:test";
import {
	validateProjectCommandValue,
	type JsonSchema,
	type JsonSchemaValue,
} from "@ispo/contract";
import {
	type CommandResourceDelivery,
	type EntityCreateOptions,
	type EntityQuery,
	type EntityQueryResult,
	type EntityRecord,
	type EntityUpdateOptions,
} from "@ispo/sdk";
import type { EntityStorageApi } from "@/services/storage/sdk-adapter";
import type { SerializedProject } from "@/services/storage/types";
import type { StoredEntityValue } from "@/services/storage/sdk-adapter";
import type { StoredProductionDocument } from "@/project/production-types";
import { ProductionDocumentService } from "@/project/production-document-service";
import { ProductionRegenerationService } from "@/project/production-regeneration";
import { runProductionImportCommand } from "@/media/production-import";
import { runProductionScriptCommand } from "@/project/production-script-command";
import { deriveProductionImageAspectRatio, validResource, type ProductionImageSdk } from "@/services/project-image-command";
import type { ProductionNarrationSdk } from "@/services/project-narration-command";
import { runProductionCommand } from "@/services/project-command-runtime";
import { ProductionCommandRouter } from "@/services/production-command-router";
import type { ProductionImportSdk } from "@/media/production-import";
import type { ProductionMediaLibrary } from "@/services/storage/production-media-adapter";

mock.module("opencut-wasm", () => ({
	applyEffectPasses: () => undefined,
	applyMaskFeather: () => undefined,
	TICKS_PER_SECOND: () => 30_000,
	formatTimecode: () => "",
	getCompositorCanvas: () => undefined,
	getLastFrameProfile: () => undefined,
	initCompositor: () => undefined,
	initializeGpu: async () => undefined,
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) => Math.round(seconds * 30_000),
	mediaTimeToSeconds: ({ time }: { time: number }) => time / 30_000,
	lastFrameTime: ({ duration }: { duration: number }) => duration,
	parseTimecode: () => undefined,
	releaseTexture: () => undefined,
	renderFrame: () => undefined,
	resizeCompositor: () => undefined,
	roundToFrame: ({ time }: { time: number }) => time,
	snappedSeekTime: ({ time }: { time: number }) => time,
	uploadTexture: () => undefined,
}));

const {
	arrangeTimelineCommand,
	createProjectCommand,
	exportProjectCommand,
	productionAcceptVersionCommand,
	productionEditCommand,
	productionImageCommand,
	productionAnimateCommand,
	productionNarrationCommand,
	productionImportCommand,
	productionRegenerateCommand,
	productionScriptCommand,
	productionTargetsCommand,
	projectCommands,
	runExposedProductionImage,
	runExposedProductionNarration,
	runExposedProductionImport,
	runExposedProductionRegenerate,
} = await import("@/services/project-commands");
const { parseResultEnvelope } = await import("/Users/venge/Code/weekend2/apps/desktop/src/shared/capability-result-envelope-parser.ts");

const revision = {
	editId: "edit-1",
	storageCasRevision: "5",
	intentRevision: "5",
	digest: "document-digest",
};

const acceptedRevision = {
	editId: "edit-1",
	documentIntentRevision: "5",
	productionRevisionId: "production-5-script",
	contentDigest: "production-digest",
};

const productionCommands = [
	arrangeTimelineCommand,
	createProjectCommand,
	exportProjectCommand,
	productionAcceptVersionCommand,
	productionEditCommand,
	productionImageCommand,
	productionAnimateCommand,
	productionNarrationCommand,
	productionImportCommand,
	productionRegenerateCommand,
	productionScriptCommand,
	productionTargetsCommand,
] as const;

const scriptRead = {
	kind: "json" as const,
	data: {
		supported: true,
		status: "completed" as const,
		operation: "read" as const,
		editId: "edit-1",
		message: "Read production script for edit-1.",
		revision,
		acceptedRevision,
		accepted: {
			script: "A one-shot production script.",
			shots: [{ shotId: "shot-1", revision: "1", narration: "Narration", visualBrief: "Visual", motionBrief: "Visual", targetDurationSeconds: 1 }],
			canvasSize: { width: 1_920, height: 1_080 },
			fps: { numerator: 30, denominator: 1 },
			totalDurationSeconds: 1,
			aspectRatio: "16:9",
		},
	},
};

const productionTargetsRead = {
	kind: "json" as const,
	data: {
		supported: true,
		status: "completed" as const,
		operation: "production-targets" as const,
		editId: "edit-1",
		message: "Read 1 production target.",
		revision,
		acceptedRevision,
		shots: [{
			shotId: "shot-1",
			shotRevision: "1",
			image: { candidates: [] },
			narration: { history: [], candidates: [] },
			downstream: ["placement", "render"] as const,
		}],
	},
};

function runnerProject(shotCount = 1): StoredProductionDocument {
	const accepted = {
		reference: acceptedRevision,
		script: shotCount === 1 ? "A one-shot production script." : "A three-shot production script.",
		shots: Array.from({ length: shotCount }, (_, index) => ({
			shotId: `shot-${index + 1}`,
			revision: 1,
			narration: `Narration ${index + 1}`,
			visualBrief: `Visual ${index + 1}`,
			durationMs: 1_000,
		})),
		targetDurationMs: shotCount * 1_000,
		canvas: { width: 1_920, height: 1_080 },
		fps: { numerator: 30, denominator: 1 },
	};
	const project: SerializedProject = {
		metadata: { id: "edit-1", name: "Contract", duration: 1, createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" },
		scenes: [{ id: "edit-1-scene", name: "Main", isMain: true, tracks: { overlay: [], main: { id: "edit-1-main", name: "Main", type: "video", elements: [], muted: false, hidden: false }, audio: [] }, bookmarks: [], createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" }],
		currentSceneId: "edit-1-scene",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1_920, height: 1_080 },
			background: { type: "color", color: "#000000" },
			production: { formatVersion: 1, accepted, acceptanceReceipts: [], actionIntents: [] },
		},
		version: 32,
	};
	return {
		...project,
		kind: "opencut.production-document",
		formatVersion: 1,
		editId: "edit-1",
		currentIntentRevision: "5",
		snapshots: [{ intentRevision: "5", digest: revision.digest, project }],
	};
}

type RunnerFixture = ProductionImportSdk & { stored(): StoredProductionDocument };

function runnerFixture(shotCount = 1): RunnerFixture {
	let row = runnerProject(shotCount);
	let version = 5;
	const entities: EntityStorageApi = {
		query<T>(type: string, query: EntityQuery = {}): Promise<EntityQueryResult<T>> {
			// SAFETY: the fixture stores one typed project row behind the SDK envelope.
			const records = type === "opencut.project" && query.where?.storageKey === "edit-1" ? [{
				id: "project-1",
				type,
				data: { storageKey: "edit-1", value: row },
				version,
				createdBy: { kind: "project", id: "opencut" },
				updatedBy: { kind: "project", id: "opencut" },
				createdAt: "2026-09-10T00:00:00.000Z",
				updatedAt: "2026-09-10T00:00:00.000Z",
			} as EntityRecord<T>] : [];
			// SAFETY: the record is the typed project row returned by this fixture.
			return Promise.resolve({ records, cursor: null });
		},
		create<T>(type: string, data: T, options: EntityCreateOptions = {}): Promise<EntityRecord<T>> {
			return Promise.resolve({
				id: options.id ?? `${type}-${version + 1}`,
				type,
				data,
				version: 1,
				createdBy: { kind: "project", id: "opencut" },
				updatedBy: { kind: "project", id: "opencut" },
				createdAt: "2026-09-10T00:00:00.000Z",
				updatedAt: "2026-09-10T00:00:00.000Z",
			} as EntityRecord<T>);
		},
		update<T>(_type: string, _id: string, patch: Partial<T>, _options: EntityUpdateOptions = {}): Promise<EntityRecord<T>> {
			// SAFETY: compare-and-set supplies the complete stored project envelope.
			const next = patch as Partial<StoredEntityValue<StoredProductionDocument>>;
			if (next.value === undefined) throw new Error("The runner fixture requires a complete entity value");
			row = next.value;
			version += 1;
			// SAFETY: the fixture row remains the typed project envelope after update.
			const data = { storageKey: "edit-1", value: row } as StoredEntityValue<T>;
			// SAFETY: the updated record is produced by this typed fixture.
			return Promise.resolve({
				id: "project-1",
				type: "opencut.project",
				data,
				version,
				createdBy: { kind: "project", id: "opencut" },
				updatedBy: { kind: "project", id: "opencut" },
				createdAt: "2026-09-10T00:00:00.000Z",
				updatedAt: "2026-09-10T00:00:00.000Z",
			} as EntityRecord<T>);
		},
		delete<T>(_type: string, _id: string): Promise<EntityRecord<T>> {
			throw new Error("The runner fixture does not delete entities");
		},
		subscribeQuery: () => ({ close: () => undefined }),
	};
	const files: ProductionImportSdk["files"] = {
		list: async () => [],
		publish: async () => ({ publicId: "imported-media", path: "OpenCut/imported-media" }),
		media: { read: async () => { throw new Error("The runner fixture does not stream media"); } },
	};
	return { entities, files, stored: () => structuredClone(row) };
}

async function inlineImageDelivery(): Promise<CommandResourceDelivery> {
	const bytes = new Uint8Array([1, 2, 3, 4]);
	const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	return {
		slot: "media",
		items: [{ name: "shot.png", mediaType: "image/png", digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""), bytes }],
	};
}

function pcmWavBytes(durationMs: number): Uint8Array {
	const sampleRate = 48_000;
	const channels = 1;
	const bitsPerSample = 16;
	const blockAlign = channels * bitsPerSample / 8;
	const byteRate = sampleRate * blockAlign;
	const dataSize = byteRate * durationMs / 1_000;
	const bytes = new Uint8Array(44 + dataSize);
	const view = new DataView(bytes.buffer);
	const writeText = (offset: number, value: string) => value.split("").forEach((character, index) => { bytes[offset + index] = character.charCodeAt(0); });
	writeText(0, "RIFF");
	view.setUint32(4, bytes.byteLength - 8, true);
	writeText(8, "WAVE");
	writeText(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitsPerSample, true);
	writeText(36, "data");
	view.setUint32(40, dataSize, true);
	return bytes;
}

async function inlineWavDelivery(bytes: Uint8Array): Promise<CommandResourceDelivery> {
	const digestBuffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	const digest = Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return { slot: "media", items: [{ name: "narration.wav", mediaType: "audio/wav", digest, bytes }] };
}

function validate(command: { id: string; inputSchema: JsonSchema }, value: JsonSchemaValue): void {
	validateProjectCommandValue(value, command.inputSchema, command.id);
}

function validateResult(command: { id: string; resultSchema: JsonSchema }, value: JsonSchemaValue): void {
	assertJsonClean(value);
	const roundTripped = JSON.parse(JSON.stringify(value));
	expect(roundTripped).toEqual(value);
	const parsed = parseResultEnvelope(roundTripped, "json");
	validateProjectCommandValue(parsed as JsonSchemaValue, command.resultSchema, `${command.id} result`);
}

function assertJsonClean(value: unknown, path = "$"): void {
	if (typeof value === "function") throw new Error(`${path} contains a function`);
	if (typeof value === "number") {
		expect(Number.isFinite(value)).toBe(true);
		return;
	}
	if (value === null || typeof value !== "object") {
		expect(value).not.toBeUndefined();
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => assertJsonClean(item, `${path}[${index}]`));
		return;
	}
	for (const [key, child] of Object.entries(value)) {
		expect(child).not.toBeUndefined();
		assertJsonClean(child, `${path}.${key}`);
	}
}

function parseHostCandidate(value: unknown): { candidateId: string; mediaRevision: string } | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const candidate = value as Record<string, unknown>;
	const candidateId = typeof candidate.candidateId === "string"
		? candidate.candidateId
		: typeof candidate.idempotencyKey === "string" ? candidate.idempotencyKey : undefined;
	const version = candidate.version;
	const mediaRevision = version && typeof version === "object" && !Array.isArray(version) && typeof (version as Record<string, unknown>).mediaRevision === "string"
		? (version as Record<string, unknown>).mediaRevision
		: undefined;
	const acceptedRevision = candidate.acceptedRevision;
	const hasReference = acceptedRevision && typeof acceptedRevision === "object" && !Array.isArray(acceptedRevision) &&
		["editId", "documentIntentRevision", "productionRevisionId", "contentDigest"].every((key) => typeof (acceptedRevision as Record<string, unknown>)[key] === "string");
	return candidateId && mediaRevision && hasReference ? { candidateId, mediaRevision } : null;
}

describe("production command revision contract", () => {
	test("production descriptor snapshot documents the complete flow", () => {
		const guidance = productionCommands.map(({ id, usage, preconditions }) => ({ id, usage, preconditions }));
		expect(guidance).toEqual([
			{
				id: "arrange-timeline",
				usage: "Run this command in the chat. Place selected accepted visual, video-clip, narration, and caption media. Stills take the shot duration; video clips are trimmed to it and leave a gap if shorter, with narration beneath the picture. Pass the returned revision to export. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
				preconditions: [{ summary: "In the chat, provide the accepted script revision and selected media versions before arranging the timeline. Create a Task only for a multi-step production run left running across turns or explicitly in the background.", requiresInput: "acceptedRevision" }],
			},
			{
				id: "create-project",
				usage: "Run this command in the chat to create a new edit in the mounted editor and navigate to it. Use it when the requested aspect ratio or production target differs from the current edit; pass an optional name for the new edit.",
				preconditions: [{ summary: "The mounted editor must be ready. Use this when no existing edit matches the requested aspect ratio and production target." }],
			},
			{
				id: "export-project",
				usage: "Run this command in the chat. Render the current arranged edit at its exact expected revision, validate the video, and publish the finished artifact to Files for the production result. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
				preconditions: [{ summary: "In the chat, arrange accepted media first and pass the current edit revision returned by that step or a later read. Create a Task only for a multi-step production run left running across turns or explicitly in the background.", requiresInput: "expectedRevision" }],
			},
			{
				id: "production-accept-version",
				usage: "Run this command in the chat. Accept one reviewed candidate or retained version for one shot using the exact revisions and candidate or version returned by production-targets or production-regenerate. The accepted media is placed on the production timeline; render still needs updating. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
				preconditions: [{ summary: "In the chat, review a current target or regeneration result before accepting a media version. Create a Task only for a multi-step production run left running across turns or explicitly in the background.", requiresInput: "acceptedRevision" }],
			},
			{
				id: "production-edit",
				usage: "Run this command in the chat. Start with list-edits, or inspect-edit without editId, to find the current edit and revision. Use list-media on a named edit to read accepted and candidate media without mounting the editor. Pass that revision to rename, arrange, or export; mutations require an explicit editId. Export returns a validated video artifact in Files. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
				preconditions: [{ summary: "Use list-edits or inspect-edit without editId to find the current edit. Rename, arrange, and export require an explicit editId and the exact revision returned by a read. Create a Task only for a multi-step production run left running across turns or explicitly in the background." }],
			},
			{
				id: "production-image",
				usage: "Run this command in the chat. Pass the accepted script revision and an exact image model pin when one is chosen, or omit model to use the host default, then generate storyboard images for accepted shots. Re-running collects the pending job; never change attempt to retry. Pass newVersion true only for another version. Use the accepted images of earlier shots, a deterministic random style pool, explicit Files references, or the stored style anchor; a supplied style anchor becomes the edit default. Host confirmation and Approval Center carry the model, price, and consent; the agent does not ask for those decisions in prose. Each completed image is published to Files, added to the mounted Assets panel when the edit is open, and recorded as a revision-bound candidate in the edit; its dimensions follow the edit aspect and the editor fits the still to the canvas; production-import is not needed. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
				preconditions: [{ summary: "In chat, pass the accepted revision and exact model pin or omit it for the host default. Re-running collects pending work; keep attempt unchanged. Use newVersion true for another version. Host confirmation and Approval Center own model, price, and consent.", requiresInput: "acceptedRevision" }],
			},
			{
				id: "production-animate",
				usage: "Run this command in the chat after accepting storyboard images. Re-running collects the pending job; never change attempt to retry. Pass newVersion true only for another version. The host-owned Animate scenes segment action must invoke this command; host confirmation and Approval Center carry consent. Each result is stored in Files, added to mounted Assets when available, and can be reviewed with production-targets before production-accept-version role animation.",
				preconditions: [{ summary: "In chat, pass the accepted revision, edit revision, selected accepted shots, and storyboard images. Re-running collects pending work; keep attempt unchanged. Use newVersion true for another version. The host production segment owns the Animate scenes action.", requiresInput: "acceptedRevision" }],
			},
			{
				id: "production-narration",
				usage: "Run this command in the chat. Pass the accepted script revision and the voice selected by the host-owned control to generate narration. Re-running collects the pending job; never change attempt to retry. Pass newVersion true only for another version. Host confirmation and Approval Center carry voice, price, and consent; the agent does not ask for those decisions in prose. Each completed WAV is published to Files with provider alignment when available, added to the mounted Assets panel when the edit is open, and imported into the matching accepted shot; callers must pass the returned revision onward. Create a Task only for a multi-step run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
				preconditions: [{ summary: "In chat, pass accepted revision, shot IDs, attempt, and host-selected voice. Re-running collects pending work; keep attempt unchanged. Use newVersion for another version. Host confirmation and Approval Center own voice, price, and consent; bind shots to accepted revision.", requiresInput: "acceptedRevision" }],
			},
			{
				id: "production-import",
				usage: "Run this command in the chat. Import one admitted image, video clip, or narration resource into an accepted shot. MP4 and WebM clips use host-stamped duration and dimensions, retain revisions, and proceed to arrange-timeline; generated production-image outputs already land in Files and skip this command. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
				preconditions: [{ summary: "In the chat, the source must be an admitted media resource for an accepted shot. Create a Task only for a multi-step production run left running across turns or explicitly in the background.", requiresInput: "acceptedRevision" }],
			},
			{
				id: "production-regenerate",
				usage: "Run this command in the chat. Read production-targets, then invoke with an exact chosen image model pin or omit model for the host default to request candidates only for selected accepted shots. Keep the prior reference set by default or provide an explicit previous, random, or Files selection. Host confirmation and Approval Center carry the model, price, and consent; the agent does not ask for those decisions in prose. Review and use production-accept-version for exactly the chosen candidate. Placement and render become stale. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
				preconditions: [{ summary: "In chat, use the accepted revision from a current read and pass exact image model pin or omit it for the host default. Host confirmation and Approval Center present model, price, and consent. Create a Task only for a multi-step run left across turns or explicitly in background.", requiresInput: "acceptedRevision" }],
			},
			{
				id: "production-script",
				usage: "Run this command in the chat. Read the current edit with editId omitted or explicit, save-draft to revise ordered shots, then ask the user with ask_user to accept the draft. Only the accepted revision drives production; pass the exact revision returned by the prior command. Mutations require an explicit editId. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
				preconditions: [
					{ summary: "Read resolves the editor's current edit when editId is omitted. Save-draft and accept require an explicit editId and current revision. Create a Task only for a multi-step production run left running across turns or explicitly in the background." },
					{ summary: "Ask the user with ask_user for script acceptance; the agent never self-accepts. Create a Task only for a multi-step production run left running across turns or explicitly in the background." },
				],
			},
			{
				id: "production-targets",
				usage: "Run this command in the chat. After script acceptance, read selected shot targets and candidate media. Pass the accepted revision and current edit revision returned by the previous read or mutation. Create a Task only for a multi-step production run the user wants to leave running across turns—several shots generated, imported, arranged, and rendered—or explicitly in the background.",
				preconditions: [{ summary: "In the chat, use an accepted script revision with shots to inspect production targets. Create a Task only for a multi-step production run left running across turns or explicitly in the background.", requiresInput: "acceptedRevision" }],
			},
		]);
		for (const command of productionCommands) {
			expect(command.usage).toBeTypeOf("string");
			expect(command.preconditions?.length).toBeGreaterThan(0);
		}
	});

	test("every exposed command precondition has valid catalog shape", () => {
		for (const command of projectCommands.catalog.commands) {
			if (command.preconditions === undefined) continue;
			expect(Array.isArray(command.preconditions)).toBe(true);
			expect(command.preconditions.length).toBeGreaterThan(0);
			expect(command.preconditions.length).toBeLessThanOrEqual(16);
			for (const precondition of command.preconditions) {
				expect(Object.keys(precondition).every((key) => key === "summary" || key === "requiresInput")).toBe(true);
				expect(precondition.summary).toBeTypeOf("string");
				expect(precondition.summary.trim().length).toBeGreaterThan(0);
				expect(precondition.summary.length).toBeLessThanOrEqual(280);
				if (precondition.requiresInput === undefined) continue;
				expect(precondition.requiresInput).toBeTypeOf("string");
				expect(precondition.requiresInput.trim().length).toBeGreaterThan(0);
				expect(precondition.requiresInput.length).toBeLessThanOrEqual(128);
				expect(Object.hasOwn(command.inputSchema.properties ?? {}, precondition.requiresInput)).toBe(true);
			}
		}
	});

	test("allows edit discovery reads without an editId", () => {
		expect(() => validate(productionEditCommand, { operation: "list-edits" })).not.toThrow();
		expect(() => validate(productionEditCommand, { operation: "inspect-edit" })).not.toThrow();
		expect(() => validate(productionScriptCommand, { operation: "read" })).not.toThrow();
	});

	test("does not advertise the mounted-editor transcription operation", () => {
		expect(() => validate(productionEditCommand, { operation: "transcribe-media" } as JsonSchemaValue)).toThrow();
		expect(productionEditCommand.inputSchema.properties?.operation?.enum).not.toContain("transcribe-media");
		expect(() => validate(productionImportCommand, {
			editId: "edit-1",
			expectedRevision: revision,
			acceptedRevision,
			shotId: "shot-1",
			shotRevision: "1",
			role: "unknown",
			idempotencyKey: "invalid-role",
		} as JsonSchemaValue)).toThrow();
	});

	test("production image accepts an optional strict model pin", () => {
		const value = {
			editId: "edit-1",
			expectedRevision: revision,
			acceptedRevision,
			shotIds: ["shot-1"],
			attempt: 1,
		};
		expect(() => validate(productionImageCommand, value)).not.toThrow();
		expect(() => validate(productionImageCommand, { ...value, model: { modelKey: "flux-dev", modelVersion: "flux-dev-v1" } })).not.toThrow();
		expect(() => validate(productionImageCommand, { ...value, model: { modelKey: "flux-dev", modelVersion: "flux-dev-v1", extra: true } })).toThrow();
		expect(() => validate(productionImageCommand, { ...value, model: { modelKey: "", modelVersion: "flux-dev-v1" } })).toThrow();
		expect(() => validate(productionImageCommand, { ...value, model: { modelKey: "x".repeat(65), modelVersion: "flux-dev-v1" } })).toThrow();
		expect(() => validate(productionImageCommand, { ...value, model: { modelKey: "flux-dev", modelVersion: "x".repeat(97) } })).toThrow();
	});

	test("derives the nearest supported storyboard aspect from the accepted canvas", () => {
		const cases = [
			[{ width: 1024, height: 1024 }, "1:1"],
			[{ width: 1920, height: 1080 }, "16:9"],
			[{ width: 1080, height: 1920 }, "9:16"],
			[{ width: 1600, height: 1200 }, "4:3"],
			[{ width: 1200, height: 1600 }, "3:4"],
			[{ width: 2520, height: 1080 }, "21:9"],
			[{ width: 1000, height: 700 }, "4:3"],
			[{ width: 1000, height: 600 }, "16:9"],
			[{ width: 500, height: 1000 }, "9:16"],
		] as const;
		for (const [canvas, expected] of cases) expect(deriveProductionImageAspectRatio(canvas)).toBe(expected);
	});

	test("validates native result dimensions against the requested aspect", () => {
		const resource = {
			kind: "files" as const,
			publicId: "image",
			path: "storyboard.png",
			digest: "d".repeat(64),
			byteLength: 1,
			mimeType: "image/png" as const,
			dimensions: { width: 1344, height: 768 },
		};
		expect(validResource(resource, "16:9")).toBe(true);
		expect(validResource(resource, "9:16")).toBe(false);
		expect(validResource({ ...resource, dimensions: undefined }, "16:9")).toBe(false);
	});

	test("production image forwards the model pin and records it on the candidate", async () => {
		const fixture = runnerFixture();
		const model = { modelKey: "flux-dev", modelVersion: "flux-dev-v1" };
		const calls: Array<{ model?: typeof model }> = [];
		const imageSdk: ProductionImageSdk = {
			...fixture,
			host: {
				storyboardImage: {
					generate: async (input) => {
						calls.push(input);
						return {
							resource: {
								kind: "files",
								publicId: "generated-image",
								path: "OpenCut/edit-1/storyboards/shot-1-1.png",
								digest: "d".repeat(64),
								byteLength: 10,
								mimeType: "image/png",
								dimensions: { width: 1_920, height: 1_080 },
							},
							aspectRatio: "16:9",
							model,
						};
					},
				},
			},
		};
		const result = await runExposedProductionImage({ editId: "edit-1", expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"], attempt: 1, model }, imageSdk);
		expect(result.data.status).toBe("completed");
		expect(calls[0]?.model).toEqual(model);
		expect(calls[0]).toMatchObject({ aspectRatio: "16:9", width: 1_920, height: 1_080 });
		expect(fixture.stored().settings.production?.accepted?.shots[0]?.imageCandidates?.[0]?.model).toEqual(model);
		expect(fixture.stored().settings.production?.accepted?.shots[0]?.imageCandidates?.[0]).toMatchObject({ aspectRatio: "16:9", dimensions: { width: 1_920, height: 1_080 } });
		const storedCandidate = fixture.stored().settings.production?.accepted?.shots[0]?.imageCandidates?.[0];
		expect(storedCandidate).toMatchObject({ candidateId: storedCandidate?.idempotencyKey, mediaId: expect.stringMatching(/^production-media-/), version: { mediaRevision: "d".repeat(64) } });
		expect(parseHostCandidate(storedCandidate)).toEqual({ candidateId: storedCandidate?.idempotencyKey, mediaRevision: "d".repeat(64) });
		const targets = await new ProductionRegenerationService(new ProductionDocumentService(fixture)).targets({ editId: "edit-1", expectedRevision: result.data.revision!, acceptedRevision });
		expect(targets.data.shots?.[0]?.image.candidates[0]?.model).toEqual(model);
		const listed = await new ProductionCommandRouter(new ProductionDocumentService(fixture)).run({ operation: "list-media", editId: "edit-1" });
		expect(listed).toMatchObject({ data: { media: [{ candidates: [{ candidateId: storedCandidate?.idempotencyKey, mediaId: storedCandidate?.mediaId, mediaRevision: "d".repeat(64) }] }] } });
		const accepted = await new ProductionCommandRouter(new ProductionDocumentService(fixture)).run({ operation: "production-accept-version", editId: "edit-1", expectedRevision: result.data.revision, acceptedRevision, shotId: "shot-1", shotRevision: 1, role: "visual", candidateId: storedCandidate?.candidateId, idempotencyKey: "accept-generated-image" });
		expect(accepted).toMatchObject({ data: { status: "completed", role: "visual" } });
		const acceptedProject = fixture.stored();
		expect(acceptedProject.settings.production?.accepted?.shots[0]?.imageVersion).toMatchObject({ mediaId: storedCandidate?.mediaId, mediaRevision: "d".repeat(64) });
		expect(acceptedProject.scenes[0]?.tracks.overlay[0]?.elements[0]).toMatchObject({ mediaId: storedCandidate?.mediaId, production: { role: "visual", shotId: "shot-1" } });
	});

	test("production image reports a pending Cloud job without claiming completion or exposing its job reference", async () => {
		const fixture = runnerFixture();
		const pendingError = Object.assign(new Error("The image job is still running."), {
			name: "StoryboardImagePendingError",
			code: "pending" as const,
			jobRef: "cloud-job-opaque",
		});
		let calls = 0;
		const imageSdk: ProductionImageSdk = {
			...fixture,
			host: {
				storyboardImage: {
					generate: async (input) => {
						calls += 1;
							expect(input.timeoutMs).toBe(30_000);
						throw pendingError;
					},
				},
			},
		};

		const result = await runExposedProductionImage({ editId: "edit-1", expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"], attempt: 1 }, imageSdk);

		expect(result.data.status).toBe("pending");
		expect(result.data.operationId).toBeUndefined();
		expect(result.data.message).toBe("Storyboard image generation is still in progress; the Cloud job continues on the host. Re-run this command to collect it.");
		expect(calls).toBe(1);
		expect(fixture.stored().settings.production?.accepted?.shots[0]?.imageCandidates).toBeUndefined();
		expect(JSON.stringify(result)).not.toContain(pendingError.jobRef);
		validateResult(productionImageCommand, result);
	});

	test("production narration chooses a curated voice and imports WAV alignment into the accepted shot", async () => {
		const fixture = runnerFixture();
		const wav = pcmWavBytes(1_500);
		const calls: Array<Parameters<ProductionNarrationSdk["host"]["narration"]["generate"]>[0]> = [];
		const narrationSdk: ProductionNarrationSdk = {
			...fixture,
			host: {
				narration: {
					generate: async (input) => {
						calls.push(input);
						return {
							resource: {
								kind: "files",
								publicId: "voice-file-1",
								path: "OpenCut/edit-1/narration/shot-1-1.wav",
								digest: "f".repeat(64),
								byteLength: wav.byteLength,
								mimeType: "audio/wav",
							},
							text: input.text,
							voice: input.voice,
							model: { modelKey: "elevenlabs-narration", modelVersion: "elevenlabs-narration-2026-09-12" },
							alignment: { words: [{ word: "Narration", startMs: 0, endMs: 1_500 }] },
						};
					},
				},
			},
		};
		const result = await runExposedProductionNarration({ editId: "edit-1", expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"], attempt: 1, voice: "warm" }, { sdk: narrationSdk, resources: [await inlineWavDelivery(wav)] });
		expect(result.data.status).toBe("completed");
		expect(calls[0]).toMatchObject({ text: "Narration 1", voice: "warm", alignment: true, format: "wav" });
		expect(fixture.stored().settings.production?.accepted?.shots[0]?.narrationVersion).toMatchObject({
		mediaType: "audio",
		mimeType: "audio/wav",
		publishedFiles: { publicId: "voice-file-1" },
		alignment: [{ text: "Narration", start: 0, end: 1.5 }],
	});
	validateResult(productionNarrationCommand, result);
	});

	test("production narration reports a pending Cloud job with host-resume guidance", async () => {
		const fixture = runnerFixture();
		const pendingError = Object.assign(new Error("The narration job is still running."), {
			name: "NarrationPendingError",
			code: "pending" as const,
			jobRef: "cloud-narration-job-opaque",
		});
		let call: Parameters<ProductionNarrationSdk["host"]["narration"]["generate"]>[0] | undefined;
		const narrationSdk: ProductionNarrationSdk = {
			...fixture,
			host: {
				narration: {
					generate: async (input) => {
						call = input;
						throw pendingError;
					},
				},
			},
		};

		const result = await runExposedProductionNarration({ editId: "edit-1", expectedRevision: revision, acceptedRevision, shotIds: ["shot-1"], attempt: 1, voice: "warm" }, { sdk: narrationSdk });

		expect(result.data.status).toBe("pending");
		expect(result.data.reason).toBeUndefined();
		expect(result.data.message).toBe("Narration generation is still in progress; the Cloud job continues on the host. Re-run this command to collect it.");
		expect(call?.timeoutMs).toBe(30_000);
		expect(JSON.stringify(result)).not.toContain(pendingError.jobRef);
		validateResult(productionNarrationCommand, result);
	});

	test("read outputs survive JSON round trips and feed every production consumer", () => {
		const readJson = JSON.parse(JSON.stringify(scriptRead));
		const targetsJson = JSON.parse(JSON.stringify(productionTargetsRead));
		expect(readJson).toEqual(scriptRead);
		expect(targetsJson).toEqual(productionTargetsRead);
		expect(readJson.data.accepted.shots[0].revision).toBe("1");
		expect(targetsJson.data.shots[0].shotRevision).toBe("1");

		const target = targetsJson.data.shots[0];
		const consumers: Array<{ command: { id: string; inputSchema: unknown }; value: unknown }> = [
			{ command: productionEditCommand, value: { operation: "inspect-edit", editId: readJson.data.editId, expectedRevision: readJson.data.revision } },
			{ command: productionScriptCommand, value: { operation: "accept", editId: readJson.data.editId, expectedRevision: readJson.data.revision, idempotencyKey: "accept-1" } },
			{ command: productionTargetsCommand, value: { editId: targetsJson.data.editId, expectedRevision: targetsJson.data.revision, acceptedRevision: targetsJson.data.acceptedRevision, shotIds: [target.shotId] } },
			{ command: productionImportCommand, value: { editId: targetsJson.data.editId, expectedRevision: targetsJson.data.revision, acceptedRevision: targetsJson.data.acceptedRevision, shotId: target.shotId, shotRevision: target.shotRevision, role: "visual", idempotencyKey: "import-1" } },
			{ command: productionImageCommand, value: { editId: readJson.data.editId, expectedRevision: readJson.data.revision, acceptedRevision: readJson.data.acceptedRevision, shotIds: [target.shotId], attempt: 1 } },
			{ command: arrangeTimelineCommand, value: { editId: targetsJson.data.editId, expectedRevision: targetsJson.data.revision, acceptedRevision: targetsJson.data.acceptedRevision, idempotencyKey: "place-1", shots: [{ shotId: target.shotId, shotRevision: target.shotRevision, startSeconds: 0, durationSeconds: 1 }] } },
			{ command: productionRegenerateCommand, value: { editId: targetsJson.data.editId, expectedRevision: targetsJson.data.revision, acceptedRevision: targetsJson.data.acceptedRevision, idempotencyKey: "regen-1", changes: [{ shotId: target.shotId, role: "visual", brief: "A new frame" }] } },
			{ command: productionAcceptVersionCommand, value: { editId: targetsJson.data.editId, expectedRevision: targetsJson.data.revision, acceptedRevision: targetsJson.data.acceptedRevision, shotId: target.shotId, shotRevision: target.shotRevision, role: "visual", idempotencyKey: "accept-version-1", useVersion: "version-1" } },
			{ command: exportProjectCommand, value: { editId: readJson.data.editId, expectedRevision: readJson.data.revision } },
		];

		for (const consumer of consumers) {
			expect(() => validate(consumer.command, consumer.value)).not.toThrow();
		}

		const importedResult = {
			kind: "json" as const,
			data: {
				supported: true,
				status: "completed" as const,
				operation: "production-import" as const,
				editId: "edit-1",
				message: "Imported narration media for shot-1.",
				revision,
				media: { mediaId: "production-media-1", mediaRevision: "digest-1", shotId: "shot-1", role: "narration" as const, durationMs: 1_500 },
				filesRef: { publicId: "file-narration-1", path: "Media/narration.wav" },
			},
		};
		validateResult(productionImportCommand, importedResult);
	});

	test("validates actual success and refusal envelopes for every production runner", async () => {
		const { runProductionPlacement } = await import("@/timeline/production-placement");
		const sdk = runnerFixture();
		const missingEdit = "missing-edit";
		const missingRevision = { ...revision, editId: missingEdit };
		const missingAcceptedRevision = { ...acceptedRevision, editId: missingEdit };
		const scriptSuccess = await runProductionScriptCommand({ operation: "read", editId: "edit-1" }, sdk);
		const scriptRefusal = await runProductionScriptCommand({ operation: "read", editId: missingEdit }, sdk);
		validateResult(productionScriptCommand, scriptSuccess);
		validateResult(productionScriptCommand, scriptRefusal);

		const targetsService = new ProductionRegenerationService(new ProductionDocumentService(sdk));
		const targetsSuccess = await targetsService.targets({ editId: "edit-1", expectedRevision: revision, acceptedRevision });
		const targetsRefusal = await targetsService.targets({ editId: missingEdit, expectedRevision: missingRevision, acceptedRevision: missingAcceptedRevision });
		validateResult(productionTargetsCommand, targetsSuccess);
		validateResult(productionTargetsCommand, targetsRefusal);

		const importSuccess = await runProductionImportCommand({
			editId: "edit-1",
			expectedRevision: revision,
			acceptedRevision,
			shotId: "shot-1",
			shotRevision: 1,
			role: "visual",
			idempotencyKey: "contract-result-import",
		}, sdk, [await inlineImageDelivery()], { import: async (media) => ({ id: media.mediaId, name: media.name, type: "image", file: media.file, width: media.width, height: media.height }) });
		const importRefusal = await runProductionImportCommand({
			editId: missingEdit,
			expectedRevision: missingRevision,
			acceptedRevision: missingAcceptedRevision,
			shotId: "shot-1",
			shotRevision: 1,
			role: "visual",
			idempotencyKey: "contract-result-import-refused",
		}, sdk, []);
		expect(importSuccess.kind).toBe("json");
		expect(importRefusal.kind).toBe("json");
		const exposedImportRunnerSuccess = await runExposedProductionImport({
			editId: "edit-1",
			expectedRevision: revision,
			acceptedRevision,
			shotId: "shot-1",
			shotRevision: "1",
			role: "visual",
			idempotencyKey: "contract-result-import-exposed",
		}, { sdk: runnerFixture(), resources: [await inlineImageDelivery()] });
		const exposedImportRunnerRefusal = await runExposedProductionImport({
			editId: missingEdit,
			expectedRevision: missingRevision,
			acceptedRevision: missingAcceptedRevision,
			shotId: "shot-1",
			shotRevision: "1",
			role: "visual",
			idempotencyKey: "contract-result-import-refused-exposed",
		}, { sdk, resources: [] });
		validateResult(productionImportCommand, exposedImportRunnerSuccess);
		validateResult(productionImportCommand, exposedImportRunnerRefusal);

		const imageSdk: ProductionImageSdk = {
			...sdk,
			host: { storyboardImage: { generate: async () => { throw new Error("unreachable"); } } },
		};
		const imageRefusal = await runExposedProductionImage({ editId: missingEdit, expectedRevision: missingRevision, acceptedRevision: missingAcceptedRevision, shotIds: ["shot-1"], attempt: 1 }, imageSdk);
		validateResult(productionImageCommand, imageRefusal);
		const exposedImportRefusal = await runExposedProductionImport({
			editId: missingEdit,
			expectedRevision: missingRevision,
			acceptedRevision: missingAcceptedRevision,
			shotId: "shot-1",
			shotRevision: "1",
			role: "visual",
			idempotencyKey: "contract-exposed-import-refused",
		}, { sdk, resources: [] });
		validateResult(productionImportCommand, exposedImportRefusal);
		expect(exposedImportRefusal.data.filesRef).toEqual({ publicId: missingEdit });
		const exposedImportSuccess = await runExposedProductionImport({
			editId: "edit-1",
			expectedRevision: revision,
			acceptedRevision,
			shotId: "shot-1",
			shotRevision: "1",
			role: "visual",
			idempotencyKey: "contract-exposed-import-success",
		}, { sdk: runnerFixture(), resources: [await inlineImageDelivery()] });
		validateResult(productionImportCommand, exposedImportSuccess);
		expect(exposedImportSuccess.kind).toBe("json");

		const failingImageSdk: ProductionImageSdk = {
			...sdk,
			host: { storyboardImage: { generate: async () => { throw new Error("producer refused"); } } },
		};
		const exposedRegenerateRefusal = await runExposedProductionRegenerate({ editId: "edit-1", expectedRevision: revision, acceptedRevision, idempotencyKey: "contract-exposed-regenerate-refused", changes: [{ shotId: "shot-1", role: "visual", brief: "A new frame" }] }, failingImageSdk);
		validateResult(productionRegenerateCommand, exposedRegenerateRefusal);

		const placementRefusal = await runProductionPlacement({ editId: missingEdit, expectedRevision: missingRevision, acceptedRevision: missingAcceptedRevision, idempotencyKey: "contract-result-placement", shots: [{ shotId: "shot-1", shotRevision: 1, startSeconds: 0, durationSeconds: 1 }] }, sdk);
		validateResult(arrangeTimelineCommand, placementRefusal);

		const regenerateRefusal = await targetsService.regenerate({ editId: missingEdit, expectedRevision: missingRevision, acceptedRevision: missingAcceptedRevision, idempotencyKey: "contract-result-regenerate", changes: [{ shotId: "shot-1", role: "visual", brief: "A new frame" }] });
		validateResult(productionRegenerateCommand, regenerateRefusal);
		const acceptVersionRefusal = await targetsService.acceptVersion({ editId: missingEdit, expectedRevision: missingRevision, acceptedRevision: missingAcceptedRevision, shotId: "shot-1", shotRevision: 1, role: "visual", idempotencyKey: "contract-result-accept-version", useVersion: "version-1" });
		validateResult(productionAcceptVersionCommand, acceptVersionRefusal);

		const editSuccess = await runProductionCommand({ operation: "inspect-edit", editId: "edit-1" }, sdk);
		const editRefusal = await runProductionCommand({ operation: "inspect-edit", editId: missingEdit }, sdk);
		const listMediaSuccess = await new ProductionCommandRouter(new ProductionDocumentService(sdk)).run({ operation: "list-media", editId: "edit-1" });
		validateResult(productionEditCommand, editSuccess);
		validateResult(productionEditCommand, editRefusal);
		validateResult(productionEditCommand, listMediaSuccess);
		const exportRefusal = await new ProductionCommandRouter(new ProductionDocumentService(sdk)).run({ operation: "export-project", editId: missingEdit, expectedRevision: missingRevision });
		validateResult(exportProjectCommand, exportRefusal);
	});

	test("keeps every conformance command result JSON-clean", async () => {
		const sdk = runnerFixture(3);
		const documents = new ProductionDocumentService(sdk);
		const router = new ProductionCommandRouter(documents);
		const scriptSaved = await runProductionScriptCommand({
			operation: "save-draft",
			editId: "edit-1",
			expectedRevision: revision,
			idempotencyKey: "json-clean-save-draft",
			script: "A three-shot production fixture.",
			shots: [1, 2, 3].map((number) => ({
				shotId: `shot-${number}`,
				narration: `Narration ${number}`,
				visualBrief: `Visual ${number}`,
				targetDurationSeconds: 1,
			})),
		}, sdk);
		const scriptAccepted = await runProductionScriptCommand({
			operation: "accept",
			editId: "edit-1",
			expectedRevision: scriptSaved.data.revision!,
			idempotencyKey: "json-clean-accept",
		}, sdk);
		const targets = await new ProductionRegenerationService(documents).targets({
			editId: "edit-1",
			expectedRevision: scriptAccepted.data.revision!,
			acceptedRevision: scriptAccepted.data.acceptedRevision!,
		});
		const listMedia = await router.run({ operation: "list-media", editId: "edit-1" });
		const listEdits = await router.run({ operation: "list-edits" });
		const inspect = await router.run({ operation: "inspect-edit", editId: "edit-1" });
		const importRefusal = await runExposedProductionImport({
			editId: "missing-edit",
			expectedRevision: revision,
			acceptedRevision,
			shotId: "shot-1",
			shotRevision: "1",
			role: "visual",
			idempotencyKey: "json-clean-import",
		}, { sdk, resources: [] });
		const imageRefusal = await runExposedProductionImage({
			editId: "missing-edit",
			expectedRevision: revision,
			acceptedRevision,
			shotIds: ["shot-1"],
			attempt: 1,
		}, {
			...sdk,
			host: { storyboardImage: { generate: async () => { throw new Error("unreachable"); } } },
		});
		const regenerationRefusal = await new ProductionRegenerationService(documents).regenerate({
			editId: "missing-edit",
			expectedRevision: revision,
			acceptedRevision,
			idempotencyKey: "json-clean-regenerate",
			changes: [{ shotId: "shot-1", role: "visual" }],
		});
		const acceptVersionRefusal = await new ProductionRegenerationService(documents).acceptVersion({
			editId: "missing-edit",
			expectedRevision: revision,
			acceptedRevision,
			shotId: "shot-1",
			shotRevision: 1,
			role: "visual",
			idempotencyKey: "json-clean-accept-version",
			useVersion: "missing-version",
		});
		const { runProductionPlacement } = await import("@/timeline/production-placement");
		const placementRefusal = await runProductionPlacement({
			editId: "missing-edit",
			expectedRevision: revision,
			acceptedRevision,
			idempotencyKey: "json-clean-placement",
			shots: [{ shotId: "shot-1", shotRevision: 1, startSeconds: 0, durationSeconds: 1 }],
		}, sdk);
		const exportRefusal = await router.run({ operation: "export-project", editId: "missing-edit", expectedRevision: revision });

		const results: Array<[string, { id: string; resultSchema: JsonSchema }, JsonSchemaValue]> = [
			["script save", productionScriptCommand, scriptSaved],
			["script accept", productionScriptCommand, scriptAccepted],
			["production targets", productionTargetsCommand, targets],
			["list media", productionEditCommand, listMedia],
			["list edits", productionEditCommand, listEdits],
			["inspect edit", productionEditCommand, inspect],
			["production import", productionImportCommand, importRefusal],
			["production image", productionImageCommand, imageRefusal],
			["production regenerate", productionRegenerateCommand, regenerationRefusal],
			["production accept version", productionAcceptVersionCommand, acceptVersionRefusal],
			["arrange timeline", arrangeTimelineCommand, placementRefusal],
			["export project", exportProjectCommand, exportRefusal],
		];
		for (const [label, command, result] of results) {
			assertJsonClean(result, label);
			const roundTripped = JSON.parse(JSON.stringify(result));
			expect(roundTripped).toEqual(result);
			validateProjectCommandValue(parseResultEnvelope(roundTripped, "json") as JsonSchemaValue, command.resultSchema, `${label} result`);
		}
		expect(targets.data.shots).toHaveLength(3);
		for (const target of targets.data.shots ?? []) {
			expect(Object.hasOwn(target.narration, "accepted")).toBe(false);
		}
	});

	test("passes read revisions through the real import runner with a complete command input", async () => {
		const sdk = runnerFixture();
		const read = await runProductionScriptCommand({ operation: "read", editId: "edit-1" }, sdk);
		if (!read.data.revision || !read.data.acceptedRevision) throw new Error("The runner fixture did not produce a complete script read");
		const readJson = JSON.parse(JSON.stringify(read));
		const targets = await new ProductionRegenerationService(new ProductionDocumentService(sdk)).targets({
			editId: readJson.data.editId,
			expectedRevision: readJson.data.revision,
			acceptedRevision: readJson.data.acceptedRevision,
		});
		if (targets.data.status !== "completed" || !targets.data.revision || !targets.data.acceptedRevision || !targets.data.shots?.[0]) {
			throw new Error("The runner fixture did not produce complete production targets");
		}
		const targetsJson = JSON.parse(JSON.stringify(targets));
		const target = targetsJson.data.shots[0];
		const importInput = {
			editId: readJson.data.editId,
			expectedRevision: targetsJson.data.revision,
			acceptedRevision: targetsJson.data.acceptedRevision,
			shotId: target.shotId,
			shotRevision: target.shotRevision,
			role: "visual" as const,
			idempotencyKey: "contract-import-1",
		};
		const mediaLibrary: ProductionMediaLibrary = {
			import: async (media) => ({ id: media.mediaId, name: media.name, type: "image", file: media.file, width: media.width, height: media.height }),
		};
		const result = await runProductionImportCommand(importInput, sdk, [await inlineImageDelivery()], mediaLibrary);
		expect(result.data.status).toBe("completed");
		expect(result.data.revision).toEqual({
			editId: "edit-1",
			storageCasRevision: "6",
			intentRevision: "6",
			digest: expect.any(String),
		});
	});
});
