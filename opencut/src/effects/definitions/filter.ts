import type { EffectDefinition, EffectPass } from "@/effects/types";
import type { ParamDefinition, ParamValues } from "@/params";
import { buildAdjustPasses } from "./adjust";
import { buildLutPasses } from "./lut";
import { filterRegistry } from "@/effects/filters/registry";
import { FILTER_ADJUST_KEYS, type FilterDefinition } from "@/effects/filters/types";

export const FILTER_EFFECT_TYPE = "filter";

export const FILTER_ID_PARAM: ParamDefinition = {
	key: "filterId",
	label: "Filter",
	type: "text",
	default: "",
	keyframable: false,
	hidden: true,
};

export const FILTER_INTENSITY_PARAM: ParamDefinition = {
	key: "intensity",
	label: "Intensity",
	type: "number",
	default: 1,
	min: 0,
	max: 1,
	step: 0.01,
	hidden: true,
};

const FILTER_PARAMS: ParamDefinition[] = [FILTER_ID_PARAM, FILTER_INTENSITY_PARAM];

function readNumber(params: ParamValues, key: string, fallback: number): number {
	const raw = params[key];
	return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/**
 * Scale a filter's full-strength adjust deltas toward neutral by the given
 * intensity, returning the adjust params the underlying adjust shader expects.
 */
export function scaleFilterAdjust({
	filter,
	intensity,
}: {
	filter: FilterDefinition;
	intensity: number;
}): ParamValues {
	const params: ParamValues = {};
	for (const key of FILTER_ADJUST_KEYS) {
		const delta = filter.adjust[key] ?? 0;
		params[key] = delta * intensity;
	}
	return params;
}

/**
 * Build the combined adjust + LUT passes for a filter at a given intensity.
 * Reuses the existing adjust and LUT pass builders so the rendered output is
 * byte-identical to applying those two effects manually at the same values.
 */
export function buildFilterPasses({
	effectParams,
}: {
	effectParams: ParamValues;
}): EffectPass[] {
	const filterId = typeof effectParams.filterId === "string" ? effectParams.filterId : "";
	const intensity = clamp01(readNumber(effectParams, "intensity", 1));
	if (!filterId || intensity <= 0) return [];

	const filter = filterRegistry.get(filterId);
	if (!filter) return [];

	const passes: EffectPass[] = [];

	if (Object.keys(filter.adjust).length > 0) {
		passes.push(
			...buildAdjustPasses({
				effectParams: scaleFilterAdjust({ filter, intensity }),
			}),
		);
	}

	if (filter.lutId) {
		passes.push(
			...buildLutPasses({
				effectParams: { lutId: filter.lutId, strength: intensity },
			}),
		);
	}

	return passes;
}

export const filterEffectDefinition: EffectDefinition = {
	type: FILTER_EFFECT_TYPE,
	name: "Filter",
	keywords: ["filter", "preset", "look", "grade", "film"],
	params: FILTER_PARAMS,
	hidden: true,
	renderer: {
		passes: [],
		buildPasses: buildFilterPasses,
	},
};
