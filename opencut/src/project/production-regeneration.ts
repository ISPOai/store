import { deriveAcceptedPlacementInput, ProductionService } from "./production-service";
import {
	runProductionImportCommand,
	type ProductionImportSdk,
} from "@/media/production-import";
import type { ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import { SdkProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import type { CommandResourceDelivery } from "@ispo/sdk";
import type {
	EditRevision,
	AcceptedProductionShot,
	ProductionImageCandidate,
	ProductionMediaVersion,
	ProductionNarrationVersion,
	ProductionRegenerationCandidate,
	ProductionRevisionReference,
	ProductionImageReferenceSelection,
	ProductionStyleAnchorInput,
} from "./production-types";
import {
	ProductionIdempotencyError,
	ProductionInputError,
	ProductionRevisionSupersededError,
} from "./production-types";
import type {
	ProductionAcceptVersionInput,
	ProductionAcceptVersionRole,
	ProductionAcceptVersionCommandResult,
	ProductionImportInput,
	ProductionRegenerateCommandResult,
	ProductionRegenerateInput,
	ProductionTargetInput,
	ProductionTargetOffer,
	ProductionTargetsCommandResult,
} from "@/services/project-command-types";
import {
	canonicalEditRevision,
	canonicalProductionRevisionReference,
} from "@/services/project-command-types";
import type { ProductionDocumentService } from "./production-document-service";
import { mediaTime, mediaTimeFromSeconds } from "@/wasm";

const MAX_CHANGES = 100;
const MAX_BRIEF_LENGTH = 4_000;

export interface ProductionImageRegenerator {
	generate(input: {
		editId: string;
		expectedRevision: EditRevision;
		acceptedRevision: ProductionRevisionReference;
		shotId: string;
		attempt: number;
		brief?: string;
		model?: { modelKey: string; modelVersion: string };
		strength?: number;
		references?: ProductionImageReferenceSelection;
		styleAnchor?: ProductionStyleAnchorInput;
	}): Promise<ProductionImageCandidate | null>;
}

type ProductionDocuments = Pick<ProductionDocumentService, "admitLegacy" | "readCurrent" | "readRevision" | "save">;

function referenceEqual(left: ProductionRevisionReference, right: ProductionRevisionReference): boolean {
	return left.editId === right.editId && left.documentIntentRevision === right.documentIntentRevision &&
		left.productionRevisionId === right.productionRevisionId && left.contentDigest === right.contentDigest;
}

function revisionEqual(left: EditRevision, right: EditRevision): boolean {
	return left.editId === right.editId &&
		left.intentRevision === right.intentRevision && left.digest === right.digest;
}

function digest<T>(value: T): Promise<string> {
	return crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))).then((bytes) =>
		Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""));
}

function staleOutputs(role: ProductionAcceptVersionRole): Array<"placement" | "render"> {
	return role === "visual" || role === "animation" || role === "narration" ? ["render"] : [];
}

function imageVersion(candidate: ProductionImageCandidate): ProductionMediaVersion {
	const version: ProductionMediaVersion = {
		idempotencyKey: candidate.idempotencyKey,
		mediaId: candidate.mediaId ?? candidate.resource.publicId,
		mediaRevision: candidate.version?.mediaRevision ?? candidate.resource.digest,
		name: candidate.resource.path.split("/").pop() || `${candidate.shotId}.png`,
		mediaType: "image",
		mimeType: candidate.resource.mimeType,
		digest: candidate.resource.digest,
		byteLength: candidate.resource.byteLength,
		sourceDurationSeconds: 0,
		filesRef: {
			publicId: candidate.resource.publicId,
			path: candidate.resource.path,
		},
	};
	if (candidate.model) version.model = structuredClone(candidate.model);
	if (candidate.strength !== undefined) version.strength = candidate.strength;
	if (candidate.references) version.references = structuredClone(candidate.references);
	if (candidate.styleAnchorRevision) version.styleAnchorRevision = candidate.styleAnchorRevision;
	if (candidate.aspectRatio) version.aspectRatio = candidate.aspectRatio;
	if (candidate.dimensions) version.dimensions = structuredClone(candidate.dimensions);
	return version;
}

