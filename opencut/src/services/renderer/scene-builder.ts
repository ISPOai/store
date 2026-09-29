import type { SceneTracks, TimelineTrack } from "@/timeline";
import type { VideoElement, ImageElement } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import { RootNode } from "./nodes/root-node";
import { VideoNode } from "./nodes/video-node";
import { ImageNode } from "./nodes/image-node";
import { TextNode } from "./nodes/text-node";
import { StickerNode } from "./nodes/sticker-node";
import { GraphicNode } from "./nodes/graphic-node";
import { ColorNode } from "./nodes/color-node";
import { BlurBackgroundNode } from "./nodes/blur-background-node";
import { EffectLayerNode } from "./nodes/effect-layer-node";
import { TransitionNode } from "./nodes/transition-node";
import type { AnyBaseNode } from "./nodes/base-node";
import type { TBackground, TCanvasSize } from "@/project/types";
import { DEFAULT_BACKGROUND_BLUR_INTENSITY } from "@/background/blur";
import {
	buildTransformFromParams,
	readBlendModeFromParams,
	readOpacityFromParams,
} from "@/rendering";
import { readCropFromParams, readFlipFromParams } from "@/crop/crop";

const PREVIEW_MAX_IMAGE_SIZE = 2048;

function getVisibleSortedElements({ track }: { track: TimelineTrack }) {
	return track.elements
		.filter((element) => !("hidden" in element && element.hidden))
		.slice()
		.sort((a, b) => {
			if (a.startTime !== b.startTime) return a.startTime - b.startTime;
			return a.id.localeCompare(b.id);
		});
}

function isTransitionable(
	element: TimelineTrack["elements"][number],
): element is VideoElement | ImageElement {
	return element.type === "video" || element.type === "image";
}

function buildMediaNode({
	element,
	mediaAsset,
	isPreview,
	skipHead,
	skipTail,
}: {
	element: VideoElement | ImageElement;
	mediaAsset: MediaAsset;
	isPreview?: boolean;
	skipHead?: number;
	skipTail?: number;
}): AnyBaseNode | null {
	if (element.type === "video" && mediaAsset.type === "video") {
		if (!mediaAsset.file || !mediaAsset.url) {
			return null;
		}
		return new VideoNode({
			mediaId: mediaAsset.id,
			url: mediaAsset.url,
			file: mediaAsset.file,
			duration: element.duration,
			timeOffset: element.startTime,
			trimStart: element.trimStart,
			trimEnd: element.trimEnd,
			retime: element.retime,
			transform: buildTransformFromParams({ params: element.params }),
			animations: element.animations,
			opacity: readOpacityFromParams({ params: element.params }),
			blendMode: readBlendModeFromParams({ params: element.params }),
			effects: element.effects ?? [],
			masks: element.masks ?? [],
			crop: readCropFromParams({ params: element.params }),
			...readFlipFromParams({ params: element.params }),
			...(skipHead !== undefined ? { skipHead } : {}),
			...(skipTail !== undefined ? { skipTail } : {}),
		});
	}
	if (element.type === "image" && mediaAsset.type === "image") {
		if (!mediaAsset.url) {
			return null;
		}
		return new ImageNode({
			url: mediaAsset.url,
			fit:
				element.fit ??
				(element.production?.owner === "opencut-production" ? "cover" : "contain"),
			duration: element.duration,
			timeOffset: element.startTime,
			trimStart: element.trimStart,
			trimEnd: element.trimEnd,
			transform: buildTransformFromParams({ params: element.params }),
			animations: element.animations,
			opacity: readOpacityFromParams({ params: element.params }),
			blendMode: readBlendModeFromParams({ params: element.params }),
			effects: element.effects ?? [],
			masks: element.masks ?? [],
			crop: readCropFromParams({ params: element.params }),
			...readFlipFromParams({ params: element.params }),
			...(skipHead !== undefined ? { skipHead } : {}),
			...(skipTail !== undefined ? { skipTail } : {}),
			...(isPreview && {
				maxSourceSize: PREVIEW_MAX_IMAGE_SIZE,
			}),
		});
	}
	return null;
}

