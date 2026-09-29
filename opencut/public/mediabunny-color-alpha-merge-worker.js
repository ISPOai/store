"use strict";

// Adapted from Mediabunny 1.45.4's colorAlphaMergerWorkerCode.
// Source: https://github.com/Vanilagy/mediabunny (MPL-2.0).
// ISPO serves this worker from the project origin so Mediabunny can preserve
// transparent WebM alpha data without requiring CSP permission for blob: code.
let cpuAlphaBuffer = null;
let cpuColorBuffer = null;
let chain = Promise.resolve();

self.addEventListener("message", (event) => {
	const { id, color, alpha } = event.data;
	chain = chain.then(async () => {
		try {
			const frame = await merge(color, alpha);
			self.postMessage({ id, frame }, { transfer: [frame] });
		} catch (error) {
			self.postMessage({
				id,
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			color.close();
			alpha.close();
		}
	});
});

async function merge(color, alpha) {
	const format = color.format;
	const alphaFormat = alpha.format;
	if (!format || !alphaFormat) {
		throw new Error("CPU color/alpha merging requires a known VideoFrame format.");
	}

	const colorIs10 = format.includes("P10");
	const colorIs12 = format.includes("P12");
	const alphaIs10 = alphaFormat.includes("P10");
	const alphaIs12 = alphaFormat.includes("P12");
	if (alphaIs10 !== colorIs10 || alphaIs12 !== colorIs12) {
		throw new Error(
			"CPU color/alpha merging requires the alpha frame to have the same bit depth as the color frame" +
				` (color: '${format}', alpha: '${alphaFormat}').`,
		);
	}

	const width = color.codedWidth;
	const height = color.codedHeight;
	if (["RGBX", "RGBA", "BGRX", "BGRA"].includes(format)) {
		return mergeInterleavedRgba(color, alpha, width, height, format);
	}
	if (
		["I420", "I420P10", "I420P12", "I422", "I422P10", "I422P12", "I444", "I444P10", "I444P12"].includes(
			format,
		)
	) {
		return mergePlanarYuv(color, alpha, width, height, format);
	}
	if (format === "NV12") {
		return mergeNv12(color, alpha, width, height);
	}

	throw new Error(`CPU color/alpha merging does not support format '${format}'.`);
}

async function mergeInterleavedRgba(color, alpha, width, height, format) {
	const pixelCount = width * height;
	const output = new Uint8Array(pixelCount * 4);
	await color.copyTo(output);

	const alphaY = await readAlpha(alpha, width, height, 1);
	for (let i = 0, j = 3; i < pixelCount; i++, j += 4) {
		output[j] = alphaY[i];
	}

	return new VideoFrame(output, {
		format: format === "RGBX" || format === "RGBA" ? "RGBA" : "BGRA",
		codedWidth: width,
		codedHeight: height,
		timestamp: color.timestamp,
		duration: color.duration ?? undefined,
		transfer: [output.buffer],
	});
}

async function mergePlanarYuv(color, alpha, width, height, format) {
	const is10 = format.includes("P10");
	const is12 = format.includes("P12");
	const bytesPerSample = is10 || is12 ? 2 : 1;

	let chromaWidth;
	let chromaHeight;
	if (format.startsWith("I420")) {
		chromaWidth = Math.ceil(width / 2);
		chromaHeight = Math.ceil(height / 2);
	} else if (format.startsWith("I422")) {
		chromaWidth = Math.ceil(width / 2);
		chromaHeight = height;
	} else {
		chromaWidth = width;
		chromaHeight = height;
	}

	const yBytes = width * height * bytesPerSample;
	const uvBytes = chromaWidth * chromaHeight * bytesPerSample;
	const alphaBytes = width * height * bytesPerSample;
	const output = new Uint8Array(yBytes + 2 * uvBytes + alphaBytes);
	await color.copyTo(output);

	const alphaY = await readAlpha(alpha, width, height, bytesPerSample);
	output.set(alphaY, yBytes + 2 * uvBytes);

	return new VideoFrame(output, {
		format: `${format.slice(0, 4)}A${format.slice(4)}`,
		codedWidth: width,
		codedHeight: height,
		timestamp: color.timestamp,
		duration: color.duration ?? undefined,
		transfer: [output.buffer],
	});
}

async function mergeNv12(color, alpha, width, height) {
	const ySize = width * height;
	const chromaWidth = Math.ceil(width / 2);
	const chromaHeight = Math.ceil(height / 2);
	const uvSize = chromaWidth * chromaHeight;

	const sourceSize = color.allocationSize();
	if (!cpuColorBuffer || cpuColorBuffer.byteLength !== sourceSize) {
		cpuColorBuffer = new Uint8Array(sourceSize);
	}
	await color.copyTo(cpuColorBuffer);

	const output = new Uint8Array(ySize + 2 * uvSize + ySize);
	output.set(cpuColorBuffer.subarray(0, ySize), 0);

	const uOffset = ySize;
	const vOffset = ySize + uvSize;
	for (let i = 0; i < uvSize; i++) {
		output[uOffset + i] = cpuColorBuffer[ySize + i * 2];
		output[vOffset + i] = cpuColorBuffer[ySize + i * 2 + 1];
	}

	const alphaY = await readAlpha(alpha, width, height, 1);
	output.set(alphaY, ySize + 2 * uvSize);

	return new VideoFrame(output, {
		format: "I420A",
		codedWidth: width,
		codedHeight: height,
		timestamp: color.timestamp,
		duration: color.duration ?? undefined,
		transfer: [output.buffer],
	});
}

async function readAlpha(alpha, width, height, bytesPerSample) {
	const size = alpha.allocationSize();
	if (!cpuAlphaBuffer || cpuAlphaBuffer.byteLength !== size) {
		cpuAlphaBuffer = new Uint8Array(size);
	}
	await alpha.copyTo(cpuAlphaBuffer);

	const format = alpha.format;
	if (["RGBA", "BGRA", "RGBX", "BGRX"].includes(format)) {
		const redOffset = format === "RGBA" || format === "RGBX" ? 0 : 2;
		const pixelCount = width * height;
		for (let i = 0; i < pixelCount; i++) {
			cpuAlphaBuffer[i] = cpuAlphaBuffer[i * 4 + redOffset];
		}
		return cpuAlphaBuffer.subarray(0, pixelCount);
	}

	return cpuAlphaBuffer.subarray(0, width * height * bytesPerSample);
}
