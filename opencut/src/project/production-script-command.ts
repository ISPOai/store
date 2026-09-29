import type { ProductionDocumentSdk } from "./production-document-service";
import { ProductionDocumentService } from "./production-document-service";
import { ProductionService } from "./production-service";
import {
	EditRevisionConflictError,
	ProductionDraftRequiredError,
	ProductionDraftStaleError,
	ProductionIdempotencyError,
	ProductionInputError,
} from "./production-types";
import type {
	ProductionScriptCommandResult,
	ProductionScriptInput,
	ProductionScriptView,
} from "@/services/project-command-types";
import {
	canonicalEditRevision,
	canonicalProductionRevisionReference,
} from "@/services/project-command-types";
import type {
	ProductionRevisionReference,
	ProductionScriptDraft,
	ProductionSnapshot,
} from "./production-types";

function aspectRatio(width: number, height: number): string {
	const greatestCommonDivisor = (left: number, right: number): number =>
		right === 0 ? left : greatestCommonDivisor(right, left % right);
	const divisor = greatestCommonDivisor(width, height);
	return `${width / divisor}:${height / divisor}`;
}

function draftView(
	draft: ProductionScriptDraft,
	canvas: ProductionSnapshot["canvas"],
	fps: ProductionSnapshot["fps"],
): ProductionScriptView {
	const shots = draft.shots.map((shot) => ({
		shotId: shot.shotId,
		narration: shot.narration,
		visualBrief: shot.visualBrief,
		motionBrief: shot.motionBrief,
		targetDurationSeconds: shot.durationMs / 1_000,
	}));
	return {
		script: draft.script,
		shots,
		canvasSize: structuredClone(canvas),
		fps: structuredClone(fps),
		totalDurationSeconds: draft.shots.reduce((total, shot) => total + shot.durationMs, 0) / 1_000,
		aspectRatio: aspectRatio(canvas.width, canvas.height),
	};
}

function acceptedView(snapshot: ProductionSnapshot): ProductionScriptView | undefined {
	const accepted = snapshot.accepted;
	if (!accepted) return undefined;
	return {
		script: accepted.script,
		shots: accepted.shots.map((shot) => ({
			shotId: shot.shotId,
			revision: String(shot.revision),
			narration: shot.narration,
			visualBrief: shot.visualBrief,
			motionBrief: shot.motionBrief,
			targetDurationSeconds: shot.durationMs / 1_000,
		})),
		canvasSize: structuredClone(accepted.canvas),
		fps: structuredClone(accepted.fps),
		totalDurationSeconds: accepted.targetDurationMs / 1_000,
		aspectRatio: aspectRatio(accepted.canvas.width, accepted.canvas.height),
	};
}

function completed(
	operation: ProductionScriptInput["operation"],
	editId: string,
	message: string,
	values: Partial<ProductionScriptCommandResult["data"]> = {},
): ProductionScriptCommandResult {
	return {
		kind: "json",
		data: {
			supported: true,
			status: "completed",
			operation,
			editId,
			message,
			...values,
		},
	};
}

function refused(
	operation: ProductionScriptInput["operation"],
	editId: string,
	message: string,
	reason: NonNullable<ProductionScriptCommandResult["data"]["reason"]>,
		revision?: ProductionScriptCommandResult["data"]["revision"],
): ProductionScriptCommandResult {
	const data: ProductionScriptCommandResult["data"] = {
		supported: true,
		status: "refused",
		operation,
		editId,
		message,
		reason,
	};
	if (revision) data.revision = revision;
	return {
		kind: "json",
		data,
	};
}

function durationMs(seconds: number): number {
	return Math.round(seconds * 1_000);
}

function expectedRevisionRequired(input: ProductionScriptInput): ProductionScriptCommandResult {
	return refused(input.operation, input.editId ?? "", `${input.operation} requires the complete expected edit revision.`, "expected-revision-required");
}

function commandRevision(
	revision: ProductionSnapshot["documentRevision"],
): ProductionScriptCommandResult["data"]["revision"] {
	return revision ? canonicalEditRevision(revision) : undefined;
}

function commandAcceptedRevision(
	revision: ProductionRevisionReference | undefined,
): ProductionScriptCommandResult["data"]["acceptedRevision"] {
	return revision ? canonicalProductionRevisionReference(revision) : undefined;
}

function assertEditId(
	input: ProductionScriptInput,
): asserts input is ProductionScriptInput & { editId: string } {
	if (input.editId === undefined) throw new Error("A bounded editId is required.");
}

