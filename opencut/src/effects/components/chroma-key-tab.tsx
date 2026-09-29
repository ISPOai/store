"use client";

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
import type { ImageElement, VideoElement, VisualElement } from "@/timeline";
import {
	Section,
	SectionContent,
	SectionFields,
} from "@/components/section";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { CHROMA_KEY_TYPE } from "@/effects/definitions/chroma-key";

function isChromaKeyEffect(effect: Effect): boolean {
	return effect.type === CHROMA_KEY_TYPE;
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

function updateEffectEnabled({
	effects,
	effectId,
	enabled,
}: {
	effects: Effect[];
	effectId: string;
	enabled: boolean;
}): Effect[] {
	return effects.map((effect) =>
		effect.id === effectId ? { ...effect, enabled } : effect,
	);
}

function ensureClipChromaKeyEffect({
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
	const existing = effects.find(isChromaKeyEffect);
	if (existing) {
		return { effectId: existing.id, effects };
	}
	const effectId = editor.timeline.addClipEffect({
		trackId,
		elementId,
		effectType: CHROMA_KEY_TYPE,
	});
	const definition = effectsRegistry.get(CHROMA_KEY_TYPE);
	const params = buildDefaultParamValues(definition.params);
	return {
		effectId,
		effects: [...effects, { id: effectId, type: CHROMA_KEY_TYPE, params, enabled: true }],
	};
}

function useClipChromaKeyParam({
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
				? ensureClipChromaKeyEffect({
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
				? ensureClipChromaKeyEffect({
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

function ChromaKeyField({
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
	const field = useClipChromaKeyParam({
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

const CHROMA_KEY_PARAM_ORDER = [
	"keyColor",
	"tolerance",
	"softness",
	"spill",
	"feather",
] as const;

export function ChromaKeyTab({
	element,
	trackId,
}: {
	element: VideoElement | ImageElement;
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
	const chromaKeyEffect = effects.find(isChromaKeyEffect) ?? null;
	const effectId = chromaKeyEffect?.id ?? null;
	const definition = effectsRegistry.get(CHROMA_KEY_TYPE);

	const onToggleEnabled = (enabled: boolean) => {
		if (!chromaKeyEffect) {
			if (!enabled) {
				return;
			}
			editor.timeline.addClipEffect({
				trackId,
				elementId: element.id,
				effectType: CHROMA_KEY_TYPE,
			});
			return;
		}
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						effects: updateEffectEnabled({
							effects,
							effectId: chromaKeyEffect.id,
							enabled,
						}),
					},
				},
			],
		});
		editor.timeline.commitPreview();
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-11 shrink-0 items-center justify-between border-b px-3.5">
				<span className="text-sm font-medium">Chroma Key</span>
				{chromaKeyEffect && (
					<Button
						variant="ghost"
						size="icon"
						aria-label="Remove chroma key"
						onClick={() =>
							editor.timeline.removeClipEffect({
								trackId,
								elementId: element.id,
								effectId: chromaKeyEffect.id,
							})
						}
					>
						<HugeiconsIcon icon={RefreshIcon} />
					</Button>
				)}
			</div>
			<div className="flex-1 overflow-y-auto">
				<Section>
					<SectionContent>
						<div className="flex items-center justify-between">
							<span className="text-sm">Enable</span>
							<Switch
								checked={chromaKeyEffect ? chromaKeyEffect.enabled : false}
								onCheckedChange={onToggleEnabled}
							/>
						</div>
						<SectionFields>
							{CHROMA_KEY_PARAM_ORDER.map((key) => {
								const param = definition.params.find(
									(candidate) => candidate.key === key,
								);
								if (!param) {
									return null;
								}
								return (
									<ChromaKeyField
										key={param.key}
										param={param}
										trackId={trackId}
										element={liveElement}
										animations={liveElement.animations}
										localTime={localTime}
										isPlayheadWithinRange={isPlayheadWithinElementRange}
										effectId={effectId}
										effects={effects}
									/>
								);
							})}
						</SectionFields>
					</SectionContent>
				</Section>
			</div>
		</div>
	);
}
