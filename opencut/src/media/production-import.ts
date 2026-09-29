import { ProjectRpcError, type CommandResourceDelivery } from "@ispo/sdk";
import { z } from "zod";
import { ProductionDocumentService } from "@/project/production-document-service";
import { ProductionService } from "@/project/production-service";
import type {
	EditRevision,
	ProductionMediaVersion,
	ProductionNarrationVersion,
	ProductionRevisionReference,
} from "@/project/production-types";
import {
	SdkProductionMediaLibrary,
	type ProductionMediaLibrary,
} from "@/services/storage/production-media-adapter";
import type { EntityStorageApi, FilesStorageApi } from "@/services/storage/sdk-adapter";
import type {
	ProductionImportInput,
	ProductionMediaCommandResult,
} from "@/services/project-command-types";
import {
	canonicalEditRevision,
	canonicalProductionRevisionReference,
} from "@/services/project-command-types";

interface ProductionImportMediaApi {
	read(
		input: MediaTransfer,
		sink: {
			write(bytes: Uint8Array, page: MediaStreamTransfer["transfer"]["pages"][number]): Promise<void>;
			commit(result: { resource: MediaTransfer["resource"]; byteLength: number; pages: number }): Promise<void>;
			abort(): Promise<void>;
		},
	): Promise<{ resource: unknown; byteLength: number; pages: number }>;
}

type MediaTransfer = NonNullable<CommandResourceDelivery["media"]>[number]["transfer"];
type MediaStreamTransfer = Extract<MediaTransfer, { transfer: { kind: "stream" } }>;

const productionRevisionReferenceSchema = z.strictObject({
	editId: z.string().min(1).max(256),
	documentIntentRevision: z.string().min(1).max(256),
	productionRevisionId: z.string().min(1).max(256),
	contentDigest: z.string().min(1).max(256),
});

const productionImportBindingSchema = z.strictObject({
	acceptedRevision: productionRevisionReferenceSchema,
	shotRevision: z.string().regex(/^[1-9][0-9]*$/u).transform(Number),
});

type ProductionImportBindingInput = {
	acceptedRevision: unknown;
	shotRevision: unknown;
};

export function parseProductionImportBinding(
	input: ProductionImportBindingInput,
): { acceptedRevision: ProductionRevisionReference; shotRevision: number } | null {
	const parsed = productionImportBindingSchema.safeParse(input);
	return parsed.success ? parsed.data : null;
}

export function sameProductionRevisionReference(
	left: ProductionRevisionReference,
	right: ProductionRevisionReference,
): boolean {
	const canonicalLeft = canonicalProductionRevisionReference(left);
	const canonicalRight = canonicalProductionRevisionReference(right);
	return canonicalLeft.editId === canonicalRight.editId &&
		canonicalLeft.documentIntentRevision === canonicalRight.documentIntentRevision &&
		canonicalLeft.productionRevisionId === canonicalRight.productionRevisionId &&
		canonicalLeft.contentDigest === canonicalRight.contentDigest;
}

function sameEditRevision(left: EditRevision, right: EditRevision): boolean {
	const canonicalLeft = canonicalEditRevision(left);
	const canonicalRight = canonicalEditRevision(right);
	return canonicalLeft.editId === canonicalRight.editId &&
		canonicalLeft.intentRevision === canonicalRight.intentRevision &&
		canonicalLeft.digest === canonicalRight.digest;
}

export interface ProductionImportSdk {
	entities: EntityStorageApi;
	files: FilesStorageApi & { media: ProductionImportMediaApi };
}
type ProductionMediaRefusal = NonNullable<ProductionMediaCommandResult["data"]["reason"]>;

function response(
	input: ProductionImportInput,
	data: Omit<ProductionMediaCommandResult["data"], "operation" | "editId" | "supported">,
): ProductionMediaCommandResult {
	const result: ProductionMediaCommandResult["data"] = {
		supported: true,
		status: data.status,
		operation: "production-import",
		editId: input.editId,
		message: data.message,
	};
	if (data.reason !== undefined) result.reason = data.reason;
	if (data.revision !== undefined) result.revision = data.revision;
	if (data.media !== undefined) result.media = data.media;
	if (data.filesRef !== undefined) result.filesRef = data.filesRef;
	return { kind: "json", data: result };
}

