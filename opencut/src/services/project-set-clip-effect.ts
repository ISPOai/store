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
import { buildDefaultEffectInstance, effectsRegistry } from "@/effects";
import { coerceParamValue, type ParamValues } from "@/params";

export interface SetClipEffectInput {
	editId: string;
	expectedRevision?: EditRevision;
	trackId: string;
	elementId: string;
	/** Effect type id (e.g. "glitch", "vignette"). See the list-effects command. */
	effectType: string;
	/** Parameter values keyed by the effect's param keys. Omitted keys keep their default. */
	params?: Record<string, number | string | boolean>;
	/** Target a specific effect instance. Required when more than one instance of the type exists. */
	effectInstanceId?: string;
	/** Remove the effect instance (or all instances of effectType when effectInstanceId is omitted). */
	remove?: boolean;
}

function invalid(message: string): never {
	throw new ProjectRpcError({ code: "input-invalid", message });
}

function coerceParams({
	effectType,
	inputParams,
}: {
	effectType: string;
	inputParams: Record<string, number | string | boolean> | undefined;
}): ParamValues {
	const definition = effectsRegistry.get(effectType);
	const instance = buildDefaultEffectInstance({ effectType });
	const params: ParamValues = { ...instance.params };

	if (!inputParams) {
		return params;
	}

	for (const [key, value] of Object.entries(inputParams)) {
		if (value === undefined) {
			continue;
		}
		const param = definition.params.find((candidate) => candidate.key === key);
		if (!param) {
			invalid(`Unknown parameter '${key}' for effect '${effectType}'.`);
		}
		const coerced = coerceParamValue({ param, value });
		if (coerced === null) {
			invalid(`Invalid value for parameter '${key}' of effect '${effectType}'.`);
		}
		params[key] = coerced;
	}

	return params;
}

function applyEffectToElement({
	element,
	effectType,
	params,
	effectInstanceId,
	remove,
}: {
	element: VisualElement;
	effectType: string;
	params: ParamValues;
	effectInstanceId: string | undefined;
	remove: boolean;
}): VisualElement {
	const effects = element.effects ?? [];

	if (remove) {
		const nextEffects = effects.filter((effect) =>
			effectInstanceId ? effect.id !== effectInstanceId : effect.type !== effectType,
		);
		return { ...element, effects: nextEffects };
	}

	if (effectInstanceId) {
		const target = effects.find((effect) => effect.id === effectInstanceId);
		if (!target) {
			invalid(`No effect instance with id '${effectInstanceId}' on this clip.`);
		}
		if (target.type !== effectType) {
			invalid(`Effect instance '${effectInstanceId}' is type '${target.type}', not '${effectType}'.`);
		}
		const nextEffects = effects.map((effect) =>
			effect.id === effectInstanceId
				? { ...effect, params: { ...effect.params, ...params } }
				: effect,
		);
		return { ...element, effects: nextEffects };
	}

	const existing = effects.find((effect) => effect.type === effectType);
	if (existing) {
		const nextEffects = effects.map((effect) =>
			effect.id === existing.id
				? { ...effect, params: { ...effect.params, ...params } }
				: effect,
		);
		return { ...element, effects: nextEffects };
	}

	return { ...element, effects: [...effects, { ...buildDefaultEffectInstance({ effectType }), params }] };
}

function resolveEffectId({
	element,
	effectType,
	effectInstanceId,
	remove,
}: {
	element: VisualElement;
	effectType: string;
	effectInstanceId: string | undefined;
	remove: boolean;
}): string | null {
	if (remove) {
		return null;
	}
	const effects = element.effects ?? [];
	const match = effectInstanceId
		? effects.find((effect) => effect.id === effectInstanceId)
		: effects.find((effect) => effect.type === effectType);
	return match?.id ?? null;
}

async function applySetClipEffect(input: SetClipEffectInput, sdk: ProductionDocumentSdk) {
	if (!effectsRegistry.has(input.effectType)) {
		const known = effectsRegistry
			.getAll()
			.map((definition) => definition.type)
			.join(", ");
		invalid(`Unknown effect type '${input.effectType}'. Known effects: ${known}.`);
	}

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
	const scene = project.scenes.find((candidate) => candidate.id === project.currentSceneId);
	if (!scene) {
		invalid("The edit has no active scene.");
	}
	const tracks = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
	const track = tracks.find((candidate) => candidate.id === input.trackId);
	if (!track) {
		invalid("The selected track does not exist.");
	}
	const element = track.elements.find((candidate) => candidate.id === input.elementId);
	if (!element) {
		invalid("The selected element does not exist on that track.");
	}
	if (!isVisualElement(element) || (element.type !== "video" && element.type !== "image")) {
		invalid("Only video and image clips support effects.");
	}

	const expected = input.expectedRevision;
	if (!expected) {
		invalid("Read the timeline and pass its exact revision before editing.");
	}
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

	const remove = input.remove ?? false;
	const params = coerceParams({ effectType: input.effectType, inputParams: input.params });

	const updatedTracks = updateElementInSceneTracks({
		tracks: scene.tracks,
		trackId: input.trackId,
		elementId: input.elementId,
		elementPredicate: isVisualElement,
		update: (candidate) =>
			applyEffectToElement({
				element: candidate as VisualElement,
				effectType: input.effectType,
				params,
				effectInstanceId: input.effectInstanceId,
				remove,
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

	const effectId = resolveEffectId({
		element: updatedElement as VisualElement,
		effectType: input.effectType,
		effectInstanceId: input.effectInstanceId,
		remove,
	});

	return {
		kind: "json" as const,
		data: {
			revision: saved.revision,
			elementId: input.elementId,
			trackId: input.trackId,
			effectType: input.effectType,
			removed: remove,
			...(effectId !== null ? { effectId } : {}),
			...(remove ? {} : { params }),
		},
	};
}

export async function setClipEffect(input: SetClipEffectInput, sdk: ProductionDocumentSdk) {
	try {
		return await applySetClipEffect(input, sdk);
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
