// Pure chroma-key math shared by the effect definition and its unit tests.
// The coefficients and curves below must stay in sync with the WGSL shader at
// rust/crates/effects/src/shaders/chroma_key.wgsl.

export const CHROMA_KEY_DEFAULT_COLOR = "#00ff00";

// Rec.601 luma / YCbCr chroma coefficients.
const Y_R = 0.299;
const Y_G = 0.587;
const Y_B = 0.114;
const CB_DIVISOR = 1.772;
const CR_DIVISOR = 1.402;

export function hexToSrgb(hex: string): [number, number, number] | null {
	const cleaned = hex.replace(/^#/, "").toLowerCase();
	if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(cleaned)) {
		return null;
	}
	return [
		Number.parseInt(cleaned.slice(0, 2), 16) / 255,
		Number.parseInt(cleaned.slice(2, 4), 16) / 255,
		Number.parseInt(cleaned.slice(4, 6), 16) / 255,
	];
}

export function normalizeKeyColor(hex: string): string | null {
	const rgb = hexToSrgb(hex);
	if (!rgb) {
		return null;
	}
	const to2 = (value: number) =>
		Math.round(Math.min(255, Math.max(0, value * 255)))
			.toString(16)
			.padStart(2, "0");
	return `#${to2(rgb[0])}${to2(rgb[1])}${to2(rgb[2])}`;
}

export function srgbToCbCr(
	r: number,
	g: number,
	b: number,
): { cb: number; cr: number } {
	const y = Y_R * r + Y_G * g + Y_B * b;
	return {
		cb: (b - y) / CB_DIVISOR + 0.5,
		cr: (r - y) / CR_DIVISOR + 0.5,
	};
}

export function chromaDistance({
	cb,
	cr,
	keyCb,
	keyCr,
}: {
	cb: number;
	cr: number;
	keyCb: number;
	keyCr: number;
}): number {
	return Math.hypot(cb - keyCb, cr - keyCr);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

// Alpha is 0 where the pixel's chroma matches the key (keyed out) and 1 where
// it is far from the key (kept). tolerance marks the inner edge and softness
// the width of the falloff band.
export function chromaKeyAlpha({
	distance,
	tolerance,
	softness,
}: {
	distance: number;
	tolerance: number;
	softness: number;
}): number {
	const edge = Math.max(softness, 1e-4);
	return smoothstep(tolerance, tolerance + edge, distance);
}

// Signed matte choke: positive feather shrinks the matte (removes edge),
// negative grows it. Clamped to (-1, 1) to keep the denominator positive.
export function applyFeather(alpha: number, feather: number): number {
	const f = Math.min(0.9, Math.max(-0.9, feather));
	return Math.min(1, Math.max(0, (alpha - f) / (1 - f)));
}

// Desaturates the retained foreground toward luma, weighted by spill strength
// and how close the pixel sits to the keyed edge (1 - alpha).
export function suppressSpill({
	r,
	g,
	b,
	alpha,
	spill,
}: {
	r: number;
	g: number;
	b: number;
	alpha: number;
	spill: number;
}): [number, number, number] {
	const s = Math.min(1, Math.max(0, spill));
	const luma = Y_R * r + Y_G * g + Y_B * b;
	const amount = s * (1 - alpha);
	return [
		r + (luma - r) * amount,
		g + (luma - g) * amount,
		b + (luma - b) * amount,
	];
}
