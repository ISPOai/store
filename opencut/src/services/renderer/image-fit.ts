export type ImageFit = "cover" | "contain";

/**
 * Normalized per-edge source crop. Each edge is a fraction of the source
 * dimension trimmed away, in [0, 1]. The crop is applied to the source before
 * image-fit, so cropping zooms into the remaining source region.
 */
export interface CropRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export function isCropActive({ crop }: { crop?: CropRect }): boolean {
	return Boolean(
		crop &&
			(crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0),
	);
}

/** The crop rectangle in source pixel space, clamped so left + right < 1 and top + bottom < 1. */
export function cropSourceRect({
	sourceWidth,
	sourceHeight,
	crop,
}: {
	sourceWidth: number;
	sourceHeight: number;
	crop: CropRect;
}): { x: number; y: number; width: number; height: number } {
	const left = Math.max(0, Math.min(1, crop.left));
	const right = Math.max(0, Math.min(1, crop.right));
	const top = Math.max(0, Math.min(1, crop.top));
	const bottom = Math.max(0, Math.min(1, crop.bottom));
	const maxHorizontal = Math.max(0, 1 - left - right);
	const maxVertical = Math.max(0, 1 - top - bottom);
	const x = left * sourceWidth;
	const y = top * sourceHeight;
	const width = Math.max(1, sourceWidth * maxHorizontal);
	const height = Math.max(1, sourceHeight * maxVertical);
	return { x, y, width, height };
}

export function cropSourceDimensions({
	sourceWidth,
	sourceHeight,
	crop,
}: {
	sourceWidth: number;
	sourceHeight: number;
	crop: CropRect;
}): { width: number; height: number } {
	const rect = cropSourceRect({ sourceWidth, sourceHeight, crop });
	return { width: rect.width, height: rect.height };
}

export function imageFitScale({
	canvasWidth,
	canvasHeight,
	sourceWidth,
	sourceHeight,
	fit = "contain",
	crop,
}: {
	canvasWidth: number;
	canvasHeight: number;
	sourceWidth: number;
	sourceHeight: number;
	fit?: ImageFit;
	crop?: CropRect;
}): number {
	const dims = crop
		? cropSourceDimensions({ sourceWidth, sourceHeight, crop })
		: { width: sourceWidth, height: sourceHeight };
	const scale = fit === "cover" ? Math.max : Math.min;
	return scale(canvasWidth / dims.width, canvasHeight / dims.height);
}

export function imageFitDimensions({
	canvasWidth,
	canvasHeight,
	sourceWidth,
	sourceHeight,
	fit = "contain",
	crop,
}: {
	canvasWidth: number;
	canvasHeight: number;
	sourceWidth: number;
	sourceHeight: number;
	fit?: ImageFit;
	crop?: CropRect;
}) {
	const scale = imageFitScale({
		canvasWidth,
		canvasHeight,
		sourceWidth,
		sourceHeight,
		fit,
		crop,
	});
	const dims = crop
		? cropSourceDimensions({ sourceWidth, sourceHeight, crop })
		: { width: sourceWidth, height: sourceHeight };
	return { width: dims.width * scale, height: dims.height * scale };
}