function versionId(version: ProductionMediaVersion | ProductionNarrationVersion): string {
	return version.mediaRevision || version.mediaId || version.idempotencyKey || "version";
}

function commandRevision(revision: EditRevision | null | undefined): EditRevision | undefined {
	return revision ? canonicalEditRevision(revision) : undefined;
}

function commandReference(reference: ProductionRevisionReference): ProductionRevisionReference {
	return canonicalProductionRevisionReference(reference);
}

interface ProductionMediaContext {
	sdk: ProductionImportSdk;
	resources: readonly CommandResourceDelivery[];
	mediaLibrary: ProductionMediaLibrary;
}

async function inLibrary(
	mediaLibrary: ProductionMediaLibrary | undefined,
	editId: string,
	mediaId: string,
): Promise<boolean> {
	return Boolean(mediaLibrary?.resolve && await mediaLibrary.resolve(editId, mediaId));
}

async function targetOffer(
	editId: string,
	shot: AcceptedProductionShot,
	acceptedRevision: ProductionRevisionReference,
	regenerationCandidates: ProductionRegenerationCandidate[],
	mediaLibrary?: ProductionMediaLibrary,
) {
	const downstream: Array<"placement" | "render"> = ["placement", "render"];
	type ImageCandidateOffer = ProductionTargetOffer["image"]["candidates"][number];
	const imageInLibrary = shot.imageVersion
		? await inLibrary(mediaLibrary, editId, shot.imageVersion.mediaId)
		: false;
	const narrationInLibrary = shot.narrationVersion
		? await inLibrary(mediaLibrary, editId, shot.narrationVersion.mediaId)
		: false;
	const imageCandidates = (shot.imageCandidates ?? [])
		.filter((candidate) => referenceEqual(candidate.acceptedRevision, acceptedRevision))
		.map((candidate) => {
			const offer: ImageCandidateOffer = {
				candidateId: candidate.candidateId ?? candidate.idempotencyKey,
				publicId: candidate.resource.publicId,
				digest: candidate.resource.digest,
			};
			if (candidate.references) offer.references = candidate.references.map(({ name }) => ({ name }));
			if (candidate.styleAnchorRevision) offer.styleAnchorRevision = candidate.styleAnchorRevision;
			if (candidate.model) offer.model = structuredClone(candidate.model);
			if (candidate.aspectRatio) offer.aspectRatio = candidate.aspectRatio;
			if (candidate.dimensions) offer.dimensions = structuredClone(candidate.dimensions);
			return offer;
		});
	const image: ProductionTargetOffer["image"] = {
		inLibrary: imageInLibrary,
		candidates: imageCandidates,
	};
	if (shot.imageVersion) {
		image.accepted = {
			mediaId: shot.imageVersion.mediaId,
			mediaRevision: shot.imageVersion.mediaRevision,
			inLibrary: imageInLibrary,
		};
	}
	const narration: ProductionTargetOffer["narration"] = {
		inLibrary: narrationInLibrary,
		history: (shot.narrationVersionHistory ?? []).map((version) => ({ mediaId: version.mediaId, mediaRevision: version.mediaRevision })),
		candidates: regenerationCandidates
			.filter((candidate) => referenceEqual(candidate.acceptedRevision, acceptedRevision) && candidate.shotId === shot.shotId && candidate.role === "narration")
			.map((candidate) => ({ candidateId: candidate.candidateId, mediaId: candidate.version.mediaId, mediaRevision: candidate.version.mediaRevision })),
	};
	if (shot.narrationVersion) {
		narration.accepted = {
			mediaId: shot.narrationVersion.mediaId,
			mediaRevision: shot.narrationVersion.mediaRevision,
			inLibrary: narrationInLibrary,
		};
	}
	const animationCandidates = (shot.animationCandidates ?? [])
		.filter((candidate) => referenceEqual(candidate.acceptedRevision, acceptedRevision))
		.map((candidate) => ({ candidateId: candidate.candidateId ?? candidate.idempotencyKey, mediaId: candidate.mediaId, mediaRevision: candidate.version?.mediaRevision ?? candidate.mediaRevision, durationSeconds: candidate.resource.durationSeconds }));
	const animationInLibrary = shot.animationVersion
		? await inLibrary(mediaLibrary, editId, shot.animationVersion.mediaId)
		: false;
	return {
		shotId: shot.shotId,
		shotRevision: String(shot.revision),
		image,
		narration,
		...(animationCandidates.length > 0 || shot.animationVersion ? {
			animation: {
				inLibrary: animationInLibrary,
				candidates: animationCandidates,
				...(shot.animationVersion ? { accepted: { mediaId: shot.animationVersion.mediaId, mediaRevision: shot.animationVersion.mediaRevision, inLibrary: animationInLibrary } } : {}),
			},
		} : {}),
		downstream,
	};
}

