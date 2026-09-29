"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useEditor } from "@/editor/use-editor";
import type { EditorCore } from "@/core";
import {
	buildEffectParamPath,
	getKeyframeAtTime,
	hasKeyframesForPath,
	resolveAnimationPathValueAtTime,
	upsertPathKeyframe,
} from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import {
	coerceParamValue,
	getParamChannelLayout,
	type ParamDefinition,
	type ParamValue,
} from "@/params";
import { buildDefaultParamValues } from "@/params/registry";
import { effectsRegistry } from "@/effects";
import type { Effect } from "@/effects/types";
import type { EffectElement, VisualElement } from "@/timeline";
import {
	Section,
	SectionContent,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";
import {
	ADJUST_HSL_BANDS,
	ADJUST_CURVE_CHANNELS,
	ADJUST_CURVE_INTERIOR_POINTS,
	type AdjustCurveChannel,
} from "@/effects/definitions/adjust";

const ADJUST_TYPE = "adjust";

const BASIC_KEYS = [
	"exposure",
	"contrast",
	"saturation",
	"temperature",
	"tint",
	"highlights",
	"shadows",
] as const;

function capitalizeBand(band: string): string {
	return band[0].toUpperCase() + band.slice(1);
}

function isAdjustEffect(effect: Effect): boolean {
	return effect.type === ADJUST_TYPE;
}

function updateEffectParam({
	effects,
	effectId,
	key,
	value,
}: {
	effects: Effect[];
	effectId: string;
	key: string;
	value: ParamValue;
}): Effect[] {
	return effects.map((effect) =>
		effect.id === effectId
			? { ...effect, params: { ...effect.params, [key]: value } }
			: effect,
	);
}

function ensureClipAdjustEffect({
	editor,
	trackId,
	elementId,
	effects,
}: {
	editor: EditorCore;
	trackId: string;
	elementId: string;
	effects: Effect[];
}): { effectId: string; effects: Effect[] } {
	const existing = effects.find(isAdjustEffect);
	if (existing) {
		return { effectId: existing.id, effects };
	}
	const effectId = editor.timeline.addClipEffect({
		trackId,
		elementId,
		effectType: ADJUST_TYPE,
	});
	const definition = effectsRegistry.get(ADJUST_TYPE);
	const params = buildDefaultParamValues(definition.params);
	return {
		effectId,
		effects: [...effects, { id: effectId, type: ADJUST_TYPE, params, enabled: true }],
	};
}

function useClipAdjustParam({
	param,
	trackId,
	element,
	animations,
	localTime,
	isPlayheadWithinRange,
	effectId,
	effects,
}: {
	param: ParamDefinition;
	trackId: string;
	element: VisualElement;
	animations: ElementAnimations | undefined;
	localTime: ReturnType<typeof useElementPlayhead>["localTime"];
	isPlayheadWithinRange: boolean;
	effectId: string | null;
	effects: Effect[];
}) {
	const editor = useEditor();
	const baseValue =
		effectId === null
			? param.default
			: (effects.find((effect) => effect.id === effectId)?.params[param.key] ??
				param.default);
	const propertyPath =
		effectId === null
			? null
			: buildEffectParamPath({ effectId, paramKey: param.key });

	const hasAnimatedKeyframes = propertyPath
		? hasKeyframesForPath({ animations, propertyPath })
		: false;
	const keyframeAtTime =
		propertyPath && isPlayheadWithinRange
			? getKeyframeAtTime({ animations, propertyPath, time: localTime })
			: null;
	const isKeyframedAtTime = keyframeAtTime !== null;
	const shouldUseAnimatedChannel = hasAnimatedKeyframes && isPlayheadWithinRange;

	const resolvedValue = propertyPath
		? resolveAnimationPathValueAtTime({
				animations,
				propertyPath,
				localTime,
				fallbackValue: baseValue,
			})
		: baseValue;

	const onPreview = (value: ParamValue) => {
		const ensured =
			effectId === null
				? ensureClipAdjustEffect({
						editor,
						trackId,
						elementId: element.id,
						effects,
					})
				: { effectId, effects };
		const path = buildEffectParamPath({
			effectId: ensured.effectId,
			paramKey: param.key,
		});

		if (shouldUseAnimatedChannel) {
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							animations: upsertPathKeyframe({
								animations,
								propertyPath: path,
								time: localTime,
								value,
								channelLayout: getParamChannelLayout({ param }),
								coerceValue: ({ value: next }) =>
									coerceParamValue({ param, value: next }),
							}),
						},
					},
				],
			});
			return;
		}

		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						effects: updateEffectParam({
							effects: ensured.effects,
							effectId: ensured.effectId,
							key: param.key,
							value,
						}),
					},
				},
			],
		});
	};

	const toggleKeyframe = () => {
		if (!isPlayheadWithinRange) {
			return;
		}
		const ensured =
			effectId === null
				? ensureClipAdjustEffect({
						editor,
						trackId,
						elementId: element.id,
						effects,
					})
				: { effectId, effects };
		const path = buildEffectParamPath({
			effectId: ensured.effectId,
			paramKey: param.key,
		});

		if (keyframeAtTime) {
			editor.timeline.removeKeyframes({
				keyframes: [
					{
						trackId,
						elementId: element.id,
						propertyPath: path,
						keyframeId: keyframeAtTime.id,
					},
				],
			});
			return;
		}

		editor.timeline.upsertKeyframes({
			keyframes: [
				{
					trackId,
					elementId: element.id,
					propertyPath: path,
					time: localTime,
					value: resolvedValue,
				},
			],
		});
	};

	return {
		resolvedValue,
		onPreview,
		onCommit: () => editor.timeline.commitPreview(),
		keyframe: {
			isActive: isKeyframedAtTime,
			isDisabled: !isPlayheadWithinRange,
			onToggle: toggleKeyframe,
		},
	};
}

