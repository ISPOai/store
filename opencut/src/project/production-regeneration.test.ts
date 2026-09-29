import { describe, expect, test } from "bun:test";
import type { LoadedProductionDocument, ProductionImageCandidate, ProductionRevisionReference } from "./production-types";
import type { SerializedProject } from "@/services/storage/types";
import { deriveAcceptedPlacementInput, ProductionService } from "./production-service";
import { ProductionRegenerationService } from "./production-regeneration";

function project(): SerializedProject {
	return {
		metadata: { id: "edit-selective", name: "Selective", duration: 15_000, createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" },
		scenes: [{
			id: "scene", name: "Main", isMain: true,
			tracks: { overlay: [], main: { id: "main", name: "Main", type: "video", elements: [], muted: false, hidden: false }, audio: [] },
			bookmarks: [], createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z",
		}],
		currentSceneId: "scene",
		settings: { fps: { numerator: 30, denominator: 1 }, canvasSize: { width: 1920, height: 1080 }, background: { type: "color", color: "#000000" } },
		version: 32,
	};
}

class MemoryDocuments {
	private current: LoadedProductionDocument | null = null;
	private readonly revisions = new Map<string, LoadedProductionDocument>();

	seed(): EditRevision {
		const revision: EditRevision = { editId: "edit-selective", storageCasRevision: "1", intentRevision: "1", digest: "seed" };
		this.current = { revision, project: project() };
		this.revisions.set(revision.intentRevision, structuredClone(this.current));
		return revision;
	}

	async admitLegacy(): Promise<never> {
		throw new Error("Legacy edits are not used by this fixture");
	}

	async readCurrent(): Promise<{ kind: "document"; document: LoadedProductionDocument } | null> {
		return this.current ? { kind: "document", document: structuredClone(this.current) } : null;
	}

	async readRevision({ intentRevision }: { editId: string; intentRevision: string }): Promise<LoadedProductionDocument | null> {
		return this.revisions.get(intentRevision) ? structuredClone(this.revisions.get(intentRevision)!) : null;
	}

	async save({ editId, project: nextProject, expectedRevision }: { editId: string; project: SerializedProject; expectedRevision: LoadedProductionDocument["revision"] | null }): Promise<LoadedProductionDocument> {
		if (this.current && (!expectedRevision || JSON.stringify(expectedRevision) !== JSON.stringify(this.current.revision))) throw new Error("revision conflict");
		const storageCasRevision = String(Number(this.current?.revision.storageCasRevision ?? "0") + 1);
		const intentRevision = String(Number(this.current?.revision.intentRevision ?? "0") + 1);
		const next: LoadedProductionDocument = { revision: { editId, storageCasRevision, intentRevision, digest: `digest-${intentRevision}` }, project: structuredClone(nextProject) };
		this.current = next;
		this.revisions.set(intentRevision, structuredClone(next));
		return structuredClone(next);
	}
}

function shots() {
	return [
		{ clientKey: "one", narration: "One", visualBrief: "First", durationMs: 4_000 },
		{ clientKey: "two", narration: "Two", visualBrief: "Second", durationMs: 5_000 },
		{ clientKey: "three", narration: "Three", visualBrief: "Third", durationMs: 6_000 },
	];
}

function image(reference: ProductionRevisionReference, shotId: string, shotRevision: number, suffix: string): ProductionImageCandidate {
	return {
		kind: "storyboard-image",
		idempotencyKey: `image-${shotId}-${suffix}`,
		acceptedRevision: structuredClone(reference),
		shotId,
		shotRevision,
		resource: { kind: "files", publicId: `file-${shotId}-${suffix}`, path: `/file-${shotId}-${suffix}.png`, digest: `digest-${shotId}-${suffix}`, byteLength: 10, mimeType: "image/png", dimensions: { width: 1920, height: 1080 } },
	};
}

describe("selective production regeneration", () => {
	test("regenerates one visual, preserves siblings, and accepts the candidate", async () => {
		const documents = new MemoryDocuments();
		const production = new ProductionService(documents);
		const first = await production.acceptRevision({ editId: "edit-selective", expectedRevision: documents.seed(), idempotencyKey: "accept", script: "Three shots", shots: shots() });
		let revision = first.documentRevision;
		for (const [index, shot] of first.accepted.shots.entries()) {
			const attached = await production.attachMediaVersion({ reference: first.accepted.reference, expectedRevision: revision, shotId: shot.shotId, shotRevision: shot.revision, role: "visual", idempotencyKey: `attach-${shot.shotId}`, version: { idempotencyKey: `accepted-${shot.shotId}`, mediaId: `accepted-${shot.shotId}`, mediaRevision: `revision-${shot.shotId}`, name: `${shot.shotId}.png`, mediaType: "image", mimeType: "image/png", digest: `accepted-digest-${shot.shotId}`, byteLength: 10, sourceDurationSeconds: shot.durationMs / 1000, ...(index === 1 ? { references: [{ publicId: "style-a", name: "portrait.png" }] } : {}) } });
			revision = attached.documentRevision;
		}
		const before = await production.load("edit-selective");
		if (!before?.accepted || !before.documentRevision) throw new Error("Missing accepted fixture");
		const placementBefore = deriveAcceptedPlacementInput({ editId: "edit-selective", expectedRevision: before.documentRevision, accepted: before.accepted, idempotencyKey: "place-before" });
		const generatedShots: string[] = [];
		const generatedReferences: unknown[] = [];
		const regeneration = new ProductionRegenerationService(documents, {
			generate: async (request) => {
				generatedShots.push(request.shotId);
				generatedReferences.push(request.references);
				return image(request.acceptedRevision, request.shotId, 1, "replacement");
			},
		});
		const request = { editId: "edit-selective", expectedRevision: before.documentRevision, acceptedRevision: before.accepted.reference, idempotencyKey: "regen-shot-two", changes: [{ shotId: before.accepted.shots[1]!.shotId, role: "visual" as const, brief: "A changed second frame" }] };
		const result = await regeneration.regenerate(request);
		if (!result.data.revision) throw new Error("Regeneration did not return a revision");
		expect(generatedShots).toEqual([before.accepted.shots[1]!.shotId]);
		expect(generatedReferences).toEqual([{ mode: "explicit", publicIds: ["style-a"] }]);
		expect(result.data.staleOutputs).toEqual(["placement", "render"]);
		const afterCandidate = await production.load("edit-selective");
		expect(afterCandidate?.accepted?.shots[0]?.imageVersion?.mediaId).toBe(`accepted-${before.accepted.shots[0]!.shotId}`);
		expect(afterCandidate?.accepted?.shots[2]?.imageVersion?.mediaId).toBe(`accepted-${before.accepted.shots[2]!.shotId}`);
		const replay = await regeneration.regenerate(request);
		expect(replay).toEqual(result);

		const candidateId = result.data.results?.[0]?.candidateId;
		if (!candidateId) throw new Error("Regeneration candidate is missing");
		const accepted = await regeneration.acceptVersion({ ...request, expectedRevision: result.data.revision!, shotId: before.accepted.shots[1]!.shotId, shotRevision: before.accepted.shots[1]!.revision, role: "visual", candidateId, idempotencyKey: "accept-replacement" });
		expect(accepted.data.status).toBe("completed");
		const final = await production.load("edit-selective");
		if (!final?.accepted || !final.documentRevision) throw new Error("Missing final accepted fixture");
		expect(final.accepted.shots[1]?.imageVersion?.mediaId).toBe(`file-${before.accepted.shots[1]!.shotId}-replacement`);
		expect(final.accepted.shots[1]?.imageVersionHistory?.map((version) => version.mediaId)).toEqual([`accepted-${before.accepted.shots[1]!.shotId}`]);
		const placementAfter = deriveAcceptedPlacementInput({ editId: "edit-selective", expectedRevision: final.documentRevision, accepted: final.accepted, idempotencyKey: "place-after" });
		expect(placementAfter.shots.map((shot) => shot.shotId)).toEqual(placementBefore.shots.map((shot) => shot.shotId));
		expect(placementAfter.shots[0]?.visual?.mediaId).toBe(placementBefore.shots[0]?.visual?.mediaId);
		expect(placementAfter.shots[2]?.visual?.mediaId).toBe(placementBefore.shots[2]?.visual?.mediaId);
		expect(placementAfter.shots[1]?.visual?.mediaId).not.toBe(placementBefore.shots[1]?.visual?.mediaId);
		const changed = await regeneration.regenerate({ ...request, expectedRevision: final.documentRevision, idempotencyKey: "regen-shot-two-changed-reference", changes: [{ shotId: before.accepted.shots[1]!.shotId, role: "visual", references: { mode: "explicit", publicIds: ["style-b"] } }] });
		expect(changed.data.status).toBe("completed");
		expect(generatedReferences[1]).toEqual({ mode: "explicit", publicIds: ["style-b"] });
	});
});
