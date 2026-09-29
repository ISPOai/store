import { describe, expect, test } from "bun:test";
import type { AcceptedProductionRevision } from "./production-types";
import {
	analyzeProductionDependencies,
	buildProductionSourceReferences,
	ProductionDependencyInputError,
	type ProductionArtifactReference,
	type ProductionArtifactVersion,
	type ProductionDependencyAnalysis,
	type ProductionSourceReference,
} from "./production-dependencies";

const BASE_SHOTS = [
	{
		shotId: "shot-opening",
		revision: 1,
		narration: "Open on a quiet workspace.",
		visualBrief: "A wide view of a calm studio.",
		durationMs: 4_000,
	},
	{
		shotId: "shot-turn",
		revision: 1,
		narration: "The timeline arranges itself.",
		visualBrief: "Cards settle into an ordered timeline.",
		durationMs: 5_000,
	},
	{
		shotId: "shot-close",
		revision: 1,
		narration: "Finish on the completed film.",
		visualBrief: "The finished film fills the monitor.",
		durationMs: 6_000,
	},
];

function acceptedRevision({
	id,
	shots = BASE_SHOTS,
	canvas = { width: 1920, height: 1080 },
	fps = { numerator: 30, denominator: 1 },
}: {
	id: string;
	shots?: AcceptedProductionRevision["shots"];
	canvas?: AcceptedProductionRevision["canvas"];
	fps?: AcceptedProductionRevision["fps"];
}): AcceptedProductionRevision {
	return {
		reference: {
			editId: "edit-selective",
			documentIntentRevision: id,
			productionRevisionId: `production-${id}`,
			contentDigest: `digest-${id}`,
		},
		script: "A concise three-shot film.",
		shots: structuredClone(shots),
		targetDurationMs: shots.reduce((sum, shot) => sum + shot.durationMs, 0),
		canvas,
		fps,
	};
}

function reference(
	artifactId: string,
	versionId = "version-1",
): ProductionArtifactReference {
	return { artifactId, versionId };
}

function source(
	revision: AcceptedProductionRevision,
	kind: ProductionSourceReference["kind"],
	shotId?: string,
): ProductionSourceReference {
	const found = buildProductionSourceReferences(revision).find(
		(candidate) =>
			candidate.kind === kind &&
			(!("shotId" in candidate) || candidate.shotId === shotId),
	);
	if (!found) throw new Error(`Missing ${kind} source for ${shotId ?? "production"}`);
	return found;
}

function compositionSources(
	revision: AcceptedProductionRevision,
): ProductionSourceReference[] {
	return buildProductionSourceReferences(revision).filter(
		(candidate) =>
			candidate.kind === "shot-duration" ||
			candidate.kind === "shot-order" ||
			candidate.kind === "canvas" ||
			candidate.kind === "frame-rate",
	);
}

function artifactBranch(
	revision: AcceptedProductionRevision,
	shotId: string,
): ProductionArtifactVersion[] {
	const audio = reference(`audio-${shotId}`);
	const captions = reference(`captions-${shotId}`);
	const image = reference(`image-${shotId}`);
	const video = reference(`video-${shotId}`);
	return [
		{
			reference: audio,
			kind: "audio",
			phase: "accepted",
			scope: { kind: "shot", shotId },
			sources: [source(revision, "shot-narration", shotId)],
			dependencies: [],
		},
		{
			reference: captions,
			kind: "captions",
			phase: "accepted",
			scope: { kind: "shot", shotId },
			sources: [source(revision, "shot-narration", shotId)],
			dependencies: [audio],
		},
		{
			reference: image,
			kind: "image",
			phase: "accepted",
			scope: { kind: "shot", shotId },
			sources: [source(revision, "shot-visual", shotId)],
			dependencies: [],
		},
		{
			reference: video,
			kind: "video",
			phase: "accepted",
			scope: { kind: "shot", shotId },
			sources: [source(revision, "shot-visual", shotId)],
			dependencies: [image],
		},
	];
}

