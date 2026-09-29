"use client";

import { usePreviewViewport } from "@/preview/components/preview-viewport";
import { useCropHandles } from "@/preview/hooks/use-crop-handles";
import {
	cropRectLocal,
	fromFrameLocal,
	type CropCorner,
	type CropEdge,
} from "@/crop/crop-frame";
import {
	BoundingBoxOutline,
	CornerHandle,
	EdgeHandle,
	getResizeCursor,
} from "./handle-primitives";

const CORNERS: CropCorner[] = [
	"top-left",
	"top-right",
	"bottom-left",
	"bottom-right",
];
const EDGES: CropEdge[] = ["left", "right", "top", "bottom"];

export function CropHandles() {
	const viewport = usePreviewViewport();
	const {
		selectedCrop,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
	} = useCropHandles();

	if (!selectedCrop) return null;

	const { frame, crop } = selectedCrop;
	const displayScale = viewport.getDisplayScale();

	const toOverlay = ({
		canvasX,
		canvasY,
	}: {
		canvasX: number;
		canvasY: number;
	}) => viewport.canvasToOverlay({ canvasX, canvasY });

	const rect = cropRectLocal({ frame, crop });
	const toCanvas = ({ x, y }: { x: number; y: number }) => {
		const offset = fromFrameLocal({ x, y, rotation: frame.rotation });
		return { x: frame.cx + offset.x, y: frame.cy + offset.y };
	};

	const cornerPositions = CORNERS.map((corner) => {
		const local = {
			x: corner === "top-left" || corner === "bottom-left" ? rect.left : rect.right,
			y: corner === "top-left" || corner === "top-right" ? rect.top : rect.bottom,
		};
		return { corner, canvas: toCanvas(local) };
	});

	const edgePositions = EDGES.map((edge) => {
		const local = {
			x:
				edge === "left"
					? rect.left
					: edge === "right"
						? rect.right
						: (rect.left + rect.right) / 2,
			y:
				edge === "top"
					? rect.top
					: edge === "bottom"
						? rect.bottom
						: (rect.top + rect.bottom) / 2,
		};
		return { edge, canvas: toCanvas(local) };
	});

	const cropCenterCanvas = toCanvas({
		x: (rect.left + rect.right) / 2,
		y: (rect.top + rect.bottom) / 2,
	});
	const cropCenter = toOverlay({
		canvasX: cropCenterCanvas.x,
		canvasY: cropCenterCanvas.y,
	});
	const outlineWidth = Math.max(rect.right - rect.left, 0) * displayScale.x;
	const outlineHeight = Math.max(rect.bottom - rect.top, 0) * displayScale.y;

	const onPointerMove = (event: React.PointerEvent) =>
		handlePointerMove({ event });
	const onPointerUp = (event: React.PointerEvent) => handlePointerUp();

	return (
		<div
			className="pointer-events-none absolute inset-0 overflow-hidden"
			aria-hidden
		>
			<BoundingBoxOutline
				center={cropCenter}
				outlineWidth={outlineWidth}
				outlineHeight={outlineHeight}
				rotation={frame.rotation}
				dashed
			/>
			{cornerPositions.map(({ corner, canvas }) => {
				const screen = toOverlay({ canvasX: canvas.x, canvasY: canvas.y });
				const angleDeg =
					Math.atan2(
						screen.y - cropCenter.y,
						screen.x - cropCenter.x,
					) *
					(180 / Math.PI);
				return (
					<CornerHandle
						key={corner}
						cursor={getResizeCursor({ angleDeg })}
						screen={screen}
						onPointerDown={(event) =>
							handlePointerDown({ event, handle: corner })
						}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
					/>
				);
			})}
			{edgePositions.map(({ edge, canvas }) => {
				const screen = toOverlay({ canvasX: canvas.x, canvasY: canvas.y });
				return (
					<EdgeHandle
						key={edge}
						edge={
							edge === "left" || edge === "right"
								? edge
								: "bottom"
						}
						screen={screen}
						rotation={frame.rotation}
						onPointerDown={(event) =>
							handlePointerDown({ event, handle: edge })
						}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
					/>
				);
			})}
		</div>
	);
}
