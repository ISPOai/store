import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AcceptedProductionRevision } from "@/project/production-types";
import {
	ProductionScriptEditor,
	createProductionScriptDraft,
	moveProductionDraftShot,
	reconcileProductionScriptAcknowledgement,
	updateProductionDraftShot,
} from "./production-script-editor";

function acceptedRevision(): AcceptedProductionRevision {
	return {
		reference: {
			editId: "edit-1",
			documentIntentRevision: "4",
			productionRevisionId: "production-4-accepted",
			contentDigest: "content-digest",
		},
		script: "A three-shot explainer.",
		shots: [
			{
				shotId: "shot-opening",
				revision: 1,
				narration: "Meet the problem.",
				visualBrief: "A cluttered desk.",
				durationMs: 4_000,
			},
			{
				shotId: "shot-resolution",
				revision: 2,
				narration: "Resolve it clearly.",
				visualBrief: "The timeline becomes ordered.",
				durationMs: 6_000,
			},
		],
		targetDurationMs: 10_000,
		canvas: { width: 1920, height: 1080 },
		fps: { numerator: 30, denominator: 1 },
	};
}

describe("production script editor", () => {
	test("editing one shot preserves its stable identity and its siblings", () => {
		const draft = createProductionScriptDraft(acceptedRevision());
		const updated = updateProductionDraftShot({
			draft,
			clientKey: "shot-resolution",
			patch: { visualBrief: "Only the second shot changes." },
		});
		expect(updated.shots[0]).toEqual(draft.shots[0]);
		expect(updated.shots[1]).toEqual({
			...draft.shots[1],
			shotId: "shot-resolution",
			visualBrief: "Only the second shot changes.",
		});
		const reordered = moveProductionDraftShot({
			draft: updated,
			clientKey: "shot-resolution",
			direction: -1,
		});
		expect(reordered.shots.map((shot) => shot.shotId)).toEqual([
			"shot-resolution",
			"shot-opening",
		]);
	});

	test("renders the accepted script and requires an explicit Use script action", () => {
		const markup = renderToStaticMarkup(
			<ProductionScriptEditor
				accepted={acceptedRevision()}
				isSaving={false}
				onAccept={() => Promise.resolve()}
			/>,
		);
		expect(markup).toContain("A three-shot explainer.");
		expect(markup).toContain("shot-opening");
		expect(markup).toContain("Narration");
		expect(markup).toContain("Visual brief");
		expect(markup).toContain("Use script");
		expect(markup).toContain("Revises production-4-accepted");
	});

	test("merges acknowledged shot identities without replacing newer draft content or order", () => {
		const accepted = acceptedRevision();
		const submittedDraft = {
			script: "Submitted script",
			shots: [
				{ ...accepted.shots[0], clientKey: "draft-opening", shotId: undefined },
				{ ...accepted.shots[1], clientKey: "draft-close", shotId: undefined },
			],
		};
		const newerOpening = {
			...submittedDraft.shots[0],
			narration: "Newer opening narration",
		};
		const current = {
			draft: {
				script: "Newer unsaved script",
				shots: [
					submittedDraft.shots[1],
					newerOpening,
					{
						clientKey: "draft-later",
						narration: "Added later",
						visualBrief: "A later shot",
						durationMs: 3_000,
					},
				],
			},
			epoch: 8,
			baseAcceptedReference: null,
		};
		const reconciled = reconcileProductionScriptAcknowledgement({
			current,
			acknowledgement: {
				idempotencyKey: "accept-draft",
				draftEpoch: 5,
				submittedDraft,
				accepted,
			},
		});

		expect(reconciled.draft.script).toBe("Newer unsaved script");
		expect(reconciled.draft.shots.map((shot) => shot.clientKey)).toEqual([
			"draft-close",
			"draft-opening",
			"draft-later",
		]);
		expect(reconciled.draft.shots.map((shot) => shot.shotId)).toEqual([
			"shot-resolution",
			"shot-opening",
			undefined,
		]);
		expect(reconciled.draft.shots[1]?.narration).toBe(
			"Newer opening narration",
		);
		expect(reconciled.baseAcceptedReference).toEqual(accepted.reference);
	});
});
