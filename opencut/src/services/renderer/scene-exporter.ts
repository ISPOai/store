import EventEmitter from "eventemitter3";

import {
	Output,
	Mp4OutputFormat,
	WebMOutputFormat,
	MovOutputFormat,
	Mp3OutputFormat,
	WavOutputFormat,
	BufferTarget,
	CanvasSource,
	AudioBufferSource,
	QUALITY_LOW,
	QUALITY_MEDIUM,
	QUALITY_HIGH,
	QUALITY_VERY_HIGH,
	canEncodeVideo,
} from "mediabunny";
import type { FrameRate } from "opencut-wasm";
import { mediaTimeToSeconds } from "opencut-wasm";
import { TICKS_PER_SECOND } from "@/wasm";
import { frameRateToFloat } from "@/fps/utils";
import type { RootNode } from "./nodes/root-node";
import type { ExportFormat, ExportQuality, ExportMovCodec } from "@/export";
import { isAudioOnlyExportFormat } from "@/export";
import { CanvasRenderer } from "./canvas-renderer";
import { createCanvasSurface } from "./canvas-utils";
import { GifEncoder } from "@/export/gif-encoder";

type ExportParams = {
	width: number;
	height: number;
	fps: FrameRate;
	format: ExportFormat;
	quality: ExportQuality;
	shouldIncludeAudio?: boolean;
	audioBuffer?: AudioBuffer;
	bitrate?: number;
	movCodec?: ExportMovCodec;
};

const qualityMap = {
	low: QUALITY_LOW,
	medium: QUALITY_MEDIUM,
	high: QUALITY_HIGH,
	very_high: QUALITY_VERY_HIGH,
};

export type SceneExporterEvents = {
	progress: [progress: number];
	complete: [buffer: ArrayBuffer];
	error: [error: Error];
	cancelled: [];
};

export class SceneExporter extends EventEmitter<SceneExporterEvents> {
	private renderer: CanvasRenderer;
	private format: ExportFormat;
	private quality: ExportQuality;
	private shouldIncludeAudio: boolean;
	private audioBuffer?: AudioBuffer;
	private bitrate?: number;
	private movCodec: ExportMovCodec;

	private isCancelled = false;

	constructor({
		width,
		height,
		fps,
		format,
		quality,
		shouldIncludeAudio,
		audioBuffer,
		bitrate,
		movCodec,
	}: ExportParams) {
		super();
		this.renderer = new CanvasRenderer({
			width,
			height,
			fps,
		});

		this.format = format;
		this.quality = quality;
		this.shouldIncludeAudio = shouldIncludeAudio ?? false;
		this.audioBuffer = audioBuffer;
		this.bitrate = bitrate;
		this.movCodec = movCodec ?? "h264";
	}

	cancel(): void {
		this.isCancelled = true;
	}

	async export({
		rootNode,
	}: {
		rootNode: RootNode;
	}): Promise<ArrayBuffer | null> {
		if (this.format === "gif") {
			return this.exportGif({ rootNode });
		}
		if (isAudioOnlyExportFormat(this.format)) {
			return this.exportAudioOnly();
		}
		return this.exportVideo({ rootNode });
	}

	private async exportVideo({
		rootNode,
	}: {
		rootNode: RootNode;
	}): Promise<ArrayBuffer | null> {
		const fps = this.renderer.fps;
		const fpsFloat = frameRateToFloat(fps);
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
		);
		const frameCount = Math.floor(rootNode.duration / ticksPerFrame);

		const codec = this.videoCodec();
		if (codec === "prores" && !(await canEncodeVideo("prores", {
			width: this.renderer.width,
			height: this.renderer.height,
		}))) {
			this.emit(
				"error",
				new Error(
					"ProRes encoding is not available in this browser. Choose the H.264 codec for MOV instead.",
				),
			);
			return null;
		}

		const outputFormat = this.outputFormat();
		const output = new Output({
			format: outputFormat,
			target: new BufferTarget(),
		});

		const videoSource = new CanvasSource(this.renderer.getOutputCanvas(), {
			codec,
			bitrate: this.bitrate ?? qualityMap[this.quality],
		});

		output.addVideoTrack(videoSource, { frameRate: fpsFloat });

