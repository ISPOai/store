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
import { lutEffectDefinition, LUT_EFFECT_TYPE } from "@/effects/definitions/lut";
import { lutRegistry } from "@/effects/lut/registry";
import { storageService } from "@/services/storage/service";
import { coerceParamValue, type ParamValues } from "@/params";

export interface SetClipLutInput {
	editId: string;
	expectedRevision?: EditRevision;
	trackId: string;
	elementId: string;
	/** A bundled or user LUT id. Pass `remove: true` instead to clear the LUT. */
	lutId?: string;
	/** LUT mix weight in 0..1. Defaults to full strength when omitted. */
	strength?: number;
	/** Remove the clip's LUT entirely. */
	remove?: boolean;
}

function invalid(message: string): never {
	throw new ProjectRpcError({ code: "input-invalid", message });
}

function coerceStrength(value: number): number {
	const param = lutEffectDefinition.params.find((candidate) => candidate.key === "strength");
	if (!param) {
		invalid("LUT definition is missing a strength parameter.");
	}
	const coerced = coerceParamValue({ param, value });
	if (coerced === null || typeof coerced !== "number") {
		invalid("Invalid strength value for LUT.");
	}
	return coerced;
}

async function isKnownLutId(lutId: string): Promise<boolean> {
	if (lutRegistry.has(lutId)) return true;
	const { luts } = await storageService.loadLuts();
	return luts.some((lut) => lut.id === lutId);
}

function buildLutParams({
	input,
}: {
	input: SetClipLutInput;
}): ParamValues {
	const params: ParamValues = {};
	if (input.lutId !== undefined && input.lutId !== null) {
		if (typeof input.lutId !== "string" || input.lutId.length === 0) {
			invalid("lutId must be a non-empty string.");
		}
		params.lutId = input.lutId;
	}
	if (input.strength !== undefined) {
		params.strength = coerceStrength(input.strength);
	}
	return params;
}

function applyLutToElement({
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
		return { ...element, effects: effects.filter((effect) => effect.type !== LUT_EFFECT_TYPE) };
	}

	const existing = effects.find((effect) => effect.type === LUT_EFFECT_TYPE);
	if (existing) {
		const nextEffects = effects.map((effect) =>
			effect.id === existing.id
				? { ...effect, params: { ...effect.params, ...params } }
				: effect,
		);
		return { ...element, effects: nextEffects };
	}

	const instance = buildDefaultEffectInstance({ effectType: LUT_EFFECT_TYPE });
	const effect = { ...instance, params: { ...instance.params, ...params } };
	return { ...element, effects: [...effects, effect] };
}

async function applySetClipLut(input: SetClipLutInput, sdk: ProductionDocumentSdk) {
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
		invalid("Only video and image clips support LUTs.");
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

	if (input.lutId !== null && input.lutId !== undefined && !(await isKnownLutId(input.lutId))) {
		invalid(`Unknown LUT id: ${input.lutId}. Use list-luts to see available ids.`);
	}

	const remove = input.remove === true;
	if (!remove && (input.lutId === undefined || input.lutId === null)) {
		invalid("Pass lutId to apply a LUT, or remove: true to clear it.");
	}
	const params = buildLutParams({ input });

	const updatedTracks = updateElementInSceneTracks({
		tracks: scene.tracks,
		trackId: input.trackId,
		elementId: input.elementId,
		elementPredicate: isVisualElement,
		update: (candidate) =>
			applyLutToElement({
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

	return {
		kind: "json" as const,
		data: {
			revision: saved.revision,
			elementId: input.elementId,
			trackId: input.trackId,
			...(remove
				? { removed: true }
				: {
						removed: false,
						effectId:
							updatedElement?.effects?.find((effect) => effect.type === LUT_EFFECT_TYPE)?.id,
						lutId: input.lutId,
					}),
		},
	};
}

export async function setClipLut(input: SetClipLutInput, sdk: ProductionDocumentSdk) {
	try {
		return await applySetClipLut(input, sdk);
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
