import { describe, expect, test } from "bun:test";
import { GifEncoder } from "./gif-encoder";

interface DecodedFrame {
	width: number;
	height: number;
	pixels: Uint8ClampedArray;
}

class BitReader {
	private offset = 0;
	constructor(private readonly bytes: Uint8Array) {}

	readBits(count: number): number {
		let value = 0;
		for (let i = 0; i < count; i++) {
			const byteIndex = Math.floor(this.offset / 8);
			const bitIndex = this.offset % 8;
			const bit = (this.bytes[byteIndex] >> bitIndex) & 1;
			value |= bit << i;
			this.offset += 1;
		}
		return value;
	}
}

function readSubBlocks(bytes: Uint8Array, start: number): { data: Uint8Array; next: number } {
	const chunks: number[] = [];
	let offset = start;
	while (offset < bytes.length) {
		const length = bytes[offset];
		offset += 1;
		if (length === 0) break;
		for (let i = 0; i < length; i++) chunks.push(bytes[offset + i]);
		offset += length;
	}
	return { data: new Uint8Array(chunks), next: offset };
}

function lzwDecode(indices: Uint8Array, minCodeSize: number): number[] {
	const clearCode = 1 << minCodeSize;
	const endCode = clearCode + 1;
	let codeSize = minCodeSize + 1;

	const dictionary: number[][] = [];
	for (let i = 0; i < clearCode; i++) dictionary.push([i]);
	dictionary.push([]); // clear code placeholder
	dictionary.push([]); // end code placeholder
	let avail = dictionary.length;

	const reader = new BitReader(indices);
	const output: number[] = [];

	let code = reader.readBits(codeSize);
	if (code !== clearCode) throw new Error(`Expected clear code, got ${code}`);

	code = reader.readBits(codeSize);
	if (code === endCode) return output;
	output.push(...dictionary[code]);
	let prev = code;

	while (true) {
		code = reader.readBits(codeSize);
		if (code === endCode) break;
		if (code === clearCode) {
			dictionary.length = 0;
			for (let i = 0; i < clearCode; i++) dictionary.push([i]);
			dictionary.push([]);
			dictionary.push([]);
			avail = dictionary.length;
			codeSize = minCodeSize + 1;
			code = reader.readBits(codeSize);
			if (code === endCode) break;
			output.push(...dictionary[code]);
			prev = code;
			continue;
		}

		let entry: number[];
		if (code < avail) {
			entry = dictionary[code];
		} else if (code === avail) {
			entry = [...dictionary[prev], dictionary[prev][0]];
		} else {
			throw new Error(`Invalid LZW code ${code}`);
		}

		output.push(...entry);
		dictionary.push([...dictionary[prev], entry[0]]);
		avail = dictionary.length;
		prev = code;

		if (avail === (1 << codeSize) - 1 && codeSize < 12) {
			codeSize += 1;
		}
	}

	return output;
}

function decodeFirstFrame(bytes: Uint8Array): DecodedFrame {
	expect(bytes.subarray(0, 6)).toEqual(
		new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
	);
	const width = bytes[6] | (bytes[7] << 8);
	const height = bytes[8] | (bytes[9] << 8);
	const packed = bytes[10];
	const hasGlobalColorTable = (packed & 0x80) !== 0;

	let offset = 13;
	if (hasGlobalColorTable) {
		const tableSize = 1 << ((packed & 0x07) + 1);
		offset += tableSize * 3;
	}

	while (offset < bytes.length) {
		const blockType = bytes[offset];
		if (blockType === 0x3b) break;
		if (blockType === 0x21) {
			offset += 2;
			// Consume any remaining sub-blocks (both application identifiers
			// and graphic-control data are [size][data] sub-blocks).
			while (bytes[offset] !== 0) {
				offset += 1 + bytes[offset];
			}
			offset += 1;
			continue;
		}
		if (blockType === 0x2c) {
			const left = bytes[offset + 1] | (bytes[offset + 2] << 8);
			const top = bytes[offset + 3] | (bytes[offset + 4] << 8);
			const w = bytes[offset + 5] | (bytes[offset + 6] << 8);
			const h = bytes[offset + 7] | (bytes[offset + 8] << 8);
			const imagePacked = bytes[offset + 9];
			offset += 10;

			let palette: number[] = [];
			if (imagePacked & 0x80) {
				const tableSize = 1 << ((imagePacked & 0x07) + 1);
				palette = Array.from(bytes.subarray(offset, offset + tableSize * 3));
				offset += tableSize * 3;
			}

			const minCodeSize = bytes[offset];
			offset += 1;
			const { data, next } = readSubBlocks(bytes, offset);
			offset = next;

			const indices = lzwDecode(data, minCodeSize);
			const pixels = new Uint8ClampedArray(w * h * 4);
			for (let i = 0; i < indices.length; i++) {
				const index = indices[i];
				pixels[i * 4] = palette[index * 3];
				pixels[i * 4 + 1] = palette[index * 3 + 1];
				pixels[i * 4 + 2] = palette[index * 3 + 2];
				pixels[i * 4 + 3] = 255;
			}
			void left;
			void top;
			return { width: w, height: h, pixels };
		}
		break;
	}

	throw new Error("No image descriptor found in GIF");
}