function completeArtifacts(
	revision: AcceptedProductionRevision,
): ProductionArtifactVersion[] {
	const branches = revision.shots.flatMap((shot) =>
		artifactBranch(revision, shot.shotId));
	const timeline = reference("timeline");
	return [
		...branches,
		{
			reference: timeline,
			kind: "timeline",
			phase: "accepted",
			scope: { kind: "production" },
			sources: compositionSources(revision),
			dependencies: branches
				.filter((artifact) => artifact.kind !== "image")
				.map((artifact) => artifact.reference),
		},
		{
			reference: reference("render"),
			kind: "render",
			phase: "accepted",
			scope: { kind: "production" },
			sources: [],
			dependencies: [timeline],
		},
	];
}

function analyze(
	prior: AcceptedProductionRevision,
	current: AcceptedProductionRevision,
	artifacts = completeArtifacts(prior),
): ProductionDependencyAnalysis {
	return analyzeProductionDependencies({
		acceptedRevisions: [prior, current],
		currentRevision: current.reference,
		artifacts,
	});
}

function affectedIds(analysis: ProductionDependencyAnalysis): string[] {
	return analysis.affected.map((item) => item.artifactId).sort();
}

function changedShot(
	revision: AcceptedProductionRevision,
	shotId: string,
	change: Partial<AcceptedProductionRevision["shots"][number]>,
): AcceptedProductionRevision["shots"] {
	return revision.shots.map((shot) =>
		shot.shotId === shotId ? { ...shot, ...change, revision: shot.revision + 1 } : shot);
}

