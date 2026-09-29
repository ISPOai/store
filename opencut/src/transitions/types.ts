import type { MediaTime } from "@/wasm";

export type TransitionType =
	| "cross-dissolve"
	| "dip-to-black"
	| "dip-to-white"
	| "slide-left"
	| "slide-right"
	| "slide-up"
	| "slide-down"
	| "wipe-left"
	| "wipe-right"
	| "wipe-up"
	| "wipe-down"
	| "zoom"
	| "blur";

export interface Transition {
	id: string;
	type: TransitionType;
	duration: MediaTime;
}

export interface TransitionComposeContext {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	/** Outgoing frame, drawn full-canvas. */
	a: CanvasImageSource;
	/** Incoming frame, drawn full-canvas. */
	b: CanvasImageSource;
	/** 0 → 1 across the transition. */
	progress: number;
	width: number;
	height: number;
}

export interface TransitionDefinition {
	type: TransitionType;
	name: string;
	keywords: string[];
	compose: (context: TransitionComposeContext) => void;
}
