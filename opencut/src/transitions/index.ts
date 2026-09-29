import { generateUUID } from "@/utils/id";
import { mediaTimeFromSeconds } from "@/wasm";
import type { MediaTime } from "@/wasm";
import { registerDefaultTransitions, isTransitionType } from "./definitions";
import type { Transition, TransitionType } from "./types";

export * from "./types";
export * from "./registry";
export { registerDefaultTransitions, isTransitionType } from "./definitions";

export const DEFAULT_TRANSITION_DURATION_SECONDS = 0.5;

export function buildDefaultTransition({
	type,
	durationSeconds,
}: {
	type: TransitionType;
	durationSeconds?: number;
}): Transition {
	return {
		id: generateUUID(),
		type,
		duration: mediaTimeFromSeconds({
			seconds: durationSeconds ?? DEFAULT_TRANSITION_DURATION_SECONDS,
		}),
	};
}

export function buildTransitionDuration({
	durationSeconds,
}: {
	durationSeconds: number;
}): MediaTime {
	return mediaTimeFromSeconds({ seconds: durationSeconds });
}
