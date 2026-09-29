import type { EffectPass } from "@/effects/types";
import type { ParamValues } from "@/params";
import { parseColorToLinearRgba } from "@/params";

export function readNumber(
	params: ParamValues,
	key: string,
	fallback: number,
): number {
	const raw = params[key];
	return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

export function readBoolean(
	params: ParamValues,
	key: string,
	fallback: boolean,
): boolean {
	const raw = params[key];
	return typeof raw === "boolean" ? raw : fallback;
}

export function readColorLinearRgb(
	params: ParamValues,
	key: string,
	fallback: string,
): [number, number, number] {
	const raw = params[key];
	const value = typeof raw === "string" ? raw : fallback;
	const parsed = parseColorToLinearRgba({ color: value });
	if (!parsed) {
		return [0, 0, 0];
	}
	return [parsed.r, parsed.g, parsed.b];
}

export function paramsPass(shader: string, params: number[]): EffectPass {
	return { shader, uniforms: { u_params: params } };
}