function buildTrackNodes({
	tracks,
	mediaMap,
	canvasSize,
	isPreview,
}: {
	tracks: TimelineTrack[];
	mediaMap: Map<string, MediaAsset>;
	canvasSize: TCanvasSize;
	isPreview?: boolean;
}): AnyBaseNode[] {
	const nodes: AnyBaseNode[] = [];

	for (const track of tracks) {
		const elements = getVisibleSortedElements({ track });

		for (const element of elements) {
			if (element.type === "effect") {
				nodes.push(
					new EffectLayerNode({
						effectType: element.effectType,
						effectParams: element.params,
						timeOffset: element.startTime,
						duration: element.duration,
					}),
				);
				continue;
			}

			if (element.type === "video" || element.type === "image") {
				const mediaAsset = mediaMap.get(element.mediaId);
				if (!mediaAsset) {
					continue;
				}
				const node = buildMediaNode({
					element,
					mediaAsset,
					isPreview,
				});
				if (node) {
					nodes.push(node);
				}
				continue;
			}

			if (element.type === "text") {
				nodes.push(
					new TextNode({
						...element,
						transform: buildTransformFromParams({ params: element.params }),
						opacity: readOpacityFromParams({ params: element.params }),
						blendMode: readBlendModeFromParams({ params: element.params }),
						canvasCenter: { x: canvasSize.width / 2, y: canvasSize.height / 2 },
						canvasHeight: canvasSize.height,
						textBaseline: "middle",
						effects: element.effects ?? [],
					}),
				);
			}

			if (element.type === "sticker") {
				nodes.push(
					new StickerNode({
						stickerId: element.stickerId,
						intrinsicWidth: element.intrinsicWidth,
						intrinsicHeight: element.intrinsicHeight,
						duration: element.duration,
						timeOffset: element.startTime,
						trimStart: element.trimStart,
						trimEnd: element.trimEnd,
						transform: buildTransformFromParams({ params: element.params }),
						animations: element.animations,
						opacity: readOpacityFromParams({ params: element.params }),
						blendMode: readBlendModeFromParams({ params: element.params }),
						effects: element.effects ?? [],
					}),
				);
			}

			if (element.type === "graphic") {
				nodes.push(
					new GraphicNode({
						definitionId: element.definitionId,
						params: element.params,
						duration: element.duration,
						timeOffset: element.startTime,
						trimStart: element.trimStart,
						trimEnd: element.trimEnd,
						transform: buildTransformFromParams({ params: element.params }),
						animations: element.animations,
						opacity: readOpacityFromParams({ params: element.params }),
						blendMode: readBlendModeFromParams({ params: element.params }),
						effects: element.effects ?? [],
						masks: element.masks ?? [],
					}),
				);
			}
		}
	}

	return nodes;
}

function buildMainTrackNodes({
	track,
	mediaMap,
	canvasSize,
	isPreview,
}: {
	track: TimelineTrack;
	mediaMap: Map<string, MediaAsset>;
	canvasSize: TCanvasSize;
	isPreview?: boolean;
}): { nodes: AnyBaseNode[]; transitionNodes: TransitionNode[] } {
	const elements = getVisibleSortedElements({ track }).filter(isTransitionable);
	const skipHead = new Map<string, number>();
	const skipTail = new Map<string, number>();
	const transitionNodes: TransitionNode[] = [];

	for (let i = 0; i < elements.length - 1; i++) {
		const outgoing = elements[i];
		const incoming = elements[i + 1];
		const boundary = outgoing.startTime + outgoing.duration;
		if (incoming.startTime !== boundary) {
			continue;
		}
		const transition = outgoing.transitionOut ?? incoming.transitionIn;
		if (!transition || transition.duration <= 0) {
			continue;
		}
		const outgoingAsset = mediaMap.get(outgoing.mediaId);
		const incomingAsset = mediaMap.get(incoming.mediaId);
		if (!outgoingAsset || !incomingAsset) {
			continue;
		}

		const half = Math.round(transition.duration / 2);
		skipTail.set(outgoing.id, half);
		skipHead.set(incoming.id, half);

		transitionNodes.push(
			new TransitionNode({
				transition,
				startTime: boundary - half,
				duration: transition.duration,
				outgoing: { element: outgoing, mediaAsset: outgoingAsset },
				incoming: { element: incoming, mediaAsset: incomingAsset },
				canvasWidth: canvasSize.width,
				canvasHeight: canvasSize.height,
				...(isPreview ? { isPreview } : {}),
			}),
		);
	}

	const nodes: AnyBaseNode[] = [];
	for (const element of elements) {
		const mediaAsset = mediaMap.get(element.mediaId);
		if (!mediaAsset) {
			continue;
		}
		const node = buildMediaNode({
			element,
			mediaAsset,
			isPreview,
			skipHead: skipHead.get(element.id),
			skipTail: skipTail.get(element.id),
		});
		if (node) {
			nodes.push(node);
		}
	}

	return { nodes, transitionNodes };
}

