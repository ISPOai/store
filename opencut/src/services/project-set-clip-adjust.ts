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
	adjustEffectDefinition,
	ADJUST_HSL_BANDS,
	ADJUST_CURVE_CHANNELS,
	ADJUST_CURVE_INTERIOR_POINTS,
} from "@/effects/definitions/adjust";
import { coerceParamValue, type ParamValues } from "@/params";

export interface AdjustHslBandInput {
	hue?: number;
	saturation?: number;
	lightness?: number;
}

export interface AdjustCurvePointInput {
	x: number;
	y: number;
}

export interface AdjustCurveInput {
	points?: AdjustCurvePointInput[];
}

export interface SetClipAdjustInput {
	editId: string;
	expectedRevision?: EditRevision;
	trackId: string;
	elementId: string;
	/** Color-adjustment scalar parameters. Omitted keys keep their current value. */
	adjustment?: {
		exposure?: number;
		contrast?: number;
		saturation?: number;
		temperature?: number;
		tint?: number;
		highlights?: number;
		shadows?: number;
	};
	/** Per-hue HSL, in fixed band order (red, orange, yellow, green, cyan, blue, purple, magenta). */
	hsl?: AdjustHslBandInput[];
	/** Tone curves, in fixed channel order (luma, red, green, blue). Up to two interior points each. */
	curves?: AdjustCurveInput[];
	/** Remove the clip's color adjustment entirely. */
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
	const param = adjustEffectDefinition.params.find((candidate) => candidate.key === key);
	if (!param) {
		invalid(`Unknown adjust parameter: ${key}`);
	}
	const coerced = coerceParamValue({ param, value });
	if (coerced === null || typeof coerced !== "number") {
		invalid(`Invalid value for adjust parameter: ${key}`);
	}
	return coerced;
}

function buildAdjustParams(input: SetClipAdjustInput): ParamValues {
	const params: ParamValues = {};

	if (input.adjustment) {
		for (const [key, value] of Object.entries(input.adjustment)) {
			if (value === undefined) {
				continue;
			}
			params[key] = coerceParamNumber({ key, value });
		}
	}

	if (input.hsl) {
		if (input.hsl.length !== ADJUST_HSL_BANDS.length) {
			invalid(`hsl must have exactly ${ADJUST_HSL_BANDS.length} bands.`);
		}
		input.hsl.forEach((band, index) => {
			const bandName = ADJUST_HSL_BANDS[index];
			if (band.hue !== undefined) {
				params[`hsl.${bandName}.hue`] = coerceParamNumber({
					key: `hsl.${bandName}.hue`,
					value: band.hue,
				});
			}
			if (band.saturation !== undefined) {
				params[`hsl.${bandName}.saturation`] = coerceParamNumber({
					key: `hsl.${bandName}.saturation`,
					value: band.saturation,
				});
			}
			if (band.lightness !== undefined) {
				params[`hsl.${bandName}.lightness`] = coerceParamNumber({
					key: `hsl.${bandName}.lightness`,
					value: band.lightness,
				});
			}
		});
	}

	if (input.curves) {
		if (input.curves.length !== ADJUST_CURVE_CHANNELS.length) {
			invalid(`curves must have exactly ${ADJUST_CURVE_CHANNELS.length} channels.`);
		}
		input.curves.forEach((curve, index) => {
			const channel = ADJUST_CURVE_CHANNELS[index];
			const points = curve.points ?? [];
			if (points.length > ADJUST_CURVE_INTERIOR_POINTS.length) {
				invalid(`Curve ${channel} supports at most ${ADJUST_CURVE_INTERIOR_POINTS.length} interior points.`);
			}
			points.forEach((point, pointIndex) => {
				const interiorIndex = ADJUST_CURVE_INTERIOR_POINTS[pointIndex];
				params[`curve.${channel}.${interiorIndex}.x`] = coerceParamNumber({
					key: `curve.${channel}.${interiorIndex}.x`,
					value: point.x,
				});
				params[`curve.${channel}.${interiorIndex}.y`] = coerceParamNumber({
					key: `curve.${channel}.${interiorIndex}.y`,
					value: point.y,
				});
			});
		});
	}

	return params;
}

function applyAdjustmentToElement({
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
		return { ...element, effects: effects.filter((effect) => effect.type !== "adjust") };
	}

	const existing = effects.find((effect) => effect.type === "adjust");
	if (existing) {
		const nextEffects = effects.map((effect) =>
			effect.id === existing.id
				? { ...effect, params: { ...effect.params, ...params } }
				: effect,
		);
		return { ...element, effects: nextEffects };
	}

	const instance = buildDefaultEffectInstance({ effectType: "adjust" });
	const effect = { ...instance, params: { ...instance.params, ...params } };
	return { ...element, effects: [...effects, effect] };
}

async function applySetClipAdjust(input: SetClipAdjustInput, sdk: ProductionDocumentSdk) {
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
		invalid("Only video and image clips support color adjustment.");
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

	const params = buildAdjustParams(input);

	const updatedTracks = updateElementInSceneTracks({
		tracks: scene.tracks,
		trackId: input.trackId,
		elementId: input.elementId,
		elementPredicate: isVisualElement,
		update: (candidate) =>
			applyAdjustmentToElement({
				element: candidate as VisualElement,
				params,
				remove: input.remove ?? false,
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

	const removed = input.remove === true;
	const effectId = removed
		? undefined
		: updatedElement?.effects?.find((effect) => effect.type === "adjust")?.id;

	return {
		kind: "json" as const,
		data: {
			revision: saved.revision,
			elementId: input.elementId,
			trackId: input.trackId,
			removed,
			...(effectId !== undefined ? { effectId } : {}),
			...(removed ? {} : { params }),
		},
	};
}

export async function setClipAdjust(input: SetClipAdjustInput, sdk: ProductionDocumentSdk) {
	try {
		return await applySetClipAdjust(input, sdk);
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
