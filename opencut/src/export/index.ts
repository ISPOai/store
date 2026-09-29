import type { FrameRate } from "opencut-wasm";
import { EXPORT_MIME_TYPES } from "./mime-types";

export const EXPORT_QUALITY_VALUES = [
	"low",
	"medium",
	"high",
	"very_high",
] as const;

export const EXPORT_FORMAT_VALUES = [
	"mp4",
	"webm",
	"mov",
	"gif",
	"mp3",
	"wav",
] as const;

export const EXPORT_MOV_CODEC_VALUES = ["h264", "prores"] as const;

export type ExportFormat = (typeof EXPORT_FORMAT_VALUES)[number];
export type ExportQuality = (typeof EXPORT_QUALITY_VALUES)[number];
export type ExportMovCodec = (typeof EXPORT_MOV_CODEC_VALUES)[number];

export interface ExportResolution {
	width: number;
	height: number;
}

export interface ExportOptions {
	format: ExportFormat;
	quality: ExportQuality;
	fps?: FrameRate;
	includeAudio?: boolean;
	/** Explicit target resolution; when omitted the project canvas size is used. */
	resolution?: ExportResolution;
	/** Explicit video bitrate in bits per second; overrides the quality preset. */
	bitrate?: number;
	/** MOV codec; defaults to `h264`. `prores` requires an encoder the browser can provide. */
	movCodec?: ExportMovCodec;
}

export interface ExportResult {
	success: boolean;
	buffer?: ArrayBuffer;
	error?: string;
	cancelled?: boolean;
}

export interface ExportState {
	isExporting: boolean;
	progress: number;
	result: ExportResult | null;
}

const VIDEO_FORMATS: ReadonlySet<ExportFormat> = new Set(["mp4", "webm", "mov"]);
const AUDIO_ONLY_FORMATS: ReadonlySet<ExportFormat> = new Set(["mp3", "wav"]);

export function isVideoExportFormat(format: ExportFormat): boolean {
	return VIDEO_FORMATS.has(format);
}

export function isAudioOnlyExportFormat(format: ExportFormat): boolean {
	return AUDIO_ONLY_FORMATS.has(format);
}

export function getExportMimeType({
	format,
}: {
	format: ExportFormat;
}): string {
	return EXPORT_MIME_TYPES[format];
}

export function getExportFileExtension({
	format,
}: {
	format: ExportFormat;
}): string {
	return `.${format}`;
}

export function getExportFileName({
	name,
	format,
}: {
	name: string;
	format: ExportFormat;
}): string {
	const extension = getExportFileExtension({ format });
	const baseName = name.toLowerCase().endsWith(extension)
		? name.slice(0, -extension.length)
		: name;
	return `${baseName}${extension}`;
}
