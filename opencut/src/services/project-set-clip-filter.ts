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
	filterEffectDefinition,
	FILTER_EFFECT_TYPE,
	FILTER_INTENSITY_PARAM,
} from "@/effects/definitions/filter";
import { filterRegistry } from "@/effects/filters/registry";
import { coerceParamValue, type ParamValues } from "@/params";

export interface SetClipFilterInput {
	editId: string;
	expectedRevision?: EditRevision;
	trackId: string;
	elementId: string;
	/** A bundled filter preset id. Pass `remove: true` instead to clear the filter. */
	filterId?: string;
	/** Filter intensity in 0..1. Defaults to full strength when omitted. */
	intensity?: number;
	/** Remove the clip's filter entirely. */
	remove?: boolean;
}

function invalid(message: string): never {
	throw new ProjectRpcError({ code: "input-invalid", message });
}

function coerceIntensity(value: number): number {
	const coerced = coerceParamValue({ param: FILTER_INTENSITY_PARAM, value });
	if (coerced === null || typeof coerced !== "number") {
		invalid("Invalid intensity value for filter.");
	}
	return coerced;
}

function buildFilterParams({ input }: { input: SetClipFilterInput }): ParamValues {
	const params: ParamValues = {};
	if (input.filterId !== undefined && input.filterId !== null) {
		if (typeof input.filterId !== "string" || input.filterId.length === 0) {
			invalid("filterId must be a non-empty string.");
		}
		params.filterId = input.filterId;
	}
	if (input.intensity !== undefined) {
		params.intensity = coerceIntensity(input.intensity);
	}
	return params;
}

function applyFilterToElement({
	element,
	params,
	remove,
}: {
	element: VisualElement;
	params: ParamValues;
	remove: boolean;
}): VisualElement {
	const effects = element.effects ?? [];
	if (remove) {
		return { ...element, effects: effects.filter((effect) => effect.type !== FILTER_EFFECT_TYPE) };
	}

	const existing = effects.find((effect) => effect.type === FILTER_EFFECT_TYPE);
	if (existing) {
		const nextEffects = effects.map((effect) =>
			effect.id === existing.id
				? { ...effect, params: { ...effect.params, ...params } }
				: effect,
		);
		return { ...element, effects: nextEffects };
	}

	const instance = buildDefaultEffectInstance({ effectType: FILTER_EFFECT_TYPE });
	const effect = { ...instance, params: { ...instance.params, ...params } };
	return { ...element, effects: [...effects, effect] };
}

async function applySetClipFilter(input: SetClipFilterInput, sdk: ProductionDocumentSdk) {
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
		invalid("Only video and image clips support filters.");
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

	const remove = input.remove === true;
	if (!remove && (input.filterId === undefined || input.filterId === null)) {
		invalid("Pass filterId to apply a filter, or remove: true to clear it.");
	}
	if (!remove && input.filterId !== undefined && input.filterId !== null && !filterRegistry.has(input.filterId)) {
		invalid(`Unknown filter id: ${input.filterId}. Use list-filters to see available ids.`);
	}

	const params = buildFilterParams({ input });

	const updatedTracks = updateElementInSceneTracks({
		tracks: scene.tracks,
		trackId: input.trackId,
		elementId: input.elementId,
		elementPredicate: isVisualElement,
		update: (candidate) =>
			applyFilterToElement({
				element: candidate as VisualElement,
				params,
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
	const filterEffect = updatedElement?.effects?.find(
		(effect) => effect.type === FILTER_EFFECT_TYPE,
	);

	if (remove) {
		return {
			kind: "json" as const,
			data: {
				revision: saved.revision,
				elementId: input.elementId,
				trackId: input.trackId,
				removed: true,
			},
		};
	}

	return {
		kind: "json" as const,
		data: {
			revision: saved.revision,
			elementId: input.elementId,
			trackId: input.trackId,
			removed: false,
			effectId: filterEffect?.id ?? "",
			filterId: input.filterId ?? "",
			intensity:
				typeof filterEffect?.params.intensity === "number"
					? filterEffect.params.intensity
					: (input.intensity ?? 1),
		},
	};
}

export async function setClipFilter(input: SetClipFilterInput, sdk: ProductionDocumentSdk) {
	try {
		return await applySetClipFilter(input, sdk);
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
