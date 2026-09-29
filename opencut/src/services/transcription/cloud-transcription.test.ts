import { describe, expect, test } from "bun:test";
import { encodePcm16Wav } from "./cloud-transcription";

function readString(bytes: Uint8Array, offset: number, length: number): string {
	let out = "";
	for (let i = 0; i < length; i++) {
		out += String.fromCharCode(bytes[offset + i]);
	}
	return out;
}

describe("encodePcm16Wav", () => {
	test("writes a mono PCM16 WAV header with the requested sample rate", () => {
		const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
		const bytes = encodePcm16Wav({ samples, sampleRate: 16_000 });

		expect(readString(bytes, 0, 4)).toBe("RIFF");
		expect(readString(bytes, 8, 4)).toBe("WAVE");
		expect(readString(bytes, 12, 4)).toBe("fmt ");
		expect(readString(bytes, 36, 4)).toBe("data");

		const view = new DataView(bytes.buffer);
		expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
		expect(view.getUint16(20, true)).toBe(1);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(16_000);
		expect(view.getUint32(28, true)).toBe(16_000 * 2);
		expect(view.getUint16(34, true)).toBe(16);
		expect(view.getUint32(40, true)).toBe(samples.length * 2);
		expect(bytes.byteLength).toBe(44 + samples.length * 2);
	});

	test("clamps and quantizes samples to 16-bit PCM", () => {
		const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]);
		const bytes = encodePcm16Wav({ samples, sampleRate: 8_000 });
		const pcm = new Int16Array(bytes.buffer, 44, samples.length);

		expect(pcm[0]).toBe(0);
		expect(pcm[1]).toBe(Math.trunc(0.5 * 0x7fff));
		expect(pcm[2]).toBe(Math.trunc(-0.5 * 0x8000));
		expect(pcm[3]).toBe(0x7fff);
		expect(pcm[4]).toBe(-0x8000);
		expect(pcm[5]).toBe(0x7fff);
		expect(pcm[6]).toBe(-0x8000);
	});

	test("handles empty audio with only the header", () => {
		const bytes = encodePcm16Wav({ samples: new Float32Array(0), sampleRate: 16_000 });
		expect(bytes.byteLength).toBe(44);
		expect(readString(bytes, 0, 4)).toBe("RIFF");
		expect(readString(bytes, 36, 4)).toBe("data");
	});
});
