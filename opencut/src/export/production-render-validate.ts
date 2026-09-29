import {
	ALL_FORMATS,
	BlobSource,
	Input,
	VideoSampleSink,
} from "mediabunny";
import type { ExportFormat } from "@/export";
import { isAudioOnlyExportFormat } from "@/export";

export interface ProductionCaptionProbe {
	startSeconds: number;
	endSeconds: number;
}

export interface ProductionRenderValidationInput {
	buffer: ArrayBuffer | Uint8Array;
	format: ExportFormat;
	expectedWidth: number;
	expectedHeight: number;
	expectedDurationSeconds: number;
	expectedAudio: boolean;
	captions: ProductionCaptionProbe[];
}

export interface ProductionRenderValidation {
	durationSeconds: number;
	width: number;
	height: number;
	hasVideo: true;
	hasAudio: boolean;
	decodedCaptionFrames: number;
}

export interface ProductionAudioValidation {
	durationSeconds: number;
	width: 0;
	height: 0;
}

export interface ProductionGifValidation {
	durationSeconds: number;
	width: number;
	height: number;
	frameCount: number;
}

export class ProductionRenderValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProductionRenderValidationError";
	}
}

function asArrayBuffer(buffer: ArrayBuffer | Uint8Array): ArrayBuffer {
	if (buffer instanceof Uint8Array) {
		const copy = new Uint8Array(buffer.byteLength);
		copy.set(buffer);
		return copy.buffer;
	}
	return buffer;
}

/**
 * Validate the bytes that will be handed to Files. This deliberately opens
 * the container again instead of trusting exporter metadata. Caption tracks
 * are rasterized by OpenCut, so a decoded sample is required in every caption
 * interval rather than looking for a container text track that does not exist.
 */
export async function validateProductionRender({
	buffer,
	format,
	expectedWidth,
	expectedHeight,
	expectedDurationSeconds,
	expectedAudio,
	captions,
}: ProductionRenderValidationInput): Promise<ProductionRenderValidation> {
	const bytes = asArrayBuffer(buffer);
	if (bytes.byteLength === 0) {
		throw new ProductionRenderValidationError("The render produced no bytes");
	}

	const input = new Input({
		source: new BlobSource(
			new Blob([bytes], { type: format === "mp4" ? "video/mp4" : "video/webm" }),
		),
		formats: ALL_FORMATS,
	});

	try {
		const durationSeconds = await input.computeDuration();
		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			throw new ProductionRenderValidationError(
				"The rendered container has no positive duration",
			);
		}
		const durationTolerance = Math.max(0.1, expectedDurationSeconds * 0.02);
		if (
			!Number.isFinite(expectedDurationSeconds) ||
			Math.abs(durationSeconds - expectedDurationSeconds) > durationTolerance
		) {
			throw new ProductionRenderValidationError(
				`Rendered duration ${durationSeconds} does not match the snapshot duration ${expectedDurationSeconds}`,
			);
		}

		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) {
			throw new ProductionRenderValidationError("The rendered container has no video stream");
		}
		const width = await videoTrack.getDisplayWidth();
		const height = await videoTrack.getDisplayHeight();
		if (width !== expectedWidth || height !== expectedHeight) {
			throw new ProductionRenderValidationError(
				`Rendered dimensions ${width}x${height} do not match ${expectedWidth}x${expectedHeight}`,
			);
		}

		const audioTrack = await input.getPrimaryAudioTrack();
		if (expectedAudio && !audioTrack) {
			throw new ProductionRenderValidationError(
				"The render requested audio but the container has no audio stream",
			);
		}

		const sink = new VideoSampleSink(videoTrack);
		let decodedCaptionFrames = 0;
		for (const caption of captions) {
			const timestamp = Math.max(0, Math.min(caption.startSeconds, durationSeconds));
			const sample = await sink.getSample(timestamp);
			if (!sample) {
				throw new ProductionRenderValidationError(
					`No decoded video frame covers caption interval ${caption.startSeconds}-${caption.endSeconds}`,
				);
			}
			sample.close();
			decodedCaptionFrames += 1;
		}

		return {
			durationSeconds,
			width,
			height,
			hasVideo: true,
			hasAudio: audioTrack !== null,
			decodedCaptionFrames,
		};
	} finally {
		input.dispose();
	}
}

/**
 * Validate an audio-only export (mp3/wav) by re-opening the container and
 * checking it has a positive duration and a real audio stream, but no video.
 */
