import type {
	TransitionComposeContext,
	TransitionDefinition,
	TransitionType,
} from "./types";
import { transitionsRegistry } from "./registry";

function drawFull(ctx: TransitionComposeContext["ctx"], source: CanvasImageSource, width: number, height: number) {
	ctx.drawImage(source, 0, 0, width, height);
}

function composeCrossDissolve({ ctx, a, b, progress, width, height }: TransitionComposeContext) {
	drawFull(ctx, a, width, height);
	ctx.globalAlpha = progress;
	drawFull(ctx, b, width, height);
	ctx.globalAlpha = 1;
}

function composeDip({ color }: { color: string }) {
	return ({ ctx, a, b, progress, width, height }: TransitionComposeContext) => {
		drawFull(ctx, a, width, height);
		if (progress < 0.5) {
			ctx.globalAlpha = progress * 2;
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, width, height);
		} else {
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, width, height);
			ctx.globalAlpha = (progress - 0.5) * 2;
			drawFull(ctx, b, width, height);
		}
		ctx.globalAlpha = 1;
	};
}

function composeSlide({ dx, dy }: { dx: number; dy: number }) {
	return ({ ctx, a, b, progress, width, height }: TransitionComposeContext) => {
		drawFull(ctx, a, width, height);
		const offsetX = dx * (1 - progress) * width;
		const offsetY = dy * (1 - progress) * height;
		ctx.drawImage(b, offsetX, offsetY, width, height);
	};
}

function composeWipe({ direction }: { direction: "left" | "right" | "up" | "down" }) {
	return ({ ctx, a, b, progress, width, height }: TransitionComposeContext) => {
		drawFull(ctx, a, width, height);
		ctx.save();
		switch (direction) {
			case "left":
				ctx.beginPath();
				ctx.rect(0, 0, width * progress, height);
				break;
			case "right":
				ctx.beginPath();
				ctx.rect(width * (1 - progress), 0, width * progress, height);
				break;
			case "up":
				ctx.beginPath();
				ctx.rect(0, height * (1 - progress), width, height * progress);
				break;
			case "down":
				ctx.beginPath();
				ctx.rect(0, 0, width, height * progress);
				break;
		}
		ctx.clip();
		drawFull(ctx, b, width, height);
		ctx.restore();
	};
}

function composeZoom({ ctx, a, b, progress, width, height }: TransitionComposeContext) {
	drawFull(ctx, a, width, height);
	const scale = 0.2 + 0.8 * progress;
	ctx.globalAlpha = Math.min(1, progress * 1.5);
	const w = width * scale;
	const h = height * scale;
	ctx.drawImage(b, (width - w) / 2, (height - h) / 2, w, h);
	ctx.globalAlpha = 1;
}

function composeBlur({ ctx, a, b, progress, width, height }: TransitionComposeContext) {
	const supportsFilter = "filter" in ctx;
	const maxBlur = Math.max(6, Math.round(Math.max(width, height) / 40));
	const drawBlurred = (source: CanvasImageSource, amount: number) => {
		if (supportsFilter) {
			ctx.save();
			ctx.filter = `blur(${amount}px)`;
			drawFull(ctx, source, width, height);
			ctx.filter = "none";
			ctx.restore();
		} else {
			drawFull(ctx, source, width, height);
		}
	};

	if (progress < 0.5) {
		drawBlurred(a, progress * 2 * maxBlur);
	} else {
		drawBlurred(b, (1 - progress) * 2 * maxBlur);
	}
}

const TRANSITION_DEFINITIONS: TransitionDefinition[] = [
	{
		type: "cross-dissolve",
		name: "Cross Dissolve",
		keywords: ["crossfade", "dissolve", "fade", "blend"],
		compose: composeCrossDissolve,
	},
	{
		type: "dip-to-black",
		name: "Dip to Black",
		keywords: ["dip", "fade to black", "black"],
		compose: composeDip({ color: "#000000" }),
	},
	{
		type: "dip-to-white",
		name: "Dip to White",
		keywords: ["dip", "fade to white", "white", "flash"],
		compose: composeDip({ color: "#ffffff" }),
	},
	{
		type: "slide-left",
		name: "Slide Left",
		keywords: ["slide", "push", "left"],
		compose: composeSlide({ dx: 1, dy: 0 }),
	},
	{
		type: "slide-right",
		name: "Slide Right",
		keywords: ["slide", "push", "right"],
		compose: composeSlide({ dx: -1, dy: 0 }),
	},
	{
		type: "slide-up",
		name: "Slide Up",
		keywords: ["slide", "push", "up"],
		compose: composeSlide({ dx: 0, dy: 1 }),
	},
	{
		type: "slide-down",
		name: "Slide Down",
		keywords: ["slide", "push", "down"],
		compose: composeSlide({ dx: 0, dy: -1 }),
	},
	{
		type: "wipe-left",
		name: "Wipe Left",
		keywords: ["wipe", "reveal", "left"],
		compose: composeWipe({ direction: "left" }),
	},
	{
		type: "wipe-right",
		name: "Wipe Right",
		keywords: ["wipe", "reveal", "right"],
		compose: composeWipe({ direction: "right" }),
	},
	{
		type: "wipe-up",
		name: "Wipe Up",
		keywords: ["wipe", "reveal", "up"],
		compose: composeWipe({ direction: "up" }),
	},
	{
		type: "wipe-down",
		name: "Wipe Down",
		keywords: ["wipe", "reveal", "down"],
		compose: composeWipe({ direction: "down" }),
	},
	{
		type: "zoom",
		name: "Zoom",
		keywords: ["zoom", "scale", "push in"],
		compose: composeZoom,
	},
	{
		type: "blur",
		name: "Blur",
		keywords: ["blur", "defocus", "soft"],
		compose: composeBlur,
	},
];

export function registerDefaultTransitions(): void {
	for (const definition of TRANSITION_DEFINITIONS) {
		if (transitionsRegistry.has(definition.type)) {
			continue;
		}
		transitionsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}

export function isTransitionType(value: string): value is TransitionType {
	return TRANSITION_DEFINITIONS.some((definition) => definition.type === value);
}
