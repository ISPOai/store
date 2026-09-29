import type { ElementAnimations } from "@/animation/types";

export const TEXT_ANIMATION_PRESET_NAMES = [
	"typewriter",
	"fade",
	"slide-up",
	"slide-down",
	"slide-left",
	"slide-right",
	"pop",
	"bounce",
	"wave",
	"blur-in",
	"scale",
] as const;

export type TextAnimationPresetName = (typeof TEXT_ANIMATION_PRESET_NAMES)[number];

export type TextAnimationPhase = "in" | "out" | "loop";

export const TEXT_ANIMATION_PHASES: readonly TextAnimationPhase[] = [
	"in",
	"out",
	"loop",
];

export interface TextAnimationPresetBinding {
	preset: TextAnimationPresetName;
	durationSeconds: number;
}

export type TextAnimationPropertyPath =
	| "opacity"
	| "transform.positionX"
	| "transform.positionY"
	| "transform.scaleX"
	| "transform.scaleY"
	| "transform.rotate";

export type TextAnimationSegmentType = "linear" | "step";

export interface TextAnimationKeyframeSpec {
	/** Time in seconds, relative to the element start. */
	time: number;
	value: number;
	segmentToNext: TextAnimationSegmentType;
}

export type TextAnimationKeyframes = Partial<
	Record<TextAnimationPropertyPath, TextAnimationKeyframeSpec[]>
>;

export interface BuildTextAnimationOptions {
	phase: TextAnimationPhase;
	/** Requested animation duration in seconds (clamped to the element). */
	durationSeconds: number;
	elementDurationSeconds: number;
	canvasWidth: number;
	canvasHeight: number;
}

export interface TextAnimationPresetDefinition {
	name: TextAnimationPresetName;
	label: string;
	keywords: string[];
	/** Phases this preset supports. */
	phases: TextAnimationPhase[];
	/** Property paths this preset animates (used to clear prior bindings). */
	paths: TextAnimationPropertyPath[];
	build: (options: BuildTextAnimationOptions) => TextAnimationKeyframes;
}

export const DEFAULT_TEXT_ANIMATION_DURATION_SECONDS = 1;
export const MIN_TEXT_ANIMATION_DURATION_SECONDS = 0.1;
export const MAX_TEXT_ANIMATION_DURATION_SECONDS = 10;

const TYPEWRITER_STEPS = 10;

function clamp({ value, min, max }: { value: number; min: number; max: number }): number {
	return Math.min(max, Math.max(min, value));
}

function key({
	time,
	value,
	segmentToNext = "linear",
}: {
	time: number;
	value: number;
	segmentToNext?: TextAnimationSegmentType;
}): TextAnimationKeyframeSpec {
	return { time, value, segmentToNext };
}

function inSpan({
	durationSeconds,
	elementDurationSeconds,
}: {
	durationSeconds: number;
	elementDurationSeconds: number;
}): { start: number; end: number } {
	const end = Math.max(0, Math.min(durationSeconds, elementDurationSeconds));
	return { start: 0, end };
}

function outSpan({
	durationSeconds,
	elementDurationSeconds,
}: {
	durationSeconds: number;
	elementDurationSeconds: number;
}): { start: number; end: number } {
	const start = Math.max(0, elementDurationSeconds - durationSeconds);
	return { start, end: elementDurationSeconds };
}

/**
 * Repeats a normalized pattern (phases in [0,1]) across the element, stopping at
 * `totalSeconds`. If the last generated keyframe falls short of the end, a final
 * keyframe is appended with the pattern's starting value so the loop closes
 * seamlessly.
 */
function buildLoopKeyframes({
	pattern,
	periodSeconds,
	totalSeconds,
}: {
	pattern: Array<{
		phase: number;
		value: number;
		segmentToNext?: TextAnimationSegmentType;
	}>;
	periodSeconds: number;
	totalSeconds: number;
}): TextAnimationKeyframeSpec[] {
	const keys: TextAnimationKeyframeSpec[] = [];
	const cycles = Math.max(1, Math.ceil(totalSeconds / periodSeconds));
	for (let cycle = 0; cycle < cycles; cycle++) {
		const offset = cycle * periodSeconds;
		for (const step of pattern) {
			const time = offset + step.phase * periodSeconds;
			if (time > totalSeconds + 1e-9) {
				break;
			}
			keys.push(key({ time, value: step.value, segmentToNext: step.segmentToNext }));
		}
	}

	if (keys.length === 0) {
		return keys;
	}
	const lastKey = keys[keys.length - 1];
	if (lastKey.time < totalSeconds - 1e-9) {
		keys.push(key({ time: totalSeconds, value: pattern[0].value }));
	}
	return keys;
}

