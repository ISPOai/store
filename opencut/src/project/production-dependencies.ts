import type {
	AcceptedProductionRevision,
	ProductionRevisionReference,
} from "./production-types";

const MAX_ACCEPTED_REVISIONS = 64;
const MAX_ARTIFACTS = 512;
const MAX_REFERENCES_PER_ARTIFACT = 128;
const MAX_TOTAL_REFERENCES = 4_096;
const MAX_REFERENCE_LENGTH = 256;
const MAX_SHOTS_PER_REVISION = 100;
export type ProductionArtifactKind =
	"audio" | "captions" | "image" | "video" | "timeline" | "render";
export type ProductionArtifactPhase = "accepted" | "previously-accepted" | "candidate";
export interface ProductionArtifactReference {
	artifactId: string;
	versionId: string;
}
export type ProductionArtifactScope =
	| { kind: "shot"; shotId: string }
	| { kind: "production" };
interface SourceBase { revision: ProductionRevisionReference }

export type ProductionSourceReference =
	| (SourceBase & { kind: "script"; script: string })
	| (SourceBase & { kind: "shot-narration"; shotId: string; shotRevision: number;
		narration: string })
	| (SourceBase & { kind: "shot-visual"; shotId: string; shotRevision: number;
		visualBrief: string })
	| (SourceBase & { kind: "shot-duration"; shotId: string; shotRevision: number;
		durationMs: number })
	| (SourceBase & { kind: "shot-order"; shotIds: string[] })
	| (SourceBase & { kind: "canvas"; width: number; height: number })
	| (SourceBase & { kind: "frame-rate"; numerator: number; denominator: number });
export interface ProductionArtifactVersion {
	reference: ProductionArtifactReference;
	kind: ProductionArtifactKind;
	phase: ProductionArtifactPhase;
	scope: ProductionArtifactScope;
	sources: ProductionSourceReference[];
	dependencies: ProductionArtifactReference[];
}
export interface ProductionDependencyInput {
	acceptedRevisions: AcceptedProductionRevision[];
	currentRevision: ProductionRevisionReference;
	artifacts: ProductionArtifactVersion[];
}
export type ProductionStaleReason =
	| { kind: "source-changed" | "source-removed"; source: string }
	| { kind: "dependency-stale" | "dependency-superseded";
		dependency: ProductionArtifactReference };
export interface ProductionArtifactEvaluation {
	reference: ProductionArtifactReference;
	kind: ProductionArtifactKind;
	phase: ProductionArtifactPhase;
	scope: ProductionArtifactScope;
	sources: ProductionSourceReference[];
	dependencies: ProductionArtifactReference[];
	freshness: "current" | "stale";
	reasons: ProductionStaleReason[];
}
export interface ProductionDependencyAnalysis {
	currentRevision: ProductionRevisionReference;
	artifacts: ProductionArtifactEvaluation[];
	affected: ProductionArtifactReference[];
}
export class ProductionDependencyInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProductionDependencyInputError";
	}
}
function assertReference(value: string, label: string): void {
	if (value.trim().length === 0 || value.length > MAX_REFERENCE_LENGTH) {
		throw new ProductionDependencyInputError(`${label} is invalid`);
	}
}

function revisionKey(reference: ProductionRevisionReference): string {
	return JSON.stringify([reference.editId, reference.documentIntentRevision,
		reference.productionRevisionId, reference.contentDigest]);
}

function artifactKey(reference: ProductionArtifactReference): string {
	return JSON.stringify([reference.artifactId, reference.versionId]);
}

function sourceIdentity(source: ProductionSourceReference): string {
	switch (source.kind) {
		case "shot-narration":
		case "shot-visual":
		case "shot-duration":
			return `${source.kind}:${source.shotId}`;
		default:
			return source.kind;
	}
}

function compareExactStrings(left: string, right: string): number {
	return left === right ? 0 : left < right ? -1 : 1;
}

function currentSourceKey(source: ProductionSourceReference): string {
	switch (source.kind) {
		case "script":
			return JSON.stringify([source.kind, source.script]);
		case "shot-narration":
			return JSON.stringify([source.kind, source.shotId, source.narration]);
		case "shot-visual":
			return JSON.stringify([source.kind, source.shotId, source.visualBrief]);
		case "shot-duration":
			return JSON.stringify([source.kind, source.shotId, source.durationMs]);
		case "shot-order":
			return JSON.stringify([source.kind, source.shotIds]);
		case "canvas":
			return JSON.stringify([source.kind, source.width, source.height]);
		case "frame-rate":
			return JSON.stringify([source.kind, source.numerator, source.denominator]);
	}
}

