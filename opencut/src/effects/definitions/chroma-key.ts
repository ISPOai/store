import type { EffectDefinition, EffectPass } from "@/effects/types";
import type { ParamDefinition, ParamValues } from "@/params";
import {
	CHROMA_KEY_DEFAULT_COLOR,
	hexToSrgb,
} from "./chroma-key-math";

export const CHROMA_KEY_SHADER = "chroma-key";
export const CHROMA_KEY_TYPE = "chroma-key";

function readNumber(
	params: ParamValues,
	key: string,
	fallback: number,
): number {
	const raw = params[key];
	return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function readKeyColorRgb(params: ParamValues): [number, number, number] {
	const raw = params.keyColor;
	const hex = typeof raw === "string" ? raw : CHROMA_KEY_DEFAULT_COLOR;
	return hexToSrgb(hex) ?? hexToSrgb(CHROMA_KEY_DEFAULT_COLOR) ?? [0, 1, 0];
}

function buildChromaKeyPasses({
	effectParams,
}: {
	effectParams: ParamValues;
}): EffectPass[] {
	return [
		{
			shader: CHROMA_KEY_SHADER,
			uniforms: {
				u_key_color: readKeyColorRgb(effectParams),
				u_tolerance: readNumber(effectParams, "tolerance", 40) / 100,
				u_softness: readNumber(effectParams, "softness", 20) / 100,
				u_spill: readNumber(effectParams, "spill", 40) / 100,
				u_feather: readNumber(effectParams, "feather", 0) / 100,
			},
		},
	];
}

export const chromaKeyEffectDefinition: EffectDefinition = {
	type: CHROMA_KEY_TYPE,
	name: "Chroma Key",
	keywords: ["chroma", "key", "green screen", "greenscreen", "blue screen", "keying", "transparent"],
	params: [
		{
			key: "keyColor",
			label: "Key Color",
			type: "color",
			default: CHROMA_KEY_DEFAULT_COLOR,
		},
		{
			key: "tolerance",
			label: "Tolerance",
			type: "number",
			default: 40,
			min: 0,
			max: 100,
			step: 1,
			unit: "percent",
		},
		{
			key: "softness",
			label: "Softness",
			type: "number",
			default: 20,
			min: 0,
			max: 100,
			step: 1,
			unit: "percent",
		},
		{
			key: "spill",
			label: "Spill Suppression",
			type: "number",
			default: 40,
			min: 0,
			max: 100,
			step: 1,
			unit: "percent",
		},
		{
			key: "feather",
			label: "Edge Feather",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
			unit: "percent",
		},
	],
	renderer: {
		passes: [],
		buildPasses: buildChromaKeyPasses,
	},
};