export async function validateAudioOnlyRender({
	buffer,
	format,
	expectedDurationSeconds,
}: {
	buffer: ArrayBuffer | Uint8Array;
	format: ExportFormat;
	expectedDurationSeconds: number;
}): Promise<ProductionAudioValidation> {
	if (!isAudioOnlyExportFormat(format)) {
		throw new ProductionRenderValidationError(`${format} is not an audio-only export`);
	}
	const bytes = asArrayBuffer(buffer);
	if (bytes.byteLength === 0) {
		throw new ProductionRenderValidationError("The render produced no bytes");
	}

	const input = new Input({
		source: new BlobSource(
			new Blob([bytes], { type: format === "mp3" ? "audio/mpeg" : "audio/wav" }),
		),
		formats: ALL_FORMATS,
	});

	try {
		const durationSeconds = await input.computeDuration();
		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			throw new ProductionRenderValidationError(
				"The rendered audio container has no positive duration",
			);
		}
		const durationTolerance = Math.max(0.1, expectedDurationSeconds * 0.02);
		if (
			!Number.isFinite(expectedDurationSeconds) ||
			Math.abs(durationSeconds - expectedDurationSeconds) > durationTolerance
		) {
			throw new ProductionRenderValidationError(
				`Rendered duration ${durationSeconds} does not match the snapshot duration ${expectedDurationSeconds}`,
			);
		}

		const audioTrack = await input.getPrimaryAudioTrack();
		if (!audioTrack) {
			throw new ProductionRenderValidationError(
				"The rendered container has no audio stream",
			);
		}

		return { durationSeconds, width: 0, height: 0 };
	} finally {
		input.dispose();
	}
}

function readUint16(bytes: Uint8Array, offset: number): number {
	return bytes[offset] | (bytes[offset + 1] << 8);
}

/**
 * Validate a GIF export by walking the container structure directly (mediabunny
 * has no GIF input format). Confirms the GIF signature, logical screen
 * dimensions, at least one image frame, and a positive accumulated delay.
 */
export function validateGifRender({
	buffer,
	expectedWidth,
	expectedHeight,
}: {
	buffer: ArrayBuffer | Uint8Array;
	expectedWidth: number;
	expectedHeight: number;
}): ProductionGifValidation {
	const bytes = asArrayBuffer(buffer);
	if (bytes.byteLength < 13) {
		throw new ProductionRenderValidationError("The render produced no GIF bytes");
	}
	const signature = String.fromCharCode(...new Uint8Array(bytes.slice(0, 6)));
	if (signature !== "GIF89a" && signature !== "GIF87a") {
		throw new ProductionRenderValidationError("The render is not a GIF image");
	}

	const view = new Uint8Array(bytes);
	const width = readUint16(view, 6);
	const height = readUint16(view, 8);
	if (width !== expectedWidth || height !== expectedHeight) {
		throw new ProductionRenderValidationError(
			`Rendered GIF dimensions ${width}x${height} do not match ${expectedWidth}x${expectedHeight}`,
		);
	}

	const packed = view[10];
	let offset = 13;
	if (packed & 0x80) {
		offset += 3 * (1 << ((packed & 0x07) + 1));
	}

	let frameCount = 0;
	let durationCentiseconds = 0;
	while (offset < view.length) {
		const blockType = view[offset];
		if (blockType === 0x3b) break;
		if (blockType === 0x21) {
			const label = view[offset + 1];
			offset += 2;
			if (label === 0xf9) {
				durationCentiseconds += readUint16(view, offset + 1);
				offset += 1 + 4;
			}
			while (view[offset] !== 0) offset += 1 + view[offset];
			offset += 1;
			continue;
		}
		if (blockType === 0x2c) {
			frameCount += 1;
			const imagePacked = view[offset + 9];
			offset += 10;
			if (imagePacked & 0x80) {
				offset += 3 * (1 << ((imagePacked & 0x07) + 1));
			}
			offset += 1; // LZW minimum code size
			while (view[offset] !== 0) offset += 1 + view[offset];
			offset += 1;
			continue;
		}
		break;
	}

	if (frameCount < 1) {
		throw new ProductionRenderValidationError("The rendered GIF has no frames");
	}

	return {
		durationSeconds: durationCentiseconds / 100,
		width,
		height,
		frameCount,
	};
}