function ClipAdjustField({
	param,
	trackId,
	element,
	animations,
	localTime,
	isPlayheadWithinRange,
	effectId,
	effects,
}: {
	param: ParamDefinition;
	trackId: string;
	element: VisualElement;
	animations: ElementAnimations | undefined;
	localTime: ReturnType<typeof useElementPlayhead>["localTime"];
	isPlayheadWithinRange: boolean;
	effectId: string | null;
	effects: Effect[];
}) {
	const field = useClipAdjustParam({
		param,
		trackId,
		element,
		animations,
		localTime,
		isPlayheadWithinRange,
		effectId,
		effects,
	});
	return (
		<PropertyParamField
			param={param}
			value={field.resolvedValue}
			onPreview={field.onPreview}
			onCommit={field.onCommit}
			keyframe={field.keyframe}
		/>
	);
}

function StandaloneAdjustField({
	param,
	element,
	trackId,
}: {
	param: ParamDefinition;
	element: EffectElement;
	trackId: string;
}) {
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const value = renderElement.params[param.key] ?? param.default;
	return (
		<PropertyParamField
			param={param}
			value={value}
			onPreview={(next) =>
				previewUpdates({ params: { ...renderElement.params, [param.key]: next } })
			}
			onCommit={commit}
		/>
	);
}

type AdjustPoint = { x: number; y: number };

type ToneCurveEditorProps = {
	points: { p1: AdjustPoint; p2: AdjustPoint };
	onChange: (points: { p1: AdjustPoint; p2: AdjustPoint }) => void;
	onCommit: (points: { p1: AdjustPoint; p2: AdjustPoint }) => void;
};

const CURVE_WIDTH = 200;
const CURVE_HEIGHT = 120;
const CURVE_PADDING = 14;
const SVG_WIDTH = CURVE_WIDTH + CURVE_PADDING * 2;
const SVG_HEIGHT = CURVE_HEIGHT + CURVE_PADDING * 2;
const POINT_RADIUS = 5;

function toCurveX(value: number): number {
	return CURVE_PADDING + value * CURVE_WIDTH;
}

function toCurveY(value: number): number {
	return CURVE_PADDING + (1 - value) * CURVE_HEIGHT;
}

function fromCurveX(svgX: number): number {
	return Math.min(1, Math.max(0, (svgX - CURVE_PADDING) / CURVE_WIDTH));
}

function fromCurveY(svgY: number): number {
	return Math.min(1, Math.max(0, 1 - (svgY - CURVE_PADDING) / CURVE_HEIGHT));
}

