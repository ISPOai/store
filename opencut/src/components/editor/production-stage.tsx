"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { productionService, type ProductionService } from "@/project/production-service";
import type {
	EditRevision,
	ProductionRevisionReference,
	ProductionSnapshot,
} from "@/project/production-types";
import {
	ProductionScriptEditor,
	reconcileProductionScriptAcknowledgement,
	type ProductionScriptAcknowledgement,
	type ProductionScriptDraft,
	type ProductionScriptSubmission,
} from "./production-script-editor";

type StageState =
	| { kind: "loading" }
	| { kind: "missing" }
	| { kind: "ready"; snapshot: ProductionSnapshot; errorMessage?: string }
	| { kind: "failed"; message: string };

interface ProductionStageViewProps {
	state: StageState;
	isSaving: boolean;
	acknowledgement?: ProductionScriptAcknowledgement | null;
	onAccept: (submission: ProductionScriptSubmission) => Promise<void>;
}

interface PendingAcceptance {
	editId: string;
	draft: ProductionScriptDraft;
	draftEpoch: number;
	idempotencyKey: string;
	expectedRevision: EditRevision | null;
	expectedLegacyStorageCasRevision?: string;
	baseAcceptedReference: ProductionRevisionReference | null;
}

interface ActiveOperation {
	id: number;
	editId: string;
	lifetime: number;
}

