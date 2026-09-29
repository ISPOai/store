import { mediaTimeToSeconds, roundMediaTime } from "@/wasm";
import { getElementLocalTime } from "@/animation";
import { resolveEffectParamsAtTime } from "@/animation/effect-param-channel";
import {
	buildGaussianBlurPasses,
	intensityToSigma,
} from "@/effects/definitions/blur";
import { effectsRegistry, resolveEffectPasses } from "@/effects";
import type { Effect, EffectPass } from "@/effects/types";
import { getSourceTimeAtClipTime } from "@/retime";
import {
	DEFAULT_GRAPHIC_SOURCE_SIZE,
	resolveGraphicElementParamsAtTime,
} from "@/graphics";
import {
	buildTextBackgroundFromElement,
	buildTextEffectsFromElement,
	getTextMeasurementContext,
	measureTextElement,
} from "@/text/measure-element";
import {
	resolveColorAtTime,
	resolveNumberAtTime,
	resolveOpacityAtTime,
} from "@/animation/values";
import { resolveTransformAtTime } from "@/rendering/animation-values";
import { buildTransformFromParams, type Transform } from "@/rendering";
import { videoCache } from "@/services/video-cache/service";
import { transitionsRegistry } from "@/transitions";
import { imageFitScale, cropSourceDimensions } from "./image-fit";
import type { CanvasRenderer } from "./canvas-renderer";
import type { AnyBaseNode } from "./nodes/base-node";
import {
	BlurBackgroundNode,
	type BackdropSource,
	type ResolvedBlurBackgroundNodeState,
} from "./nodes/blur-background-node";
import {
	EffectLayerNode,
	type ResolvedEffectLayerNodeState,
} from "./nodes/effect-layer-node";
import {
	GraphicNode,
	type ResolvedGraphicNodeState,
} from "./nodes/graphic-node";
import { ImageNode, loadImageSource } from "./nodes/image-node";
import { StickerNode, loadStickerSource } from "./nodes/sticker-node";
import { TextNode, type ResolvedTextNodeState } from "./nodes/text-node";
import { VideoNode } from "./nodes/video-node";
import {
	TransitionNode,
	type ResolvedTransitionNodeState,
	type TransitionSource,
} from "./nodes/transition-node";
import type {
	ResolvedVisualNodeState,
	ResolvedVisualSourceNodeState,
	VisualNodeParams,
} from "./nodes/visual-node";

type ResolveContext = {
	renderer: CanvasRenderer;
	time: number;
};

export async function resolveRenderTree({
	node,
	renderer,
	time,
}: {
	node: AnyBaseNode;
	renderer: CanvasRenderer;
	time: number;
}): Promise<void> {
	await resolveNode({
		node,
		context: {
			renderer,
			time,
		},
	});
}

async function resolveNode({
	node,
	context,
}: {
	node: AnyBaseNode;
	context: ResolveContext;
}): Promise<void> {
	if (node instanceof VideoNode) {
		node.resolved = await resolveVideoNode({ node, context });
	} else if (node instanceof ImageNode) {
		node.resolved = await resolveImageNode({ node, context });
	} else if (node instanceof StickerNode) {
		node.resolved = await resolveStickerNode({ node, context });
	} else if (node instanceof GraphicNode) {
		node.resolved = resolveGraphicNode({ node, context });
	} else if (node instanceof TextNode) {
		node.resolved = resolveTextNode({ node, context });
	} else if (node instanceof BlurBackgroundNode) {
		node.resolved = await resolveBlurBackgroundNode({ node, context });
	} else if (node instanceof EffectLayerNode) {
		node.resolved = resolveEffectLayerNode({ node, context });
	} else if (node instanceof TransitionNode) {
		node.resolved = await resolveTransitionNode({ node, context });
	}

	await Promise.all(
		node.children.map((child) => resolveNode({ node: child, context })),
	);
}

