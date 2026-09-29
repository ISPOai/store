import type { EffectDefinition, EffectPass } from "@/effects/types";
import type { ParamDefinition, ParamValues } from "@/params";
import { lutRegistry } from "@/effects/lut/registry";

export const LUT_SHADER = "lut";
export const LUT_EFFECT_TYPE = "lut";

export const LUT_LUTID_PARAM: ParamDefinition = {
	key: "lutId",
	label: "LUT",
	type: "text",
	default: "",
	keyframable: false,
	hidden: true,
};

export const LUT_STRENGTH_PARAM: ParamDefinition = {
	key: "strength",
	label: "Strength",
	type: "number",
	default: 1,
	min: 0,
	max: 1,
	step: 0.01,
	hidden: true,
};

const LUT_PARAMS: ParamDefinition[] = [LUT_LUTID_PARAM, LUT_STRENGTH_PARAM];

function readNumber(params: ParamValues, key: string, fallback: number): number {
	const raw = params[key];
	return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function buildLutPasses({
	effectParams,
}: {
	effectParams: ParamValues;
}): EffectPass[] {
	const lutId = typeof effectParams.lutId === "string" ? effectParams.lutId : "";
	const strength = clamp01(readNumber(effectParams, "strength", 1));
	if (!lutId || strength <= 0) return [];

	const lut = lutRegistry.getParsed(lutId);
	if (!lut) return [];

	return [
		{
			shader: LUT_SHADER,
			uniforms: { u_strength: strength },
			lut: {
				size: lut.size,
				data: lut.data,
				domainMin: lut.domainMin,
				domainMax: lut.domainMax,
			},
		},
	];
}

export const lutEffectDefinition: EffectDefinition = {
	type: LUT_EFFECT_TYPE,
	name: "LUT",
	keywords: ["lut", "look", "grade", "color grade", "film"],
	params: LUT_PARAMS,
	renderer: {
		passes: [],
		buildPasses: buildLutPasses,
	},
};
