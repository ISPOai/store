import { BaseNode } from "./base-node";
import type { TextElement } from "@/timeline";
import type { EffectPass } from "@/effects/types";
import type { BlendMode, Transform } from "@/rendering";
import {
	drawMeasuredTextLayoutWithEffects,
	type TextGlowDrawing,
	type TextShadowDrawing,
	type TextStrokeDrawing,
} from "@/text/primitives";
import type { MeasuredTextElement, TextEffects } from "@/text/measure-element";
import { FONT_SIZE_SCALE_REFERENCE } from "@/text/typography";

export type TextNodeParams = TextElement & {
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

export interface ResolvedTextNodeState {
	transform: Transform;
	opacity: number;
	textColor: string;
	backgroundColor: string;
	textEffects: TextEffects;
	effectPasses: EffectPass[][];
	measuredText: MeasuredTextElement;
}

export class TextNode extends BaseNode<TextNodeParams, ResolvedTextNodeState> {}

export function renderTextToContext({
	node,
	ctx,
}: {
	node: TextNode;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): void {
	const resolved = node.resolved;
	if (!resolved) {
		return;
	}

	const x = resolved.transform.position.x + node.params.canvasCenter.x;
	const y = resolved.transform.position.y + node.params.canvasCenter.y;
	const baseline = node.params.textBaseline ?? "middle";

	const scale = node.params.canvasHeight / FONT_SIZE_SCALE_REFERENCE;
	const { stroke, shadow, glow } = resolved.textEffects;
	const strokeDrawing: TextStrokeDrawing = {
		color: stroke.color,
		width: stroke.width * scale,
	};
	const shadowDrawing: TextShadowDrawing = {
		color: shadow.color,
		x: shadow.x * scale,
		y: shadow.y * scale,
		blur: shadow.blur * scale,
	};
	const glowDrawing: TextGlowDrawing = {
		color: glow.color,
		radius: glow.radius * scale,
	};

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(resolved.transform.scaleX, resolved.transform.scaleY);
	if (resolved.transform.rotate) {
		ctx.rotate((resolved.transform.rotate * Math.PI) / 180);
	}

	drawMeasuredTextLayoutWithEffects({
		ctx,
		layout: resolved.measuredText,
		textColor: resolved.textColor,
		background: resolved.measuredText.resolvedBackground,
		backgroundColor: resolved.backgroundColor,
		textBaseline: baseline,
		stroke: strokeDrawing,
		shadow: shadowDrawing,
		glow: glowDrawing,
	});

	ctx.restore();
}
