"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
	AcceptedProductionRevision,
	ProductionRevisionReference,
	ProductionShotInput,
} from "@/project/production-types";

export interface ProductionScriptDraft {
	script: string;
	shots: ProductionShotInput[];
}

export interface ProductionScriptSubmission {
	draft: ProductionScriptDraft;
	epoch: number;
	baseAcceptedReference: ProductionRevisionReference | null;
}

export interface ProductionScriptAcknowledgement {
	idempotencyKey: string;
	draftEpoch: number;
	submittedDraft: ProductionScriptDraft;
	accepted: AcceptedProductionRevision;
}

export interface ProductionScriptDraftState {
	draft: ProductionScriptDraft;
	epoch: number;
	baseAcceptedReference: ProductionRevisionReference | null;
}

interface ProductionScriptEditorProps {
	accepted: AcceptedProductionRevision | null;
	acknowledgement?: ProductionScriptAcknowledgement | null;
	isSaving: boolean;
	onAccept: (submission: ProductionScriptSubmission) => Promise<void>;
}

function newDraftShot(): ProductionShotInput {
	return {
		clientKey: `draft-${crypto.randomUUID()}`,
		narration: "",
		visualBrief: "",
		durationMs: 5_000,
	};
}

export function createProductionScriptDraft(
	accepted: AcceptedProductionRevision | null,
): ProductionScriptDraft {
	if (!accepted) return { script: "", shots: [newDraftShot()] };
	return {
		script: accepted.script,
		shots: accepted.shots.map((shot) => ({
			shotId: shot.shotId,
			clientKey: shot.shotId,
			narration: shot.narration,
			visualBrief: shot.visualBrief,
			durationMs: shot.durationMs,
		})),
	};
}

export function updateProductionDraftShot({
	draft,
	clientKey,
	patch,
}: {
	draft: ProductionScriptDraft;
	clientKey: string;
	patch: Partial<Pick<ProductionShotInput, "narration" | "visualBrief" | "durationMs">>;
}): ProductionScriptDraft {
	return {
		...draft,
		shots: draft.shots.map((shot) =>
			shot.clientKey === clientKey ? { ...shot, ...patch } : shot,
		),
	};
}

export function moveProductionDraftShot({
	draft,
	clientKey,
	direction,
}: {
	draft: ProductionScriptDraft;
	clientKey: string;
	direction: -1 | 1;
}): ProductionScriptDraft {
	const index = draft.shots.findIndex((shot) => shot.clientKey === clientKey);
	const destination = index + direction;
	if (index < 0 || destination < 0 || destination >= draft.shots.length) {
		return draft;
	}
	const shots = [...draft.shots];
	const [shot] = shots.splice(index, 1);
	shots.splice(destination, 0, shot);
	return { ...draft, shots };
}

export function reconcileProductionScriptAcknowledgement({
	current,
	acknowledgement,
}: {
	current: ProductionScriptDraftState;
	acknowledgement: ProductionScriptAcknowledgement;
}): ProductionScriptDraftState {
	if (
		current.epoch < acknowledgement.draftEpoch ||
		acknowledgement.submittedDraft.shots.length !==
			acknowledgement.accepted.shots.length
	) {
		return current;
	}
	const acceptedIds = new Map(
		acknowledgement.submittedDraft.shots.map((shot, index) => [
			shot.clientKey,
			acknowledgement.accepted.shots[index]?.shotId,
		]),
	);
	return {
		...current,
		draft: {
			...current.draft,
			shots: current.draft.shots.map((shot) => {
				const shotId = acceptedIds.get(shot.clientKey);
				return shotId ? { ...shot, shotId } : shot;
			}),
		},
		baseAcceptedReference: structuredClone(
			acknowledgement.accepted.reference,
		),
	};
}

