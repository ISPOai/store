import { files } from "@ispo/sdk";

import {
	EXPORT_FORMAT_VALUES,
	EXPORT_MOV_CODEC_VALUES,
	EXPORT_QUALITY_VALUES,
	getExportFileName,
	getExportMimeType,
	type ExportFormat,
	type ExportMovCodec,
	type ExportQuality,
	type ExportResolution,
} from "@/export";
import { DEFAULT_EXPORT_OPTIONS } from "@/export/defaults";
import { isValidExportResolution } from "@/export/resolution";
import { floatToFrameRate } from "@/fps/utils";
import { whenEditorReady } from "@/services/editor-ready";
import { mediaTimeToSeconds } from "@/wasm";
import { projectFolder } from "@/services/storage/project-folder";

export interface ExportProjectData {
	path: string;
	fileName: string;
	format: ExportFormat;
	sizeBytes: number;
	durationSeconds: number;
}

interface ExportProjectInput {
	format: ExportFormat;
	quality: ExportQuality;
	includeAudio: boolean;
	name?: string;
	resolution?: ExportResolution;
	fps?: number;
	bitrate?: number;
	movCodec?: ExportMovCodec;
}

/** Sentinel message for a user-cancelled export; UI callers swallow it. */
export const EXPORT_CANCELLED_MESSAGE = "Export was cancelled.";

function isExportFormat(value: unknown): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((format) => format === value);
}

function isExportQuality(value: unknown): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((quality) => quality === value);
}

function isExportMovCodec(value: unknown): value is ExportMovCodec {
	return EXPORT_MOV_CODEC_VALUES.some((codec) => codec === value);
}

function normalizeExportProjectInput({
	input,
}: {
	input: unknown;
}): ExportProjectInput {
	const normalized: ExportProjectInput = {
		format: DEFAULT_EXPORT_OPTIONS.format,
		quality: DEFAULT_EXPORT_OPTIONS.quality,
		includeAudio: DEFAULT_EXPORT_OPTIONS.includeAudio ?? true,
	};
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return normalized;
	}
	const record = input as Record<string, unknown>;
	if (isExportFormat(record.format)) {
		normalized.format = record.format;
	}
	if (isExportQuality(record.quality)) {
		normalized.quality = record.quality;
	}
	if (typeof record.includeAudio === "boolean") {
		normalized.includeAudio = record.includeAudio;
	}
	if (typeof record.name === "string" && record.name.trim() !== "") {
		normalized.name = record.name.trim();
	}
	if (isValidExportResolution(record.resolution)) {
		normalized.resolution = record.resolution;
	}
	if (typeof record.fps === "number" && Number.isFinite(record.fps) && record.fps > 0) {
		normalized.fps = record.fps;
	}
	if (
		typeof record.bitrate === "number" &&
		Number.isInteger(record.bitrate) &&
		record.bitrate > 0
	) {
		normalized.bitrate = record.bitrate;
	}
	if (isExportMovCodec(record.movCodec)) {
		normalized.movCodec = record.movCodec;
	}
	return normalized;
}

/**
 * Runtime entry for the `export-project` command (metadata lives in
 * `@/services/project-commands`). Renders the open project with the normal
 * export pipeline and publishes the result into the user's Files app
 * (OpenCut's own Files folder), returning the published path.
 */
export async function runExportProject(
	input: unknown,
): Promise<ExportProjectData> {
	const { format, quality, includeAudio, name, resolution, fps, bitrate, movCodec } =
		normalizeExportProjectInput({
			input,
		});
	const editor = await whenEditorReady();
	const activeProject = editor.project.getActive();

	if (editor.project.getExportState().isExporting) {
		throw new Error(
			"An export is already running. Wait for it to finish (or cancel it), then retry.",
		);
	}

	const totalDuration = editor.timeline.getTotalDuration();
	if (totalDuration <= 0) {
		throw new Error(
			"The timeline is empty — there is nothing to export. Arrange media on the timeline first (e.g. with the arrange-timeline command).",
		);
	}

	const result = await editor.project.export({
		options: {
			format,
			quality,
			fps: fps !== undefined ? floatToFrameRate(fps) : activeProject.settings.fps,
			includeAudio,
			resolution,
			bitrate,
			movCodec,
		},
	});

	if (result.cancelled) {
		editor.project.clearExportState();
		throw new Error(EXPORT_CANCELLED_MESSAGE);
	}
	if (!result.success || !result.buffer) {
		throw new Error(
			result.error ?? "Export failed. Check the export settings and try again.",
		);
	}

	const baseName = name ?? activeProject.metadata.name;
	const fileName = getExportFileName({ name: baseName, format });
	const published = await files.publish({
		content: new Uint8Array(result.buffer),
		name: fileName,
		mimeType: getExportMimeType({ format }),
		folder: projectFolder({
			editId: activeProject.metadata.id,
			name: activeProject.metadata.name,
			section: "Exports",
		}),
	});

	editor.project.clearExportState();

	return {
		path: published.path,
		fileName,
		format,
		sizeBytes: result.buffer.byteLength,
		durationSeconds: mediaTimeToSeconds({ time: totalDuration }),
	};
}