function resolveEffectPassGroups({
	effects,
	animations,
	localTime,
	width,
	height,
}: {
	effects: Effect[] | undefined;
	animations: VisualNodeParams["animations"];
	localTime: number;
	width: number;
	height: number;
}): EffectPass[][] {
	return (effects ?? [])
		.filter((effect) => effect.enabled)
		.map((effect) => {
			const resolvedParams = resolveEffectParamsAtTime({
				effectId: effect.id,
				params: effect.params,
				animations,
				localTime,
			});
			const definition = effectsRegistry.get(effect.type);
			return resolveEffectPasses({
				definition,
				effectParams: resolvedParams,
				width,
				height,
				time: localTime,
			});
		});
}

function resolveVisualState({
	params,
	context,
	sourceWidth,
	sourceHeight,
	fit,
	crop,
}: {
	params: VisualNodeParams;
	context: ResolveContext;
	sourceWidth: number;
	sourceHeight: number;
	fit?: "cover" | "contain";
	crop?: VisualNodeParams["crop"];
}): ResolvedVisualNodeState | null {
	const clipTime = context.time - params.timeOffset;
	if (clipTime < 0 || clipTime >= params.duration) {
		return null;
	}

	const skipHead = params.skipHead ?? 0;
	const skipTail = params.skipTail ?? 0;
	if (clipTime < skipHead || clipTime >= params.duration - skipTail) {
		return null;
	}

	const localTime = getElementLocalTime({
		timelineTime: context.time,
		elementStartTime: params.timeOffset,
		elementDuration: params.duration,
	});
	const transform = resolveTransformAtTime({
		baseTransform: params.transform,
		animations: params.animations,
		localTime,
	});
	const opacity = resolveOpacityAtTime({
		baseOpacity: params.opacity,
		animations: params.animations,
		localTime,
	});
	const fitSource = crop
		? cropSourceDimensions({ sourceWidth, sourceHeight, crop })
		: { width: sourceWidth, height: sourceHeight };
	const containScale = imageFitScale({
		canvasWidth: context.renderer.width,
		canvasHeight: context.renderer.height,
		sourceWidth: fitSource.width,
		sourceHeight: fitSource.height,
		fit,
	});
	const effectWidth = Math.round(
		Math.abs(fitSource.width * containScale * transform.scaleX),
	);
	const effectHeight = Math.round(
		Math.abs(fitSource.height * containScale * transform.scaleY),
	);

	return {
		localTime,
		transform,
		opacity,
		effectPasses: resolveEffectPassGroups({
			effects: params.effects,
			animations: params.animations,
			localTime,
			width: effectWidth,
			height: effectHeight,
		}),
	};
}

async function resolveVideoNode({
	node,
	context,
}: {
	node: VideoNode;
	context: ResolveContext;
}): Promise<ResolvedVisualSourceNodeState | null> {
	const clipTime = context.time - node.params.timeOffset;
	if (clipTime < 0 || clipTime >= node.params.duration) {
		return null;
	}

	const sourceTimeTicks =
		node.params.trimStart +
		getSourceTimeAtClipTime({
			clipTime,
			retime: node.params.retime,
			clipDuration: node.params.duration,
		});
	const frame = await videoCache.getFrameAt({
		mediaId: node.params.mediaId,
		file: node.params.file,
		time: mediaTimeToSeconds({ time: roundMediaTime({ time: sourceTimeTicks }) }),
	});
	if (!frame) {
		return null;
	}

	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth: frame.canvas.width,
		sourceHeight: frame.canvas.height,
		crop: node.params.crop,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		source: frame.canvas,
		sourceWidth: frame.canvas.width,
		sourceHeight: frame.canvas.height,
	};
}

async function resolveImageNode({
	node,
	context,
}: {
	node: ImageNode;
	context: ResolveContext;
}): Promise<ResolvedVisualSourceNodeState | null> {
	const source = await loadImageSource({
		url: node.params.url,
		maxSourceSize: node.params.maxSourceSize,
	});
	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth: source.width,
		sourceHeight: source.height,
		fit: node.params.fit,
		crop: node.params.crop,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		source: source.source,
		sourceWidth: source.width,
		sourceHeight: source.height,
	};
}

