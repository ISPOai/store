import { expect, test } from "bun:test";
import type { ParamValues } from "@/params";
import {
	adjustEffectDefinition,
	ADJUST_SHADER,
	ADJUST_HSL_BANDS,
	ADJUST_CURVE_CHANNELS,
} from "../definitions/adjust";

function buildPasses(params: ParamValues) {
	const buildPasses = adjustEffectDefinition.renderer.buildPasses;
	if (!buildPasses) {
		throw new Error("adjust definition must provide buildPasses");
	}
	return buildPasses({ effectParams: params, width: 1920, height: 1080 });
}

function uniforms(params: ParamValues) {
	const passes = buildPasses(params);
	expect(passes).toHaveLength(1);
	const pass = passes[0];
	expect(pass.shader).toBe(ADJUST_SHADER);
	return pass.uniforms as Record<string, number[]>;
}

test("default params produce one identity adjust pass", () => {
	const params: ParamValues = {};
	for (const param of adjustEffectDefinition.params) {
		params[param.key] = param.default;
	}
	const u = uniforms(params);

	expect(u.u_basic).toEqual([0, 0, 0, 0, 0, 0, 0]);
	expect(u.u_hsl).toHaveLength(24);
	expect(u.u_hsl.every((value) => value === 0)).toBe(true);
	expect(u.u_curve_counts).toEqual([4, 4, 4, 4]);

	// Identity curves: (0,0), (0.33,0.33), (0.67,0.67), (1,1) per channel.
	expect(u.u_curves).toHaveLength(32);
	const identity = [0, 0, 0.33, 0.33, 0.67, 0.67, 1, 1];
	for (let channel = 0; channel < ADJUST_CURVE_CHANNELS.length; channel++) {
		expect(u.u_curves.slice(channel * 8, channel * 8 + 8)).toEqual(identity);
	}
});

test("scalar params are normalized to [-1, 1]", () => {
	const u = uniforms({
		exposure: 100,
		contrast: -50,
		saturation: 25,
		temperature: 0,
		tint: 0,
		highlights: 0,
		shadows: 0,
	});
	expect(u.u_basic[0]).toBe(1);
	expect(u.u_basic[1]).toBe(-0.5);
	expect(u.u_basic[2]).toBe(0.25);
});

test("hsl bands map in fixed order", () => {
	const params: ParamValues = {};
	for (const band of ADJUST_HSL_BANDS) {
		params[`hsl.${band}.hue`] = 0;
		params[`hsl.${band}.saturation`] = 0;
		params[`hsl.${band}.lightness`] = 0;
	}
	params["hsl.blue.hue"] = -90;
	params["hsl.blue.saturation"] = 50;
	const u = uniforms(params);
	const blueIndex = ADJUST_HSL_BANDS.indexOf("blue") * 3;
	expect(u.u_hsl[blueIndex]).toBe(-90);
	expect(u.u_hsl[blueIndex + 1]).toBe(0.5);
	expect(u.u_hsl[blueIndex + 2]).toBe(0);
});

test("curve points are sorted by x when packed", () => {
	const u = uniforms({
		"curve.luma.1.x": 0.8,
		"curve.luma.1.y": 0.2,
		"curve.luma.2.x": 0.4,
		"curve.luma.2.y": 0.6,
	});
	// Points (0.8,0.2) and (0.4,0.6) are re-sorted so x ascends: 0.4 before 0.8.
	const luma = u.u_curves.slice(0, 8);
	expect(luma).toEqual([0, 0, 0.4, 0.6, 0.8, 0.2, 1, 1]);
});

test("all adjust params are numbers", () => {
	for (const param of adjustEffectDefinition.params) {
		expect(param.type).toBe("number");
	}
	expect(adjustEffectDefinition.params.length).toBe(7 + 8 * 3 + 4 * 2 * 2);
});
