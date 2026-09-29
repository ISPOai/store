import { whenEditorReady } from "./editor-ready";
import { navigateToEditorProject } from "@/lib/next-stubs/navigation";
import { ProjectRpcError } from "@ispo/sdk";
import { EditorCore } from "@/core";
import {
	ProductionDocumentService,
	type ProductionDocumentSdk,
} from "@/project/production-document-service";
import {
	EditRevisionConflictError,
	type EditRevision,
} from "@/project/production-types";
import { isVisualElement, updateElementInSceneTracks } from "@/timeline";
import type { VisualElement } from "@/timeline";
import { buildDefaultEffectInstance } from "@/effects";
import {
	CHROMA_KEY_TYPE,
	chromaKeyEffectDefinition,
} from "@/effects/definitions/chroma-key";
import { normalizeKeyColor } from "@/effects/definitions/chroma-key-math";
import { coerceParamValue, type ParamValues } from "@/params";

export interface SetClipChromaKeyInput {
	editId: string;
	expectedRevision?: EditRevision;
	trackId: string;
	elementId: string;
	/** Key color as a `#RRGGBB` hex string. Omitted keeps the current value. */
	keyColor?: string;
	tolerance?: number;
	softness?: number;
	spill?: number;
	feather?: number;
	/** Enable or disable the chroma-key effect. Defaults to enabled on create. */
	enabled?: boolean;
	/** Remove the clip's chroma key entirely. */
	remove?: boolean;
}

function invalid(message: string): never {
	throw new ProjectRpcError({ code: "input-invalid", message });
}

function coerceParamNumber({
	key,
	value,
}: {
	key: string;
	value: number;
}): number {
	const param = chromaKeyEffectDefinition.params.find(
		(candidate) => candidate.key === key,
	);
	if (!param) {
		invalid(`Unknown chroma-key parameter: ${key}`);
	}
	const coerced = coerceParamValue({ param, value });
	if (coerced === null || typeof coerced !== "number") {
		invalid(`Invalid value for chroma-key parameter: ${key}`);
	}
	return coerced;
}

function coerceKeyColor(value: string): string {
	const normalized = normalizeKeyColor(value);
	if (!normalized) {
		invalid("keyColor must be a #RRGGBB hex color.");
	}
	return normalized;
}

function buildChromaKeyParams(input: SetClipChromaKeyInput): ParamValues {
	const params: ParamValues = {};

	if (input.keyColor !== undefined) {
		params.keyColor = coerceKeyColor(input.keyColor);
	}
	if (input.tolerance !== undefined) {
		params.tolerance = coerceParamNumber({
			key: "tolerance",
			value: input.tolerance,
		});
	}
	if (input.softness !== undefined) {
		params.softness = coerceParamNumber({
			key: "softness",
			value: input.softness,
		});
	}
	if (input.spill !== undefined) {
		params.spill = coerceParamNumber({ key: "spill", value: input.spill });
	}
	if (input.feather !== undefined) {
		params.feather = coerceParamNumber({
			key: "feather",
			value: input.feather,
		});
	}

	return params;
}

function applyChromaKeyToElement({
	element,
	params,
	remove,
	enabled,
}: {
	element: VisualElement;
	params: ParamValues;
	remove: boolean;
	enabled?: boolean;
}): VisualElement {
	const effects = element.effects ?? [];
	if (remove) {
		return {
			...element,
			effects: effects.filter((effect) => effect.type !== CHROMA_KEY_TYPE),
		};
	}

	const existing = effects.find((effect) => effect.type === CHROMA_KEY_TYPE);
	if (existing) {
		const nextEffects = effects.map((effect) =>
			effect.id === existing.id
				? {
						...effect,
						params: { ...effect.params, ...params },
						...(enabled === undefined ? {} : { enabled }),
					}
				: effect,
		);
		return { ...element, effects: nextEffects };
	}

	const instance = buildDefaultEffectInstance({ effectType: CHROMA_KEY_TYPE });
	const effect = {
		...instance,
		params: { ...instance.params, ...params },
		...(enabled === undefined ? {} : { enabled }),
	};
	return { ...element, effects: [...effects, effect] };
}