async function resolveStickerNode({
	node,
	context,
}: {
	node: StickerNode;
	context: ResolveContext;
}): Promise<ResolvedVisualSourceNodeState | null> {
	const source = await loadStickerSource({ stickerId: node.params.stickerId });
	const sourceWidth = node.params.intrinsicWidth ?? source.width;
	const sourceHeight = node.params.intrinsicHeight ?? source.height;
	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth,
		sourceHeight,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		source: source.source,
		sourceWidth,
		sourceHeight,
	};
}

function resolveGraphicNode({
	node,
	context,
}: {
	node: GraphicNode;
	context: ResolveContext;
}): ResolvedGraphicNodeState | null {
	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth: DEFAULT_GRAPHIC_SOURCE_SIZE,
		sourceHeight: DEFAULT_GRAPHIC_SOURCE_SIZE,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		resolvedParams: resolveGraphicElementParamsAtTime({
			element: node.params,
			localTime: visualState.localTime,
		}),
	};
}

function resolveTextNode({
	node,
	context,
}: {
	node: TextNode;
	context: ResolveContext;
}): ResolvedTextNodeState | null {
	if (
		context.time < node.params.startTime ||
		context.time >= node.params.startTime + node.params.duration
	) {
		return null;
	}

	const localTime = getElementLocalTime({
		timelineTime: context.time,
		elementStartTime: node.params.startTime,
		elementDuration: node.params.duration,
	});
	const background = buildTextBackgroundFromElement({ element: node.params });
	const textEffects = buildTextEffectsFromElement({ element: node.params });

	return {
		transform: resolveTransformAtTime({
			baseTransform: node.params.transform,
			animations: node.params.animations,
			localTime,
		}),
		opacity: resolveOpacityAtTime({
			baseOpacity: node.params.opacity,
			animations: node.params.animations,
			localTime,
		}),
		textColor: resolveColorAtTime({
			baseColor:
				typeof node.params.params.color === "string"
					? node.params.params.color
					: "#ffffff",
			animations: node.params.animations,
			propertyPath: "color",
			localTime,
		}),
		backgroundColor: resolveColorAtTime({
			baseColor: background.color,
			animations: node.params.animations,
			propertyPath: "background.color",
			localTime,
		}),
		textEffects: {
			stroke: {
				color: resolveColorAtTime({
					baseColor: textEffects.stroke.color,
					animations: node.params.animations,
					propertyPath: "stroke.color",
					localTime,
				}),
				width: resolveNumberAtTime({
					baseValue: textEffects.stroke.width,
					animations: node.params.animations,
					propertyPath: "stroke.width",
					localTime,
				}),
			},
			shadow: {
				color: resolveColorAtTime({
					baseColor: textEffects.shadow.color,
					animations: node.params.animations,
					propertyPath: "shadow.color",
					localTime,
				}),
				x: resolveNumberAtTime({
					baseValue: textEffects.shadow.x,
					animations: node.params.animations,
					propertyPath: "shadow.x",
					localTime,
				}),
				y: resolveNumberAtTime({
					baseValue: textEffects.shadow.y,
					animations: node.params.animations,
					propertyPath: "shadow.y",
					localTime,
				}),
				blur: resolveNumberAtTime({
					baseValue: textEffects.shadow.blur,
					animations: node.params.animations,
					propertyPath: "shadow.blur",
					localTime,
				}),
			},
			glow: {
				color: resolveColorAtTime({
					baseColor: textEffects.glow.color,
					animations: node.params.animations,
					propertyPath: "glow.color",
					localTime,
				}),
				radius: resolveNumberAtTime({
					baseValue: textEffects.glow.radius,
					animations: node.params.animations,
					propertyPath: "glow.radius",
					localTime,
				}),
			},
		},
		effectPasses: resolveEffectPassGroups({
			effects: node.params.effects,
			animations: node.params.animations,
			localTime,
			width: context.renderer.width,
			height: context.renderer.height,
		}),
		measuredText: measureTextElement({
			element: node.params,
			canvasHeight: node.params.canvasHeight,
			localTime,
			ctx: getTextMeasurementContext(),
		}),
	};
}