		let audioSource: AudioBufferSource | null = null;
		if (this.shouldIncludeAudio && this.audioBuffer) {
			let audioCodec: "aac" | "opus" = this.format === "webm" ? "opus" : "aac";

			if (audioCodec === "aac" && typeof AudioEncoder !== "undefined") {
				const { supported } = await AudioEncoder.isConfigSupported({
					codec: "mp4a.40.2",
					sampleRate: this.audioBuffer.sampleRate,
					numberOfChannels: this.audioBuffer.numberOfChannels,
					bitrate: 192000,
				});
				if (!supported) audioCodec = "opus";
			}

			audioSource = new AudioBufferSource({
				codec: audioCodec,
				bitrate: qualityMap[this.quality],
			});
			output.addAudioTrack(audioSource);
		}

		await output.start();

		if (audioSource && this.audioBuffer) {
			await audioSource.add(this.audioBuffer);
			audioSource.close();
		}

		for (let i = 0; i < frameCount; i++) {
			if (this.isCancelled) {
				await output.cancel();
				this.emit("cancelled");
				return null;
			}

			const timeTicks = i * ticksPerFrame;
			const timeSeconds = mediaTimeToSeconds({ time: timeTicks });
			await this.renderer.render({ node: rootNode, time: timeTicks });
			await videoSource.add(timeSeconds, 1 / fpsFloat);

			this.emit("progress", i / frameCount);
		}

		if (this.isCancelled) {
			await output.cancel();
			this.emit("cancelled");
			return null;
		}

		videoSource.close();
		await output.finalize();
		this.emit("progress", 1);

		const buffer = output.target.buffer;
		if (!buffer) {
			this.emit("error", new Error("Failed to export video"));
			return null;
		}

		this.emit("complete", buffer);
		return buffer;
	}

	private async exportGif({
		rootNode,
	}: {
		rootNode: RootNode;
	}): Promise<ArrayBuffer | null> {
		const fps = this.renderer.fps;
		const fpsFloat = frameRateToFloat(fps);
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
		);
		const frameCount = Math.floor(rootNode.duration / ticksPerFrame);

		const width = this.renderer.width;
		const height = this.renderer.height;
		const encoder = new GifEncoder({ width, height });
		const target = createCanvasSurface({ width, height });
		const delayMs = 1000 / fpsFloat;

		for (let i = 0; i < frameCount; i++) {
			if (this.isCancelled) {
				this.emit("cancelled");
				return null;
			}

			const timeTicks = i * ticksPerFrame;
			await this.renderer.render({ node: rootNode, time: timeTicks });

			// GIF has no alpha; composite the rendered frame onto white.
			target.context.fillStyle = "#ffffff";
			target.context.fillRect(0, 0, width, height);
			target.context.drawImage(
				this.renderer.getOutputCanvas(),
				0,
				0,
				width,
				height,
			);
			const frame = target.context.getImageData(0, 0, width, height);

			encoder.addFrame({ data: frame.data, delayMs });
			this.emit("progress", i / frameCount);
		}

		if (this.isCancelled) {
			this.emit("cancelled");
			return null;
		}

		this.emit("progress", 1);
		const bytes = encoder.finish();
		const buffer = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(buffer).set(bytes);
		this.emit("complete", buffer);
		return buffer;
	}

	private async exportAudioOnly(): Promise<ArrayBuffer | null> {
		if (!this.audioBuffer) {
			this.emit("error", new Error("The timeline has no audio to export."));
			return null;
		}

		const isMp3 = this.format === "mp3";
		const outputFormat = isMp3 ? new Mp3OutputFormat() : new WavOutputFormat();
		const output = new Output({
			format: outputFormat,
			target: new BufferTarget(),
		});

		const audioSource = new AudioBufferSource({
			codec: isMp3 ? "mp3" : "pcm-s16",
			...(isMp3 ? { bitrate: this.bitrate ?? qualityMap[this.quality] } : {}),
		});
		output.addAudioTrack(audioSource);

		await output.start();
		await audioSource.add(this.audioBuffer);
		audioSource.close();
		await output.finalize();
		this.emit("progress", 1);

		const buffer = output.target.buffer;
		if (!buffer) {
			this.emit("error", new Error("Failed to export audio"));
			return null;
		}

		this.emit("complete", buffer);
		return buffer;
	}

	private videoCodec(): "avc" | "vp9" | "prores" {
		if (this.format === "webm") return "vp9";
		if (this.format === "mov" && this.movCodec === "prores") return "prores";
		return "avc";
	}

	private outputFormat(): Mp4OutputFormat | WebMOutputFormat | MovOutputFormat {
		if (this.format === "webm") return new WebMOutputFormat();
		if (this.format === "mov") return new MovOutputFormat();
		return new Mp4OutputFormat();
	}
}