export function ProductionScriptEditor({
	accepted,
	acknowledgement,
	isSaving,
	onAccept,
}: ProductionScriptEditorProps) {
	const formId = useId();
	const [draftState, setDraftState] = useState<ProductionScriptDraftState>(() => ({
		draft: createProductionScriptDraft(accepted),
		epoch: 0,
		baseAcceptedReference: accepted
			? structuredClone(accepted.reference)
			: null,
	}));
	const { draft } = draftState;
	useEffect(() => {
		if (!acknowledgement) return;
		setDraftState((current) =>
			reconcileProductionScriptAcknowledgement({ current, acknowledgement }),
		);
	}, [acknowledgement]);

	const reviseDraft = (
		update: (current: ProductionScriptDraft) => ProductionScriptDraft,
	) => {
		setDraftState((current) => ({
			...current,
			draft: update(current.draft),
			epoch: current.epoch + 1,
		}));
	};

	const updateShot = (
		clientKey: string,
		patch: Partial<Pick<ProductionShotInput, "narration" | "visualBrief" | "durationMs">>,
	) => {
		reviseDraft((current) =>
			updateProductionDraftShot({ draft: current, clientKey, patch }),
		);
	};

	return (
		<form
			className="flex flex-col gap-5"
			onSubmit={(event) => {
				event.preventDefault();
				void onAccept({
					draft: structuredClone(draft),
					epoch: draftState.epoch,
					baseAcceptedReference: draftState.baseAcceptedReference
						? structuredClone(draftState.baseAcceptedReference)
						: null,
				});
		}}
		>
			<div className="flex flex-col gap-2">
				<label className="text-sm font-medium" htmlFor={`${formId}-script`}>
					Script
				</label>
				<Textarea
					id={`${formId}-script`}
					className="min-h-28"
					placeholder="Write the accepted story and narration direction."
					value={draft.script}
					onChange={(event) =>
						reviseDraft((current) => ({ ...current, script: event.target.value }))
					}
				/>
			</div>

			<div className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-3">
					<h3 className="text-sm font-semibold">Shots</h3>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							reviseDraft((current) => ({
								...current,
								shots: [...current.shots, newDraftShot()],
							}))
						}
					>
						<Plus data-icon="inline-start" />
						Add shot
					</Button>
				</div>

				{draft.shots.map((shot, index) => {
					const prefix = `${formId}-shot-${shot.clientKey}`;
					return (
						<section
							className="flex flex-col gap-3 rounded-lg border border-border p-4"
							key={shot.clientKey}
						>
							<div className="flex items-center gap-2">
								<h4 className="text-sm font-medium">Shot {index + 1}</h4>
								{shot.shotId ? (
									<span className="text-muted-foreground font-mono text-xs">
										{shot.shotId}
									</span>
								) : null}
								<Button
									type="button"
									className="ml-auto"
									variant="ghost"
									size="sm"
									disabled={index === 0}
									onClick={() =>
										reviseDraft((current) =>
											moveProductionDraftShot({
												draft: current,
												clientKey: shot.clientKey,
												direction: -1,
											}),
										)
									}
								>
									<ChevronUp data-icon="inline-start" />
									Up
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={index === draft.shots.length - 1}
									onClick={() =>
										reviseDraft((current) =>
											moveProductionDraftShot({
												draft: current,
												clientKey: shot.clientKey,
												direction: 1,
											}),
										)
									}
								>
									<ChevronDown data-icon="inline-start" />
									Down
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={draft.shots.length === 1}
									onClick={() =>
										reviseDraft((current) => ({
											...current,
											shots: current.shots.filter(
												(candidate) => candidate.clientKey !== shot.clientKey,
											),
										}))
									}
								>
									<Trash2 data-icon="inline-start" />
									Remove
								</Button>
							</div>

							<div className="flex flex-col gap-2">
								<label className="text-sm" htmlFor={`${prefix}-narration`}>
									Narration
								</label>
								<Textarea
									id={`${prefix}-narration`}
									value={shot.narration}
									onChange={(event) =>
										updateShot(shot.clientKey, { narration: event.target.value })
									}
								/>
							</div>

							<div className="flex flex-col gap-2">
								<label className="text-sm" htmlFor={`${prefix}-visual`}>
									Visual brief
								</label>
								<Textarea
									id={`${prefix}-visual`}
									value={shot.visualBrief}
									onChange={(event) =>
										updateShot(shot.clientKey, { visualBrief: event.target.value })
									}
								/>
							</div>

							<div className="flex max-w-40 flex-col gap-2">
								<label className="text-sm" htmlFor={`${prefix}-duration`}>
									Duration (seconds)
								</label>
								<Input
									id={`${prefix}-duration`}
									type="number"
									min="0.1"
									step="0.1"
									value={shot.durationMs / 1_000}
									onChange={(event) =>
										updateShot(shot.clientKey, {
											durationMs: Math.round(Number(event.target.value) * 1_000),
										})
									}
								/>
							</div>
						</section>
					);
				})}
			</div>

			<div className="flex items-center gap-3">
				<Button type="submit" disabled={isSaving}>
					{isSaving ? "Saving…" : "Use script"}
				</Button>
				<span className="text-muted-foreground text-sm">
					{draftState.baseAcceptedReference
						? `Revises ${draftState.baseAcceptedReference.productionRevisionId}`
						: "Creates the first accepted revision"}
				</span>
			</div>
		</form>
	);
}
