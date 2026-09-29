import { expect, test } from "bun:test";
import type { EffectDefinition, EffectPass } from "@/effects/types";
import type { ParamValues } from "@/params";
import { adjustEffectDefinition } from "../definitions/adjust";
import { blurEffectDefinition } from "../definitions/blur";
import {
	chromaticAberrationEffectDefinition,
	fisheyeEffectDefinition,
	glitchEffectDefinition,
	kaleidoscopeEffectDefinition,
	mirrorEffectDefinition,
	pixelateEffectDefinition,
	rgbSplitEffectDefinition,
	vhsEffectDefinition,
} from "../definitions/distortion";
import {
	radialBlurEffectDefinition,
	sharpenEffectDefinition,
	tiltShiftEffectDefinition,
	vignetteEffectDefinition,
	zoomBlurEffectDefinition,
} from "../definitions/focus";
import {
	duotoneEffectDefinition,
	glowEffectDefinition,
	invertEffectDefinition,
	neonEdgeEffectDefinition,
	posterizeEffectDefinition,
} from "../definitions/color";
import {
	filmGrainEffectDefinition,
	halftoneEffectDefinition,
	noiseEffectDefinition,
	oldFilmEffectDefinition,
	scanlinesEffectDefinition,
} from "../definitions/texture";
import { flickerEffectDefinition, shakeEffectDefinition } from "../definitions/motion";

const definitions: EffectDefinition[] = [
	blurEffectDefinition,
	adjustEffectDefinition,
	glitchEffectDefinition,
	vhsEffectDefinition,
	pixelateEffectDefinition,
	chromaticAberrationEffectDefinition,
	rgbSplitEffectDefinition,
	fisheyeEffectDefinition,
	mirrorEffectDefinition,
	kaleidoscopeEffectDefinition,
	zoomBlurEffectDefinition,
	radialBlurEffectDefinition,
	sharpenEffectDefinition,
	tiltShiftEffectDefinition,
	vignetteEffectDefinition,
	filmGrainEffectDefinition,
	noiseEffectDefinition,
	halftoneEffectDefinition,
	scanlinesEffectDefinition,
	oldFilmEffectDefinition,
	duotoneEffectDefinition,
	posterizeEffectDefinition,
	invertEffectDefinition,
	glowEffectDefinition,
	neonEdgeEffectDefinition,
	shakeEffectDefinition,
	flickerEffectDefinition,
];

const byType = new Map(definitions.map((definition) => [definition.type, definition]));

function getDefinition(type: string): EffectDefinition {
	const definition = byType.get(type);
	if (!definition) throw new Error(`Unknown effect: ${type}`);
	return definition;
}

function buildPasses(
	definition: EffectDefinition,
	effectParams: ParamValues,
	time = 0,
): EffectPass[] {
	const buildPasses = definition.renderer.buildPasses;
	if (buildPasses) {
		return buildPasses({ effectParams, width: 1920, height: 1080, time });
	}
	return definition.renderer.passes.map((pass) => ({
		shader: pass.shader,
		uniforms: pass.uniforms({ effectParams, width: 1920, height: 1080, time }),
	}));
}

function uParams(definition: EffectDefinition, effectParams: ParamValues, time = 0) {
	const passes = buildPasses(definition, effectParams, time);
	expect(passes).toHaveLength(1);
	return passes[0].uniforms.u_params as number[];
}

const TIME = 2.5;

test("all 27 effects are registered with name and searchable keywords", () => {
	expect(definitions.length).toBe(27);
	for (const definition of definitions) {
		expect(definition.type).toBeTruthy();
		expect(definition.name).toBeTruthy();
		expect(definition.keywords.length).toBeGreaterThan(0);
	}
});

test("every numeric param is keyframable", () => {
	for (const definition of definitions) {
		for (const param of definition.params) {
			if (param.type === "number") {
				expect(param.keyframable).not.toBe(false);
			}
		}
	}
});

test("definitions map params to their uniform layout", () => {
	const cases: Array<{ type: string; params: ParamValues; expected: number[] }> = [
		{ type: "glitch", params: { intensity: 30, blockHeight: 8 }, expected: [0.3, 8, TIME] },
		{ type: "vhs", params: { intensity: 40 }, expected: [0.4, TIME] },
		{ type: "pixelate", params: { size: 16 }, expected: [16] },
		{ type: "chromatic-aberration", params: { amount: 30 }, expected: [0.3] },
		{ type: "rgb-split", params: { amount: 30, angle: 45 }, expected: [0.3, 45] },
		{ type: "fisheye", params: { strength: 40 }, expected: [0.4] },
		{ type: "mirror", params: { mode: "quad" }, expected: [2] },
		{ type: "kaleidoscope", params: { segments: 6, rotation: 30 }, expected: [6, 30] },
		{ type: "zoom-blur", params: { strength: 40 }, expected: [0.4] },
		{ type: "radial-blur", params: { strength: 40 }, expected: [0.4] },
		{ type: "sharpen", params: { amount: 50 }, expected: [0.5] },
		{ type: "tilt-shift", params: { blur: 40, focusY: 0.5, band: 0.3 }, expected: [0.4, 0.5, 0.3] },
		{ type: "vignette", params: { strength: 60, softness: 50 }, expected: [0.6, 0.5] },
		{ type: "film-grain", params: { amount: 20 }, expected: [0.2, TIME] },
		{ type: "noise", params: { amount: 25, monochrome: true }, expected: [0.25, 1, TIME] },
		{ type: "halftone", params: { size: 8, angle: 45 }, expected: [8, 45] },
		{ type: "scanlines", params: { spacing: 4, opacity: 50 }, expected: [4, 0.5] },
		{ type: "old-film", params: { intensity: 40 }, expected: [0.4, TIME] },
		{
			type: "duotone",
			params: { shadowColor: "#000000", highlightColor: "#ff0000" },
			expected: [0, 0, 0, 1, 0, 0],
		},
		{ type: "posterize", params: { levels: 4 }, expected: [4] },
		{ type: "invert", params: { amount: 100 }, expected: [1] },
		{ type: "glow", params: { intensity: 50, threshold: 50 }, expected: [0.5, 0.5] },
		{ type: "neon-edge", params: { strength: 60 }, expected: [0.6] },
		{ type: "shake", params: { intensity: 30 }, expected: [0.3, TIME] },
		{ type: "flicker", params: { intensity: 40, speed: 6 }, expected: [0.4, 6, TIME] },
	];

	const timeVarying = new Set([
		"glitch",
		"vhs",
		"film-grain",
		"noise",
		"old-film",
		"shake",
		"flicker",
	]);

	for (const { type, params, expected } of cases) {
		const definition = getDefinition(type);
		const actual = uParams(definition, params, TIME);
		expect(actual).toEqual(expected);
		if (timeVarying.has(type)) {
			expect(actual).toContain(TIME);
		}
	}
});

test("duotone renders through the generic tab with two color params", () => {
	const definition = getDefinition("duotone");
	const colorParams = definition.params.filter((param) => param.type === "color");
	expect(colorParams.map((param) => param.key)).toEqual(["shadowColor", "highlightColor"]);
	expect(definition.params.every((param) => !param.hidden)).toBe(true);
});