async function applySetClipChromaKey(
	input: SetClipChromaKeyInput,
	sdk: ProductionDocumentSdk,
) {
	const editor = EditorCore.getInstance();
	const documents = new ProductionDocumentService(sdk);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") {
		invalid("A saved edit is required.");
	}
	if (editor.project.getActiveOrNull()?.metadata.id !== input.editId) {
		await editor.save.flush();
		navigateToEditorProject(input.editId);
		await whenEditorReady(input.editId);
	}

	const project = structuredClone(current.document.project);
	const scene = project.scenes.find(
		(candidate) => candidate.id === project.currentSceneId,
	);
	if (!scene) {
		invalid("The edit has no active scene.");
	}
	const tracks = [
		scene.tracks.main,
		...scene.tracks.overlay,
		...scene.tracks.audio,
	];
	const track = tracks.find((candidate) => candidate.id === input.trackId);
	if (!track) {
		invalid("The selected track does not exist.");
	}
	const element = track.elements.find(
		(candidate) => candidate.id === input.elementId,
	);
	if (!element) {
		invalid("The selected element does not exist on that track.");
	}
	if (
		!isVisualElement(element) ||
		(element.type !== "video" && element.type !== "image")
	) {
		invalid("Only video and image clips support chroma key.");
	}

	const expected = input.expectedRevision;
	if (!expected) {
		invalid("Read the timeline and pass its exact revision before editing.");
	}
	if (
		expected.editId !== current.document.revision.editId ||
		expected.storageCasRevision !==
			current.document.revision.storageCasRevision ||
		expected.intentRevision !== current.document.revision.intentRevision ||
		expected.digest !== current.document.revision.digest
	) {
		throw new EditRevisionConflictError({
			editId: input.editId,
			expected,
			actual: current.document.revision,
		});
	}

	const params = buildChromaKeyParams(input);

	const updatedTracks = updateElementInSceneTracks({
		tracks: scene.tracks,
		trackId: input.trackId,
		elementId: input.elementId,
		elementPredicate: isVisualElement,
		update: (candidate) =>
			applyChromaKeyToElement({
				element: candidate as VisualElement,
				params,
				remove: input.remove ?? false,
				enabled: input.enabled,
			}),
	});
	scene.tracks = updatedTracks;

	const saved = await documents.save({
		editId: input.editId,
		project,
		expectedRevision: expected,
	});

	const updatedTrack = [
		updatedTracks.main,
		...updatedTracks.overlay,
		...updatedTracks.audio,
	].find((candidate) => candidate.id === input.trackId);
	const updatedElement = updatedTrack?.elements.find(
		(candidate) => candidate.id === input.elementId,
	) as VisualElement | undefined;

	const effectId =
		input.remove === true
			? undefined
			: updatedElement?.effects?.find(
					(effect) => effect.type === CHROMA_KEY_TYPE,
				)?.id;

	return {
		kind: "json" as const,
		data: {
			revision: saved.revision,
			elementId: input.elementId,
			trackId: input.trackId,
			...(effectId === undefined ? {} : { effectId }),
			...(input.remove === true ? {} : { params }),
			removed: input.remove === true,
		},
	};
}

export async function setClipChromaKey(
	input: SetClipChromaKeyInput,
	sdk: ProductionDocumentSdk,
) {
	try {
		return await applySetClipChromaKey(input, sdk);
	} catch (error) {
		if (error instanceof EditRevisionConflictError) {
			throw new ProjectRpcError({
				code: "entity-version-conflict",
				message:
					"This edit changed. Inspect its current revision before applying your changes.",
				details: {
					editId: error.editId,
					expected: error.expected,
					actual: error.actual,
				},
			});
		}
		throw error;
	}
}