function ToneCurveEditor({ points, onChange, onCommit }: ToneCurveEditorProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [active, setActive] = useState<"p1" | "p2" | null>(null);
	const latestRef = useRef(points);
	latestRef.current = points;

	const getPosition = (event: PointerEvent) => {
		const svg = svgRef.current;
		if (!svg) return { x: 0, y: 0 };
		const rect = svg.getBoundingClientRect();
		return {
			x: (event.clientX - rect.left) * (SVG_WIDTH / rect.width),
			y: (event.clientY - rect.top) * (SVG_HEIGHT / rect.height),
		};
	};

	const onPointerDown = (which: "p1" | "p2") => (event: PointerEvent<SVGCircleElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setActive(which);
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
		if (!active) return;
		const pos = getPosition(event);
		const point = {
			x: fromCurveX(pos.x),
			y: fromCurveY(pos.y),
		};
		const next =
			active === "p1"
				? { p1: point, p2: latestRef.current.p2 }
				: { p1: latestRef.current.p1, p2: point };
		latestRef.current = next;
		onChange(next);
	};

	const onPointerUp = () => {
		if (!active) return;
		setActive(null);
		onCommit(latestRef.current);
	};

	const sorted = [
		{ x: 0, y: 0 },
		{ x: points.p1.x, y: points.p1.y },
		{ x: points.p2.x, y: points.p2.y },
		{ x: 1, y: 1 },
	].sort((a, b) => a.x - b.x);
	const path = sorted
		.map((p, i) => `${i === 0 ? "M" : "L"}${toCurveX(p.x)},${toCurveY(p.y)}`)
		.join(" ");

	return (
		<svg
			ref={svgRef}
			viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
			className="bg-foreground/3 w-full cursor-crosshair select-none rounded-md"
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
		>
			<title>Curve editor</title>
			<line
				x1={toCurveX(0)}
				y1={toCurveY(0)}
				x2={toCurveX(1)}
				y2={toCurveY(1)}
				className="stroke-foreground/8"
				strokeWidth={1}
				strokeDasharray="3 3"
			/>
			<path d={path} fill="none" className="stroke-primary" strokeWidth={2} strokeLinecap="round" />
			<circle cx={toCurveX(0)} cy={toCurveY(0)} r={2} className="fill-foreground/20" />
			<circle cx={toCurveX(1)} cy={toCurveY(1)} r={2} className="fill-foreground/20" />
			<circle
				cx={toCurveX(points.p1.x)}
				cy={toCurveY(points.p1.y)}
				r={POINT_RADIUS}
				className={cn("fill-primary cursor-grab", active === "p1" && "cursor-grabbing")}
				onPointerDown={onPointerDown("p1")}
			/>
			<circle
				cx={toCurveX(points.p2.x)}
				cy={toCurveY(points.p2.y)}
				r={POINT_RADIUS}
				className={cn("fill-primary cursor-grab", active === "p2" && "cursor-grabbing")}
				onPointerDown={onPointerDown("p2")}
			/>
		</svg>
	);
}

function AdjustBody({
	definition,
	readValue,
	renderField,
	onPreviewCurve,
	onCommitCurve,
}: {
	definition: ReturnType<typeof effectsRegistry.get>;
	readValue: (key: string) => number;
	renderField: (param: ParamDefinition) => ReactNode;
	onPreviewCurve: (channel: AdjustCurveChannel, points: { p1: AdjustPoint; p2: AdjustPoint }) => void;
	onCommitCurve: () => void;
}) {
	const basicParams = definition.params.filter((p) =>
		(BASIC_KEYS as readonly string[]).includes(p.key),
	);
	const hslParams = definition.params.filter((p) => p.key.startsWith("hsl."));

	const curvePoint = (channel: AdjustCurveChannel, point: number, axis: "x" | "y"): number =>
		readValue(`curve.${channel}.${point}.${axis}`);

	const curves = ADJUST_CURVE_CHANNELS.map((channel) => ({
		channel,
		points: {
			p1: {
				x: curvePoint(channel, ADJUST_CURVE_INTERIOR_POINTS[0], "x"),
				y: curvePoint(channel, ADJUST_CURVE_INTERIOR_POINTS[0], "y"),
			},
			p2: {
				x: curvePoint(channel, ADJUST_CURVE_INTERIOR_POINTS[1], "x"),
				y: curvePoint(channel, ADJUST_CURVE_INTERIOR_POINTS[1], "y"),
			},
		},
	}));

	return (
		<>
			<Section collapsible defaultOpen sectionKey="adjust:basic">
				<SectionHeader>
					<SectionTitle>Basic</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>{basicParams.map((param) => (
						<div key={param.key}>{renderField(param)}</div>
					))}</SectionFields>
				</SectionContent>
			</Section>

			<Section collapsible defaultOpen sectionKey="adjust:hsl" showTopBorder>
				<SectionHeader>
					<SectionTitle>HSL</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						{ADJUST_HSL_BANDS.map((band) => {
							const bandParams = hslParams.filter((p) =>
								p.key.startsWith(`hsl.${band}.`),
							);
							return (
								<div key={band} className="flex flex-col gap-3.5">
									<div className="text-sm font-medium text-muted-foreground">
										{capitalizeBand(band)}
									</div>
									{bandParams.map((param) => (
										<div key={param.key}>{renderField(param)}</div>
									))}
								</div>
							);
						})}
					</SectionFields>
				</SectionContent>
			</Section>

			<Section collapsible defaultOpen sectionKey="adjust:curves" showTopBorder>
				<SectionHeader>
					<SectionTitle>Curves</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						{curves.map(({ channel, points }) => (
							<div key={channel} className="flex flex-col gap-2">
								<div className="text-sm font-medium text-muted-foreground">
									{capitalizeBand(channel)}
								</div>
								<ToneCurveEditor
									points={points}
									onChange={(next) => onPreviewCurve(channel, next)}
									onCommit={onCommitCurve}
								/>
							</div>
						))}
					</SectionFields>
				</SectionContent>
			</Section>
		</>
	);
}

