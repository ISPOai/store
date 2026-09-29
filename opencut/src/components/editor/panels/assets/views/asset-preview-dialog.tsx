import { useEffect, useRef, useState } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { MediaAsset } from "@/media/types";

// One wheel gesture (esp. trackpad inertia) fires a long burst of events. After a step, ignore the
// wheel until the burst pauses (gesture ended) or a held scroll has run long enough to step again.
const WHEEL_GESTURE_GAP_MS = 180;
const WHEEL_REPEAT_MS = 550;
const WHEEL_STEP_THRESHOLD = 30;

export function AssetPreviewDialog({ item, items, onNavigate, onClose, onRestoreFocus }: {
	item?: MediaAsset;
	items: MediaAsset[];
	onNavigate: (id: string) => void;
	onClose: () => void;
	onRestoreFocus: () => void;
}) {
	const index = item ? items.findIndex((candidate) => candidate.id === item.id) : -1;
	const wheel = useRef({ accumulated: 0, lastStep: 0, lastEvent: 0 });

	const step = (delta: number) => {
		const next = items[index + delta];
		if (next) onNavigate(next.id);
	};
	const stepRef = useRef(step);
	stepRef.current = step;

	// Window capture runs before the editor's document-level shortcuts (arrows = seek), and works
	// regardless of where focus landed inside the dialog.
	const open = !!item;
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if ((event.target as HTMLElement | null)?.closest?.("video, audio, input, textarea")) return;
			const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
				: event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
			if (!delta) return;
			event.preventDefault();
			event.stopPropagation();
			stepRef.current(delta);
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [open]);

	return (
		<Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-4xl flex-col gap-4 overflow-auto p-6 [&>button]:size-8 [&>button]:flex [&>button]:items-center [&>button]:justify-center"
				onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus(); }}
				onWheel={(event) => {
					const state = wheel.current;
					const now = performance.now();
					const sameGesture = now - state.lastEvent < WHEEL_GESTURE_GAP_MS;
					state.lastEvent = now;
					if (!sameGesture) state.accumulated = 0;
					else if (now - state.lastStep < WHEEL_REPEAT_MS) return;
					state.accumulated += Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
					if (Math.abs(state.accumulated) < WHEEL_STEP_THRESHOLD) return;
					step(Math.sign(state.accumulated));
					state.accumulated = 0;
					state.lastStep = now;
				}}>
				{item && <>
					<div className="flex flex-col gap-2 pr-12">
						<DialogTitle className="break-all leading-snug">{item.name}</DialogTitle>
						<DialogDescription>Asset preview · {item.type} · scroll or use arrow keys to browse</DialogDescription>
					</div>
					<PreviewContent key={item.id} item={item} />
					<div className="flex items-center justify-center gap-3">
						<Button variant="outline" size="icon" className="size-8" aria-label="Previous asset"
							disabled={index <= 0} onClick={() => step(-1)}>
							<HugeiconsIcon icon={ArrowLeft01Icon} />
						</Button>
						<span className="text-muted-foreground text-sm tabular-nums">{index + 1} / {items.length}</span>
						<Button variant="outline" size="icon" className="size-8" aria-label="Next asset"
							disabled={index >= items.length - 1} onClick={() => step(1)}>
							<HugeiconsIcon icon={ArrowRight01Icon} />
						</Button>
					</div>
				</>}
			</DialogContent>
		</Dialog>
	);
}

function PreviewContent({ item }: { item: MediaAsset }) {
	const [source, setSource] = useState(item.url);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		setFailed(false);
		if (item.url) { setSource(item.url); return; }
		const url = URL.createObjectURL(item.file);
		setSource(url);
		return () => URL.revokeObjectURL(url);
	}, [item.url, item.file]);

	return <div className="flex min-h-32 items-center justify-center rounded-md bg-muted p-4">
		{failed ? <p role="alert" className="text-muted-foreground text-sm">This asset could not be previewed. Its file may be unavailable or unsupported.</p>
			: !source ? <p role="status">Loading preview…</p>
			: item.type === "image" ? <img src={source} alt={item.name} className="max-h-[65dvh] max-w-full object-contain" onError={() => setFailed(true)} />
			: item.type === "video" ? <video src={source} aria-label={item.name} controls playsInline preload="metadata" className="max-h-[65dvh] w-full object-contain" onError={() => setFailed(true)} />
			: <audio src={source} aria-label={item.name} controls preload="metadata" className="w-full" onError={() => setFailed(true)} />}
	</div>;
}
