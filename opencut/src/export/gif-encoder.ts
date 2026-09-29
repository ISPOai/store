/**
 * A minimal, dependency-free GIF89a encoder sufficient for OpenCut export.
 *
 * Frames are encoded with a per-frame local color table quantized by median
 * cut (5-bit-per-channel histogram), then LZW-compressed with variable-width
 * codes. Encoding is incremental (`addFrame`) so a long clip does not hold all
 * decoded frames in memory at once.
 */

export interface GifFrameInput {
	/** RGBA pixel data, `width * height * 4` bytes. Alpha is ignored. */
	data: Uint8ClampedArray;
	/** Per-frame delay in milliseconds; clamped to GIF's centisecond floor. */
	delayMs: number;
}

const MAX_COLORS = 256;
const HIST_BITS = 5;
const HIST_SIZE = 1 << HIST_BITS;
const HIST_CELL_COUNT = HIST_SIZE * HIST_SIZE * HIST_SIZE;

interface HistPoint {
	cell: number;
	r: number;
	g: number;
	b: number;
	count: number;
}

interface ColorBox {
	points: HistPoint[];
	total: number;
}

function delayToCentiseconds(delayMs: number): number {
	const centis = Math.round(delayMs / 10);
	return Math.max(2, Math.min(centis, 65535));
}

function buildHistogram(data: Uint8ClampedArray): Uint32Array {
	const counts = new Uint32Array(HIST_CELL_COUNT);
	const pixelCount = data.length / 4;
	for (let i = 0; i < pixelCount; i++) {
		const r = data[i * 4] >> (8 - HIST_BITS);
		const g = data[i * 4 + 1] >> (8 - HIST_BITS);
		const b = data[i * 4 + 2] >> (8 - HIST_BITS);
		counts[(r << (HIST_BITS * 2)) | (g << HIST_BITS) | b] += 1;
	}
	return counts;
}

function boxRange(box: ColorBox): { channel: "r" | "g" | "b"; range: number } {
	let minR = box.points[0].r;
	let maxR = box.points[0].r;
	let minG = box.points[0].g;
	let maxG = box.points[0].g;
	let minB = box.points[0].b;
	let maxB = box.points[0].b;
	for (const point of box.points) {
		if (point.r < minR) minR = point.r;
		if (point.r > maxR) maxR = point.r;
		if (point.g < minG) minG = point.g;
		if (point.g > maxG) maxG = point.g;
		if (point.b < minB) minB = point.b;
		if (point.b > maxB) maxB = point.b;
	}
	const rangeR = maxR - minR;
	const rangeG = maxG - minG;
	const rangeB = maxB - minB;
	if (rangeR >= rangeG && rangeR >= rangeB) return { channel: "r", range: rangeR };
	if (rangeG >= rangeB) return { channel: "g", range: rangeG };
	return { channel: "b", range: rangeB };
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] | null {
	const { channel, range } = boxRange(box);
	if (range <= 0) return null;

	const sorted = box.points.slice().sort((a, b) => a[channel] - b[channel]);
	const half = box.total / 2;
	let cumulative = 0;
	let splitIndex = sorted.length;
	for (let i = 0; i < sorted.length; i++) {
		cumulative += sorted[i].count;
		if (cumulative >= half) {
			splitIndex = i + 1;
			break;
		}
	}
	if (splitIndex <= 0 || splitIndex >= sorted.length) {
		return null;
	}

	const left = sorted.slice(0, splitIndex);
	const right = sorted.slice(splitIndex);
	return [
		{ points: left, total: left.reduce((sum, p) => sum + p.count, 0) },
		{ points: right, total: right.reduce((sum, p) => sum + p.count, 0) },
	];
}

function buildCellToIndex(counts: Uint32Array): Uint8Array {
	const points: HistPoint[] = [];
	for (let cell = 0; cell < HIST_CELL_COUNT; cell++) {
		const count = counts[cell];
		if (count === 0) continue;
		const r = cell >> (HIST_BITS * 2);
		const g = (cell >> HIST_BITS) & (HIST_SIZE - 1);
		const b = cell & (HIST_SIZE - 1);
		points.push({ cell, r, g, b, count });
	}

	let boxes: ColorBox[] = [
		{ points, total: points.reduce((sum, p) => sum + p.count, 0) },
	];
	while (boxes.length < MAX_COLORS) {
		let largestIndex = -1;
		let largestTotal = -1;
		for (let i = 0; i < boxes.length; i++) {
			if (boxes[i].points.length > 1 && boxes[i].total > largestTotal) {
				largestTotal = boxes[i].total;
				largestIndex = i;
			}
		}
		if (largestIndex === -1) break;
		const split = splitBox(boxes[largestIndex]);
		if (!split) break;
		boxes.splice(largestIndex, 1, split[0], split[1]);
	}

	const cellToIndex = new Uint8Array(HIST_CELL_COUNT);
	for (let boxIndex = 0; boxIndex < boxes.length; boxIndex++) {
		for (const point of boxes[boxIndex].points) {
			cellToIndex[point.cell] = boxIndex;
		}
	}
	return cellToIndex;
}

class BitWriter {
	private currentByte = 0;
	private bitsFilled = 0;
	private bytes: number[] = [];

	writeCode(code: number, codeSize: number): void {
		for (let i = 0; i < codeSize; i++) {
			const bit = (code >> i) & 1;
			this.currentByte |= bit << this.bitsFilled;
			this.bitsFilled += 1;
			if (this.bitsFilled === 8) {
				this.bytes.push(this.currentByte);
				this.currentByte = 0;
				this.bitsFilled = 0;
			}
		}
	}

