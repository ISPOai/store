import type { MediaAsset } from "@/media/types";
import type { Transform } from "@/rendering";
import type { ImageElement, VideoElement } from "@/timeline";
import { clamp } from "@/utils/math";
import { imageFitScale, type CropRect } from "@/services/renderer/image-fit";
import { resolveElementImageFit } from "./crop";

export type CropCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type CropEdge = "left" | "right" | "top" | "bottom";
export type CropHandle = CropCorner | CropEdge;

/**
 * The reference frame the crop handles are drawn inside: the box the element
 * occupies when crop is zero, using its current transform and fit. It is
 * independent of the crop itself, so it stays stable while dragging.
 */
export interface CropFrame {
	cx: number;
	cy: number;
	width: number;
	height: number;
	rotation: number;
	sourceWidth: number;
	sourceHeight: number;
}

export function computeCropFrame({
	element,
	canvasSize,
	mediaAsset,
	transform,
}: {
	element: VideoElement | ImageElement;
	canvasSize: { width: number; height: number };
	mediaAsset?: MediaAsset | null;
	transform: Transform;
}): CropFrame {
	const sourceWidth = mediaAsset?.width ?? canvasSize.width;
	const sourceHeight = mediaAsset?.height ?? canvasSize.height;
	const fit = resolveElementImageFit({ element });
	const refScale = imageFitScale({
		canvasWidth: canvasSize.width,
		canvasHeight: canvasSize.height,
		sourceWidth,
		sourceHeight,
		fit,
	});
	return {
		cx: canvasSize.width / 2 + transform.position.x,
		cy: canvasSize.height / 2 + transform.position.y,
		width: Math.abs(sourceWidth * refScale * transform.scaleX),
		height: Math.abs(sourceHeight * refScale * transform.scaleY),
		rotation: transform.rotate,
		sourceWidth,
		sourceHeight,
	};
}

/** The crop rectangle edges in frame-local coordinates (origin at frame center, y down). */
export function cropRectLocal({
	frame,
	crop,
}: {
	frame: CropFrame;
	crop: CropRect;
}): { left: number; top: number; right: number; bottom: number } {
	const halfW = frame.width / 2;
	const halfH = frame.height / 2;
	return {
		left: -halfW + crop.left * frame.width,
		right: halfW - crop.right * frame.width,
		top: -halfH + crop.top * frame.height,
		bottom: halfH - crop.bottom * frame.height,
	};
}

function clampOpposite({ value, opposite }: { value: number; opposite: number }): number {
	return clamp({ value, min: 0, max: Math.max(0, 1 - opposite) });
}

/**
 * Compute the crop produced by dragging `handle` to the frame-local point
 * (localX, localY). Corner handles move two edges; edge handles move one.
 */
export function cropFromHandleDrag({
	crop,
	handle,
	localX,
	localY,
	frameWidth,
	frameHeight,
}: {
	crop: CropRect;
	handle: CropHandle;
	localX: number;
	localY: number;
	frameWidth: number;
	frameHeight: number;
}): CropRect {
	const fractionX = clamp({
		value: localX / frameWidth + 0.5,
		min: 0,
		max: 1,
	});
	const fractionY = clamp({
		value: localY / frameHeight + 0.5,
		min: 0,
		max: 1,
	});

	switch (handle) {
		case "top-left":
			return {
				...crop,
				left: clampOpposite({ value: fractionX, opposite: crop.right }),
				top: clampOpposite({ value: fractionY, opposite: crop.bottom }),
			};
		case "top-right":
			return {
				...crop,
				right: clampOpposite({ value: 1 - fractionX, opposite: crop.left }),
				top: clampOpposite({ value: fractionY, opposite: crop.bottom }),
			};
		case "bottom-left":
			return {
				...crop,
				left: clampOpposite({ value: fractionX, opposite: crop.right }),
				bottom: clampOpposite({ value: 1 - fractionY, opposite: crop.top }),
			};
		case "bottom-right":
			return {
				...crop,
				right: clampOpposite({ value: 1 - fractionX, opposite: crop.left }),
				bottom: clampOpposite({ value: 1 - fractionY, opposite: crop.top }),
			};
		case "left":
			return {
				...crop,
				left: clampOpposite({ value: fractionX, opposite: crop.right }),
			};
		case "right":
			return {
				...crop,
				right: clampOpposite({ value: 1 - fractionX, opposite: crop.left }),
			};
		case "top":
			return {
				...crop,
				top: clampOpposite({ value: fractionY, opposite: crop.bottom }),
			};
		case "bottom":
			return {
				...crop,
				bottom: clampOpposite({ value: 1 - fractionY, opposite: crop.top }),
			};
		default: {
			const exhaustive: never = handle;
			return exhaustive;
		}
	}
}

/** Un-rotate a canvas-space delta (from the frame center) into frame-local coordinates. */
export function toFrameLocal({
	dx,
	dy,
	rotation,
}: {
	dx: number;
	dy: number;
	rotation: number;
}): { x: number; y: number } {
	const angleRad = (rotation * Math.PI) / 180;
	const cos = Math.cos(angleRad);
	const sin = Math.sin(angleRad);
	return {
		x: dx * cos + dy * sin,
		y: -dx * sin + dy * cos,
	};
}

/** Rotate a frame-local point into canvas-space offset from the frame center. */
export function fromFrameLocal({
	x,
	y,
	rotation,
}: {
	x: number;
	y: number;
	rotation: number;
}): { x: number; y: number } {
	const angleRad = (rotation * Math.PI) / 180;
	const cos = Math.cos(angleRad);
	const sin = Math.sin(angleRad);
	return {
		x: x * cos - y * sin,
		y: x * sin + y * cos,
	};
}