export function buildProductionSourceReferences(
	revision: AcceptedProductionRevision,
): ProductionSourceReference[] {
	const reference = structuredClone(revision.reference);
	return [
		{ kind: "script", revision: reference, script: revision.script },
		...revision.shots.flatMap((shot): ProductionSourceReference[] => [
			{
				kind: "shot-narration",
				revision: reference,
				shotId: shot.shotId,
				shotRevision: shot.revision,
				narration: shot.narration,
			},
			{
				kind: "shot-visual",
				revision: reference,
				shotId: shot.shotId,
				shotRevision: shot.revision,
				visualBrief: shot.visualBrief,
			},
			{
				kind: "shot-duration",
				revision: reference,
				shotId: shot.shotId,
				shotRevision: shot.revision,
				durationMs: shot.durationMs,
			},
		]),
		{
			kind: "shot-order",
			revision: reference,
			shotIds: revision.shots.map((shot) => shot.shotId),
		},
		{
			kind: "canvas",
			revision: reference,
			width: revision.canvas.width,
			height: revision.canvas.height,
		},
		{
			kind: "frame-rate",
			revision: reference,
			numerator: revision.fps.numerator,
			denominator: revision.fps.denominator,
		},
	];
}

function validateRevision(revision: AcceptedProductionRevision): void {
	for (const [label, value] of Object.entries(revision.reference)) {
		assertReference(value, label);
	}
	if (revision.shots.length === 0 || revision.shots.length > MAX_SHOTS_PER_REVISION) {
		throw new ProductionDependencyInputError("Accepted revision shot count is invalid");
	}
	const shotIds = new Set<string>();
	for (const shot of revision.shots) {
		assertReference(shot.shotId, "Shot ID");
		if (shotIds.has(shot.shotId)) {
			throw new ProductionDependencyInputError(`Duplicate shot ${shot.shotId}`);
		}
		shotIds.add(shot.shotId);
		if (!Number.isSafeInteger(shot.revision) || shot.revision < 1) {
			throw new ProductionDependencyInputError(`Shot ${shot.shotId} revision is invalid`);
		}
		if (!Number.isSafeInteger(shot.durationMs) || shot.durationMs <= 0) {
			throw new ProductionDependencyInputError(`Shot ${shot.shotId} duration is invalid`);
		}
	}
	for (const value of [
		revision.targetDurationMs,
		revision.canvas.width,
		revision.canvas.height,
		revision.fps.numerator,
		revision.fps.denominator,
	]) {
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new ProductionDependencyInputError("Accepted revision dimensions are invalid");
		}
	}
}

function requireSourceKinds(
	artifact: ProductionArtifactVersion,
	required: ProductionSourceReference["kind"][],
): void {
	const actual = artifact.sources.map((source) => source.kind).sort();
	const expected = [...required].sort();
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new ProductionDependencyInputError(`${artifact.kind} sources are invalid`);
	}
}

function assertShotArtifact(artifact: ProductionArtifactVersion): string {
	if (artifact.scope.kind !== "shot") {
		throw new ProductionDependencyInputError(`${artifact.kind} requires a shot scope`);
	}
	for (const source of artifact.sources) {
		if ("shotId" in source && source.shotId !== artifact.scope.shotId) {
			throw new ProductionDependencyInputError(`${artifact.kind} crosses shot scopes`);
		}
	}
	return artifact.scope.shotId;
}