function buildFade({ phase, durationSeconds, elementDurationSeconds }: BuildTextAnimationOptions): TextAnimationKeyframes {
	if (phase === "loop") {
		const periodSeconds = Math.max(durationSeconds, 0.2);
		return {
			opacity: buildLoopKeyframes({
				pattern: [
					{ phase: 0, value: 1 },
					{ phase: 0.5, value: 0.25 },
					{ phase: 1, value: 1 },
				],
				periodSeconds,
				totalSeconds: elementDurationSeconds,
			}),
		};
	}

	const span =
		phase === "in"
			? inSpan({ durationSeconds, elementDurationSeconds })
			: outSpan({ durationSeconds, elementDurationSeconds });
	return {
		opacity: [
			key({ time: span.start, value: phase === "in" ? 0 : 1 }),
			key({ time: span.end, value: phase === "in" ? 1 : 0 }),
		],
	};
}

function buildSlide(
	direction: "up" | "down" | "left" | "right",
	{ phase, durationSeconds, elementDurationSeconds, canvasWidth, canvasHeight }: BuildTextAnimationOptions,
): TextAnimationKeyframes {
	const horizontal = direction === "left" || direction === "right";
	const path: TextAnimationPropertyPath = horizontal
		? "transform.positionX"
		: "transform.positionY";
	const distance = horizontal ? Math.max(canvasWidth, 1) : Math.max(canvasHeight, 1);
	const sign = direction === "left" || direction === "up" ? -1 : 1;
	const span =
		phase === "in"
			? inSpan({ durationSeconds, elementDurationSeconds })
			: outSpan({ durationSeconds, elementDurationSeconds });

	return {
		[path]: [
			key({ time: span.start, value: phase === "in" ? sign * distance : 0 }),
			key({ time: span.end, value: phase === "in" ? 0 : sign * distance }),
		],
	};
}

function buildPop({ phase, durationSeconds, elementDurationSeconds }: BuildTextAnimationOptions): TextAnimationKeyframes {
	const span =
		phase === "in"
			? inSpan({ durationSeconds, elementDurationSeconds })
			: outSpan({ durationSeconds, elementDurationSeconds });
	const scaleKeys =
		phase === "in"
			? [
					key({ time: span.start, value: 0 }),
					key({ time: span.start + (span.end - span.start) * 0.7, value: 1.15 }),
					key({ time: span.end, value: 1 }),
				]
			: [
					key({ time: span.start, value: 1 }),
					key({ time: span.end, value: 0 }),
				];
	return {
		"transform.scaleX": scaleKeys,
		"transform.scaleY": scaleKeys,
	};
}

function buildScale({ phase, durationSeconds, elementDurationSeconds }: BuildTextAnimationOptions): TextAnimationKeyframes {
	const span =
		phase === "in"
			? inSpan({ durationSeconds, elementDurationSeconds })
			: outSpan({ durationSeconds, elementDurationSeconds });
	const scaleKeys =
		phase === "in"
			? [key({ time: span.start, value: 0 }), key({ time: span.end, value: 1 })]
			: [key({ time: span.start, value: 1 }), key({ time: span.end, value: 0 })];
	return {
		"transform.scaleX": scaleKeys,
		"transform.scaleY": scaleKeys,
	};
}

function buildBounce({ phase, durationSeconds, elementDurationSeconds, canvasHeight }: BuildTextAnimationOptions): TextAnimationKeyframes {
	const height = Math.max(0.3 * canvasHeight, 1);
	if (phase === "loop") {
		const periodSeconds = Math.max(durationSeconds, 0.2);
		return {
			"transform.positionY": buildLoopKeyframes({
				pattern: [
					{ phase: 0, value: 0 },
					{ phase: 0.5, value: -height },
					{ phase: 1, value: 0 },
				],
				periodSeconds,
				totalSeconds: elementDurationSeconds,
			}),
		};
	}

	const span =
		phase === "in"
			? inSpan({ durationSeconds, elementDurationSeconds })
			: outSpan({ durationSeconds, elementDurationSeconds });
	const keys =
		phase === "in"
			? [
					key({ time: span.start, value: -height }),
					key({ time: span.start + (span.end - span.start) * 0.5, value: 0.4 * height }),
					key({ time: span.start + (span.end - span.start) * 0.75, value: -0.18 * height }),
					key({ time: span.end, value: 0 }),
				]
			: [
					key({ time: span.start, value: 0 }),
					key({ time: span.start + (span.end - span.start) * 0.5, value: 0.4 * height }),
					key({ time: span.start + (span.end - span.start) * 0.75, value: -0.18 * height }),
					key({ time: span.end, value: -height }),
				];
	return { "transform.positionY": keys };
}

