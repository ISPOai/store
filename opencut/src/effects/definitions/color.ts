import type { EffectDefinition } from "@/effects/types";
import { paramsPass, readColorLinearRgb, readNumber } from "./helpers";

export const DUOTONE_SHADER = "duotone";
export const POSTERIZE_SHADER = "posterize";
export const INVERT_SHADER = "invert";
export const GLOW_SHADER = "glow";
export const NEON_EDGE_SHADER = "neon-edge";

export const duotoneEffectDefinition: EffectDefinition = {
	type: "duotone",
	name: "Duotone",
	keywords: ["duotone", "two", "tone", "color", "gradient", "monochrome"],
	params: [
		{ key: "shadowColor", label: "Shadow Color", type: "color", default: "#000000" },
		{ key: "highlightColor", label: "Highlight Color", type: "color", default: "#ffffff" },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => {
			const shadow = readColorLinearRgb(effectParams, "shadowColor", "#000000");
			const highlight = readColorLinearRgb(effectParams, "highlightColor", "#ffffff");
			return [paramsPass(DUOTONE_SHADER, [...shadow, ...highlight])];
		},
	},
};

export const posterizeEffectDefinition: EffectDefinition = {
	type: "posterize",
	name: "Posterize",
	keywords: ["posterize", "levels", "quantize", "banding", "flat"],
	params: [
		{ key: "levels", label: "Levels", type: "number", default: 4, min: 2, max: 16, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(POSTERIZE_SHADER, [readNumber(effectParams, "levels", 4)]),
		],
	},
};

export const invertEffectDefinition: EffectDefinition = {
	type: "invert",
	name: "Invert",
	keywords: ["invert", "negative", "reverse", "color"],
	params: [
		{ key: "amount", label: "Amount", type: "number", default: 100, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(INVERT_SHADER, [readNumber(effectParams, "amount", 100) / 100]),
		],
	},
};

export const glowEffectDefinition: EffectDefinition = {
	type: "glow",
	name: "Glow",
	keywords: ["glow", "bloom", "neon", "shine", "light"],
	params: [
		{ key: "intensity", label: "Intensity", type: "number", default: 50, min: 0, max: 100, step: 1 },
		{ key: "threshold", label: "Threshold", type: "number", default: 50, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(GLOW_SHADER, [
				readNumber(effectParams, "intensity", 50) / 100,
				readNumber(effectParams, "threshold", 50) / 100,
			]),
		],
	},
};

export const neonEdgeEffectDefinition: EffectDefinition = {
	type: "neon-edge",
	name: "Neon Edge",
	keywords: ["neon", "edge", "outline", "glow", "trace"],
	params: [
		{ key: "strength", label: "Strength", type: "number", default: 60, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(NEON_EDGE_SHADER, [readNumber(effectParams, "strength", 60) / 100]),
		],
	},
};
