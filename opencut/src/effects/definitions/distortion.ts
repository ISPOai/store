import type { EffectDefinition } from "@/effects/types";
import { paramsPass, readNumber } from "./helpers";

export const GLITCH_SHADER = "glitch";
export const VHS_SHADER = "vhs";
export const PIXELATE_SHADER = "pixelate";
export const CHROMATIC_ABERRATION_SHADER = "chromatic-aberration";
export const RGB_SPLIT_SHADER = "rgb-split";
export const FISHEYE_SHADER = "fisheye";
export const MIRROR_SHADER = "mirror";
export const KALEIDOSCOPE_SHADER = "kaleidoscope";

export const glitchEffectDefinition: EffectDefinition = {
	type: "glitch",
	name: "Glitch",
	keywords: ["glitch", "digital", "corrupt", "vhs", "error"],
	params: [
		{ key: "intensity", label: "Intensity", type: "number", default: 30, min: 0, max: 100, step: 1 },
		{ key: "blockHeight", label: "Block Height", type: "number", default: 8, min: 2, max: 64, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams, time }) => [
			paramsPass(GLITCH_SHADER, [
				readNumber(effectParams, "intensity", 30) / 100,
				readNumber(effectParams, "blockHeight", 8),
				time,
			]),
		],
	},
};

export const vhsEffectDefinition: EffectDefinition = {
	type: "vhs",
	name: "VHS",
	keywords: ["vhs", "tape", "retro", "tracking", "analog"],
	params: [
		{ key: "intensity", label: "Intensity", type: "number", default: 40, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams, time }) => [
			paramsPass(VHS_SHADER, [
				readNumber(effectParams, "intensity", 40) / 100,
				time,
			]),
		],
	},
};

export const pixelateEffectDefinition: EffectDefinition = {
	type: "pixelate",
	name: "Pixelate",
	keywords: ["pixelate", "pixel", "block", "mosaic", "8-bit"],
	params: [
		{ key: "size", label: "Pixel Size", type: "number", default: 16, min: 2, max: 128, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(PIXELATE_SHADER, [readNumber(effectParams, "size", 16)]),
		],
	},
};

export const chromaticAberrationEffectDefinition: EffectDefinition = {
	type: "chromatic-aberration",
	name: "Chromatic Aberration",
	keywords: ["chromatic", "aberration", "fringe", "color", "lens"],
	params: [
		{ key: "amount", label: "Amount", type: "number", default: 30, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(CHROMATIC_ABERRATION_SHADER, [readNumber(effectParams, "amount", 30) / 100]),
		],
	},
};

export const rgbSplitEffectDefinition: EffectDefinition = {
	type: "rgb-split",
	name: "RGB Split",
	keywords: ["rgb", "split", "channel", "glitch", "color"],
	params: [
		{ key: "amount", label: "Amount", type: "number", default: 30, min: 0, max: 100, step: 1 },
		{ key: "angle", label: "Angle", type: "number", default: 0, min: 0, max: 360, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(RGB_SPLIT_SHADER, [
				readNumber(effectParams, "amount", 30) / 100,
				readNumber(effectParams, "angle", 0),
			]),
		],
	},
};

export const fisheyeEffectDefinition: EffectDefinition = {
	type: "fisheye",
	name: "Fisheye",
	keywords: ["fisheye", "lens", "distort", "wide", "bulge"],
	params: [
		{ key: "strength", label: "Strength", type: "number", default: 40, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(FISHEYE_SHADER, [readNumber(effectParams, "strength", 40) / 100]),
		],
	},
};

export const mirrorEffectDefinition: EffectDefinition = {
	type: "mirror",
	name: "Mirror",
	keywords: ["mirror", "reflect", "symmetry", "flip"],
	params: [
		{
			key: "mode",
			label: "Mode",
			type: "select",
			default: "horizontal",
			options: [
				{ value: "horizontal", label: "Horizontal" },
				{ value: "vertical", label: "Vertical" },
				{ value: "quad", label: "Quad" },
			],
		},
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => {
			const mode = effectParams.mode;
			const modeIndex = mode === "vertical" ? 1 : mode === "quad" ? 2 : 0;
			return [paramsPass(MIRROR_SHADER, [modeIndex])];
		},
	},
};

export const kaleidoscopeEffectDefinition: EffectDefinition = {
	type: "kaleidoscope",
	name: "Kaleidoscope",
	keywords: ["kaleidoscope", "mirror", "symmetry", "pattern"],
	params: [
		{ key: "segments", label: "Segments", type: "number", default: 6, min: 2, max: 16, step: 1 },
		{ key: "rotation", label: "Rotation", type: "number", default: 0, min: 0, max: 360, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(KALEIDOSCOPE_SHADER, [
				readNumber(effectParams, "segments", 6),
				readNumber(effectParams, "rotation", 0),
			]),
		],
	},
};