	finish(): Uint8Array {
		if (this.bitsFilled > 0) {
			this.bytes.push(this.currentByte);
			this.currentByte = 0;
			this.bitsFilled = 0;
		}
		return new Uint8Array(this.bytes);
	}
}

function writeSubBlocks(data: Uint8Array): number[] {
	const blocks: number[] = [];
	let offset = 0;
	while (offset < data.length) {
		const length = Math.min(255, data.length - offset);
		blocks.push(length);
		for (let i = 0; i < length; i++) blocks.push(data[offset + i]);
		offset += length;
	}
	blocks.push(0);
	return blocks;
}

function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
	const clearCode = 1 << minCodeSize;
	const endCode = clearCode + 1;
	let codeSize = minCodeSize + 1;
	let nextCode = endCode + 1;

	const writer = new BitWriter();
	writer.writeCode(clearCode, codeSize);

	if (indices.length === 0) {
		writer.writeCode(endCode, codeSize);
		return writeSubBlocks(writer.finish());
	}

	const dictionary = new Map<number, number>();
	let prefix = indices[0];
	for (let i = 1; i < indices.length; i++) {
		const pixel = indices[i];
		const key = prefix * MAX_COLORS + pixel;
		const existing = dictionary.get(key);
		if (existing !== undefined) {
			prefix = existing;
			continue;
		}

		writer.writeCode(prefix, codeSize);
		dictionary.set(key, nextCode);
		nextCode += 1;

		if (nextCode === (1 << codeSize) && codeSize < 12) {
			codeSize += 1;
		} else if (nextCode === 4096) {
			writer.writeCode(clearCode, codeSize);
			dictionary.clear();
			codeSize = minCodeSize + 1;
			nextCode = endCode + 1;
		}

		prefix = pixel;
	}

	writer.writeCode(prefix, codeSize);
	writer.writeCode(endCode, codeSize);
	return writeSubBlocks(writer.finish());
}

function writeUint16(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff];
}

export class GifEncoder {
	private readonly width: number;
	private readonly height: number;
	private readonly output: number[] = [];

	constructor({ width, height }: { width: number; height: number }, { loop = true }: { loop?: boolean } = {}) {
		this.width = width;
		this.height = height;

		this.output.push(...[0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
		this.output.push(...writeUint16(width));
		this.output.push(...writeUint16(height));
		// No global color table; 8-bit color resolution.
		this.output.push(0x70, 0x00, 0x00);

		if (loop) {
			this.output.push(
				0x21, 0xff, 0x0b,
				0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
				0x03, 0x01,
			);
			this.output.push(...writeUint16(0));
			this.output.push(0x00);
		}
	}

	addFrame(frame: GifFrameInput): void {
		const pixelCount = frame.data.length / 4;
		if (pixelCount !== this.width * this.height) {
			throw new Error(
				`GIF frame is ${pixelCount} pixels but expected ${this.width * this.height}`,
			);
		}

		const counts = buildHistogram(frame.data);
		const cellToIndex = buildCellToIndex(counts);

		const indices = new Uint8Array(pixelCount);
		for (let i = 0; i < pixelCount; i++) {
			const r = frame.data[i * 4] >> (8 - HIST_BITS);
			const g = frame.data[i * 4 + 1] >> (8 - HIST_BITS);
			const b = frame.data[i * 4 + 2] >> (8 - HIST_BITS);
			indices[i] = cellToIndex[(r << (HIST_BITS * 2)) | (g << HIST_BITS) | b];
		}

		// Recompute the palette as the box colors in index order.
		const boxColors = new Map<number, { r: number; g: number; b: number; total: number }>();
		for (let i = 0; i < pixelCount; i++) {
			const index = indices[i];
			const r = frame.data[i * 4];
			const g = frame.data[i * 4 + 1];
			const b = frame.data[i * 4 + 2];
			const existing = boxColors.get(index);
			if (existing) {
				existing.r += r;
				existing.g += g;
				existing.b += b;
				existing.total += 1;
			} else {
				boxColors.set(index, { r, g, b, total: 1 });
			}
		}

		const colorCount = boxColors.size;
		let minCodeSize = 2;
		while ((1 << minCodeSize) < colorCount) minCodeSize += 1;
		const paddedSize = 1 << minCodeSize;

		const palette: number[] = [];
		for (let index = 0; index < paddedSize; index++) {
			const color = boxColors.get(index);
			if (color) {
				palette.push(
					Math.round(color.r / color.total),
					Math.round(color.g / color.total),
					Math.round(color.b / color.total),
				);
			} else {
				palette.push(0, 0, 0);
			}
		}

		this.output.push(
			0x21, 0xf9, 0x04,
			0x04, // disposal method 1 (leave in place), no transparency
		);
		this.output.push(...writeUint16(delayToCentiseconds(frame.delayMs)));
		this.output.push(0x00, 0x00);

		this.output.push(0x2c);
		this.output.push(...writeUint16(0));
		this.output.push(...writeUint16(0));
		this.output.push(...writeUint16(this.width));
		this.output.push(...writeUint16(this.height));
		// Local color table flag (1<<7) | color table size (minCodeSize - 1).
		this.output.push(0x80 | (minCodeSize - 1));
		this.output.push(...palette);

		this.output.push(minCodeSize);
		this.output.push(...lzwEncode(indices, minCodeSize));
	}

	finish(): Uint8Array {
		this.output.push(0x3b);
		return new Uint8Array(this.output);
	}
}