function durationLabel(milliseconds: number): string {
	const seconds = milliseconds / 1_000;
	return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} sec`;
}

function currentQuestionCount(snapshot: ProductionSnapshot): number {
	if (!snapshot.accepted) return 0;
	const currentRevisionId = snapshot.accepted.reference.productionRevisionId;
	return new Set(
		snapshot.actionIntents
			.filter(
				(intent) =>
					intent.acceptedRevision.productionRevisionId === currentRevisionId,
			)
			.flatMap((intent) => intent.unresolvedQuestionRefs),
	).size;
}

function sameDraft(left: ProductionScriptDraft, right: ProductionScriptDraft): boolean {
	return (
		left.script === right.script &&
		left.shots.length === right.shots.length &&
		left.shots.every((shot, index) => {
			const other = right.shots[index];
			return (
				other !== undefined &&
				shot.shotId === other.shotId &&
				shot.clientKey === other.clientKey &&
				shot.narration === other.narration &&
				shot.visualBrief === other.visualBrief &&
				shot.durationMs === other.durationMs
			);
		})
	);
}

export function ProductionStageView({
	state,
	isSaving,
	acknowledgement,
	onAccept,
}: ProductionStageViewProps) {
	if (state.kind === "loading") {
		return <p className="text-muted-foreground text-sm">Loading production plan…</p>;
	}
	if (state.kind === "missing") {
		return <p className="text-muted-foreground text-sm">Open an edit to write a script.</p>;
	}
	if (state.kind === "failed") {
		return <p className="text-destructive text-sm">{state.message}</p>;
	}

	const { snapshot } = state;
	const accepted = snapshot.accepted;
	const questionCount = currentQuestionCount(snapshot);
	return (
		<div className="flex flex-col gap-5 py-4">
			<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
					<span className="flex items-baseline gap-1.5">
						<span className="text-muted-foreground">Edit revision</span>
						<span className="font-mono">
							{snapshot.documentRevision?.intentRevision ?? "Legacy"}
						</span>
					</span>
					{accepted ? (
						<>
							<span className="flex items-baseline gap-1.5">
								<span className="text-muted-foreground">Duration</span>
								<span>{durationLabel(accepted.targetDurationMs)}</span>
							</span>
							<span className="flex items-baseline gap-1.5">
								<span className="text-muted-foreground">Shots</span>
								<span>{accepted.shots.length}</span>
							</span>
						</>
					) : null}
				</div>
				{questionCount > 0 ? (
					<p className="text-muted-foreground text-sm">
						{questionCount} unresolved production {questionCount === 1 ? "question" : "questions"}
					</p>
				) : null}
			</div>
			{state.errorMessage ? (
				<p className="text-destructive text-sm">{state.errorMessage}</p>
			) : null}

			<ProductionScriptEditor
				key={snapshot.editId}
				accepted={accepted}
				acknowledgement={
					acknowledgement?.accepted.reference.editId === snapshot.editId
						? acknowledgement
						: null
				}
				isSaving={isSaving}
				onAccept={onAccept}
			/>
		</div>
	);
}

export function ProductionStage({
	service = productionService,
}: {
	service?: ProductionService;
}) {
	const editor = useEditor();
	const editId = useEditor(
		(editor) => editor.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const [state, setState] = useState<StageState>({ kind: "loading" });
	const [isSaving, setIsSaving] = useState(false);
	const [acknowledgement, setAcknowledgement] =
		useState<ProductionScriptAcknowledgement | null>(null);
	const pendingByEdit = useRef(new Map<string, PendingAcceptance>());
	const operationSequence = useRef(0);
	const inFlight = useRef<ActiveOperation | null>(null);
	const lifetime = useRef({ editId, service, generation: 0 });
	if (lifetime.current.editId !== editId || lifetime.current.service !== service) {
		lifetime.current = {
			editId,
			service,
			generation: lifetime.current.generation + 1,
		};
		inFlight.current = null;
	}

	useEffect(() => {
		let current = true;
		const generation = lifetime.current.generation;
		setIsSaving(false);
		setAcknowledgement(null);
		if (!editId) {
			setState({ kind: "missing" });
			return () => {
				current = false;
			};
		}
		setState({ kind: "loading" });
		void service.load(editId).then(
			(snapshot) => {
				if (!current || lifetime.current.generation !== generation) return;
				setState(snapshot ? { kind: "ready", snapshot } : { kind: "missing" });
			},
			(error) => {
				if (!current || lifetime.current.generation !== generation) return;
				setState({
					kind: "failed",
					message: error instanceof Error ? error.message : "Could not load production plan",
				});
			},
		);
		return () => {
			current = false;
		};
	}, [editId, service]);

	const accept = async ({
		draft,
		epoch,
		baseAcceptedReference,
	}: ProductionScriptSubmission) => {
		if (!editId || state.kind !== "ready" || inFlight.current) return;
		const submittedState = {
			draft,
			epoch,
			baseAcceptedReference,
		};
		const currentSubmission =
			acknowledgement?.accepted.reference.editId === editId
				? reconcileProductionScriptAcknowledgement({
						current: submittedState,
						acknowledgement,
					})
				: submittedState;
		const operation: ActiveOperation = {
			id: operationSequence.current + 1,
			editId,
			lifetime: lifetime.current.generation,
		};
		operationSequence.current = operation.id;
		inFlight.current = operation;
		const isCurrentOperation = () =>
			inFlight.current?.id === operation.id &&
			lifetime.current.generation === operation.lifetime &&
			lifetime.current.editId === operation.editId;
		setIsSaving(true);
		try {
			let pending = pendingByEdit.current.get(editId);
			if (
				!pending ||
				pending.draftEpoch !== currentSubmission.epoch ||
				!sameDraft(pending.draft, currentSubmission.draft)
			) {
				if (editor.save.getIsDirty()) await editor.save.flush();
				if (!isCurrentOperation()) return;
				const current = await service.load(editId);
				if (!current) throw new Error("The active edit is no longer available");
				if (!isCurrentOperation()) return;
				pending = {
					editId,
					draft: structuredClone(currentSubmission.draft),
					draftEpoch: currentSubmission.epoch,
					idempotencyKey: `ui-accept-${crypto.randomUUID()}`,
					expectedRevision: current.documentRevision
						? structuredClone(current.documentRevision)
						: null,
					expectedLegacyStorageCasRevision:
						current.legacyStorageCasRevision ?? undefined,
					baseAcceptedReference: currentSubmission.baseAcceptedReference
						? structuredClone(currentSubmission.baseAcceptedReference)
						: null,
				};
				pendingByEdit.current.set(editId, pending);
			}
			const result = await service.acceptRevision({
				editId: pending.editId,
				expectedRevision: pending.expectedRevision,
				expectedLegacyStorageCasRevision:
					pending.expectedLegacyStorageCasRevision,
				baseAcceptedReference: pending.baseAcceptedReference,
				idempotencyKey: pending.idempotencyKey,
				script: pending.draft.script,
				shots: pending.draft.shots,
			});
			const refreshed = await service.load(editId);
			if (!refreshed) throw new Error("The active edit is no longer available");
			if (!isCurrentOperation()) return;
			if (pendingByEdit.current.get(editId)?.idempotencyKey === pending.idempotencyKey) {
				pendingByEdit.current.delete(editId);
			}
			setAcknowledgement({
				idempotencyKey: pending.idempotencyKey,
				draftEpoch: pending.draftEpoch,
				submittedDraft: structuredClone(pending.draft),
				accepted: structuredClone(result.accepted),
			});
			setState({
				kind: "ready",
				snapshot: refreshed,
			});
		} catch (error) {
			if (!isCurrentOperation()) return;
			const message = error instanceof Error ? error.message : "Could not accept script";
			setState((current) =>
				current.kind === "ready"
					? { ...current, errorMessage: message }
					: { kind: "failed", message },
			);
		} finally {
			if (inFlight.current?.id === operation.id) {
				inFlight.current = null;
				if (lifetime.current.generation === operation.lifetime) {
					setIsSaving(false);
				}
			}
		}
	};

	return (
		<ProductionStageView
			state={state}
			isSaving={isSaving}
			acknowledgement={acknowledgement}
			onAccept={accept}
		/>
	);
}

export type { StageState };
