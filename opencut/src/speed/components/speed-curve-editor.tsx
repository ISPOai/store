"use client";

import { useRef, useState, type PointerEvent } from "react";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/utils/ui";
import type { RetimeConfig, SpeedCurveKeyframe } from "@/timeline";
import {
	MAX_RETIME_RATE,
	MIN_RETIME_RATE,
	DEFAULT_RETIME_RATE,
} from "@/retime/rate";
import {
	getSpeedRateAt,
	getNormalizedBezierForSpeedSegment,
	getSpeedHandlesForNormalizedBezier,
	normalizeSpeedCurve,
} from "@/retime/curve";
import {
	SPEED_CURVE_PRESET_NAMES,
	buildConstantRetime,
	buildCustomSpeedCurveRetime,
	buildSpeedCurvePreset,
	type SpeedCurvePresetName,
} from "@/retime/presets";
import { BezierGraph } from "@/timeline/components/graph-editor/bezier-graph";
import type { NormalizedCubicBezier } from "@/animation/types";
import { generateUUID } from "@/utils/id";
import type { AudioElement, VideoElement } from "@/timeline";

const GRAPH_WIDTH = 224;
const GRAPH_HEIGHT = 108;
const GRAPH_PADDING = 14;
const KEYFRAME_RADIUS = 5;
const HANDLE_RADIUS = 3.5;
const HIT_TOLERANCE = 8;
const CURVE_SEGMENTS = 64;
const RATE_VISUAL_MAX = MAX_RETIME_RATE;

function clampRate({ rate }: { rate: number }): number {
	return Math.max(MIN_RETIME_RATE, Math.min(MAX_RETIME_RATE, rate));
}

function toSvgX({ time }: { time: number }): number {
	return GRAPH_PADDING + Math.max(0, Math.min(1, time)) * (GRAPH_WIDTH - GRAPH_PADDING * 2);
}

function toSvgY({ rate }: { rate: number }): number {
	const fraction = clampRate({ rate }) / RATE_VISUAL_MAX;
	return GRAPH_PADDING + (1 - fraction) * (GRAPH_HEIGHT - GRAPH_PADDING * 2);
}

function fromSvgX({ x }: { x: number }): number {
	return Math.max(
		0,
		Math.min(1, (x - GRAPH_PADDING) / (GRAPH_WIDTH - GRAPH_PADDING * 2)),
	);
}

function fromSvgY({ y }: { y: number }): number {
	const fraction = 1 - (y - GRAPH_PADDING) / (GRAPH_HEIGHT - GRAPH_PADDING * 2);
	return clampRate({ rate: fraction * RATE_VISUAL_MAX });
}

function curvePath({ curve }: { curve: SpeedCurveKeyframe[] }): string {
	const points: string[] = [];
	for (let i = 0; i <= CURVE_SEGMENTS; i++) {
		const time = i / CURVE_SEGMENTS;
		const rate = getSpeedRateAt({ curve, time });
		points.push(`${toSvgX({ time })},${toSvgY({ rate })}`);
	}
	return `M${points.join("L")}`;
}

function handlePoint({
	key,
	side,
}: {
	key: SpeedCurveKeyframe;
	side: "left" | "right";
}): { x: number; y: number } | null {
	const handle = side === "right" ? key.rightHandle : key.leftHandle;
	if (!handle) {
		return null;
	}
	return {
		x: toSvgX({ time: key.time + handle.dt }),
		y: toSvgY({ rate: key.rate + handle.dv }),
	};
}

type DragState =
	| { kind: "keyframe"; index: number }
	| { kind: "handle"; keyIndex: number; side: "left" | "right" }
	| null;

function getCurveForElement({
	element,
}: {
	element: AudioElement | VideoElement;
}): SpeedCurveKeyframe[] {
	return element.retime?.curve ?? [];
}

