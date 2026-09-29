import type { PointerEvent as ReactPointerEvent } from "react";
import type { MediaAsset } from "@/media/types";
import {
	computeCropFrame,
	cropFromHandleDrag,
	toFrameLocal,
	type CropFrame,
	type CropHandle,
} from "@/crop/crop-frame";
import {
	readCropFromParams,
	writeCropToParams,
} from "@/crop/crop";
import type { CropRect } from "@/services/renderer/image-fit";
import type { ParamValues } from "@/params";
import { buildTransformFromParams } from "@/rendering";
import { resolveTransformAtTime } from "@/rendering/animation-values";
import { getElementLocalTime } from "@/animation";
import type {
	ElementRef,
	ImageElement,
	SceneTracks,
	TimelineElement,
	VideoElement,
} from "@/timeline";

type Point = { readonly x: number; readonly y: number };
type CanvasSize = { readonly width: number; readonly height: number };

export interface CropSelection {
	trackId: string;
	elementId: string;
	element: VideoElement | ImageElement;
	frame: CropFrame;
	crop: CropRect;
}

export interface CropHandleViewportAdapter {
	screenToCanvas: ({
		clientX,
		clientY,
	}: {
		clientX: number;
		clientY: number;
	}) => Point | null;
}

export interface CropHandleSceneReader {
	getSelectedElements: () => readonly ElementRef[];
	getTracks: () => SceneTracks;
	getCurrentTime: () => number;
	getMediaAssets: () => MediaAsset[];
	getCanvasSize: () => CanvasSize;
}

export interface CropHandleTimelineOps {
	previewElements: (
		updates: readonly {
			trackId: string;
			elementId: string;
			updates: { params: ParamValues };
		}[],
	) => void;
	commitPreview: () => void;
	discardPreview: () => void;
}

export interface CropHandleDeps {
	viewport: CropHandleViewportAdapter;
	scene: CropHandleSceneReader;
	timeline: CropHandleTimelineOps;
}

export interface CropHandleDepsRef {
	readonly current: CropHandleDeps;
}

interface CropDragSession {
	kind: "dragging";
	handle: CropHandle;
	trackId: string;
	elementId: string;
	frame: CropFrame;
	initialCrop: CropRect;
	initialParams: ParamValues;
	pointerId: number;
	captureTarget: HTMLElement;
}

type CropSession = { kind: "idle" } | CropDragSession;

const IDLE: CropSession = { kind: "idle" };

function findElementInTracks({
	tracks,
	trackId,
	elementId,
}: {
	tracks: SceneTracks;
	trackId: string;
	elementId: string;
}): TimelineElement | null {
	const track = [tracks.main, ...tracks.overlay].find(
		(candidate) => candidate.id === trackId,
	);
	return track?.elements.find((element) => element.id === elementId) ?? null;
}

export class CropHandleController {
	private readonly depsRef: CropHandleDepsRef;
	private readonly subscribers = new Set<() => void>();
	private session: CropSession = IDLE;

	constructor({ depsRef }: { depsRef: CropHandleDepsRef }) {
		this.depsRef = depsRef;

		this.onHandlePointerDown = this.onHandlePointerDown.bind(this);
		this.onPointerMove = this.onPointerMove.bind(this);
		this.onPointerUp = this.onPointerUp.bind(this);
	}

	private get deps(): CropHandleDeps {
		return this.depsRef.current;
	}

	get isActive(): boolean {
		return this.session.kind !== "idle";
	}

	get activeHandle(): CropHandle | null {
		return this.session.kind === "dragging" ? this.session.handle : null;
	}

	get selectedCrop(): CropSelection | null {
		return this.buildSelectedCrop();
	}

	subscribe(fn: () => void): () => void {
		this.subscribers.add(fn);
		return () => this.subscribers.delete(fn);
	}

	destroy(): void {
		if (this.session.kind === "dragging") {
			this.deps.timeline.discardPreview();
			this.releasePointer(this.session);
		}
		this.session = IDLE;
		this.subscribers.clear();
	}

	cancel(): void {
		if (this.session.kind === "idle") return;
		const session = this.session;
		this.session = IDLE;
		this.deps.timeline.discardPreview();
		this.releasePointer(session);
		this.notify();
	}

	onHandlePointerDown({
		event,
		handle,
	}: {
		event: ReactPointerEvent;
		handle: CropHandle;
	}): void {
		const selection = this.buildSelectedCrop();
		if (!selection) return;

		event.stopPropagation();
		event.preventDefault();

		this.session = {
			kind: "dragging",
			handle,
			trackId: selection.trackId,
			elementId: selection.elementId,
			frame: selection.frame,
			initialCrop: selection.crop,
			initialParams: selection.element.params,
			pointerId: event.pointerId,
			captureTarget: event.currentTarget as HTMLElement,
		};
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		this.notify();
	}

	onPointerMove({ event }: { event: ReactPointerEvent }): void {
		if (this.session.kind !== "dragging") return;

		const position = this.deps.viewport.screenToCanvas({
			clientX: event.clientX,
			clientY: event.clientY,
		});
		if (!position) return;

		const { frame, initialCrop } = this.session;
		const local = toFrameLocal({
			dx: position.x - frame.cx,
			dy: position.y - frame.cy,
			rotation: frame.rotation,
		});
		const nextCrop = cropFromHandleDrag({
			crop: initialCrop,
			handle: this.session.handle,
			localX: local.x,
			localY: local.y,
			frameWidth: frame.width,
			frameHeight: frame.height,
		});

		this.deps.timeline.previewElements([
			{
				trackId: this.session.trackId,
				elementId: this.session.elementId,
				updates: {
					params: writeCropToParams({
						params: this.session.initialParams,
						crop: nextCrop,
					}),
				},
			},
		]);
	}

	onPointerUp(): void {
		if (this.session.kind !== "dragging") return;
		const session = this.session;
		this.session = IDLE;
		this.deps.timeline.commitPreview();
		this.releasePointer(session);
		this.notify();
	}

	private notify(): void {
		for (const fn of this.subscribers) fn();
	}

	private releasePointer(session: CropDragSession): void {
		if (session.captureTarget.hasPointerCapture(session.pointerId)) {
			session.captureTarget.releasePointerCapture(session.pointerId);
		}
	}

	private buildSelectedCrop(): CropSelection | null {
		const selected = this.deps.scene.getSelectedElements();
		if (selected.length !== 1) return null;
		const { trackId, elementId } = selected[0];

		const tracks = this.deps.scene.getTracks();
		const element = findElementInTracks({ tracks, trackId, elementId });
		if (!element || (element.type !== "video" && element.type !== "image")) {
			return null;
		}

		const localTime = getElementLocalTime({
			timelineTime: this.deps.scene.getCurrentTime(),
			elementStartTime: element.startTime,
			elementDuration: element.duration,
		});
		const transform = resolveTransformAtTime({
			baseTransform: buildTransformFromParams({ params: element.params }),
			animations: element.animations,
			localTime,
		});
		const mediaAsset = this.deps.scene
			.getMediaAssets()
			.find((asset) => asset.id === element.mediaId);
		const frame = computeCropFrame({
			element,
			canvasSize: this.deps.scene.getCanvasSize(),
			mediaAsset,
			transform,
		});

		return {
			trackId,
			elementId,
			element,
			frame,
			crop: readCropFromParams({ params: element.params }),
		};
	}
}
