import type { TCanvasSize } from "@/project/types";
import type { ExportResolution } from "./index";

/**
 * Export resolution presets expressed as the pixel length of the shorter canvas
 * edge, matching how CapCut presents resolution (720p / 1080p / 2K / 4K). The
 * project's aspect ratio is preserved and the longer edge is derived.
 */
export const EXPORT_RESOLUTION_PRESETS = [
	{ id: "source", label: "Source", shortEdge: null },
	{ id: "480p", label: "480p", shortEdge: 480 },
	{ id: "720p", label: "720p", shortEdge: 720 },
	{ id: "1080p", label: "1080p", shortEdge: 1080 },
	{ id: "1440p", label: "2K", shortEdge: 1440 },
	{ id: "2160p", label: "4K", shortEdge: 2160 },
] as const;

export type ExportResolutionPreset = (typeof EXPORT_RESOLUTION_PRESETS)[number]["id"];

const MAX_EXPORT_EDGE = 4096;

function roundEven(value: number): number {
	const rounded = Math.round(value);
	return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Derive the concrete output canvas size from a resolution preset and the
 * project's canvas size. `source` returns the project size unchanged; numeric
 * presets scale the shorter edge to `shortEdge` and preserve the aspect ratio,
 * clamping the result to the 4K ceiling.
 */
export function resolveExportCanvasSize({
	canvasSize,
	resolution,
}: {
	canvasSize: TCanvasSize;
	resolution: ExportResolutionPreset;
}): TCanvasSize {
	const preset = EXPORT_RESOLUTION_PRESETS.find(
		(candidate) => candidate.id === resolution,
	);
	if (!preset || preset.shortEdge === null || canvasSize.width <= 0 || canvasSize.height <= 0) {
		return canvasSize;
	}

	const isLandscape = canvasSize.width >= canvasSize.height;
	const shorterEdge = isLandscape ? canvasSize.height : canvasSize.width;
	const longerEdge = isLandscape ? canvasSize.width : canvasSize.height;
	if (longerEdge <= 0 || shorterEdge <= 0) return canvasSize;

	const targetShortEdge = Math.min(preset.shortEdge, MAX_EXPORT_EDGE);
	const scale = targetShortEdge / shorterEdge;
	const scaledShorter = roundEven(targetShortEdge);
	const scaledLonger = roundEven(longerEdge * scale);

	const width = isLandscape ? scaledLonger : scaledShorter;
	const height = isLandscape ? scaledShorter : scaledLonger;
	return { width, height };
}

export function isExportResolutionPreset(value: unknown): value is ExportResolutionPreset {
	return EXPORT_RESOLUTION_PRESETS.some((preset) => preset.id === value);
}

export function isValidExportResolution(value: unknown): value is ExportResolution {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const { width, height } = value as Record<string, unknown>;
	return (
		typeof width === "number" &&
		Number.isInteger(width) &&
		width >= 2 &&
		width <= MAX_EXPORT_EDGE &&
		typeof height === "number" &&
		Number.isInteger(height) &&
		height >= 2 &&
		height <= MAX_EXPORT_EDGE
	);
}

/**
 * Apply an explicit export resolution to the project canvas size, clamping
 * each edge to an even dimension within the 4K ceiling. A missing resolution
 * keeps the project canvas size unchanged.
 */
export function applyExportResolution({
	canvasSize,
	resolution,
}: {
	canvasSize: TCanvasSize;
	resolution?: ExportResolution;
}): TCanvasSize {
	if (!resolution) return canvasSize;
	const clamp = (value: number): number =>
		roundEven(Math.min(MAX_EXPORT_EDGE, Math.max(2, value)));
	return { width: clamp(resolution.width), height: clamp(resolution.height) };
}