function assertDependencyKinds({
	artifact,
	dependencies,
	allowed,
}: {
	artifact: ProductionArtifactVersion;
	dependencies: ProductionArtifactVersion[];
	allowed: ProductionArtifactKind[];
}): void {
	if (dependencies.some((dependency) => !allowed.includes(dependency.kind))) {
		throw new ProductionDependencyInputError(`${artifact.kind} dependency kind is invalid`);
	}
	if (
		artifact.phase === "accepted" &&
		dependencies.some((dependency) => dependency.phase === "candidate")
	) {
		throw new ProductionDependencyInputError("Accepted artifacts cannot depend on candidates");
	}
}
function validateArtifactContract(
	artifact: ProductionArtifactVersion,
	dependencies: ProductionArtifactVersion[],
): void {
	if (artifact.kind === "audio" || artifact.kind === "image") {
		assertShotArtifact(artifact);
		requireSourceKinds(artifact, [
			artifact.kind === "audio" ? "shot-narration" : "shot-visual",
		]);
		if (dependencies.length !== 0) {
			throw new ProductionDependencyInputError(`${artifact.kind} cannot have dependencies`);
		}
		return;
	}
	if (artifact.kind === "captions" || artifact.kind === "video") {
		const shotId = assertShotArtifact(artifact);
		requireSourceKinds(artifact, [
			artifact.kind === "captions" ? "shot-narration" : "shot-visual",
		]);
		const expected = artifact.kind === "captions" ? "audio" : "image";
		assertDependencyKinds({ artifact, dependencies, allowed: [expected] });
		if (
			dependencies.length !== 1 ||
			dependencies[0]?.scope.kind !== "shot" ||
			dependencies[0].scope.shotId !== shotId
		) {
			throw new ProductionDependencyInputError(`${artifact.kind} dependency is invalid`);
		}
		return;
	}
	if (artifact.scope.kind !== "production") {
		throw new ProductionDependencyInputError(`${artifact.kind} requires production scope`);
	}
	if (artifact.kind === "render") {
		requireSourceKinds(artifact, []);
		assertDependencyKinds({ artifact, dependencies, allowed: ["timeline"] });
		if (dependencies.length !== 1) {
			throw new ProductionDependencyInputError("Render requires one timeline");
		}
		return;
	}
	const order = artifact.sources.find((source) => source.kind === "shot-order");
	if (!order) throw new ProductionDependencyInputError("Timeline requires shot order");
	const durationKinds = order.shotIds.map<ProductionSourceReference["kind"]>(
		() => "shot-duration");
	requireSourceKinds(artifact, [
		"shot-order",
		"canvas",
		"frame-rate",
		...durationKinds,
	]);
	const durationIds = artifact.sources
		.filter((source) => source.kind === "shot-duration")
		.map((source) => source.shotId)
		.sort();
	if (JSON.stringify(durationIds) !== JSON.stringify([...order.shotIds].sort())) {
		throw new ProductionDependencyInputError("Timeline duration sources are incomplete");
	}
	assertDependencyKinds({
		artifact,
		dependencies,
		allowed: ["audio", "captions", "image", "video"],
	});
}
function assertAcyclic(
	artifacts: ProductionArtifactVersion[],
	byReference: Map<string, ProductionArtifactVersion>,
): void {
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (artifact: ProductionArtifactVersion): void => {
		const key = artifactKey(artifact.reference);
		if (visiting.has(key)) throw new ProductionDependencyInputError("Artifact cycle detected");
		if (visited.has(key)) return;
		visiting.add(key);
		for (const reference of artifact.dependencies) {
			const dependency = byReference.get(artifactKey(reference));
			if (dependency) visit(dependency);
		}
		visiting.delete(key);
		visited.add(key);
	};
	for (const artifact of artifacts) visit(artifact);
}

function copyReference(reference: ProductionArtifactReference): ProductionArtifactReference {
	return { artifactId: reference.artifactId, versionId: reference.versionId };
}