export function SpeedCurveEditor({
	element,
	trackId,
}: {
	element: AudioElement | VideoElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [drag, setDrag] = useState<DragState>(null);
	const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
	const [isBezierPopoverOpen, setIsBezierPopoverOpen] = useState(false);
	const svgRef = useRef<SVGSVGElement>(null);
	const pendingCurveRef = useRef<SpeedCurveKeyframe[] | null>(null);

	const curve = normalizeSpeedCurve({ curve: getCurveForElement({ element }) });
	const maintainPitch = element.retime?.maintainPitch ?? false;
	const hasCurve = curve.length > 0;

	const commit = ({ retime }: { retime?: RetimeConfig }) => {
		editor.timeline.updateElementRetime({ trackId, elementId: element.id, retime });
	};

	const preview = ({ retime }: { retime?: RetimeConfig }) => {
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: { retime },
				},
			],
		});
	};

	const applyPreset = ({ name }: { name: SpeedCurvePresetName | null }) => {
		if (name === null) {
			const rate = element.retime?.rate ?? DEFAULT_RETIME_RATE;
			commit({ retime: buildConstantRetime({ rate, maintainPitch }) });
			return;
		}
		commit({ retime: buildSpeedCurvePreset({ name, maintainPitch }) });
	};

	const commitCurve = ({ nextCurve }: { nextCurve: SpeedCurveKeyframe[] }) => {
		const normalized = normalizeSpeedCurve({ curve: nextCurve });
		if (normalized.length === 0) {
			commit({
				retime: buildConstantRetime({
					rate: element.retime?.rate ?? DEFAULT_RETIME_RATE,
					maintainPitch,
				}),
			});
			return;
		}
		commit({ retime: buildCustomSpeedCurveRetime({ curve: normalized, maintainPitch }) });
	};

	const previewCurve = ({ nextCurve }: { nextCurve: SpeedCurveKeyframe[] }) => {
		const normalized = normalizeSpeedCurve({ curve: nextCurve });
		pendingCurveRef.current = normalized;
		const retime =
			normalized.length === 0
				? buildConstantRetime({
						rate: element.retime?.rate ?? DEFAULT_RETIME_RATE,
						maintainPitch,
					})
				: buildCustomSpeedCurveRetime({ curve: normalized, maintainPitch });
		preview({ retime });
	};

	const moveKeyframe = ({ index, time, rate }: { index: number; time: number; rate: number }) => {
		const next = [...curve];
		next[index] = { ...next[index], time, rate: clampRate({ rate }) };
		return next;
	};

	const moveHandle = ({
		keyIndex,
		side,
		time,
		rate,
	}: {
		keyIndex: number;
		side: "left" | "right";
		time: number;
		rate: number;
	}) => {
		const next = [...curve];
		const key = next[keyIndex];
		const dt = time - key.time;
		const dv = rate - key.rate;
		if (side === "right") {
			next[keyIndex] = { ...key, rightHandle: { dt, dv }, segmentToNext: "bezier" };
		} else {
			next[keyIndex] = { ...key, leftHandle: { dt, dv } };
			const leftIndex = keyIndex - 1;
			if (leftIndex >= 0) {
				next[leftIndex] = { ...next[leftIndex], segmentToNext: "bezier" };
			}
		}
		return next;
	};

	const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
		const svg = svgRef.current;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const scale = GRAPH_WIDTH / rect.width;
		const x = (event.clientX - rect.left) * scale;
		const y = (event.clientY - rect.top) * (GRAPH_HEIGHT / rect.height);

		pendingCurveRef.current = null;

		// Handles first (smaller hit targets).
		for (let i = 0; i < curve.length; i++) {
			const key = curve[i];
			if (key.segmentToNext === "bezier") {
				const right = handlePoint({ key, side: "right" });
				if (right && Math.hypot(right.x - x, right.y - y) < HIT_TOLERANCE) {
					event.currentTarget.setPointerCapture(event.pointerId);
					setDrag({ kind: "handle", keyIndex: i, side: "right" });
					return;
				}
			}
			const nextKey = curve[i + 1];
			if (nextKey?.leftHandle) {
				const left = handlePoint({ key: nextKey, side: "left" });
				if (left && Math.hypot(left.x - x, left.y - y) < HIT_TOLERANCE) {
					event.currentTarget.setPointerCapture(event.pointerId);
					setDrag({ kind: "handle", keyIndex: i + 1, side: "left" });
					return;
				}
			}
		}

		// Keyframes.
		for (let i = 0; i < curve.length; i++) {
			const key = curve[i];
			const kx = toSvgX({ time: key.time });
			const ky = toSvgY({ rate: key.rate });
			if (Math.hypot(kx - x, ky - y) < HIT_TOLERANCE + 2) {
				event.currentTarget.setPointerCapture(event.pointerId);
				setDrag({ kind: "keyframe", index: i });
				setSelectedSegmentIndex(Math.min(i, curve.length - 2));
				return;
			}
		}

		// Empty area: add a keyframe at the pointer position.
		const time = fromSvgX({ x });
		const rate = fromSvgY({ y });
		commitCurve({
			nextCurve: [
				...curve,
				{ id: generateUUID(), time, rate, segmentToNext: "linear" },
			],
		});
	};

	const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
		if (!drag) return;
		const svg = svgRef.current;
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const scale = GRAPH_WIDTH / rect.width;
		const x = (event.clientX - rect.left) * scale;
		const y = (event.clientY - rect.top) * (GRAPH_HEIGHT / rect.height);
		const time = fromSvgX({ x });
		const rate = fromSvgY({ y });

		if (drag.kind === "keyframe") {
			const isBoundary = drag.index === 0 || drag.index === curve.length - 1;
			const nextTime = isBoundary ? curve[drag.index].time : time;
			previewCurve({
				nextCurve: moveKeyframe({ index: drag.index, time: nextTime, rate }),
			});
			return;
		}

		previewCurve({
			nextCurve: moveHandle({
				keyIndex: drag.keyIndex,
				side: drag.side,
				time,
				rate,
			}),
		});
	};

	const onPointerUp = () => {
		if (!drag) return;
		setDrag(null);
		if (pendingCurveRef.current) {
			commitCurve({ nextCurve: pendingCurveRef.current });
			pendingCurveRef.current = null;
		}
	};

	const selectedSegment = curve[selectedSegmentIndex] && curve[selectedSegmentIndex + 1]
		? {
				left: curve[selectedSegmentIndex],
				right: curve[selectedSegmentIndex + 1],
			}
		: null;

	const bezierValue: NormalizedCubicBezier | null = selectedSegment
		? getNormalizedBezierForSpeedSegment({
				left: selectedSegment.left,
				right: selectedSegment.right,
				referenceSpanValue: RATE_VISUAL_MAX,
			})
		: null;

	const onBezierChange = (value: NormalizedCubicBezier) => {
		if (!selectedSegment) return;
		const handles = getSpeedHandlesForNormalizedBezier({
			left: selectedSegment.left,
			right: selectedSegment.right,
			bezier: value,
			referenceSpanValue: RATE_VISUAL_MAX,
		});
		if (!handles) return;
		const next = [...curve];
		const leftIndex = selectedSegmentIndex;
		const rightIndex = selectedSegmentIndex + 1;
		next[leftIndex] = {
			...next[leftIndex],
			segmentToNext: "bezier",
			rightHandle: handles.rightHandle,
		};
		next[rightIndex] = { ...next[rightIndex], leftHandle: handles.leftHandle };
		previewCurve({ nextCurve: next });
	};

	const onBezierCommit = (value: NormalizedCubicBezier) => {
		if (!selectedSegment) return;
		const handles = getSpeedHandlesForNormalizedBezier({
			left: selectedSegment.left,
			right: selectedSegment.right,
			bezier: value,
			referenceSpanValue: RATE_VISUAL_MAX,
		});
		if (!handles) return;
		const next = [...curve];
		const leftIndex = selectedSegmentIndex;
		const rightIndex = selectedSegmentIndex + 1;
		next[leftIndex] = {
			...next[leftIndex],
			segmentToNext: "bezier",
			rightHandle: handles.rightHandle,
		};
		next[rightIndex] = { ...next[rightIndex], leftHandle: handles.leftHandle };
		commitCurve({ nextCurve: next });
	};

	const removeKeyframe = ({ index }: { index: number }) => {
		if (curve.length <= 1) return;
		const next = curve.filter((_, i) => i !== index);
		commitCurve({ nextCurve: next });
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="grid grid-cols-3 gap-1.5">
				<PresetChip
					label="None"
					isActive={!hasCurve}
					onSelect={() => applyPreset({ name: null })}
				/>
				{SPEED_CURVE_PRESET_NAMES.map((name) => (
					<PresetChip
						key={name}
						label={presetLabel({ name })}
						isActive={hasCurve && presetMatches({ curve, name })}
						onSelect={() => applyPreset({ name })}
					/>
				))}
			</div>

			{hasCurve && (
				<>
					<svg
						ref={svgRef}
						viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
						className="bg-foreground/3 w-full cursor-crosshair select-none rounded-sm"
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
						onPointerCancel={onPointerUp}
					>
						<title>Speed curve editor</title>
						<line
							x1={GRAPH_PADDING}
							y1={toSvgY({ rate: 1 })}
							x2={GRAPH_WIDTH - GRAPH_PADDING}
							y2={toSvgY({ rate: 1 })}
							className="stroke-foreground/10"
							strokeWidth={1}
							strokeDasharray="3 3"
						/>
						<path d={curvePath({ curve })} fill="none" className="stroke-primary" strokeWidth={2} strokeLinecap="round" />
						{curve.map((key, index) => {
							const nextKey = curve[index + 1];
							if (key.segmentToNext === "bezier") {
								const right = handlePoint({ key, side: "right" });
								if (right) {
									return (
										<g key={`handle-${key.id}`}>
											<line
												x1={toSvgX({ time: key.time })}
												y1={toSvgY({ rate: key.rate })}
												x2={right.x}
												y2={right.y}
												className="stroke-primary/30"
												strokeWidth={1}
											/>
											<circle cx={right.x} cy={right.y} r={HANDLE_RADIUS} className="fill-primary" />
										</g>
									);
								}
							}
							if (nextKey?.leftHandle) {
								const left = handlePoint({ key: nextKey, side: "left" });
								if (left) {
									return (
										<g key={`handle-${nextKey.id}`}>
											<line
												x1={toSvgX({ time: nextKey.time })}
												y1={toSvgY({ rate: nextKey.rate })}
												x2={left.x}
												y2={left.y}
												className="stroke-primary/30"
												strokeWidth={1}
											/>
											<circle cx={left.x} cy={left.y} r={HANDLE_RADIUS} className="fill-primary" />
										</g>
									);
								}
							}
							return null;
						})}
						{curve.map((key, index) => (
							<g key={key.id}>
								<circle
									cx={toSvgX({ time: key.time })}
									cy={toSvgY({ rate: key.rate })}
									r={KEYFRAME_RADIUS}
									className="fill-background stroke-primary"
									strokeWidth={2}
									onDoubleClick={() => removeKeyframe({ index })}
								/>
							</g>
						))}
					</svg>

					<div className="flex items-center gap-2">
						<Popover open={isBezierPopoverOpen} onOpenChange={setIsBezierPopoverOpen}>
							<Button
								variant="outline"
								size="sm"
								className="h-7 gap-1.5 px-2.5 text-xs"
								onClick={() => setIsBezierPopoverOpen(true)}
							>
								Curve
							</Button>
							<PopoverContent side="bottom" align="start" className="w-56">
								<div className="px-1 py-1">
									{bezierValue ? (
										<BezierGraph
											value={bezierValue}
											onChange={onBezierChange}
											onChangeEnd={onBezierCommit}
										/>
									) : (
										<p className="text-muted-foreground px-2 py-2 text-xs">
											Select a segment between two keyframes to edit its curve.
										</p>
									)}
								</div>
							</PopoverContent>
						</Popover>
						<span className="text-muted-foreground text-xs">
							Drag points to shape speed; double-click a point to remove it.
						</span>
					</div>
				</>
			)}
		</div>
	);
}

function presetLabel({ name }: { name: SpeedCurvePresetName }): string {
	switch (name) {
		case "montage":
			return "Montage";
		case "hero":
			return "Hero";
		case "bullet":
			return "Bullet";
		case "jump-cut":
			return "Jump cut";
		case "flash-in":
			return "Flash in";
		case "flash-out":
			return "Flash out";
	}
}

function presetMatches({
	curve,
	name,
}: {
	curve: SpeedCurveKeyframe[];
	name: SpeedCurvePresetName;
}): boolean {
	const preset = buildSpeedCurvePreset({ name }).curve ?? [];
	if (preset.length !== curve.length) {
		return false;
	}
	return preset.every((key, index) => {
		const candidate = curve[index];
		return (
			Math.abs(key.time - candidate.time) < 1e-6 &&
			Math.abs(key.rate - candidate.rate) < 1e-6
		);
	});
}

function PresetChip({
	label,
	isActive,
	onSelect,
}: {
	label: string;
	isActive: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"h-7 rounded-sm border px-2 text-xs font-medium",
				isActive
					? "border-primary bg-primary/10 text-primary"
					: "text-muted-foreground hover:text-foreground border-transparent hover:bg-foreground/5",
			)}
		>
			{label}
		</button>
	);
}