function targetResult(
	data: Omit<ProductionTargetsCommandResult["data"], "revision">,
	revision: EditRevision | null | undefined,
): ProductionTargetsCommandResult {
	const result: ProductionTargetsCommandResult = { kind: "json", data };
	const commandRevisionValue = commandRevision(revision);
	if (commandRevisionValue) result.data.revision = commandRevisionValue;
	return result;
}

function withCommandRevision<T extends object>(
	data: T,
	revision: EditRevision | null | undefined,
): T & { revision?: EditRevision } {
	const commandRevisionValue = commandRevision(revision);
	return commandRevisionValue ? { ...data, revision: commandRevisionValue } : data;
}

class ProductionMediaImportRefusalError extends Error {
	constructor(
		readonly reason: string,
		message: string,
	) {
		super(message);
		this.name = "ProductionMediaImportRefusalError";
	}
}

export class ProductionRegenerationService {
	private readonly production: ProductionService;
	private readonly mediaContext?: ProductionMediaContext;

	constructor(
		private readonly documents: ProductionDocuments,
		private readonly imageRegenerator?: ProductionImageRegenerator,
		mediaContext?: Omit<ProductionMediaContext, "mediaLibrary"> & { mediaLibrary?: ProductionMediaLibrary },
		private readonly autoPlace = false,
	) {
		this.production = new ProductionService(documents);
		this.mediaContext = mediaContext
			? { ...mediaContext, mediaLibrary: mediaContext.mediaLibrary ?? new SdkProductionMediaLibrary(mediaContext.sdk) }
			: undefined;
	}

	async targets(input: ProductionTargetInput): Promise<ProductionTargetsCommandResult> {
		const snapshot = await this.production.load(input.editId);
		if (!snapshot) return { kind: "json", data: { supported: true, status: "refused", operation: "production-targets", editId: input.editId, message: `Edit ${input.editId} was not found.`, reason: "edit-not-found" } };
		if (!snapshot.documentRevision || !revisionEqual(snapshot.documentRevision, input.expectedRevision)) {
			return targetResult({ supported: true, status: "refused", operation: "production-targets", editId: input.editId, message: "The edit changed since the expected revision.", reason: "revision-conflict" }, snapshot.documentRevision);
		}
		if (!snapshot.accepted || !referenceEqual(snapshot.accepted.reference, input.acceptedRevision)) {
			return targetResult({ supported: true, status: "refused", operation: "production-targets", editId: input.editId, message: "The accepted production revision is no longer current.", reason: "accepted-source-mismatch" }, snapshot.documentRevision);
		}
		const selected = input.shotIds ? new Set(input.shotIds) : null;
		const shots = snapshot.accepted.shots.filter((shot) => !selected || selected.has(shot.shotId));
		if (shots.length === 0) return targetResult({ supported: true, status: "refused", operation: "production-targets", editId: input.editId, message: "No accepted shots matched the request.", reason: "input-invalid" }, snapshot.documentRevision);
		return targetResult({ supported: true, status: "completed", operation: "production-targets", editId: input.editId, message: `Read ${shots.length} production target${shots.length === 1 ? "" : "s"}.`, acceptedRevision: commandReference(snapshot.accepted.reference), shots: await Promise.all(shots.map((shot) => targetOffer(input.editId, shot, snapshot.accepted!.reference, snapshot.regenerationCandidates ?? [], this.mediaContext?.mediaLibrary))) }, snapshot.documentRevision);
	}