export function analyzeProductionDependencies(
	input: ProductionDependencyInput,
): ProductionDependencyAnalysis {
	if (
		input.acceptedRevisions.length === 0 ||
		input.acceptedRevisions.length > MAX_ACCEPTED_REVISIONS ||
		input.artifacts.length > MAX_ARTIFACTS
	) {
		throw new ProductionDependencyInputError("Dependency input exceeds its bounds");
	}
	const revisions = new Map<string, AcceptedProductionRevision>();
	for (const revision of input.acceptedRevisions) {
		validateRevision(revision);
		const key = revisionKey(revision.reference);
		if (revisions.has(key)) throw new ProductionDependencyInputError("Duplicate revision");
		revisions.set(key, revision);
	}
	const current = revisions.get(revisionKey(input.currentRevision));
	if (!current) throw new ProductionDependencyInputError("Current revision is missing");
	if (
		input.acceptedRevisions.some(
			(revision) => revision.reference.editId !== current.reference.editId,
		)
	) {
		throw new ProductionDependencyInputError("Accepted revisions cross edit scopes");
	}

	const byReference = new Map<string, ProductionArtifactVersion>();
	const acceptedArtifactIds = new Set<string>();
	const artifactFamilies = new Map<string, string>();
	let referenceCount = 0;
	for (const artifact of input.artifacts) {
		assertReference(artifact.reference.artifactId, "Artifact ID");
		assertReference(artifact.reference.versionId, "Artifact version");
		if (artifact.scope.kind === "shot") assertReference(artifact.scope.shotId, "Shot ID");
		if (
			artifact.sources.length > MAX_REFERENCES_PER_ARTIFACT ||
			artifact.dependencies.length > MAX_REFERENCES_PER_ARTIFACT
		) {
			throw new ProductionDependencyInputError("Artifact references exceed their bounds");
		}
		referenceCount += artifact.sources.length + artifact.dependencies.length;
		const key = artifactKey(artifact.reference);
		if (byReference.has(key)) throw new ProductionDependencyInputError("Duplicate artifact reference");
		byReference.set(key, artifact);
		const family = JSON.stringify([artifact.kind, artifact.scope.kind,
			artifact.scope.kind === "shot" ? artifact.scope.shotId : null]);
		const priorFamily = artifactFamilies.get(artifact.reference.artifactId);
		if (priorFamily !== undefined && priorFamily !== family) {
			throw new ProductionDependencyInputError("Artifact version family is ambiguous");
		}
		artifactFamilies.set(artifact.reference.artifactId, family);
		if (artifact.phase === "accepted") {
			if (acceptedArtifactIds.has(artifact.reference.artifactId)) {
				throw new ProductionDependencyInputError("Artifact has multiple accepted versions");
			}
			acceptedArtifactIds.add(artifact.reference.artifactId);
		}
		const sourceIds = artifact.sources.map(sourceIdentity);
		if (new Set(sourceIds).size !== sourceIds.length) {
			throw new ProductionDependencyInputError("Duplicate artifact source reference");
		}
		const dependencyIds = artifact.dependencies.map(artifactKey);
		if (new Set(dependencyIds).size !== dependencyIds.length) {
			throw new ProductionDependencyInputError("Duplicate artifact dependency reference");
		}
	}
	if (referenceCount > MAX_TOTAL_REFERENCES) {
		throw new ProductionDependencyInputError("Dependency references exceed their total bound");
	}

	for (const artifact of input.artifacts) {
		for (const source of artifact.sources) {
			const revision = revisions.get(revisionKey(source.revision));
			const expected = revision
				? buildProductionSourceReferences(revision).find(
					(candidate) => sourceIdentity(candidate) === sourceIdentity(source),
				)
				: undefined;
			const expectedShotRevision = expected && "shotRevision" in expected ? expected.shotRevision : null;
			const shotRevision = "shotRevision" in source ? source.shotRevision : null;
			if (!expected || currentSourceKey(expected) !== currentSourceKey(source)
				|| expectedShotRevision !== shotRevision) {
				throw new ProductionDependencyInputError("Artifact source snapshot is invalid");
			}
		}
		if (
			artifact.dependencies.some(
				(reference) => !byReference.has(artifactKey(reference)),
			)
		) throw new ProductionDependencyInputError("Artifact dependency is missing");
	}
	assertAcyclic(input.artifacts, byReference);
	for (const artifact of input.artifacts) {
		const dependencies = artifact.dependencies.map((reference) => {
			const dependency = byReference.get(artifactKey(reference));
			if (!dependency) throw new ProductionDependencyInputError("Missing dependency");
			return dependency;
		});
		validateArtifactContract(artifact, dependencies);
	}

	const currentSources = new Map(
		buildProductionSourceReferences(current).map((source) => [
			sourceIdentity(source),
			currentSourceKey(source),
		]),
	);
	const evaluations = new Map<string, ProductionArtifactEvaluation>();
	const evaluate = (artifact: ProductionArtifactVersion): ProductionArtifactEvaluation => {
		const key = artifactKey(artifact.reference);
		const prior = evaluations.get(key);
		if (prior) return prior;
		const reasons: ProductionStaleReason[] = [];
		for (const source of artifact.sources) {
			const currentKey = currentSources.get(sourceIdentity(source));
			if (currentKey !== currentSourceKey(source)) {
				reasons.push({
					kind: currentKey === undefined ? "source-removed" : "source-changed",
					source: sourceIdentity(source),
				});
			}
		}
		for (const reference of artifact.dependencies) {
			const dependency = byReference.get(artifactKey(reference));
			if (
				artifact.phase !== "previously-accepted" &&
				dependency?.phase === "previously-accepted"
			) {
				reasons.push({
					kind: "dependency-superseded",
					dependency: copyReference(reference),
				});
			}
			if (dependency && evaluate(dependency).freshness === "stale") {
				reasons.push({ kind: "dependency-stale", dependency: copyReference(reference) });
			}
		}
		reasons.sort((left, right) => compareExactStrings(JSON.stringify(left), JSON.stringify(right)));
		const evaluation: ProductionArtifactEvaluation = {
			reference: copyReference(artifact.reference),
			kind: artifact.kind,
			phase: artifact.phase,
			scope: structuredClone(artifact.scope),
			sources: structuredClone(artifact.sources),
			dependencies: artifact.dependencies.map(copyReference),
			freshness: reasons.length === 0 ? "current" : "stale",
			reasons,
		};
		evaluations.set(key, evaluation);
		return evaluation;
	};
	const artifacts = [...input.artifacts]
		.sort((left, right) =>
			compareExactStrings(artifactKey(left.reference), artifactKey(right.reference)))
		.map(evaluate);
	return {
		currentRevision: structuredClone(current.reference),
		artifacts,
		affected: artifacts
			.filter((artifact) =>
				artifact.phase !== "previously-accepted" && artifact.freshness === "stale")
			.map((artifact) => copyReference(artifact.reference)),
	};
}
