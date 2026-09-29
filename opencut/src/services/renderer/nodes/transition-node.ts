import type { Transition } from "@/transitions";
import type { MediaAsset } from "@/media/types";
import type { ImageElement, VideoElement } from "@/timeline";
import { BaseNode } from "./base-node";

export type TransitionSideElement = VideoElement | ImageElement;

export type TransitionSource = {
	element: TransitionSideElement;
	mediaAsset: MediaAsset;
};

export type TransitionNodeParams = {
	transition: Transition;
	/** Overlap window start (timeline ticks). */
	startTime: number;
	/** Overlap window duration (timeline ticks). */
	duration: number;
	outgoing: TransitionSource;
	incoming: TransitionSource;
	canvasWidth: number;
	canvasHeight: number;
	isPreview?: boolean;
};

export type ResolvedTransitionNodeState = {
	composite: OffscreenCanvas;
};

export class TransitionNode extends BaseNode<
	TransitionNodeParams,
	ResolvedTransitionNodeState
> {}
