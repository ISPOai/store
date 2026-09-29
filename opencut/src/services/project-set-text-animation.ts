import { whenEditorReady } from "./editor-ready";
import { navigateToEditorProject } from "@/lib/next-stubs/navigation";
import { ProjectRpcError } from "@ispo/sdk";
import { EditorCore } from "@/core";
import { ProductionDocumentService, type ProductionDocumentSdk } from "@/project/production-document-service";
import { EditRevisionConflictError, type EditRevision } from "@/project/production-types";
import type { TextElement } from "@/timeline";
import {
	buildTextAnimationPresetKeyframes,
	getTextAnimationPresetDefinition,
	getTextAnimationPresetPaths,
	isTextAnimationPhase,
	isTextAnimationPresetName,
	mergePresetAnimations,
	removeAnimationPaths,
	type TextAnimationPhase,
	type TextAnimationPresetName,
} from "@/animation/presets";
import { buildPresetAnimations } from "@/animation/preset-to-animations";
import { mediaTimeToSeconds } from "@/wasm";

export interface SetTextAnimationInput {
	editId: string;
	expectedRevision?: EditRevision;
	trackId: string;
	elementId: string;
	phase: TextAnimationPhase;
	/** Preset name to apply. Omit when `remove` is true. */
	preset?: TextAnimationPresetName;
	/** When true, remove the phase's animation instead of applying one. */
	remove?: boolean;
	durationSeconds?: number;
}

function invalid(message: string): never {
	throw new ProjectRpcError({ code: "input-invalid", message });
}

function bindingField(phase: TextAnimationPhase): "textAnimationIn" | "textAnimationOut" | "textAnimationLoop" {
	switch (phase) {
		case "in":
			return "textAnimationIn";
		case "out":
			return "textAnimationOut";
		case "loop":
			return "textAnimationLoop";
	}
}

function currentBinding(
	element: TextElement,
	phase: TextAnimationPhase,
): { preset: TextAnimationPresetName; durationSeconds: number } | undefined {
	switch (phase) {
		case "in":
			return element.textAnimationIn;
		case "out":
			return element.textAnimationOut;
		case "loop":
			return element.textAnimationLoop;
	}
}

async function applySetTextAnimation(input: SetTextAnimationInput, sdk: ProductionDocumentSdk) {
	const editor = EditorCore.getInstance();
	const documents = new ProductionDocumentService(sdk);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") invalid("A saved edit is required.");
	if (editor.project.getActiveOrNull()?.metadata.id !== input.editId) {
		await editor.save.flush();
		navigateToEditorProject(input.editId);
		await whenEditorReady(input.editId);
	}

	if (!isTextAnimationPhase(input.phase)) invalid("phase must be in, out, or loop.");
	if (input.remove && input.preset) invalid("Provide either a preset or remove, not both.");
	if (!input.remove && !input.preset) invalid("Provide a preset, or set remove to true.");
	if (input.preset !== undefined && !isTextAnimationPresetName(input.preset)) {
		invalid(`Unknown text-animation preset: ${String(input.preset)}`);
	}

	const project = structuredClone(current.document.project);
	const scene = project.scenes.find((candidate) => candidate.id === project.currentSceneId);
	if (!scene) invalid("The edit has no active scene.");
	const tracks = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
	const track = tracks.find((candidate) => candidate.id === input.trackId);
	if (!track) invalid("The selected track does not exist.");
	const element = track.elements.find((candidate) => candidate.id === input.elementId);
	if (!element) invalid("The selected element does not exist on that track.");
	if (element.type !== "text") invalid("Only text elements support text animations.");

	const expected = input.expectedRevision;
	if (!expected) invalid("Read the timeline and pass its exact revision before editing.");
	if (
		expected.editId !== current.document.revision.editId ||
		expected.storageCasRevision !== current.document.revision.storageCasRevision ||
		expected.intentRevision !== current.document.revision.intentRevision ||
		expected.digest !== current.document.revision.digest
	) {
		throw new EditRevisionConflictError({
			editId: input.editId,
			expected,
			actual: current.document.revision,
		});
	}

	const previousBinding = currentBinding(element, input.phase);
	const preset = input.preset;
	const shouldRemove = input.remove === true;

	if (shouldRemove) {
		if (!previousBinding) invalid("That phase has no text animation to remove.");
		element.animations = removeAnimationPaths({
			animations: element.animations,
			paths: getTextAnimationPresetPaths(previousBinding.preset),
		});
		element[bindingField(input.phase)] = undefined;
	} else {
		if (!preset) invalid("Provide a preset, or set remove to true.");
		const definition = getTextAnimationPresetDefinition(preset);
		if (!definition.phases.includes(input.phase)) {
			invalid(`Preset ${preset} does not support the ${input.phase} phase.`);
		}
		const durationSeconds =
			input.durationSeconds ?? previousBinding?.durationSeconds ?? 1;
		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			invalid("durationSeconds must be a finite positive number.");
		}

		const presetAnimations = buildPresetAnimations({
			keyframes: buildTextAnimationPresetKeyframes({
				name: preset,
				phase: input.phase,
				durationSeconds,
				elementDurationSeconds: mediaTimeToSeconds({ time: element.duration }),
				canvasWidth: project.settings.canvasSize.width,
				canvasHeight: project.settings.canvasSize.height,
			}),
		});
		element.animations = mergePresetAnimations({
			animations: element.animations,
			removePaths: previousBinding
				? getTextAnimationPresetPaths(previousBinding.preset)
				: [],
			presetAnimations,
		});
		element[bindingField(input.phase)] = {
			preset,
			durationSeconds,
		};
	}

	const saved = await documents.save({
		editId: input.editId,
		project,
		expectedRevision: expected,
	});

	const appliedPreset = shouldRemove ? undefined : preset;

	return {
		kind: "json" as const,
		data: {
			revision: saved.revision,
			elementId: element.id,
			trackId: track.id,
			phase: input.phase,
			...(appliedPreset
				? {
						preset: appliedPreset,
						durationSeconds: element[bindingField(input.phase)]?.durationSeconds,
					}
				: {}),
		},
	};
}

export async function setTextAnimation(input: SetTextAnimationInput, sdk: ProductionDocumentSdk) {
	try {
		return await applySetTextAnimation(input, sdk);
	} catch (error) {
		if (error instanceof EditRevisionConflictError) {
			throw new ProjectRpcError({
				code: "entity-version-conflict",
				message: "This edit changed. Inspect its current revision before applying your changes.",
				details: { editId: error.editId, expected: error.expected, actual: error.actual },
			});
		}
		throw error;
	}
}
