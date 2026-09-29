"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useEditor } from "@/editor/use-editor";
import { getClipTimeAtSourceTime } from "@/retime";
import type { TimelineElement } from "@/timeline";
import { isBeatAnalysisUsable } from "@/media/beat-detection";
import { beatCache } from "@/services/beat-cache/service";
import { getBeatSourceForElement } from "@/timeline/beat-source";
import { TICKS_PER_SECOND } from "@/wasm";

const MIN_BEAT_SPACING_PX = 6;
const MIN_LABEL_SPACING_PX = 28;
const BEATS_PER_BAR = 4;

const subscribeToBeats = (listener: () => void) => beatCache.subscribe(listener);

interface GridLine {
	x: number;
	isBar: boolean;
	bar: number;
}

/**
 * Beat grid drawn over a music-bearing clip, in the style of Final Cut Pro's
 * beat detection: bright bar lines with bar numbers, fainter beat ticks.
 * Hidden for sources without a steady pulse (speech, ambience).
 */
export function BeatGrid({
	element,
	pixelsPerSecond,
}: {
	element: TimelineElement;
	pixelsPerSecond: number;
}) {
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const source = getBeatSourceForElement({ element, mediaAssets });
	const sourceKey = source?.sourceKey ?? null;

	useEffect(() => {
		if (source) {
			beatCache.load(source).catch(() => {
				// Undecodable audio simply shows no grid.
			});
		}
		// The source identity is fully described by its key.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sourceKey]);

	const analysis = useSyncExternalStore(
		subscribeToBeats,
		() => (sourceKey ? beatCache.peek({ sourceKey }) : null),
	);

	const retime = "retime" in element ? element.retime : undefined;
	const lines = useMemo((): GridLine[] => {
		if (pixelsPerSecond <= 0 || !analysis || !isBeatAnalysisUsable(analysis)) {
			return [];
		}
		const rate = retime?.rate ?? 1;
		const beatPx = (60 / analysis.bpm / rate) * pixelsPerSecond;
		if (beatPx * BEATS_PER_BAR < MIN_BEAT_SPACING_PX) {
			return [];
		}
		const showBeats = beatPx >= MIN_BEAT_SPACING_PX;
		const trimStartSec = element.trimStart / TICKS_PER_SECOND;
		const durationSec = element.duration / TICKS_PER_SECOND;
		const result: GridLine[] = [];
		analysis.beats.forEach((sourceTime, index) => {
			const beatInBar = index - analysis.downbeatOffset;
			const isBar = ((beatInBar % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0;
			if (!isBar && !showBeats) return;
			const clipTime = getClipTimeAtSourceTime({
				sourceTime: sourceTime - trimStartSec,
				retime,
				clipDuration: durationSec,
			});
			if (clipTime < 0 || clipTime > durationSec) return;
			result.push({
				x: clipTime * pixelsPerSecond,
				isBar,
				bar: Math.floor(beatInBar / BEATS_PER_BAR) + 1,
			});
		});
		return result;
	}, [analysis, element.duration, element.trimStart, pixelsPerSecond, retime]);

	if (lines.length === 0 || !analysis) {
		return null;
	}

	const barPx = (60 / analysis.bpm / (retime?.rate ?? 1)) * BEATS_PER_BAR * pixelsPerSecond;
	const showLabels = barPx >= MIN_LABEL_SPACING_PX;

	return (
		<div
			className="pointer-events-none absolute inset-x-0 top-5 bottom-0 overflow-hidden"
			data-beat-grid
			data-bpm={Math.round(analysis.bpm)}
		>
			{/* Ruler strip: gives beat ticks a dark backing so they read over thumbnails. */}
			<div className="absolute inset-x-0 bottom-0 h-3.5 bg-black/55" />
			{lines.map((line) =>
				line.isBar ? (
					<div
						key={`bar-${line.x}`}
						className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-amber-300 shadow-[0_0_2px_rgb(0_0_0/0.9)]"
						style={{ left: `${line.x}px` }}
					>
						{showLabels && line.bar > 0 && (
							<span className="absolute top-0 left-1 rounded-sm bg-amber-300 px-1 py-px text-[0.6rem] leading-none font-semibold tabular-nums text-black">
								{line.bar}
							</span>
						)}
					</div>
				) : (
					<div
						key={`beat-${line.x}`}
						className="absolute bottom-0 h-2 w-px bg-white/70"
						style={{ left: `${line.x}px` }}
					/>
				),
			)}
		</div>
	);
}