async function resolveBlurBackgroundNode({
	node,
	context,
}: {
	node: BlurBackgroundNode;
	context: ResolveContext;
}): Promise<ResolvedBlurBackgroundNodeState | null> {
	const clipTime = context.time - node.params.timeOffset;
	if (clipTime < 0 || clipTime >= node.params.duration) {
		return null;
	}

	const backdropSource = await resolveBackdropSource({ node, clipTime });
	if (!backdropSource) {
		return null;
	}

	return {
		backdropSource,
		passes: buildGaussianBlurPasses({
			sigmaX: intensityToSigma({
				intensity: node.params.blurIntensity,
				resolution: context.renderer.width,
				reference: 1920,
			}),
			sigmaY: intensityToSigma({
				intensity: node.params.blurIntensity,
				resolution: context.renderer.height,
				reference: 1080,
			}),
		}),
	};
}

async function resolveBackdropSource({
	node,
	clipTime,
}: {
	node: BlurBackgroundNode;
	clipTime: number;
}): Promise<BackdropSource | null> {
	if (node.params.mediaType === "video") {
		const sourceTimeTicks =
			node.params.trimStart +
			getSourceTimeAtClipTime({
				clipTime,
				retime: node.params.retime,
				clipDuration: node.params.duration,
			});
		const frame = await videoCache.getFrameAt({
			mediaId: node.params.mediaId,
			file: node.params.file,
			time: mediaTimeToSeconds({ time: roundMediaTime({ time: sourceTimeTicks }) }),
		});
		if (!frame) {
			return null;
		}

		return {
			source: frame.canvas,
			width: frame.canvas.width,
			height: frame.canvas.height,
		};
	}

	const source = await loadImageSource({ url: node.params.url });
	return {
		source: source.source,
		width: source.width,
		height: source.height,
	};
}

function resolveEffectLayerNode({
	node,
	context,
}: {
	node: EffectLayerNode;
	context: ResolveContext;
}): ResolvedEffectLayerNodeState | null {
	const time = context.time;
	if (
		time < node.params.timeOffset - 1e-6 ||
		time >= node.params.timeOffset + node.params.duration + 1e-6
	) {
		return null;
	}

	const definition = effectsRegistry.get(node.params.effectType);
	const localTime = getElementLocalTime({
		timelineTime: time,
		elementStartTime: node.params.timeOffset,
		elementDuration: node.params.duration,
	});
	const passes = resolveEffectPasses({
		definition,
		effectParams: node.params.effectParams,
		width: context.renderer.width,
		height: context.renderer.height,
		time: localTime,
	});
	if (passes.length === 0) {
		return null;
	}

	return {
		passes,
	};
}

const PREVIEW_MAX_TRANSITION_IMAGE_SIZE = 2048;

type TransitionSideSample = {
	source: CanvasImageSource;
	sourceWidth: number;
	sourceHeight: number;
	transform: Transform;
};

async function resolveTransitionNode({
	node,
	context,
}: {
	node: TransitionNode;
	context: ResolveContext;
}): Promise<ResolvedTransitionNodeState | null> {
	const { transition, startTime, duration, canvasWidth, canvasHeight } =
		node.params;
	const time = context.time;
	if (time < startTime - 1e-6 || time >= startTime + duration + 1e-6) {
		return null;
	}

	const progress = Math.min(
		1,
		Math.max(0, (time - startTime) / Math.max(duration, 1)),
	);

	const outgoing = await sampleTransitionSource({
		source: node.params.outgoing,
		time,
		isPreview: node.params.isPreview,
	});
	const incoming = await sampleTransitionSource({
		source: node.params.incoming,
		time,
		isPreview: node.params.isPreview,
	});
	if (!outgoing || !incoming) {
		return null;
	}

	const composite = new OffscreenCanvas(canvasWidth, canvasHeight);
	const ctx = composite.getContext("2d");
	if (!ctx) {
		return null;
	}

	const definition = transitionsRegistry.get(transition.type);
	definition.compose({
		ctx,
		a: drawTransitionSide({
			sample: outgoing,
			width: canvasWidth,
			height: canvasHeight,
			fit:
				node.params.outgoing.element.type === "image"
					? node.params.outgoing.element.fit
					: undefined,
		}),
		b: drawTransitionSide({
			sample: incoming,
			width: canvasWidth,
			height: canvasHeight,
			fit:
				node.params.incoming.element.type === "image"
					? node.params.incoming.element.fit
					: undefined,
		}),
		progress,
		width: canvasWidth,
		height: canvasHeight,
	});

	return { composite };
}