describe("production dependency invalidation", () => {
	test("a narration edit affects only audio, captions, timeline, and render descendants", () => {
		const prior = acceptedRevision({ id: "1" });
		const current = acceptedRevision({
			id: "2",
			shots: changedShot(prior, "shot-turn", {
				narration: "The timeline now moves twice as quickly.",
			}),
		});

		expect(affectedIds(analyze(prior, current))).toEqual([
			"audio-shot-turn",
			"captions-shot-turn",
			"render",
			"timeline",
		]);
	});

	test("a visual edit affects image and video while preserving narration products", () => {
		const prior = acceptedRevision({ id: "1" });
		const current = acceptedRevision({
			id: "2",
			shots: changedShot(prior, "shot-turn", {
				visualBrief: "Cards sweep into a bright, circular timeline.",
			}),
		});

		expect(affectedIds(analyze(prior, current))).toEqual([
			"image-shot-turn",
			"render",
			"timeline",
			"video-shot-turn",
		]);
	});

	test("a newly accepted source image invalidates video that used the prior image", () => {
		const revision = acceptedRevision({ id: "1" });
		const branch = artifactBranch(revision, "shot-turn");
		const oldImage: ProductionArtifactVersion = {
			...branch[2],
			phase: "previously-accepted",
		};
		const oldVideo = branch[3];
		const newImage = {
			...branch[2],
			reference: reference("image-shot-turn", "version-2"),
		};
		const result = analyzeProductionDependencies({
			acceptedRevisions: [revision],
			currentRevision: revision.reference,
			artifacts: [oldVideo, newImage, oldImage],
		});

		expect(affectedIds(result)).toEqual(["video-shot-turn"]);
		expect(result.artifacts.find(
			(artifact) => artifact.reference.versionId === "version-2")?.freshness,
		).toBe("current");
		expect(result.artifacts.find(
			(artifact) => artifact.kind === "video")?.reasons[0]?.kind,
		).toBe("dependency-superseded");
	});

	test("duration, order, canvas, and frame-rate edits invalidate composition only", () => {
		const prior = acceptedRevision({ id: "1" });
		const revisions = [
			acceptedRevision({
				id: "duration",
				shots: changedShot(prior, "shot-opening", { durationMs: 4_500 }),
			}),
			acceptedRevision({ id: "order", shots: [...prior.shots].reverse() }),
			acceptedRevision({ id: "canvas", canvas: { width: 1080, height: 1920 } }),
			acceptedRevision({ id: "fps", fps: { numerator: 24, denominator: 1 } }),
		];

		for (const current of revisions) {
			expect(affectedIds(analyze(prior, current))).toEqual(["render", "timeline"]);
		}
	});

	test("stable shot IDs localize removal and reordering without positional confusion", () => {
		const prior = acceptedRevision({ id: "1" });
		const reordered = acceptedRevision({
			id: "2",
			shots: [prior.shots[2], prior.shots[0], prior.shots[1]],
		});
		expect(affectedIds(analyze(prior, reordered))).toEqual(["render", "timeline"]);

		const removed = acceptedRevision({
			id: "3",
			shots: [prior.shots[2], prior.shots[0]],
		});
		expect(affectedIds(analyze(prior, removed))).toEqual([
			"audio-shot-turn",
			"captions-shot-turn",
			"image-shot-turn",
			"render",
			"timeline",
			"video-shot-turn",
		]);
		const retained = analyze(prior, removed).artifacts.find(
			(artifact) => artifact.reference.artifactId === "audio-shot-opening");
		expect(retained?.freshness).toBe("current");
	});

	test("old candidates retain source provenance and never replace accepted versions", () => {
		const prior = acceptedRevision({ id: "1" });
		const current = acceptedRevision({
			id: "2",
			shots: changedShot(prior, "shot-turn", {
				visualBrief: "The revised accepted storyboard image.",
			}),
		});
		const oldAccepted: ProductionArtifactVersion = {
			...artifactBranch(prior, "shot-turn")[2],
			phase: "previously-accepted",
		};
		const oldCandidate: ProductionArtifactVersion = {
			...oldAccepted,
			reference: reference("image-shot-turn", "candidate-old"),
			phase: "candidate",
		};
		const newAccepted: ProductionArtifactVersion = {
			...artifactBranch(current, "shot-turn")[2],
			reference: reference("image-shot-turn", "accepted-new"),
		};
		const newCandidate: ProductionArtifactVersion = {
			...newAccepted,
			reference: reference("image-shot-turn", "candidate-new"),
			phase: "candidate",
		};

		const result = analyze(prior, current, [
			oldCandidate,
			newCandidate,
			oldAccepted,
			newAccepted,
		]);
		expect(result.artifacts.map((artifact) => ({
			versionId: artifact.reference.versionId,
			phase: artifact.phase,
			freshness: artifact.freshness,
		}))).toEqual([
			{ versionId: "accepted-new", phase: "accepted", freshness: "current" },
			{ versionId: "candidate-new", phase: "candidate", freshness: "current" },
			{ versionId: "candidate-old", phase: "candidate", freshness: "stale" },
			{ versionId: "version-1", phase: "previously-accepted", freshness: "stale" },
		]);
		expect(result.affected).toEqual([oldCandidate.reference]);
		const stale = result.artifacts.find(
			(artifact) => artifact.reference.versionId === "candidate-old");
		expect(stale?.sources[0]).toEqual(source(prior, "shot-visual", "shot-turn"));
		expect(stale?.phase).toBe("candidate");
	});

	test("results are deterministic across bounded input permutations", () => {
		const prior = acceptedRevision({ id: "1" });
		const current = acceptedRevision({
			id: "2",
			shots: changedShot(prior, "shot-turn", { narration: "Changed narration." }),
		});
		const artifacts = completeArtifacts(prior);
		const expected = analyze(prior, current, artifacts);
		for (let offset = 1; offset < artifacts.length; offset += 1) {
			const rotated = [...artifacts.slice(offset), ...artifacts.slice(0, offset)];
			const result = analyzeProductionDependencies({
				acceptedRevisions: offset % 2 === 0 ? [prior, current] : [current, prior],
				currentRevision: current.reference,
				artifacts: rotated,
			});
			expect(result).toEqual(expected);
		}
	});

	test("malformed, cyclic, ambiguous, and oversized graphs fail closed", () => {
		const revision = acceptedRevision({ id: "1" });
		const image = artifactBranch(revision, "shot-opening")[2];
		const base = {
			acceptedRevisions: [revision],
			currentRevision: revision.reference,
		};
		expect(() =>
			analyzeProductionDependencies({ ...base, artifacts: [image, image] }),
		).toThrow(ProductionDependencyInputError);
		const ambiguous: ProductionArtifactVersion = {
			...image,
			reference: reference(image.reference.artifactId, "other-shot"),
			phase: "candidate",
			scope: { kind: "shot", shotId: "shot-turn" },
			sources: [source(revision, "shot-visual", "shot-turn")],
		};
		expect(() => analyzeProductionDependencies({
			...base,
			artifacts: [image, ambiguous],
		})).toThrow("Artifact version family is ambiguous");
		const [audio, captions] = artifactBranch(revision, "shot-opening");
		expect(() => analyzeProductionDependencies({
			...base,
			artifacts: [audio, { ...captions, dependencies: [audio.reference, audio.reference] }],
		})).toThrow("Duplicate artifact dependency reference");

		const renderArtifact = completeArtifacts(revision).find(
			(item) => item.kind === "render");
		if (!renderArtifact) throw new Error("Render fixture is missing");
		const missing = {
			...renderArtifact,
			dependencies: [reference("missing-timeline")],
		};
		expect(() => analyzeProductionDependencies({ ...base, artifacts: [missing] }))
			.toThrow("dependency is missing");

		const timeline = completeArtifacts(revision).find(
			(item) => item.kind === "timeline");
		const render = completeArtifacts(revision).find((item) => item.kind === "render");
		if (!timeline || !render) throw new Error("Fixture artifacts are missing");
		const cycle = [
			{ ...timeline, dependencies: [render.reference] },
			{ ...render, dependencies: [timeline.reference] },
		];
		expect(() => analyzeProductionDependencies({ ...base, artifacts: cycle }))
			.toThrow("Artifact cycle detected");

		const visual = source(revision, "shot-visual", "shot-opening");
		if (visual.kind !== "shot-visual") throw new Error("Visual fixture is invalid");
		const tampered = {
			...image,
			sources: [{ ...visual, visualBrief: "Unaccepted source text" }],
		};
		expect(() => analyzeProductionDependencies({ ...base, artifacts: [tampered] }))
			.toThrow("source snapshot is invalid");

		const oversized = Array.from({ length: 513 }, (_, index) => ({
			...image,
			reference: reference(`image-${index}`),
		}));
		expect(() => analyzeProductionDependencies({ ...base, artifacts: oversized }))
			.toThrow("exceeds its bounds");
	});

	test("family identity ignores shot scope property insertion order", () => {
		const revision = acceptedRevision({ id: "1" });
		const image = artifactBranch(revision, "shot-opening")[2];
		const candidate: ProductionArtifactVersion = {
			...image,
			reference: reference(image.reference.artifactId, "candidate"),
			phase: "candidate",
			scope: { shotId: "shot-opening", kind: "shot" },
		};
		const result = analyzeProductionDependencies({
			acceptedRevisions: [revision], currentRevision: revision.reference,
			artifacts: [image, candidate],
		});
		expect(result.artifacts.map((item) => item.phase)).toEqual(["candidate", "accepted"]);
		expect(result.affected).toEqual([]);
	});

	test("opaque Unicode identities and stale reasons have exact permutation-independent order", () => {
		const prior = acceptedRevision({ id: "1" });
		const current = acceptedRevision({
			id: "2", shots: changedShot(prior, "shot-opening", { visualBrief: "New view." }),
		});
		const image = artifactBranch(prior, "shot-opening")[2];
		const ids = ["e\u0301", "\u00e9"];
		const images = ids.map((id) => ({ ...image, reference: reference(id) }));
		const timeline: ProductionArtifactVersion = {
			reference: reference("timeline"), kind: "timeline", phase: "accepted",
			scope: { kind: "production" }, sources: compositionSources(prior),
			dependencies: images.map((item) => item.reference),
		};
		for (const reversed of [false, true]) {
			const ordered = reversed ? [...images].reverse() : images;
			const result = analyze(prior, current, [
				...ordered, { ...timeline, dependencies: ordered.map((item) => item.reference) },
			]);
			expect(result.artifacts.map((item) => item.reference.artifactId))
				.toEqual(["e\u0301", "timeline", "\u00e9"]);
			expect(result.affected.map((item) => item.artifactId))
				.toEqual(["e\u0301", "timeline", "\u00e9"]);
			expect(result.artifacts.find((item) => item.kind === "timeline")?.reasons)
				.toEqual(ids.map((id) => ({ kind: "dependency-stale", dependency: reference(id) })));
		}
	});
});