function buildBlurBackgroundNodes({
	track,
	mediaMap,
	blurIntensity,
}: {
	track: TimelineTrack | undefined;
	mediaMap: Map<string, MediaAsset>;
	blurIntensity: number;
}): AnyBaseNode[] {
	if (!track) {
		return [];
	}

	const nodes: AnyBaseNode[] = [];
	const elements = getVisibleSortedElements({ track });

	for (const element of elements) {
		if (element.type !== "video" && element.type !== "image") {
			continue;
		}

		const mediaAsset = mediaMap.get(element.mediaId);
		if (
			!mediaAsset?.file ||
			!mediaAsset?.url ||
			(mediaAsset.type !== "video" && mediaAsset.type !== "image")
		) {
			continue;
		}

		nodes.push(
			new BlurBackgroundNode({
				mediaId: mediaAsset.id,
				url: mediaAsset.url,
				file: mediaAsset.file,
				mediaType: mediaAsset.type,
				duration: element.duration,
				timeOffset: element.startTime,
				trimStart: element.trimStart,
				trimEnd: element.trimEnd,
				retime: element.type === "video" ? element.retime : undefined,
				blurIntensity,
			}),
		);
	}

	return nodes;
}

export type BuildSceneParams = {
	canvasSize: TCanvasSize;
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	duration: number;
	background: TBackground;
	isPreview?: boolean;
};

export function buildScene({
	canvasSize,
	tracks,
	mediaAssets,
	duration,
	background,
	isPreview,
}: BuildSceneParams) {
	const rootNode = new RootNode({ duration });
	const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));

	const visibleTracks = [
		...tracks.overlay.filter((track) => !("hidden" in track && track.hidden)),
		...(!tracks.main.hidden ? [tracks.main] : []),
	];
	const orderedTracksBottomToTop = visibleTracks.slice().reverse();
	const mainTrack = tracks.main.hidden ? undefined : tracks.main;

	const allNodes = buildTrackNodes({
		tracks: orderedTracksBottomToTop.filter((track) => track.id !== mainTrack?.id),
		mediaMap,
		canvasSize,
		isPreview,
	});
	const mainTrackResult = mainTrack
		? buildMainTrackNodes({ track: mainTrack, mediaMap, canvasSize, isPreview })
		: { nodes: [], transitionNodes: [] };

	if (background.type === "blur") {
		const blurNodes = buildBlurBackgroundNodes({
			track: mainTrack,
			mediaMap,
			blurIntensity:
				background.blurIntensity ?? DEFAULT_BACKGROUND_BLUR_INTENSITY,
		});
		for (const node of blurNodes) {
			rootNode.add(node);
		}
	} else if (
		background.type === "color" &&
		background.color !== "transparent"
	) {
		rootNode.add(new ColorNode({ color: background.color }));
	}

	// Main track renders at the bottom, so its nodes come first.
	for (const node of mainTrackResult.nodes) {
		rootNode.add(node);
	}
	for (const node of mainTrackResult.transitionNodes) {
		rootNode.add(node);
	}
	for (const node of allNodes) {
		rootNode.add(node);
	}

	return rootNode;
}
