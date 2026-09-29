"use client";

import { useEditor } from "@/editor/use-editor";
import type { EditorCore } from "@/core";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import {
	buildEffectParamPath,
	getKeyframeAtTime,
	hasKeyframesForPath,
	resolveAnimationPathValueAtTime,
	upsertPathKeyframe,
} from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import {
	coerceParamValue,
	getParamChannelLayout,
	type ParamDefinition,
	type ParamValue,
} from "@/params";
import { buildDefaultParamValues } from "@/params/registry";
import type { Effect } from "@/effects/types";
import type { VisualElement } from "@/timeline";
import {
	filterEffectDefinition,
	FILTER_EFFECT_TYPE,
	FILTER_INTENSITY_PARAM,
} from "@/effects/definitions/filter";
import { filterRegistry } from "@/effects/filters/registry";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon } from "@hugeicons/core-free-icons";

function ensureClipFilterEffect({
	editor,
	trackId,
	elementId,
	effects,
	filterId,
}: {
	editor: EditorCore;
	trackId: string;
	elementId: string;
	effects: Effect[];
	filterId: string;
}): { effectId: string; effects: Effect[] } {
	const existing = effects.find((effect) => effect.type === FILTER_EFFECT_TYPE);
	if (existing) {
		return { effectId: existing.id, effects };
	}
	const effectId = editor.timeline.addClipEffect({
		trackId,
		elementId,
		effectType: FILTER_EFFECT_TYPE,
		params: { filterId, intensity: 1 },
	});
	const params = {
		...buildDefaultParamValues(filterEffectDefinition.params),
		filterId,
		intensity: 1,
	};
	return {
		effectId,
		effects: [...effects, { id: effectId, type: FILTER_EFFECT_TYPE, params, enabled: true }],
	};
}

function useClipFilterIntensity({
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
		effectId === null ? null : buildEffectParamPath({ effectId, paramKey: param.key });

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
				? ensureClipFilterEffect({
						editor,
						trackId,
						elementId: element.id,
						effects,
						filterId: "",
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
						effects: ensured.effects.map((effect) =>
							effect.id === ensured.effectId
								? { ...effect, params: { ...effect.params, [param.key]: value } }
								: effect,
						),
					},
				},
			],
		});
	};

	const toggleKeyframe = () => {
		if (!isPlayheadWithinRange) return;
		const ensured =
			effectId === null
				? ensureClipFilterEffect({
						editor,
						trackId,
						elementId: element.id,
						effects,
						filterId: "",
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

export function FilterTab({
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
	const filterEffect = effects.find((effect) => effect.type === FILTER_EFFECT_TYPE) ?? null;
	const effectId = filterEffect?.id ?? null;
	const filterId = typeof filterEffect?.params.filterId === "string" ? filterEffect.params.filterId : "";
	const availableFilters = filterRegistry.list();

	const intensityField = useClipFilterIntensity({
		param: FILTER_INTENSITY_PARAM,
		trackId,
		element: liveElement,
		animations: liveElement.animations,
		localTime,
		isPlayheadWithinRange: isPlayheadWithinElementRange,
		effectId,
		effects,
	});

	const setFilterId = (nextId: string) => {
		if (nextId === "none" || nextId === "") {
			if (filterEffect) {
				editor.timeline.removeClipEffect({
					trackId,
					elementId: element.id,
					effectId: filterEffect.id,
				});
			}
			return;
		}

		const ensured =
			effectId === null
				? ensureClipFilterEffect({
						editor,
						trackId,
						elementId: element.id,
						effects,
						filterId: nextId,
					})
				: { effectId, effects };
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						effects: ensured.effects.map((effect) =>
							effect.id === ensured.effectId
								? { ...effect, params: { ...effect.params, filterId: nextId } }
								: effect,
						),
					},
				},
			],
		});
		editor.timeline.commitPreview();
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-11 shrink-0 items-center justify-between border-b px-3.5">
				<SectionTitle>Filter</SectionTitle>
				{filterEffect && (
					<Button
						variant="ghost"
						size="icon"
						aria-label="Remove filter"
						onClick={() =>
							editor.timeline.removeClipEffect({
								trackId,
								elementId: element.id,
								effectId: filterEffect.id,
							})
						}
					>
						<HugeiconsIcon icon={RefreshIcon} />
					</Button>
				)}
			</div>
			<div className="flex-1 overflow-y-auto p-3.5">
				<Section collapsible defaultOpen sectionKey="filter:picker">
					<SectionHeader>
						<SectionTitle>Preset</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<Select value={filterId || "none"} onValueChange={setFilterId}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="None" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">None</SelectItem>
								{availableFilters.map((filter) => (
									<SelectItem key={filter.id} value={filter.id}>
										{filter.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</SectionContent>
				</Section>

				<Section collapsible defaultOpen sectionKey="filter:intensity" showTopBorder>
					<SectionHeader>
						<SectionTitle>Intensity</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<PropertyParamField
							param={FILTER_INTENSITY_PARAM}
							value={intensityField.resolvedValue}
							onPreview={intensityField.onPreview}
							onCommit={intensityField.onCommit}
							keyframe={intensityField.keyframe}
						/>
					</SectionContent>
				</Section>
			</div>
		</div>
	);
}
