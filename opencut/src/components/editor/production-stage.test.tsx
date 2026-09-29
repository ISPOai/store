import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { AcceptedProductionRevision } from "@/project/production-types";
import type { StageState } from "./production-stage";
import * as wasmGlue from "../../../node_modules/opencut-wasm/opencut_wasm_bg.js";

const wasmModule = new WebAssembly.Module(
	readFileSync(
		new URL(
			"../../../node_modules/opencut-wasm/opencut_wasm_bg.wasm",
			import.meta.url,
		),
	),
);
const wasmInstance = new WebAssembly.Instance(wasmModule, {
	"./opencut_wasm_bg.js": wasmGlue,
});
wasmGlue.__wbg_set_wasm(wasmInstance.exports);
const startWasm = wasmInstance.exports.__wbindgen_start;
if (startWasm instanceof Function) startWasm();
mock.module("opencut-wasm", () => wasmGlue);

const { ProductionStageView } = await import("./production-stage");

function acceptedRevision(): AcceptedProductionRevision {
	return {
		reference: {
			editId: "edit-1",
			documentIntentRevision: "3",
			productionRevisionId: "production-3-current",
			contentDigest: "content-digest",
		},
		script: "The current accepted script.",
		shots: [
			{
				shotId: "shot-1",
				revision: 1,
				narration: "Open.",
				visualBrief: "Wide morning view.",
				durationMs: 7_000,
			},
			{
				shotId: "shot-2",
				revision: 1,
				narration: "Close.",
				visualBrief: "Product in use.",
				durationMs: 8_000,
			},
		],
		targetDurationMs: 15_000,
		canvas: { width: 1920, height: 1080 },
		fps: { numerator: 30, denominator: 1 },
	};
}

describe("production stage", () => {
	test("projects the accepted edit and unresolved Task references beside the editor", () => {
		const accepted = acceptedRevision();
		const state: StageState = {
			kind: "ready",
			snapshot: {
				editId: "edit-1",
				documentRevision: {
					editId: "edit-1",
					storageCasRevision: "4",
					intentRevision: "4",
					digest: "document-digest",
				},
				legacyStorageCasRevision: null,
				accepted,
				actionIntents: [
					{
						intentId: "intent-1",
						idempotencyKey: "submit-1",
						requestDigest: "request-digest",
						documentIntentRevision: "4",
						acceptedRevision: accepted.reference,
						unresolvedQuestionRefs: ["question-tone", "question-camera"],
					},
				],
			},
		};
		const markup = renderToStaticMarkup(
			<ProductionStageView
				state={state}
				isSaving={false}
				onAccept={() => Promise.resolve()}
			/>,
		);
		expect(markup).toContain("Edit revision");
		expect(markup).toContain("15 sec");
		expect(markup).toContain("Shots");
		expect(markup).toContain("2 unresolved production questions");
		expect(markup).toContain("Use script");
	});

	test("does not present acceptance controls before an edit has loaded", () => {
		const markup = renderToStaticMarkup(
			<ProductionStageView
				state={{ kind: "loading" }}
				isSaving={false}
				onAccept={() => Promise.resolve()}
			/>,
		);
		expect(markup).toContain("Loading production plan");
		expect(markup).not.toContain("Use script");
	});

	test("keeps the accepted draft available after a refusal so it can be retried", () => {
		const accepted = acceptedRevision();
		const markup = renderToStaticMarkup(
			<ProductionStageView
				state={{
					kind: "ready",
					errorMessage: "The edit changed before acceptance",
					snapshot: {
						editId: "edit-1",
						documentRevision: {
							editId: "edit-1",
							storageCasRevision: "4",
							intentRevision: "4",
							digest: "document-digest",
						},
						legacyStorageCasRevision: null,
						accepted,
						actionIntents: [],
					},
				}}
				isSaving={false}
				onAccept={() => Promise.resolve()}
			/>,
		);
		expect(markup).toContain("The edit changed before acceptance");
		expect(markup).toContain("Use script");
		expect(markup).toContain("The current accepted script.");
	});
});