	async regenerate(input: ProductionRegenerateInput): Promise<ProductionRegenerateCommandResult> {
		if (input.changes.length === 0 || input.changes.length > MAX_CHANGES || input.idempotencyKey.trim().length === 0) {
			return { kind: "json", data: { supported: true, status: "refused", operation: "production-regenerate", editId: input.editId, message: "A bounded change set and idempotency key are required.", reason: "input-invalid" } };
		}
		for (const change of input.changes) {
			if (change.brief !== undefined && (change.brief.trim().length === 0 || change.brief.length > MAX_BRIEF_LENGTH)) {
				return { kind: "json", data: { supported: true, status: "refused", operation: "production-regenerate", editId: input.editId, message: "Each regeneration brief must be bounded and non-empty.", reason: "input-invalid" } };
			}
		}
		try {
		const snapshot = await this.production.load(input.editId);
		if (!snapshot) return { kind: "json", data: { supported: true, status: "refused", operation: "production-regenerate", editId: input.editId, message: `Edit ${input.editId} was not found.`, reason: "edit-not-found" } };
		if (!snapshot.accepted || !referenceEqual(snapshot.accepted.reference, input.acceptedRevision)) return { kind: "json", data: withCommandRevision({ supported: true, status: "refused", operation: "production-regenerate", editId: input.editId, message: "The accepted production revision is no longer current.", reason: "accepted-source-mismatch" }, snapshot.documentRevision) };
		const orderedChanges = input.changes.map((change) => ({ ...change })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
		const requestDigest = await digest({ acceptedRevision: input.acceptedRevision, attempt: input.attempt ?? 1, model: input.model, strength: input.strength, references: input.references, styleAnchor: input.styleAnchor, changes: orderedChanges });
		const prior = snapshot.regenerationReceipts?.find((receipt) => receipt.idempotencyKey === input.idempotencyKey);
		if (prior) {
			if (prior.requestDigest !== requestDigest) throw new ProductionIdempotencyError(input.idempotencyKey);
			const replayResults: NonNullable<ProductionRegenerateCommandResult["data"]["results"]> = prior.candidateIds.map((candidateId) => ({ shotId: snapshot.regenerationCandidates?.find((candidate) => candidate.candidateId === candidateId)?.shotId ?? "", role: snapshot.regenerationCandidates?.find((candidate) => candidate.candidateId === candidateId)?.role ?? "visual", candidateId, status: "candidate" }));
			return { kind: "json", data: withCommandRevision({ supported: true, status: "completed", operation: "production-regenerate", editId: input.editId, message: `Prepared ${prior.candidateIds.length} targeted regeneration candidate${prior.candidateIds.length === 1 ? "" : "s"}.`, results: replayResults, staleOutputs: ["placement", "render"] }, snapshot.documentRevision) };
		}
		if (!snapshot.documentRevision || !revisionEqual(snapshot.documentRevision, input.expectedRevision)) return { kind: "json", data: withCommandRevision({ supported: true, status: "refused", operation: "production-regenerate", editId: input.editId, message: "The edit changed since the expected revision.", reason: "revision-conflict" }, snapshot.documentRevision) };
		const seen = new Set<string>();
		const generated: ProductionRegenerationCandidate[] = [];
		const statuses = new Map<string, "candidate" | "reused">();
		for (const change of orderedChanges) {
			const key = `${change.shotId}:${change.role}`;
			if (seen.has(key)) throw new ProductionInputError(`The change set names ${key} more than once`);
			seen.add(key);
			const shot = snapshot.accepted.shots.find((candidate) => candidate.shotId === change.shotId);
			if (!shot) throw new ProductionInputError(`Shot ${change.shotId} is not accepted`);
			let version: ProductionMediaVersion | ProductionNarrationVersion;
			let status: "candidate" | "reused" = "candidate";
			if (change.useVersion) {
				const history = change.role === "visual" ? shot.imageVersionHistory ?? [] : shot.narrationVersionHistory ?? [];
				const selected = history.find((candidate) => candidate.mediaId === change.useVersion || candidate.mediaRevision === change.useVersion || candidate.idempotencyKey === change.useVersion);
				if (!selected) throw new ProductionInputError(`Version ${change.useVersion} is not retained for ${change.shotId}`);
				version = structuredClone(selected);
				status = "reused";
			} else if (change.role === "visual") {
				if (!this.imageRegenerator) throw new ProductionInputError("Storyboard image regeneration is unavailable");
				const retained = [...(shot.imageCandidates ?? [])].reverse().find((candidate) => referenceEqual(candidate.acceptedRevision, input.acceptedRevision) && candidate.references?.length);
				const retainedReferences = retained?.references ?? shot.imageVersion?.references;
				const references = change.references ?? input.references ?? (retainedReferences ? { mode: "explicit" as const, publicIds: retainedReferences.map((reference) => reference.publicId) } : undefined);
				const candidate = await this.imageRegenerator.generate({ editId: input.editId, expectedRevision: input.expectedRevision, acceptedRevision: input.acceptedRevision, shotId: shot.shotId, attempt: input.attempt ?? 1, brief: change.brief, model: input.model, strength: input.strength, references, styleAnchor: input.styleAnchor });
				if (!candidate) throw new ProductionInputError(`No image candidate was produced for ${shot.shotId}`);
				version = imageVersion(candidate);
			} else {
				throw new ProductionInputError("Narration regeneration requires an exact retained Voicebox version");
			}
			const candidateId = `regeneration-${(await digest([input.idempotencyKey, change.shotId, change.role, versionId(version)])).slice(0, 40)}`;
			const regenerationCandidate: ProductionRegenerationCandidate = { candidateId, acceptedRevision: structuredClone(input.acceptedRevision), shotId: shot.shotId, shotRevision: shot.revision, role: change.role, version: structuredClone(version) };
			if (change.brief) regenerationCandidate.brief = change.brief;
			generated.push(regenerationCandidate);
			statuses.set(candidateId, status);
		}
		const latest = await this.production.load(input.editId);
		if (!latest?.documentRevision || !latest.accepted || !referenceEqual(latest.accepted.reference, input.acceptedRevision)) throw new ProductionRevisionSupersededError(input.acceptedRevision);
		const committed = await this.production.commitRegenerationCandidates({ reference: input.acceptedRevision, expectedRevision: latest.documentRevision, requestDigest, idempotencyKey: input.idempotencyKey, candidates: generated });
		return { kind: "json", data: { supported: true, status: "completed", operation: "production-regenerate", editId: input.editId, message: `Prepared ${generated.length} targeted regeneration candidate${generated.length === 1 ? "" : "s"}.`, revision: canonicalEditRevision(committed.documentRevision), results: generated.map((candidate) => ({ shotId: candidate.shotId, role: candidate.role, candidateId: candidate.candidateId, status: statuses.get(candidate.candidateId) ?? "candidate" })), staleOutputs: ["placement", "render"] } };
		} catch (error) {
			if (error instanceof ProductionRevisionSupersededError) return { kind: "json", data: { supported: true, status: "refused", operation: "production-regenerate", editId: input.editId, message: error.message, reason: "revision-conflict" } };
			if (error instanceof ProductionInputError) return { kind: "json", data: { supported: true, status: "refused", operation: "production-regenerate", editId: input.editId, message: error.message, reason: "input-invalid" } };
			if (error instanceof ProductionIdempotencyError) return { kind: "json", data: { supported: true, status: "refused", operation: "production-regenerate", editId: input.editId, message: error.message, reason: "input-invalid" } };
			throw error;
		}
	}

	async acceptVersion(input: ProductionAcceptVersionInput): Promise<ProductionAcceptVersionCommandResult> {
		try {
			if (input.candidateId !== undefined && input.useVersion !== undefined) throw new ProductionInputError("Choose a candidate or retained version, not both");
			if (input.role === "animation") {
				const accepted = await this.production.acceptAnimationVersion({
					reference: input.acceptedRevision,
					expectedRevision: input.expectedRevision,
					shotId: input.shotId,
					shotRevision: input.shotRevision,
					idempotencyKey: input.idempotencyKey,
					candidateId: input.candidateId,
					useVersion: input.useVersion,
				});
				return this.placeAcceptedVersion(input, this.acceptanceResult(input, accepted.documentRevision, `Accepted animation version for ${input.shotId}.`));
			}
			const stored = await this.acceptStoredCandidate(input);
			if (stored) return this.placeAcceptedVersion(input, stored);
			const imported = await this.importAcceptedCandidate(input);
			if (imported) return this.placeAcceptedVersion(input, imported);
			const acceptInput = {
				reference: input.acceptedRevision,
				expectedRevision: input.expectedRevision,
				shotId: input.shotId,
				shotRevision: input.shotRevision,
				role: input.role,
				idempotencyKey: input.idempotencyKey,
				candidateId: input.candidateId,
				useVersion: input.useVersion,
			};
			const accepted = await this.production.acceptRegenerationVersion(acceptInput);
			return this.placeAcceptedVersion(input, this.acceptanceResult(input, accepted.documentRevision, `Accepted ${input.role} version for ${input.shotId}.`));
		} catch (error) {
			if (error instanceof ProductionMediaImportRefusalError) return { kind: "json", data: { supported: true, status: "refused", operation: "production-accept-version", editId: input.editId, message: error.message, reason: error.reason } };
			if (error instanceof ProductionRevisionSupersededError) return { kind: "json", data: { supported: true, status: "refused", operation: "production-accept-version", editId: input.editId, message: error.message, reason: "revision-conflict" } };
			if (error instanceof ProductionInputError) return { kind: "json", data: { supported: true, status: "refused", operation: "production-accept-version", editId: input.editId, message: error.message, reason: "input-invalid" } };
			throw error;
		}
	}

	private acceptanceResult(
		input: ProductionAcceptVersionInput,
		documentRevision: EditRevision,
		message: string,
	): ProductionAcceptVersionCommandResult {
		return { kind: "json", data: { supported: true, status: "completed", operation: "production-accept-version", editId: input.editId, message, revision: canonicalEditRevision(documentRevision), shotId: input.shotId, role: input.role, staleOutputs: staleOutputs(input.role) } };
	}

	private async placeAcceptedVersion(
		input: ProductionAcceptVersionInput,
		result: ProductionAcceptVersionCommandResult,
	): Promise<ProductionAcceptVersionCommandResult> {
		if (input.placeOnTimeline === false || !this.autoPlace || result.data.status !== "completed" || !result.data.revision) return result;
		const snapshot = await this.production.load(input.editId);
		if (!snapshot?.accepted || !snapshot.documentRevision) throw new ProductionRevisionSupersededError(input.acceptedRevision);
		if (input.role === "animation") {
			const version = snapshot.accepted.shots.find(shot => shot.shotId === input.shotId)?.animationVersion;
			const current = await this.documents.readCurrent(input.editId);
			if (!version || current?.kind !== "document") throw new ProductionInputError("Accepted animation is unavailable.");
			const project = structuredClone(current.document.project);
			const clips = project.scenes.flatMap(scene => [scene.tracks.main, ...scene.tracks.overlay].flatMap(track =>
				track.type === "video" ? track.elements.flatMap((element, index) =>
					element.production?.shotId === input.shotId && element.production.role === "visual" ? [{ track, index, element }] : []) : []));
			if (clips.length) {
				const sourceDuration = mediaTimeFromSeconds({ seconds: version.sourceDurationSeconds });
				for (const { track, index, element: clip } of clips) {
					if (clip.trimStart + clip.duration > sourceDuration) throw new ProductionInputError("Replacement video must fit the existing trimmed clip.");
					const replacement = { ...clip, type: "video" as const, mediaId: version.mediaId, name: version.name,
						sourceDuration, trimEnd: mediaTime({ ticks: sourceDuration - clip.trimStart - clip.duration }),
						isSourceAudioEnabled: false,
						production: { ...clip.production!, sourceId: version.mediaId, sourceRevision: version.mediaRevision, requestId: input.idempotencyKey } };
					if ("fit" in replacement) delete replacement.fit;
					track.elements[index] = replacement;
				}
				await this.documents.save({ editId: input.editId, project, expectedRevision: snapshot.documentRevision });
				const saved = await this.documents.readCurrent(input.editId);
				if (saved?.kind !== "document") throw new ProductionInputError("Replacement could not be read back.");
				return { ...result, data: { ...result.data, revision: canonicalEditRevision(saved.document.revision) } };
			}
		}
		const { ProductionPlacementService } = await import("../timeline/production-placement");
		const placement = await new ProductionPlacementService(this.documents).run(deriveAcceptedPlacementInput({
			editId: input.editId,
			expectedRevision: snapshot.documentRevision,
			accepted: snapshot.accepted,
			idempotencyKey: `production-accept-placement-${input.idempotencyKey}`,
		}));
		if (placement.data.status !== "completed") throw new ProductionInputError(`Accepted ${input.role} version could not be placed: ${placement.data.message}`);
		return { ...result, data: { ...result.data, revision: canonicalEditRevision(placement.data.revision) } };
	}

	private async acceptStoredCandidate(input: ProductionAcceptVersionInput): Promise<ProductionAcceptVersionCommandResult | null> {
		const snapshot = await this.production.load(input.editId);
		const shot = snapshot?.accepted?.shots.find((candidate) => candidate.shotId === input.shotId && candidate.revision === input.shotRevision);
		if (!snapshot || !shot) return null;
		if (input.role === "visual") {
			const candidate = (shot.imageCandidates ?? []).find((item) => {
				const candidateId = item.candidateId ?? item.idempotencyKey;
				const mediaId = item.mediaId ?? item.resource.publicId;
				const mediaRevision = item.version?.mediaRevision ?? item.resource.digest;
				return input.candidateId !== undefined
					? candidateId === input.candidateId
					: input.useVersion !== undefined
						? candidateId === input.useVersion || mediaId === input.useVersion || mediaRevision === input.useVersion
						: (shot.imageCandidates ?? []).length === 1;
			});
			if (!candidate) return null;
			const version = imageVersion(candidate);
			if (this.mediaContext && !(await inLibrary(this.mediaContext.mediaLibrary, input.editId, version.mediaId))) {
				const imported = await runProductionImportCommand({
					editId: input.editId,
					expectedRevision: input.expectedRevision,
					acceptedRevision: input.acceptedRevision,
					shotId: input.shotId,
					shotRevision: input.shotRevision,
					role: "visual",
					idempotencyKey: `accept-import-visual-${input.candidateId ?? candidate.idempotencyKey}`,
					sourcePublicId: candidate.resource.publicId,
				}, this.mediaContext.sdk, this.mediaContext.resources, this.mediaContext.mediaLibrary);
				if (imported.data.status !== "completed" || !imported.data.revision) throw new ProductionMediaImportRefusalError(imported.data.reason ?? "input-invalid", imported.data.message);
				return this.acceptanceResult(input, imported.data.revision, `Accepted and imported visual version for ${input.shotId}.`);
			}
			const accepted = await this.production.attachMediaVersion({ reference: input.acceptedRevision, expectedRevision: input.expectedRevision, shotId: input.shotId, shotRevision: input.shotRevision, role: "visual", version, idempotencyKey: input.idempotencyKey });
			return this.acceptanceResult(input, accepted.documentRevision, `Accepted visual version for ${input.shotId}.`);
		}
		if (input.role !== "narration") return null;
		const candidate = (shot.narrationCandidates ?? []).find((item) => {
			const candidateId = item.idempotencyKey ?? item.mediaRevision;
			return input.candidateId !== undefined
				? candidateId === input.candidateId
				: input.useVersion !== undefined
					? candidateId === input.useVersion || item.mediaId === input.useVersion || item.mediaRevision === input.useVersion
					: (shot.narrationCandidates ?? []).length === 1;
		});
		if (!candidate) return null;
		if (this.mediaContext && !(await inLibrary(this.mediaContext.mediaLibrary, input.editId, candidate.mediaId))) {
			if (!candidate.publishedFiles) throw new ProductionMediaImportRefusalError("accepted-source-mismatch", "The accepted narration version has no published Files identity for import.");
			const imported = await runProductionImportCommand({
				editId: input.editId,
				expectedRevision: input.expectedRevision,
				acceptedRevision: input.acceptedRevision,
				shotId: input.shotId,
				shotRevision: input.shotRevision,
				role: "narration",
				idempotencyKey: `accept-import-narration-${input.candidateId ?? candidate.idempotencyKey}`,
				publishedFiles: structuredClone(candidate.publishedFiles),
				sourcePublicId: candidate.publishedFiles.publicId,
				...(candidate.voiceboxGenerationRef ? { voiceboxGenerationRef: candidate.voiceboxGenerationRef } : {}),
				alignment: structuredClone(candidate.alignment),
			}, this.mediaContext.sdk, this.mediaContext.resources, this.mediaContext.mediaLibrary);
			if (imported.data.status !== "completed" || !imported.data.revision) throw new ProductionMediaImportRefusalError(imported.data.reason ?? "input-invalid", imported.data.message);
			return this.acceptanceResult(input, imported.data.revision, `Accepted and imported narration version for ${input.shotId}.`);
		}
		const accepted = await this.production.attachMediaVersion({ reference: input.acceptedRevision, expectedRevision: input.expectedRevision, shotId: input.shotId, shotRevision: input.shotRevision, role: "narration", version: candidate, idempotencyKey: input.idempotencyKey });
		return this.acceptanceResult(input, accepted.documentRevision, `Accepted narration version for ${input.shotId}.`);
	}

	private async importAcceptedCandidate(input: ProductionAcceptVersionInput): Promise<ProductionAcceptVersionCommandResult | null> {
		if (!this.mediaContext) return null;
		if (input.role === "animation") return null;
		const snapshot = await this.production.load(input.editId);
		const candidates = (snapshot?.regenerationCandidates ?? []).filter((candidate) =>
			candidate.shotId === input.shotId && candidate.shotRevision === input.shotRevision && candidate.role === input.role);
		const candidate = input.candidateId !== undefined
			? candidates.find((item) => item.candidateId === input.candidateId)
			: input.useVersion !== undefined
				? candidates.find((item) => item.candidateId === input.useVersion || item.version.mediaId === input.useVersion || item.version.mediaRevision === input.useVersion || item.version.idempotencyKey === input.useVersion)
				: candidates.length === 1 ? candidates[0] : undefined;
		if (!candidate || !snapshot) return null;
		if (await inLibrary(this.mediaContext.mediaLibrary, input.editId, candidate.version.mediaId)) return null;
		const importInput: ProductionImportInput = {
			editId: input.editId,
			expectedRevision: input.expectedRevision,
			acceptedRevision: input.acceptedRevision,
			shotId: input.shotId,
			shotRevision: input.shotRevision,
			role: input.role,
			idempotencyKey: `accept-import-${input.role}-${candidate.candidateId}`,
		};
		if (input.role === "visual") {
			const imageCandidate = (snapshot.accepted?.shots.find((shot) => shot.shotId === input.shotId)?.imageCandidates ?? []).find((item) => item.idempotencyKey === candidate.version.idempotencyKey || item.resource.publicId === candidate.version.mediaId);
			if (!imageCandidate) throw new ProductionMediaImportRefusalError("accepted-source-mismatch", "The accepted image candidate is no longer available for import.");
			importInput.sourcePublicId = imageCandidate.resource.publicId;
		} else {
			if (!("alignment" in candidate.version)) throw new ProductionMediaImportRefusalError("input-invalid", "The accepted narration version is incomplete.");
			if (!candidate.version.publishedFiles) throw new ProductionMediaImportRefusalError("accepted-source-mismatch", "The accepted narration version has no published Files identity for import.");
			importInput.publishedFiles = structuredClone(candidate.version.publishedFiles);
			importInput.sourcePublicId = candidate.version.publishedFiles.publicId;
			if (candidate.version.voiceboxGenerationRef) importInput.voiceboxGenerationRef = candidate.version.voiceboxGenerationRef;
			importInput.alignment = structuredClone(candidate.version.alignment);
		}
		const result = await runProductionImportCommand(importInput, this.mediaContext.sdk, this.mediaContext.resources, this.mediaContext.mediaLibrary);
		if (result.data.status !== "completed" || !result.data.media) {
			throw new ProductionMediaImportRefusalError(result.data.reason ?? "input-invalid", result.data.message);
		}
		return {
			kind: "json",
			data: {
				supported: true,
				status: "completed",
				operation: "production-accept-version",
				editId: input.editId,
				message: `Accepted and imported ${input.role} version for ${input.shotId}.`,
				...(result.data.revision ? { revision: result.data.revision } : {}),
				shotId: input.shotId,
				role: input.role,
				staleOutputs: staleOutputs(input.role),
			},
		};
	}
}
