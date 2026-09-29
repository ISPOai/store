import { normalizeChannel } from "@/animation";
import type {
	ElementAnimations,
	ScalarAnimationChannel,
} from "@/animation/types";
import { generateUUID } from "@/utils/id";
import { mediaTimeFromSeconds } from "@/wasm";
import type { TextAnimationKeyframes } from "./presets";

/**
 * Converts preset keyframe specs (float seconds) into the stored `ElementAnimations`
 * shape the renderer consumes. Keyframe times become integer-tick `MediaTime`
 * values relative to the element start.
 */
export function buildPresetAnimations({
	keyframes,
}: {
	keyframes: TextAnimationKeyframes;
}): ElementAnimations | undefined {
	const animations: ElementAnimations = {};

	for (const [path, specs] of Object.entries(keyframes)) {
		if (!specs || specs.length === 0) {
			continue;
		}

		const channel: ScalarAnimationChannel = {
			keys: specs.map((spec) => ({
				id: generateUUID(),
				time: mediaTimeFromSeconds({ seconds: spec.time }),
				value: spec.value,
				segmentToNext: spec.segmentToNext,
				tangentMode: "flat",
			})),
		};
		animations[path] = normalizeChannel({ channel });
	}

	return Object.keys(animations).length > 0 ? animations : undefined;
}