export function AdjustTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const editor = useEditor();
	const { renderElement } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});

	const liveElement = renderElement as VisualElement;
	const effects = liveElement.effects ?? [];
	const adjustEffect = effects.find(isAdjustEffect) ?? null;
	const effectId = adjustEffect?.id ?? null;
	const definition = effectsRegistry.get(ADJUST_TYPE);

	const readValue = (key: string): number => {
		const value = adjustEffect?.params[key] ?? definition.params.find((p) => p.key === key)?.default ?? 0;
		return typeof value === "number" ? value : Number(value);
	};

	const onPreviewCurve = (
		channel: AdjustCurveChannel,
		points: { p1: AdjustPoint; p2: AdjustPoint },
	) => {
		const ensured =
			effectId === null
				? ensureClipAdjustEffect({
						editor,
						trackId,
						elementId: element.id,
						effects,
					})
				: { effectId, effects };
		let nextEffects = ensured.effects;
		for (const point of ADJUST_CURVE_INTERIOR_POINTS) {
			const pt = point === 1 ? points.p1 : points.p2;
			nextEffects = updateEffectParam({
				effects: nextEffects,
				effectId: ensured.effectId,
				key: `curve.${channel}.${point}.x`,
				value: pt.x,
			});
			nextEffects = updateEffectParam({
				effects: nextEffects,
				effectId: ensured.effectId,
				key: `curve.${channel}.${point}.y`,
				value: pt.y,
			});
		}
		editor.timeline.previewElements({
			updates: [{ trackId, elementId: element.id, updates: { effects: nextEffects } }],
		});
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-11 shrink-0 items-center justify-between border-b px-3.5">
				<SectionTitle>Adjust</SectionTitle>
				{adjustEffect && (
					<Button
						variant="ghost"
						size="icon"
						aria-label="Reset adjust"
						onClick={() =>
							editor.timeline.removeClipEffect({
								trackId,
								elementId: element.id,
								effectId: adjustEffect.id,
							})
						}
					>
						<HugeiconsIcon icon={RefreshIcon} />
					</Button>
				)}
			</div>
			<div className="flex-1 overflow-y-auto">
				<AdjustBody
					definition={definition}
					readValue={readValue}
					renderField={(param) => (
						<ClipAdjustField
							param={param}
							trackId={trackId}
							element={liveElement}
							animations={liveElement.animations}
							localTime={localTime}
							isPlayheadWithinRange={isPlayheadWithinElementRange}
							effectId={effectId}
							effects={effects}
						/>
					)}
					onPreviewCurve={onPreviewCurve}
					onCommitCurve={() => editor.timeline.commitPreview()}
				/>
			</div>
		</div>
	);
}

export function StandaloneAdjustTab({
	element,
	trackId,
}: {
	element: EffectElement;
	trackId: string;
}) {
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const definition = effectsRegistry.get(ADJUST_TYPE);
	const liveParams = renderElement.params;

	const readValue = (key: string): number => {
		const value = liveParams[key] ?? definition.params.find((p) => p.key === key)?.default ?? 0;
		return typeof value === "number" ? value : Number(value);
	};

	const onPreviewCurve = (
		channel: AdjustCurveChannel,
		points: { p1: AdjustPoint; p2: AdjustPoint },
	) => {
		const nextParams = { ...liveParams };
		for (const point of ADJUST_CURVE_INTERIOR_POINTS) {
			const pt = point === 1 ? points.p1 : points.p2;
			nextParams[`curve.${channel}.${point}.x`] = pt.x;
			nextParams[`curve.${channel}.${point}.y`] = pt.y;
		}
		previewUpdates({ params: nextParams });
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-11 shrink-0 items-center border-b px-3.5">
				<SectionTitle>Adjust</SectionTitle>
			</div>
			<div className="flex-1 overflow-y-auto">
				<AdjustBody
					definition={definition}
					readValue={readValue}
					renderField={(param) => (
						<StandaloneAdjustField
							param={param}
							element={element}
							trackId={trackId}
						/>
					)}
					onPreviewCurve={onPreviewCurve}
					onCommitCurve={commit}
				/>
			</div>
		</div>
	);
}

export { isAdjustEffect };
