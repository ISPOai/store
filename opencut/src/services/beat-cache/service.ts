"use client";

import { detectBeatsInBuffer, type BeatAnalysis } from "@/media/beat-detection";
import { decodeAudioSource } from "@/services/waveform-cache/service";

export interface BeatSource {
	sourceKey: string;
	audioBuffer?: AudioBuffer;
	sourceFile?: File;
	audioUrl?: string;
}

/**
 * Per-source beat analysis. Results are kept both as promises (for loading) and
 * as resolved values so timeline snapping can read them synchronously.
 */
export class BeatCache {
	private pending = new Map<string, Promise<BeatAnalysis>>();
	private resolved = new Map<string, BeatAnalysis>();
	private listeners = new Set<() => void>();

	peek({ sourceKey }: { sourceKey: string }): BeatAnalysis | null {
		return this.resolved.get(sourceKey) ?? null;
	}

	load(source: BeatSource): Promise<BeatAnalysis> {
		const existing = this.pending.get(source.sourceKey);
		if (existing) {
			return existing;
		}

		const promise = this.analyze(source)
			.then((analysis) => {
				this.resolved.set(source.sourceKey, analysis);
				this.emit();
				return analysis;
			})
			.catch((error) => {
				this.pending.delete(source.sourceKey);
				throw error;
			});
		this.pending.set(source.sourceKey, promise);
		return promise;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	clearSource({ sourceKey }: { sourceKey: string }): void {
		this.pending.delete(sourceKey);
		if (this.resolved.delete(sourceKey)) {
			this.emit();
		}
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}

	private async analyze({
		sourceKey,
		audioBuffer,
		sourceFile,
		audioUrl,
	}: BeatSource): Promise<BeatAnalysis> {
		const buffer =
			audioBuffer ??
			(await decodeAudioSource({ sourceKey, sourceFile, audioUrl }));
		return detectBeatsInBuffer(buffer);
	}
}

export const beatCache = new BeatCache();
