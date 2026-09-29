import type { ParamValues } from "@/params";
import type { ImageElement, VideoElement } from "@/timeline";
import { clamp } from "@/utils/math";
import type { CropRect } from "@/services/renderer/image-fit";

export const CROP_PARAM_KEYS = [
	"crop.left",
	"crop.top",
	"crop.right",
	"crop.bottom",
] as const;

export const FLIP_PARAM_KEYS = ["flipX", "flipY"] as const;

export const DEFAULT_CROP: CropRect = { left: 0, top: 0, right: 0, bottom: 0 };

function readEdge({
	params,
	key,
}: {
	params: ParamValues;
	key: string;
}): number {
	const value = params[key];
	return typeof value === "number" ? clamp({ value, min: 0, max: 1 }) : 0;
}

export function readCropFromParams({
	params,
}: {
	params: ParamValues;
}): CropRect {
	return {
		left: readEdge({ params, key: "crop.left" }),
		top: readEdge({ params, key: "crop.top" }),
		right: readEdge({ params, key: "crop.right" }),
		bottom: readEdge({ params, key: "crop.bottom" }),
	};
}

export function readFlipFromParams({
	params,
}: {
	params: ParamValues;
}): { flipX: boolean; flipY: boolean } {
	return {
		flipX: params.flipX === true,
		flipY: params.flipY === true,
	};
}

export function writeCropToParams({
	params,
	crop,
}: {
	params: ParamValues;
	crop: CropRect;
}): ParamValues {
	return {
		...params,
		"crop.left": clamp({ value: crop.left, min: 0, max: 1 }),
		"crop.top": clamp({ value: crop.top, min: 0, max: 1 }),
		"crop.right": clamp({ value: crop.right, min: 0, max: 1 }),
		"crop.bottom": clamp({ value: crop.bottom, min: 0, max: 1 }),
	};
}

export function writeFlipToParams({
	params,
	flipX,
	flipY,
}: {
	params: ParamValues;
	flipX: boolean;
	flipY: boolean;
}): ParamValues {
	return {
		...params,
		flipX,
		flipY,
	};
}

/** Video is always contained; production stills cover the canvas, ordinary images contain. */
export function resolveElementImageFit({
	element,
}: {
	element: VideoElement | ImageElement;
}): "cover" | "contain" {
	if (element.type === "image") {
		return element.fit ??
			(element.production?.owner === "opencut-production" ? "cover" : "contain");
	}
	return "contain";
}
