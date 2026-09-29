import { expect, test } from "bun:test";
import type { ParamValues } from "@/params";
import {
	applyFeather,
	chromaDistance,
	chromaKeyAlpha,
	hexToSrgb,
	normalizeKeyColor,
	srgbToCbCr,
	suppressSpill,
} from "../definitions/chroma-key-math";
import {
	CHROMA_KEY_SHADER,
	chromaKeyEffectDefinition,
} from "../definitions/chroma-key";

function buildPasses(params: ParamValues) {
	const buildPasses = chromaKeyEffectDefinition.renderer.buildPasses;
	if (!buildPasses) {
		throw new Error("chroma-key definition must provide buildPasses");
	}
	return buildPasses({ effectParams: params, width: 1920, height: 1080 });
}

function uniforms(params: ParamValues) {
	const passes = buildPasses(params);
	expect(passes).toHaveLength(1);
	const pass = passes[0];
	expect(pass.shader).toBe(CHROMA_KEY_SHADER);
	return pass.uniforms;
}

test("hexToSrgb parses 6 and 8 digit hex", () => {
	expect(hexToSrgb("#00ff00")).toEqual([0, 1, 0]);
	expect(hexToSrgb("ff0000")).toEqual([1, 0, 0]);
	expect(hexToSrgb("#0000FFFF")).toEqual([0, 0, 1]);
	expect(hexToSrgb("#123456")).toEqual([
		0x12 / 255,
		0x34 / 255,
		0x56 / 255,
	]);
	expect(hexToSrgb("nonsense")).toBeNull();
	expect(hexToSrgb("#fff")).toBeNull();
});

test("normalizeKeyColor collapses alpha and lowercases", () => {
	expect(normalizeKeyColor("#00FF00FF")).toBe("#00ff00");
	expect(normalizeKeyColor("#FF0000")).toBe("#ff0000");
	expect(normalizeKeyColor("#FFFFFF")).toBe("#ffffff");
	expect(normalizeKeyColor("red")).toBeNull();
});

test("srgbToCbCr uses Rec.601 chroma for green, red, and neutral colors", () => {
	const green = srgbToCbCr(0, 1, 0);
	expect(green.cb).toBeCloseTo(0.1687, 3);
	expect(green.cr).toBeCloseTo(0.0813, 3);

	const red = srgbToCbCr(1, 0, 0);
	expect(red.cb).toBeCloseTo(0.3313, 3);
	expect(red.cr).toBeCloseTo(1, 3);

	const neutral = srgbToCbCr(0.5, 0.5, 0.5);
	expect(neutral.cb).toBeCloseTo(0.5, 3);
	expect(neutral.cr).toBeCloseTo(0.5, 3);
});

test("chromaDistance is symmetric euclidean distance", () => {
	expect(chromaDistance({ cb: 0, cr: 0, keyCb: 3, keyCr: 4 })).toBeCloseTo(5);
	expect(chromaDistance({ cb: 1, cr: 1, keyCb: 1, keyCr: 1 })).toBe(0);
});

test("tolerance/softness alpha curve keys the inner region and keeps the outer", () => {
	// Below tolerance the pixel is fully keyed out (alpha 0).
	expect(chromaKeyAlpha({ distance: 0.3, tolerance: 0.4, softness: 0.2 })).toBe(0);
	// At tolerance + softness the pixel is fully kept (alpha 1).
	expect(chromaKeyAlpha({ distance: 0.6, tolerance: 0.4, softness: 0.2 })).toBe(1);
	// Midway through the soft band is the smoothstep inflection point.
	expect(chromaKeyAlpha({ distance: 0.5, tolerance: 0.4, softness: 0.2 })).toBeCloseTo(0.5, 6);
	// Beyond the band clamps to 1.
	expect(chromaKeyAlpha({ distance: 2, tolerance: 0.4, softness: 0.2 })).toBe(1);
});

test("zero softness does not divide by zero", () => {
	expect(chromaKeyAlpha({ distance: 0.5, tolerance: 0.4, softness: 0 })).toBe(1);
	expect(chromaKeyAlpha({ distance: 0.3, tolerance: 0.4, softness: 0 })).toBe(0);
});

test("feather chokes (positive) and grows (negative) the matte", () => {
	expect(applyFeather(0, 0)).toBe(0);
	expect(applyFeather(1, 0)).toBe(1);
	// Positive feather shrinks the matte.
	expect(applyFeather(0.5, 0.2)).toBeCloseTo((0.5 - 0.2) / 0.8, 6);
	// Negative feather grows the matte.
	expect(applyFeather(0.5, -0.2)).toBeCloseTo((0.5 + 0.2) / 1.2, 6);
	// Results stay clamped.
	expect(applyFeather(0.1, 0.9)).toBe(0);
	expect(applyFeather(1, -0.9)).toBe(1);
	expect(applyFeather(0.9, -0.9)).toBeCloseTo(1.8 / 1.9, 6);
});

test("spill suppression desaturates retained edges toward luma", () => {
	const [r, g, b] = suppressSpill({ r: 0.5, g: 0.6, b: 0.4, alpha: 1, spill: 0.5 });
	// alpha 1 keeps the pixel untouched.
	expect([r, g, b]).toEqual([0.5, 0.6, 0.4]);

	const luma = 0.299 * 0.5 + 0.587 * 0.6 + 0.114 * 0.4;
	const [r2, g2, b2] = suppressSpill({ r: 0.5, g: 0.6, b: 0.4, alpha: 0, spill: 1 });
	expect(r2).toBeCloseTo(luma, 6);
	expect(g2).toBeCloseTo(luma, 6);
	expect(b2).toBeCloseTo(luma, 6);
});

test("default params pack the default green key and normalized scalars", () => {
	const params: ParamValues = {};
	for (const param of chromaKeyEffectDefinition.params) {
		params[param.key] = param.default;
	}
	const u = uniforms(params);

	expect(u.u_key_color).toEqual([0, 1, 0]);
	expect(u.u_tolerance).toBeCloseTo(0.4, 6);
	expect(u.u_softness).toBeCloseTo(0.2, 6);
	expect(u.u_spill).toBeCloseTo(0.4, 6);
	expect(u.u_feather).toBe(0);
});

test("keyColor and scalars map from params", () => {
	const u = uniforms({
		keyColor: "#0000ff",
		tolerance: 20,
		softness: 50,
		spill: 0,
		feather: -30,
	});
	expect(u.u_key_color).toEqual([0, 0, 1]);
	expect(u.u_tolerance).toBeCloseTo(0.2, 6);
	expect(u.u_softness).toBeCloseTo(0.5, 6);
	expect(u.u_spill).toBe(0);
	expect(u.u_feather).toBeCloseTo(-0.3, 6);
});

test("invalid key color falls back to the default green", () => {
	const u = uniforms({ keyColor: "not-a-color" });
	expect(u.u_key_color).toEqual([0, 1, 0]);
});

test("chroma-key params are one color plus four keyframable numbers", () => {
	expect(chromaKeyEffectDefinition.params).toHaveLength(5);
	const color = chromaKeyEffectDefinition.params.find((p) => p.key === "keyColor");
	expect(color?.type).toBe("color");
	const numbers = chromaKeyEffectDefinition.params.filter((p) => p.key !== "keyColor");
	expect(numbers.every((p) => p.type === "number")).toBe(true);
	expect(numbers.map((p) => p.key)).toEqual([
		"tolerance",
		"softness",
		"spill",
		"feather",
	]);
});