async function sampleTransitionSource({
	source,
	time,
	isPreview,
}: {
	source: TransitionSource;
	time: number;
	isPreview?: boolean;
}): Promise<TransitionSideSample | null> {
	const { element, mediaAsset } = source;
	const clipTime = Math.min(
		Math.max(0, time - element.startTime),
		Math.max(0, element.duration - 1e-6),
	);
	const localTime = getElementLocalTime({
		timelineTime: time,
		elementStartTime: element.startTime,
		elementDuration: element.duration,
	});
	const transform = resolveTransformAtTime({
		baseTransform: buildTransformFromParams({ params: element.params }),
		animations: element.animations,
		localTime: Math.max(0, localTime),
	});

	if (element.type === "video") {
		if (!mediaAsset.file || !mediaAsset.url) {
			return null;
		}
		const sourceTimeTicks =
			element.trimStart +
			getSourceTimeAtClipTime({
				clipTime,
				retime: element.retime,
			});
		const frame = await videoCache.getFrameAt({
			mediaId: element.mediaId,
			file: mediaAsset.file,
			time: mediaTimeToSeconds({ time: roundMediaTime({ time: sourceTimeTicks }) }),
		});
		if (!frame) {
			return null;
		}
		return {
			source: frame.canvas,
			sourceWidth: frame.canvas.width,
			sourceHeight: frame.canvas.height,
			transform,
		};
	}

	if (!mediaAsset.url) {
		return null;
	}
	const loaded = await loadImageSource({
		url: mediaAsset.url,
		maxSourceSize: isPreview ? PREVIEW_MAX_TRANSITION_IMAGE_SIZE : undefined,
	});
	return {
		source: loaded.source,
		sourceWidth: loaded.width,
		sourceHeight: loaded.height,
		transform,
	};
}

function drawTransitionSide({
	sample,
	width,
	height,
	fit,
}: {
	sample: TransitionSideSample;
	width: number;
	height: number;
	fit?: "cover" | "contain";
}): OffscreenCanvas {
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return canvas;
	}

	const containScale = imageFitScale({
		canvasWidth: width,
		canvasHeight: height,
		sourceWidth: sample.sourceWidth,
		sourceHeight: sample.sourceHeight,
		fit,
	});
	const scaledWidth = sample.sourceWidth * containScale * sample.transform.scaleX;
	const scaledHeight =
		sample.sourceHeight * containScale * sample.transform.scaleY;
	const absWidth = Math.abs(scaledWidth);
	const absHeight = Math.abs(scaledHeight);
	const centerX = width / 2 + sample.transform.position.x;
	const centerY = height / 2 + sample.transform.position.y;
	const flipX = scaledWidth < 0 ? -1 : 1;
	const flipY = scaledHeight < 0 ? -1 : 1;

	ctx.save();
	ctx.translate(centerX, centerY);
	ctx.rotate((sample.transform.rotate * Math.PI) / 180);
	ctx.scale(flipX, flipY);
	ctx.translate(-centerX, -centerY);
	ctx.drawImage(
		sample.source,
		centerX - absWidth / 2,
		centerY - absHeight / 2,
		absWidth,
		absHeight,
	);
	ctx.restore();
	return canvas;
}
