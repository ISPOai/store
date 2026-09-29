"use client";

import { useEffect, useRef } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { transitionsRegistry } from "@/transitions";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import type { TransitionDefinition } from "@/transitions";

const PREVIEW_SIZE = 96;

export function TransitionsView() {
	const transitions = transitionsRegistry.getAll();

	return (
		<PanelView title="Transitions">
			<TransitionsGrid transitions={transitions} />
		</PanelView>
	);
}

function TransitionsGrid({
	transitions,
}: {
	transitions: TransitionDefinition[];
}) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{transitions.map((transition) => (
				<TransitionItem key={transition.type} transition={transition} />
			))}
		</div>
	);
}

function TransitionPreviewCanvas({ type }: { type: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const definition = transitionsRegistry.get(type);
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const a = document.createElement("canvas");
		a.width = PREVIEW_SIZE;
		a.height = PREVIEW_SIZE;
		const aCtx = a.getContext("2d");
		if (aCtx) {
			const gradient = aCtx.createLinearGradient(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
			gradient.addColorStop(0, "#3b82f6");
			gradient.addColorStop(1, "#0ea5e9");
			aCtx.fillStyle = gradient;
			aCtx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
		}

		const b = document.createElement("canvas");
		b.width = PREVIEW_SIZE;
		b.height = PREVIEW_SIZE;
		const bCtx = b.getContext("2d");
		if (bCtx) {
			const gradient = bCtx.createLinearGradient(PREVIEW_SIZE, PREVIEW_SIZE, 0, 0);
			gradient.addColorStop(0, "#f59e0b");
			gradient.addColorStop(1, "#ef4444");
			bCtx.fillStyle = gradient;
			bCtx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
		}

		let frame = 0;
		let raf = 0;
		const render = () => {
			frame += 1;
			const progress = (Math.sin(frame / 60) + 1) / 2;
			ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
			definition.compose({
				ctx,
				a,
				b,
				progress,
				width: PREVIEW_SIZE,
				height: PREVIEW_SIZE,
			});
			raf = requestAnimationFrame(render);
		};
		raf = requestAnimationFrame(render);

		return () => cancelAnimationFrame(raf);
	}, [type]);

	return <canvas ref={canvasRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} className="size-full" />;
}

function TransitionItem({ transition }: { transition: TransitionDefinition }) {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();

	const handleAddToTimeline = () => {
		const selected = selectedElements[0];
		if (!selected) return;
		editor.timeline.setClipTransition({
			trackId: selected.trackId,
			elementId: selected.elementId,
			edge: "out",
			transitionType: transition.type,
		});
	};

	return (
		<DraggableItem
			name={transition.name}
			preview={<TransitionPreviewCanvas type={transition.type} />}
			dragData={{
				id: transition.type,
				name: transition.name,
				type: "transition",
				transitionType: transition.type,
				targetElementTypes: ["video", "image"],
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}
