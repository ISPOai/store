"use client";

import { createAudioContext } from "@/media/audio";
import {
	buildSourceWaveformSummary,
	type SourceWaveformSummary,
} from "@/media/waveform-summary";

interface GetSourceWaveformSummaryArgs {
	sourceKey: string;
	audioBuffer?: AudioBuffer;
	sourceFile?: File;
	audioUrl?: string;
}

export class WaveformCache {
	private summaries = new Map<string, Promise<SourceWaveformSummary>>();

	getSourceSummary({
		sourceKey,
		audioBuffer,
		sourceFile,
		audioUrl,
	}: GetSourceWaveformSummaryArgs): Promise<SourceWaveformSummary> {
		const existing = this.summaries.get(sourceKey);
		if (existing) {
			return existing;
		}

		const promise = this.buildSummary({
			sourceKey,
			audioBuffer,
			sourceFile,
			audioUrl,
		}).catch((error) => {
			this.summaries.delete(sourceKey);
			throw error;
		});

		this.summaries.set(sourceKey, promise);
		return promise;
	}

	clearSource({ sourceKey }: { sourceKey: string }): void {
		this.summaries.delete(sourceKey);
	}

	clearAll(): void {
		this.summaries.clear();
	}

	private async buildSummary({
		sourceKey,
		audioBuffer,
		sourceFile,
		audioUrl,
	}: GetSourceWaveformSummaryArgs): Promise<SourceWaveformSummary> {
		if (audioBuffer) {
			return buildSourceWaveformSummary({ sourceKey, buffer: audioBuffer });
		}

		const buffer = await decodeAudioSource({ sourceKey, sourceFile, audioUrl });
		return buildSourceWaveformSummary({ sourceKey, buffer });
	}
}

export async function decodeAudioSource({
	sourceKey,
	sourceFile,
	audioUrl,
}: {
	sourceKey: string;
	sourceFile?: File;
	audioUrl?: string;
}): Promise<AudioBuffer> {
	let arrayBuffer: ArrayBuffer | null = null;
	if (sourceFile) {
		arrayBuffer = await sourceFile.arrayBuffer();
	} else if (audioUrl) {
		const response = await fetch(audioUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch audio source: ${response.status}`);
		}
		arrayBuffer = await response.arrayBuffer();
	}

	if (!arrayBuffer) {
		throw new Error(`No audio source available for ${sourceKey}`);
	}

	const audioContext = createAudioContext();
	try {
		return await audioContext.decodeAudioData(arrayBuffer.slice(0));
	} finally {
		void audioContext.close();
	}
}

export const waveformCache = new WaveformCache();
