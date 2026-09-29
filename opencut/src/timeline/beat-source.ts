import { getClipTimeAtSourceTime } from "@/retime";
import { isBeatAnalysisUsable } from "@/media/beat-detection";
import type { MediaAsset } from "@/media/types";
import { buildWaveformSourceKey } from "@/media/waveform-summary";
import { beatCache, type BeatSource } from "@/services/beat-cache/service";
import type { SceneTracks, TimelineElement } from "@/timeline";
import { isSourceAudioEnabled } from "@/timeline/audio-separation";
import type { SnapPoint } from "@/timeline/snapping";
import { useTimelineStore } from "@/timeline/timeline-store";
import { addMediaTime, mediaTime, TICKS_PER_SECOND } from "@/wasm";

/** Source key for the audio that drives an element's beat grid, if it carries any. */
export function getBeatSourceKey(element: TimelineElement): string | null {
	if (element.type === "audio") {
		return element.sourceType === "upload"
			? buildWaveformSourceKey({ kind: "media", id: element.mediaId })
			: buildWaveformSourceKey({ kind: "library", id: element.sourceUrl });
	}
	// Once a video's audio is extracted, the grid moves to the audio clip.
	if (element.type === "video" && isSourceAudioEnabled({ element })) {
		return buildWaveformSourceKey({ kind: "media", id: element.mediaId });
	}
	return null;
}

export function getBeatSourceForElement({
	element,
	mediaAssets,
}: {
	element: TimelineElement;
	mediaAssets: MediaAsset[];
}): BeatSource | null {
	const sourceKey = getBeatSourceKey(element);
	if (!sourceKey) return null;
	if (element.type === "audio" && element.sourceType === "library") {
		return { sourceKey, audioBuffer: element.buffer, audioUrl: element.sourceUrl };
	}
	if (element.type !== "audio" && element.type !== "video") return null;
	const asset = mediaAssets.find((candidate) => candidate.id === element.mediaId);
	if (!asset || asset.hasAudio === false || (!asset.file && !asset.url)) {
		return null;
	}
	return { sourceKey, sourceFile: asset.file, audioUrl: asset.url };
}

/** Timeline-time beat positions of every analyzed clip, for magnetic snapping. */
export function getBeatSnapPoints({
	tracks,
	excludeElementIds,
}: {
	tracks: SceneTracks;
	excludeElementIds?: Set<string>;
}): SnapPoint[] {
	if (!useTimelineStore.getState().beatGridEnabled) return [];
	const snapPoints: SnapPoint[] = [];
	for (const track of [...tracks.overlay, tracks.main, ...tracks.audio]) {
		for (const element of track.elements) {
			if (excludeElementIds?.has(element.id)) continue;
			const sourceKey = getBeatSourceKey(element);
			const analysis = sourceKey ? beatCache.peek({ sourceKey }) : null;
			if (!analysis || !isBeatAnalysisUsable(analysis)) continue;
			const retime = "retime" in element ? element.retime : undefined;
			const trimStartSec = element.trimStart / TICKS_PER_SECOND;
			const durationSec = element.duration / TICKS_PER_SECOND;
			for (const sourceTime of analysis.beats) {
				const clipTime = getClipTimeAtSourceTime({
					sourceTime: sourceTime - trimStartSec,
					retime,
					clipDuration: durationSec,
				});
				if (clipTime < 0 || clipTime > durationSec) continue;
				snapPoints.push({
					time: addMediaTime({
						a: element.startTime,
						b: mediaTime({ ticks: Math.round(clipTime * TICKS_PER_SECOND) }),
					}),
					type: "beat",
					elementId: element.id,
					trackId: track.id,
				});
			}
		}
	}
	return snapPoints;
}
