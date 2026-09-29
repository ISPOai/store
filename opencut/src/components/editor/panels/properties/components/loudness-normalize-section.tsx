"use client";

import { useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import { AudioWave02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { canElementHaveAudio, type TimelineTrack } from "@/timeline";
import type { AudioCapableElement } from "@/timeline/audio-state";
import {
	DEFAULT_NORMALIZATION_TARGET,
	NORMALIZATION_TARGETS,
	computeNormalizedVolume,
	measureTargetsLoudness,
	type LoudnessTarget,
} from "@/media/loudness/normalize";

export function LoudnessNormalizeSection({
	targets,
}: {
	targets: LoudnessTarget[];
}) {
	const editor = useEditor();
	const [targetLufs, setTargetLufs] = useState<number>(
		DEFAULT_NORMALIZATION_TARGET,
	);
	const [busy, setBusy] = useState(false);

	const elementsWithTracks = editor.timeline.getElementsWithTracks({
		elements: targets,
	});
	const audioEntries = elementsWithTracks.filter(
		(entry): entry is { track: TimelineTrack; element: AudioCapableElement } =>
			canElementHaveAudio(entry.element),
	);
	const audioTargets = audioEntries.map(({ track, element }) => ({
		trackId: track.id,
		elementId: element.id,
	}));

	const handleNormalize = async () => {
		if (audioTargets.length === 0) return;
		setBusy(true);
		try {
			const scene = editor.scenes.getActiveSceneOrNull();
			if (!scene) return;

			const measurements = await measureTargetsLoudness({
				tracks: scene.tracks,
				mediaAssets: editor.media.getAssets(),
				targets: audioTargets,
			});

			const updates: Array<{
				trackId: string;
				elementId: string;
				patch: { params: { volume: number } };
			}> = [];
			const skippedNames: string[] = [];

			for (const { track, element } of audioEntries) {
				const measurement = measurements.get(element.id);
				if (!measurement) {
					skippedNames.push(element.name);
					continue;
				}
				const { nextVolumeDb } = computeNormalizedVolume({
					element,
					measurement,
					targetLufs,
				});
				if (nextVolumeDb === null) {
					skippedNames.push(element.name);
					continue;
				}
				updates.push({
					trackId: track.id,
					elementId: element.id,
					patch: { params: { volume: nextVolumeDb } },
				});
			}

			if (updates.length === 0) {
				toast.error("Nothing to normalize", {
					description:
						"Selected clips have no audible audio or are silent.",
				});
				return;
			}

			editor.timeline.updateElements({ updates });

			if (skippedNames.length > 0) {
				toast.success(
					`Normalized ${updates.length} clip${updates.length === 1 ? "" : "s"} to ${targetLufs} LUFS`,
					{ description: `Skipped ${skippedNames.length} without audible audio.` },
				);
			} else {
				toast.success(
					`Normalized ${updates.length} clip${updates.length === 1 ? "" : "s"} to ${targetLufs} LUFS`,
				);
			}
		} catch (error) {
			toast.error("Loudness normalization failed", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setBusy(false);
		}
	};

	if (audioTargets.length === 0) return null;

	return (
		<div className="flex items-center gap-2 px-4 pb-4">
			<Select
				value={String(targetLufs)}
				onValueChange={(value: string) => setTargetLufs(Number(value))}
			>
				<SelectTrigger className="w-24">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{NORMALIZATION_TARGETS.map((value) => (
						<SelectItem key={value} value={String(value)}>
							{value} LUFS
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				variant="outline"
				size="sm"
				className="flex-1"
				disabled={busy}
				onClick={handleNormalize}
			>
				<HugeiconsIcon icon={AudioWave02Icon} />
				{busy ? "Measuring…" : "Normalize loudness"}
			</Button>
		</div>
	);
}