describe("GifEncoder", () => {
	test("round-trips a solid-color frame through LZW", () => {
		const width = 4;
		const height = 3;
		const data = new Uint8ClampedArray(width * height * 4);
		for (let i = 0; i < width * height; i++) {
			data[i * 4] = 0xff;
			data[i * 4 + 1] = 0x00;
			data[i * 4 + 2] = 0x00;
			data[i * 4 + 3] = 0xff;
		}

		const encoder = new GifEncoder({ width, height });
		encoder.addFrame({ data, delayMs: 100 });
		const bytes = encoder.finish();

		expect(bytes[bytes.length - 1]).toBe(0x3b);

		const decoded = decodeFirstFrame(bytes);
		expect(decoded.width).toBe(width);
		expect(decoded.height).toBe(height);
		for (let i = 0; i < width * height; i++) {
			expect(decoded.pixels[i * 4]).toBe(255);
			expect(decoded.pixels[i * 4 + 1]).toBe(0);
			expect(decoded.pixels[i * 4 + 2]).toBe(0);
		}
	});

	test("round-trips a two-color pattern with distinct palette entries", () => {
		const width = 2;
		const height = 2;
		const colors = [
			[0x00, 0x00, 0x00],
			[0xff, 0xff, 0xff],
		];
		const data = new Uint8ClampedArray(width * height * 4);
		for (let i = 0; i < width * height; i++) {
			const color = colors[i % 2];
			data[i * 4] = color[0];
			data[i * 4 + 1] = color[1];
			data[i * 4 + 2] = color[2];
			data[i * 4 + 3] = 0xff;
		}

		const encoder = new GifEncoder({ width, height });
		encoder.addFrame({ data, delayMs: 33 });
		const bytes = encoder.finish();

		const decoded = decodeFirstFrame(bytes);
		for (let i = 0; i < width * height; i++) {
			expect(decoded.pixels[i * 4]).toBe(i % 2 === 0 ? 0 : 255);
			expect(decoded.pixels[i * 4 + 1]).toBe(i % 2 === 0 ? 0 : 255);
			expect(decoded.pixels[i * 4 + 2]).toBe(i % 2 === 0 ? 0 : 255);
		}
	});

	test("round-trips a many-color frame across code-size growth", () => {
		const width = 64;
		const height = 4;
		const data = new Uint8ClampedArray(width * height * 4);
		for (let i = 0; i < width * height; i++) {
			data[i * 4] = (i * 37) % 256;
			data[i * 4 + 1] = (i * 61) % 256;
			data[i * 4 + 2] = (i * 97) % 256;
			data[i * 4 + 3] = 0xff;
		}

		const encoder = new GifEncoder({ width, height });
		encoder.addFrame({ data, delayMs: 40 });
		const bytes = encoder.finish();

		const decoded = decodeFirstFrame(bytes);
		expect(decoded.width).toBe(width);
		expect(decoded.height).toBe(height);
		// GIF is palette-limited: each source pixel must map back to one of the
		// palette colors, so a decoded pixel is at most a quantization step away.
		for (let i = 0; i < width * height; i++) {
			for (let c = 0; c < 3; c++) {
				const source = data[i * 4 + c];
				const result = decoded.pixels[i * 4 + c];
				expect(Math.abs(source - result)).toBeLessThanOrEqual(4);
			}
		}
	});
});
