"use client";

import { useEffect, useRef } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { useEditor } from "@/editor/use-editor";
import { buildEffectElement } from "@/timeline/element-utils";
import { filterRegistry } from "@/effects/filters/registry";
import { FILTER_EFFECT_TYPE } from "@/effects/definitions/filter";
import type { FilterDefinition } from "@/effects/filters/types";

const FILTER_TARGET_ELEMENT_TYPES = ["video", "image"] as const;

export function FiltersView() {
	const filters = filterRegistry.list();

	return (
		<PanelView title="Filters">
			<FiltersGrid filters={filters} />
		</PanelView>
	);
}

function FiltersGrid({ filters }: { filters: FilterDefinition[] }) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{filters.map((filter) => (
				<FilterItem key={filter.id} filter={filter} />
			))}
		</div>
	);
}

function FilterPreviewCanvas({ filterId }: { filterId: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType: FILTER_EFFECT_TYPE,
					params: { filterId, intensity: 1 },
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [filterId]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function FilterItem({ filter }: { filter: FilterDefinition }) {
	const editor = useEditor();

	const handleAddToTimeline = () => {
		const currentTime = editor.playback.getCurrentTime();
		const element = buildEffectElement({
			effectType: FILTER_EFFECT_TYPE,
			startTime: currentTime,
			params: { filterId: filter.id, intensity: 1 },
		});

		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element,
		});
	};

	return (
		<DraggableItem
			name={filter.name}
			preview={<FilterPreviewCanvas filterId={filter.id} />}
			dragData={{
				id: filter.id,
				name: filter.name,
				type: "effect",
				effectType: FILTER_EFFECT_TYPE,
				targetElementTypes: [...FILTER_TARGET_ELEMENT_TYPES],
				params: { filterId: filter.id, intensity: 1 },
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}