function refusal(
	input: ProductionImportInput,
	reason: ProductionMediaRefusal,
	message: string,
): ProductionMediaCommandResult {
	return response(input, { status: "refused", reason, message });
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function pcmWavDurationMs(bytes: Uint8Array): number | undefined {
	if (bytes.byteLength < 12) return undefined;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const text = (offset: number, length: number): string => String.fromCharCode(...bytes.subarray(offset, offset + length));
	if (text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") return undefined;
	let offset = 12;
	let byteRate: number | undefined;
	let blockAlign: number | undefined;
	let dataBytes: number | undefined;
	while (offset + 8 <= bytes.byteLength) {
		const chunkSize = view.getUint32(offset + 4, true);
		const chunkStart = offset + 8;
		const chunkEnd = chunkStart + chunkSize;
		const paddedEnd = chunkEnd + (chunkSize & 1);
		if (chunkEnd > bytes.byteLength || paddedEnd > bytes.byteLength) return undefined;
		const chunkId = text(offset, 4);
		if (chunkId === "fmt ") {
			if (chunkSize < 16) return undefined;
			const format = view.getUint16(chunkStart, true);
			const channels = view.getUint16(chunkStart + 2, true);
			const sampleRate = view.getUint32(chunkStart + 4, true);
			byteRate = view.getUint32(chunkStart + 8, true);
			blockAlign = view.getUint16(chunkStart + 12, true);
			const bitsPerSample = view.getUint16(chunkStart + 14, true);
			if (format !== 1 || channels === 0 || sampleRate === 0 || bitsPerSample === 0 || blockAlign === 0 || byteRate === 0) return undefined;
			if (blockAlign !== channels * Math.ceil(bitsPerSample / 8) || byteRate !== sampleRate * blockAlign) return undefined;
		} else if (chunkId === "data") {
			dataBytes = chunkSize;
		}
		offset = paddedEnd;
	}
	if (byteRate === undefined || blockAlign === undefined || dataBytes === undefined || dataBytes === 0 || dataBytes % blockAlign !== 0) return undefined;
	const durationMs = dataBytes / byteRate * 1_000;
	return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined;
}

function mediaMimeType(value: string): "image/png" | "image/jpeg" | "image/webp" | "audio/wav" | "video/mp4" | "video/webm" {
	if (value === "image/png" || value === "image/jpeg" || value === "image/webp" || value === "audio/wav" || value === "video/mp4" || value === "video/webm") return value;
	throw new Error(`Unsupported media type: ${value}`);
}

function isVisualRole(role: ProductionImportInput["role"]): role is "visual" | "video" {
	return role === "visual" || role === "video";
}

async function publishedFileDelivery(
	publicId: string | undefined,
	sdk: ProductionImportSdk,
): Promise<CommandResourceDelivery | undefined> {
	if (!publicId) return undefined;
	const published = (await sdk.files.list()).find((entry) => entry.publicId === publicId);
	if (!published?.url) return undefined;
	const mediaType = published.mimeType === "image/png" || published.mimeType === "image/jpeg" || published.mimeType === "image/webp" || published.mimeType === "audio/wav" || published.mimeType === "video/mp4" || published.mimeType === "video/webm"
		? published.mimeType
		: undefined;
	if (!mediaType) return undefined;
	const response = await fetch(published.url);
	if (!response.ok) return undefined;
	const bytes = new Uint8Array(await response.arrayBuffer());
	return { slot: "media", items: [{ name: published.name, mediaType, digest: await sha256(bytes), bytes }] };
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
	if (bytes.byteLength < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 || bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10) return undefined;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const width = view.getUint32(16, false);
	const height = view.getUint32(20, false);
	return width > 0 && height > 0 ? { width, height } : undefined;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
	if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
	let offset = 2;
	while (offset + 9 < bytes.byteLength) {
		if (bytes[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		while (bytes[offset] === 0xff) offset += 1;
		const marker = bytes[offset++];
		if (marker === undefined || marker === 0xd9 || marker === 0xda) return undefined;
		if (marker >= 0xd0 && marker <= 0xd7) continue;
		if (offset + 1 >= bytes.byteLength) return undefined;
		const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
		if (length < 2 || offset + length > bytes.byteLength) return undefined;
		const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3) ||
			(marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) ||
			(marker >= 0xcd && marker <= 0xcf);
		if (isStartOfFrame && length >= 7) {
			const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
			const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
			return width > 0 && height > 0 ? { width, height } : undefined;
		}
		offset += length;
	}
	return undefined;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
	if (bytes.byteLength < 30 || String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP") return undefined;
	const chunk = String.fromCharCode(...bytes.subarray(12, 16));
	if (chunk === "VP8X") {
		const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
		const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
		return { width, height };
	}
	if (chunk === "VP8L" && bytes.byteLength >= 25) {
		const width = 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8);
		const height = 1 + ((bytes[22]! >> 6) | (bytes[23]! << 2) | ((bytes[24]! & 0xf) << 10));
		return { width, height };
	}
	if (chunk === "VP8 " && bytes.byteLength >= 31 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
		const width = bytes[26]! | (bytes[27]! << 8);
		const height = bytes[28]! | (bytes[29]! << 8);
		return width > 0 && height > 0 ? { width, height } : undefined;
	}
	return undefined;
}

function parseImageDimensions(bytes: Uint8Array, mediaType: string): { width: number; height: number } | undefined {
	if (mediaType === "image/png") return pngDimensions(bytes);
	if (mediaType === "image/jpeg") return jpegDimensions(bytes);
	if (mediaType === "image/webp") return webpDimensions(bytes);
	return undefined;
}

async function imageDimensions(bytes: Uint8Array, mediaType: string): Promise<{ width: number; height: number } | undefined> {
	const parsed = parseImageDimensions(bytes, mediaType);
	if (parsed) return parsed;
	const createBitmap = globalThis.createImageBitmap;
	if (!createBitmap) return undefined;
	try {
		const bitmap = await createBitmap(new Blob([bytes.slice().buffer], { type: mediaType }));
		const dimensions = { width: bitmap.width, height: bitmap.height };
		bitmap.close();
		return dimensions;
	} catch {
		return undefined;
	}
}

async function readResource(
	delivery: CommandResourceDelivery,
	sdk: ProductionImportSdk,
): Promise<{ bytes: Uint8Array; mediaType: string; name: string; durationMs?: number; dimensions?: { width: number; height: number } }> {
	if (delivery.items.length + (delivery.media?.length ?? 0) !== 1) {
		throw new Error("production-import requires exactly one admitted media resource");
	}
	if (delivery.items.length === 1) {
		const item = delivery.items[0]!;
		if (await sha256(item.bytes) !== item.digest) throw new Error("The admitted media digest does not match its bytes");
		return { bytes: item.bytes, mediaType: item.mediaType, name: item.name, dimensions: await imageDimensions(item.bytes, item.mediaType) };
	}
	const item = delivery.media![0]!;
	const chunks: Uint8Array[] = [];
	const read = await sdk.files.media.read(item.transfer, {
		async write(bytes) { chunks.push(new Uint8Array(bytes)); },
		async commit() {},
		async abort() {},
	});
	const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	if (await sha256(bytes) !== item.digest) throw new Error("The streamed media digest does not match its bytes");
	return {
		bytes,
		mediaType: item.mediaType,
		name: item.name,
		durationMs: item.transfer.resource.durationMs,
		dimensions: item.transfer.resource.dimensions,
	};
}

export async function productionMediaId(
	input: Pick<ProductionImportInput, "editId" | "acceptedRevision" | "shotId" | "role">,
	digest: string,
): Promise<string> {
	const bytes = new TextEncoder().encode(`${input.editId}\0${input.acceptedRevision.productionRevisionId}\0${input.shotId}\0${input.role}\0${digest}`);
	const value = await crypto.subtle.digest("SHA-256", bytes);
	return `production-media-${Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 48)}`;
}

function validAlignment(alignment: ProductionImportInput["alignment"], text: string, durationMs: number): Array<{ text: string; start: number; end: number }> {
	if (!alignment || alignment.length === 0) return [{ text, start: 0, end: durationMs / 1000 }];
	return alignment.map((segment) => ({ text: segment.text, start: segment.start, end: segment.end }));
}

export async function runProductionImportCommand(
	input: ProductionImportInput,
	sdk: ProductionImportSdk,
	resources: readonly CommandResourceDelivery[],
	mediaLibrary: ProductionMediaLibrary = new SdkProductionMediaLibrary(sdk),
): Promise<ProductionMediaCommandResult> {
	if (!input.editId || !input.shotId || !input.idempotencyKey) return refusal(input, "input-invalid", "editId, shotId, and idempotencyKey are required.");
	const hasVoiceboxIdentity = input.voiceboxGenerationRef !== undefined;
	if (input.role === "narration" && hasVoiceboxIdentity && !input.publishedFiles?.publicId) return refusal(input, "input-invalid", "Voicebox narration imports require both the generation and published Files identities.");
	const binding = parseProductionImportBinding({
		acceptedRevision: input.acceptedRevision,
		shotRevision: String(input.shotRevision),
	});
	if (!binding) return refusal(input, "input-invalid", "acceptedRevision and shotRevision must use the declared revision types.");
	const delivery = resources.find((item) => item.slot === "media") ?? await publishedFileDelivery(input.sourcePublicId ?? input.publishedFiles?.publicId, sdk);
	if (!delivery) return refusal(input, "input-invalid", "production-import requires an admitted media resource.");
	const documents = new ProductionDocumentService(sdk);
	const service = new ProductionService(documents);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") return refusal(input, "legacy-revision-required", "Admit an edit revision before importing media.");
	const accepted = (await service.load(input.editId))?.accepted;
	const shot = accepted?.shots.find((candidate) => candidate.shotId === input.shotId);
	if (!accepted || !sameProductionRevisionReference(accepted.reference, binding.acceptedRevision) || !shot || shot.revision !== binding.shotRevision) return refusal(input, "accepted-source-mismatch", "The import is not bound to an accepted shot revision.");
	const existing = input.role === "video" && shot.animationVersion?.idempotencyKey === input.idempotencyKey
		? shot.animationVersion
		: isVisualRole(input.role) ? shot.imageVersion : shot.narrationVersion;
	if (existing?.idempotencyKey === input.idempotencyKey) {
		const deliveredOwner = delivery.media?.[0]?.transfer.resource.owner;
		const storedFilesRef = await mediaLibrary.resolve?.(input.editId, existing.mediaId);
		const filesRef = storedFilesRef ?? (input.publishedFiles
			? { publicId: input.publishedFiles.publicId, ...(input.publishedFiles.path ? { path: input.publishedFiles.path } : {}) }
			: deliveredOwner?.store === "files"
				? { publicId: deliveredOwner.resourceRef }
				: undefined);
		return response(input, { status: "completed", message: `Imported ${input.role} media for ${shot.shotId}.`, revision: canonicalEditRevision(current.document.revision), media: { mediaId: existing.mediaId, mediaRevision: existing.mediaRevision, shotId: shot.shotId, role: input.role, durationMs: input.role === "visual" ? shot.durationMs : Math.round(existing.sourceDurationSeconds * 1_000) }, filesRef });
	}
	if (!sameEditRevision(current.document.revision, input.expectedRevision)) {
		return refusal(input, "revision-conflict", "The edit changed since the expected revision.");
	}
	try {
		const source = await readResource(delivery, sdk);
		const deliveredResource = delivery.media?.[0]?.transfer.resource;
		if (input.publishedFiles && deliveredResource && deliveredResource.owner.resourceRef !== input.publishedFiles.publicId) return refusal(input, "accepted-source-mismatch", "The delivered Files resource is not the published Voicebox version.");
		if (input.role === "visual" && input.sourcePublicId && !shot.imageCandidates?.some((candidate) => candidate.resource.publicId === input.sourcePublicId)) return refusal(input, "accepted-source-mismatch", "The image resource is not a candidate for the accepted shot.");
		const expectedType = input.role === "visual" ? ["image/png", "image/jpeg", "image/webp"] : input.role === "video" ? ["video/mp4", "video/webm"] : ["audio/wav"];
		if (!expectedType.includes(source.mediaType)) return refusal(input, "input-invalid", `A ${input.role} import requires ${expectedType.join(", ")}.`);
		let durationMs = input.durationMs ?? source.durationMs;
		if (input.role === "video") {
			if (source.durationMs === undefined || !Number.isFinite(source.durationMs) || source.durationMs <= 0) return refusal(input, "input-invalid", "Video duration metadata is required from the admitted media resource.");
			if (!source.dimensions) return refusal(input, "input-invalid", "Video dimensions metadata is required from the admitted media resource.");
			if (input.durationMs !== undefined && Math.abs(input.durationMs - source.durationMs) > 1) return refusal(input, "input-invalid", "Video durationMs does not match the admitted media duration.");
			durationMs = source.durationMs;
		}
		if (input.role === "narration" && input.durationMs !== undefined && source.durationMs !== undefined && Math.abs(input.durationMs - source.durationMs) > 1) return refusal(input, "input-invalid", "Narration durationMs does not match the admitted media duration.");
		if (input.role === "narration" && source.durationMs === undefined) {
			const derivedDurationMs = pcmWavDurationMs(source.bytes);
			if (derivedDurationMs === undefined) return refusal(input, "input-invalid", "Narration durationMs is required when the admitted bytes are not a parseable PCM WAV.");
			if (input.durationMs !== undefined && Math.abs(input.durationMs - derivedDurationMs) > 1) return refusal(input, "input-invalid", "Narration durationMs does not match the admitted PCM WAV.");
			durationMs = input.durationMs ?? derivedDurationMs;
		}
		if (input.role === "narration" && (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0)) return refusal(input, "input-invalid", "Narration durationMs is required.");
		const digest = await sha256(source.bytes);
		const id = await productionMediaId(input, digest);
		const name = input.name?.trim() || source.name;
		const fileBytes = new Uint8Array(source.bytes.byteLength);
		fileBytes.set(source.bytes);
		const file = new File([fileBytes.buffer], name, { type: source.mediaType });
		const filesIdentity = deliveredResource?.owner.store === "files"
			? { publicId: deliveredResource.owner.resourceRef, revision: deliveredResource.owner.resourceRevision }
			: undefined;
		const imported = await mediaLibrary.import({
			editId: input.editId,
			mediaId: id,
			mediaRevision: digest,
			role: input.role,
			name,
			mimeType: mediaMimeType(source.mediaType),
			digest,
			file,
			width: isVisualRole(input.role) ? source.dimensions?.width : undefined,
			height: isVisualRole(input.role) ? source.dimensions?.height : undefined,
			duration: durationMs === undefined ? undefined : durationMs / 1000,
		});
		const common: ProductionMediaVersion = {
			idempotencyKey: input.idempotencyKey,
			mediaId: imported.id,
			mediaRevision: digest,
			name,
			mediaType: input.role === "narration" ? "audio" : input.role === "video" ? "video" : "image",
			mimeType: mediaMimeType(source.mediaType),
			digest,
			byteLength: source.bytes.byteLength,
			sourceDurationSeconds: input.role === "visual" ? shot.durationMs / 1000 : (durationMs! / 1000),
		};
		if (imported.filesRef || filesIdentity) {
			common.filesRef = imported.filesRef ?? {
				publicId: filesIdentity!.publicId,
				...(filesIdentity!.revision ? { revision: filesIdentity!.revision } : {}),
			};
		}
		if (isVisualRole(input.role) && source.dimensions) common.dimensions = structuredClone(source.dimensions);
		const version: ProductionMediaVersion | ProductionNarrationVersion = isVisualRole(input.role)
			? common
			: {
				...common,
				source: hasVoiceboxIdentity ? "voicebox" : "files",
				acceptedRevision: canonicalProductionRevisionReference(accepted.reference),
				acceptedShotId: shot.shotId,
				acceptedShotRevision: shot.revision,
				...(input.voiceboxGenerationRef ? { voiceboxGenerationRef: input.voiceboxGenerationRef } : {}),
				...(input.publishedFiles ?? filesIdentity ? { publishedFiles: input.publishedFiles ?? filesIdentity } : {}),
				alignment: validAlignment(input.alignment, shot.narration, durationMs!),
			};
		const saved = await service.attachMediaVersion({
			reference: accepted.reference,
			expectedRevision: input.expectedRevision,
			shotId: shot.shotId,
			shotRevision: shot.revision,
			role: isVisualRole(input.role) ? "visual" : input.role,
			version,
			idempotencyKey: input.idempotencyKey,
		});
		return response(input, { status: "completed", message: `Imported ${input.role} media for ${shot.shotId}.`, revision: canonicalEditRevision(saved.documentRevision), media: { mediaId: imported.id, mediaRevision: digest, shotId: shot.shotId, role: input.role, durationMs: input.role === "visual" ? shot.durationMs : durationMs! }, filesRef: imported.filesRef ?? filesIdentity });
	} catch (error) {
		if (error instanceof ProjectRpcError) throw error;
		return refusal(input, "input-invalid", error instanceof Error ? error.message : "The media import failed.");
	}
}