function buildWave({ phase, durationSeconds, elementDurationSeconds }: BuildTextAnimationOptions): TextAnimationKeyframes {
	const amplitude = 12;
	if (phase === "loop") {
		const periodSeconds = Math.max(durationSeconds, 0.3);
		return {
			"transform.rotate": buildLoopKeyframes({
				pattern: [
					{ phase: 0, value: -amplitude },
					{ phase: 0.5, value: amplitude },
					{ phase: 1, value: -amplitude },
				],
				periodSeconds,
				totalSeconds: elementDurationSeconds,
			}),
		};
	}

	const span =
		phase === "in"
			? inSpan({ durationSeconds, elementDurationSeconds })
			: outSpan({ durationSeconds, elementDurationSeconds });
	const keys =
		phase === "in"
			? [
					key({ time: span.start, value: -amplitude }),
					key({ time: span.start + (span.end - span.start) * 0.5, value: 0.5 * amplitude }),
					key({ time: span.end, value: 0 }),
				]
			: [
					key({ time: span.start, value: 0 }),
					key({ time: span.start + (span.end - span.start) * 0.5, value: 0.5 * amplitude }),
					key({ time: span.end, value: -amplitude }),
				];
	return { "transform.rotate": keys };
}

function buildBlurIn({ phase, durationSeconds, elementDurationSeconds }: BuildTextAnimationOptions): TextAnimationKeyframes {
	if (phase !== "in") {
		return {};
	}
	const span = inSpan({ durationSeconds, elementDurationSeconds });
	return {
		opacity: [key({ time: span.start, value: 0 }), key({ time: span.end, value: 1 })],
		"transform.scaleX": [
			key({ time: span.start, value: 1.12 }),
			key({ time: span.end, value: 1 }),
		],
		"transform.scaleY": [
			key({ time: span.start, value: 1.12 }),
			key({ time: span.end, value: 1 }),
		],
	};
}

function buildTypewriter({ phase, durationSeconds, elementDurationSeconds }: BuildTextAnimationOptions): TextAnimationKeyframes {
	const span =
		phase === "in"
			? inSpan({ durationSeconds, elementDurationSeconds })
			: outSpan({ durationSeconds, elementDurationSeconds });
	const spanSeconds = span.end - span.start;
	const keys: TextAnimationKeyframeSpec[] = [];
	for (let step = 0; step <= TYPEWRITER_STEPS; step++) {
		const progress = step / TYPEWRITER_STEPS;
		keys.push(
			key({
				time: span.start + progress * spanSeconds,
				value: phase === "in" ? progress : 1 - progress,
				segmentToNext: "step",
			}),
		);
	}
	return { opacity: keys };
}