export async function runProductionScriptCommand(
	input: ProductionScriptInput,
	sdk: ProductionDocumentSdk,
): Promise<ProductionScriptCommandResult> {
	const documents = new ProductionDocumentService(sdk);
	if (input.operation !== "read" && input.editId === undefined) {
		return refused(input.operation, "", `${input.operation} requires an explicit editId.`, "input-invalid");
	}
	const editId = input.editId ?? (await documents.listEdits()).activeEditId;
	if (!editId) return refused(input.operation, "", "No current edit was found.", "edit-not-found");
	input = { ...input, editId };
	assertEditId(input);
	const service = new ProductionService(documents);
	const snapshot = await service.load(editId);
	if (!snapshot) return refused(input.operation, editId, `Edit ${editId} was not found.`, "edit-not-found");

	if (input.operation === "read") {
		const accepted = acceptedView(snapshot);
		const values: Partial<ProductionScriptCommandResult["data"]> = {};
		const revision = commandRevision(snapshot.documentRevision);
		const acceptedRevision = commandAcceptedRevision(snapshot.accepted?.reference);
		if (revision) values.revision = revision;
		if (snapshot.draft) values.draft = draftView(snapshot.draft, snapshot.canvas, snapshot.fps);
		if (accepted) values.accepted = accepted;
		if (acceptedRevision) values.acceptedRevision = acceptedRevision;
		return completed(input.operation, editId, `Read production script for ${editId}.`, values);
	}

	if (!input.expectedRevision) return expectedRevisionRequired(input);
	const expectedRevision = canonicalEditRevision(input.expectedRevision);
	try {
		if (input.operation === "save-draft") {
			if (input.script === undefined || !Array.isArray(input.shots)) {
				return refused(input.operation, input.editId, "save-draft requires a full script and ordered shots.", "input-invalid", commandRevision(snapshot.documentRevision));
			}
			const saved = await service.saveScriptDraft({
				editId: input.editId,
				expectedRevision,
				script: input.script,
				shots: input.shots.map((shot) => ({
					shotId: shot.shotId,
					narration: shot.narration,
					visualBrief: shot.visualBrief,
					motionBrief: shot.motionBrief,
					durationMs: durationMs(shot.targetDurationSeconds),
				})),
			});
			return completed(input.operation, input.editId, `Saved a ${saved.draft.shots.length}-shot production draft.`, {
				revision: canonicalEditRevision(saved.documentRevision),
				draft: draftView(saved.draft, snapshot.canvas, snapshot.fps),
			});
		}

		if (!input.idempotencyKey) return refused(input.operation, input.editId, "accept requires an idempotency key.", "input-invalid", commandRevision(snapshot.documentRevision));
		const accepted = await service.acceptScriptDraft({
			editId: input.editId,
			expectedRevision,
			idempotencyKey: input.idempotencyKey,
		});
		const latest = await service.load(input.editId);
		if (!latest) throw new Error(`Edit ${input.editId} disappeared after acceptance`);
		const view = acceptedView(latest);
		if (!view) throw new Error("Accepted production revision is unavailable after acceptance");
		return completed(input.operation, input.editId, `Accepted ${view.shots.length} production shots.`, {
			revision: canonicalEditRevision(accepted.documentRevision),
			accepted: view,
			acceptedRevision: commandAcceptedRevision(accepted.accepted.reference),
			summary: {
				shotCount: view.shots.length,
				totalDurationSeconds: view.totalDurationSeconds,
				aspectRatio: view.aspectRatio,
			},
		});
	} catch (error) {
		if (error instanceof EditRevisionConflictError) {
			return refused(input.operation, input.editId, error.message, "revision-conflict", commandRevision(error.actual));
		}
		if (error instanceof ProductionDraftStaleError) {
			return refused(input.operation, input.editId, error.message, "revision-conflict", commandRevision(snapshot.documentRevision));
		}
		if (error instanceof ProductionDraftRequiredError) {
			return refused(input.operation, input.editId, error.message, "draft-required", commandRevision(snapshot.documentRevision));
		}
		if (error instanceof ProductionIdempotencyError) {
			return refused(input.operation, input.editId, error.message, "idempotency-conflict", commandRevision(snapshot.documentRevision));
		}
		if (error instanceof ProductionInputError) {
			return refused(input.operation, input.editId, error.message, "input-invalid", commandRevision(snapshot.documentRevision));
		}
		throw error;
	}
}