const TEXT_ANIMATION_PRESETS: Record<TextAnimationPresetName, TextAnimationPresetDefinition> = {
	typewriter: {
		name: "typewriter",
		label: "Typewriter",
		keywords: ["type", "reveal", "characters", "print"],
		phases: ["in", "out"],
		paths: ["opacity"],
		build: buildTypewriter,
	},
	fade: {
		name: "fade",
		label: "Fade",
		keywords: ["fade", "dissolve", "opacity"],
		phases: ["in", "out", "loop"],
		paths: ["opacity"],
		build: buildFade,
	},
	"slide-up": {
		name: "slide-up",
		label: "Slide Up",
		keywords: ["slide", "up", "move"],
		phases: ["in", "out"],
		paths: ["transform.positionY"],
		build: (options) => buildSlide("up", options),
	},
	"slide-down": {
		name: "slide-down",
		label: "Slide Down",
		keywords: ["slide", "down", "move"],
		phases: ["in", "out"],
		paths: ["transform.positionY"],
		build: (options) => buildSlide("down", options),
	},
	"slide-left": {
		name: "slide-left",
		label: "Slide Left",
		keywords: ["slide", "left", "move"],
		phases: ["in", "out"],
		paths: ["transform.positionX"],
		build: (options) => buildSlide("left", options),
	},
	"slide-right": {
		name: "slide-right",
		label: "Slide Right",
		keywords: ["slide", "right", "move"],
		phases: ["in", "out"],
		paths: ["transform.positionX"],
		build: (options) => buildSlide("right", options),
	},
	pop: {
		name: "pop",
		label: "Pop",
		keywords: ["pop", "scale", "burst", "bounce"],
		phases: ["in", "out"],
		paths: ["transform.scaleX", "transform.scaleY"],
		build: buildPop,
	},
	bounce: {
		name: "bounce",
		label: "Bounce",
		keywords: ["bounce", "drop", "spring"],
		phases: ["in", "out", "loop"],
		paths: ["transform.positionY"],
		build: buildBounce,
	},
	wave: {
		name: "wave",
		label: "Wave",
		keywords: ["wave", "wiggle", "rotate"],
		phases: ["in", "out", "loop"],
		paths: ["transform.rotate"],
		build: buildWave,
	},
	"blur-in": {
		name: "blur-in",
		label: "Blur In",
		keywords: ["blur", "focus", "soft", "reveal"],
		phases: ["in"],
		paths: ["opacity", "transform.scaleX", "transform.scaleY"],
		build: buildBlurIn,
	},
	scale: {
		name: "scale",
		label: "Scale",
		keywords: ["scale", "zoom", "grow"],
		phases: ["in", "out"],
		paths: ["transform.scaleX", "transform.scaleY"],
		build: buildScale,
	},
};

export function isTextAnimationPresetName(
	value: unknown,
): value is TextAnimationPresetName {
	return (
		typeof value === "string" &&
		(TEXT_ANIMATION_PRESET_NAMES as readonly string[]).includes(value)
	);
}

export function isTextAnimationPhase(
	value: unknown,
): value is TextAnimationPhase {
	return (
		typeof value === "string" &&
		(TEXT_ANIMATION_PHASES as readonly string[]).includes(value)
	);
}

export function getTextAnimationPresetDefinitions(): TextAnimationPresetDefinition[] {
	return TEXT_ANIMATION_PRESET_NAMES.map((name) => TEXT_ANIMATION_PRESETS[name]);
}

export function getTextAnimationPresetDefinition(
	name: TextAnimationPresetName,
): TextAnimationPresetDefinition {
	return TEXT_ANIMATION_PRESETS[name];
}

export function getTextAnimationPresetPaths(
	name: TextAnimationPresetName,
): TextAnimationPropertyPath[] {
	return [...TEXT_ANIMATION_PRESETS[name].paths];
}

export function buildTextAnimationPresetKeyframes({
	name,
	phase,
	durationSeconds,
	elementDurationSeconds,
	canvasWidth,
	canvasHeight,
}: {
	name: TextAnimationPresetName;
	phase: TextAnimationPhase;
	durationSeconds: number;
	elementDurationSeconds: number;
	canvasWidth: number;
	canvasHeight: number;
}): TextAnimationKeyframes {
	const definition = TEXT_ANIMATION_PRESETS[name];
	const safeDuration = clamp({
		value: durationSeconds,
		min: 0,
		max: MAX_TEXT_ANIMATION_DURATION_SECONDS,
	});
	return definition.build({
		phase,
		durationSeconds: safeDuration,
		elementDurationSeconds,
		canvasWidth,
		canvasHeight,
	});
}

function compactAnimations(
	animations: ElementAnimations,
): ElementAnimations | undefined {
	const entries = Object.entries(animations).filter(([, data]) => data != null);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function removeAnimationPaths({
	animations,
	paths,
}: {
	animations: ElementAnimations | undefined;
	paths: readonly string[];
}): ElementAnimations | undefined {
	if (!animations) {
		return undefined;
	}
	const next = { ...animations };
	for (const path of paths) {
		delete next[path];
	}
	return compactAnimations(next);
}

export function mergePresetAnimations({
	animations,
	removePaths,
	presetAnimations,
}: {
	animations: ElementAnimations | undefined;
	removePaths: readonly string[];
	presetAnimations: ElementAnimations | undefined;
}): ElementAnimations | undefined {
	const next: ElementAnimations = { ...(animations ?? {}) };
	for (const path of removePaths) {
		delete next[path];
	}
	for (const [path, data] of Object.entries(presetAnimations ?? {})) {
		if (data != null) {
			next[path] = data;
		}
	}
	return compactAnimations(next);
}
