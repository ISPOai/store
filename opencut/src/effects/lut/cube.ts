/**
 * A parsed 3D `.cube` LUT. `data` holds `size^3` RGB triplets (length
 * `size^3 * 3`) with each channel normalized to `0..1`.
 */
export interface ParsedCubeLut {
	size: number;
	data: number[];
	domainMin: number;
	domainMax: number;
}

/**
 * Parse an Iridas/Resolve `.cube` LUT. Handles comments (`#`), `TITLE`,
 * `DOMAIN_MIN`/`DOMAIN_MAX`, and `LUT_3D_SIZE` (required). `LUT_1D_SIZE` is
 * tolerated (its entries are skipped); a file with only a 1D LUT is rejected
 * because the renderer samples a 3D texture.
 */
export function parseCubeLut(text: string): ParsedCubeLut {
	let domainMin = 0;
	let domainMax = 1;
	let lut1dSize: number | null = null;
	let lut3dSize: number | null = null;

	// Data is collected per active section so a file carrying both a 1D and a
	// 3D block keeps their entries separated.
	let active: "1d" | "3d" | null = null;
	const data1d: number[] = [];
	const data3d: number[] = [];

	for (const rawLine of text.split(/\r?\n/)) {
		const line = stripComment(rawLine).trim();
		if (!line) continue;

		const upper = line.toUpperCase();
		if (upper.startsWith("TITLE")) continue;

		if (upper.startsWith("DOMAIN_MIN")) {
			const value = readHeaderValue(line, "DOMAIN_MIN");
			if (value !== null) domainMin = value;
			continue;
		}
		if (upper.startsWith("DOMAIN_MAX")) {
			const value = readHeaderValue(line, "DOMAIN_MAX");
			if (value !== null) domainMax = value;
			continue;
		}
		if (upper.startsWith("LUT_1D_SIZE")) {
			const value = readHeaderValue(line, "LUT_1D_SIZE");
			if (value === null) continue;
			lut1dSize = value;
			active = "1d";
			continue;
		}
		if (upper.startsWith("LUT_3D_SIZE")) {
			const value = readHeaderValue(line, "LUT_3D_SIZE");
			if (value === null) continue;
			lut3dSize = value;
			active = "3d";
			continue;
		}

		// A bare data row: three numbers.
		const triplet = parseTriplet(line);
		if (!triplet) continue;
		if (active === "1d") data1d.push(...triplet);
		else if (active === "3d") data3d.push(...triplet);
		// Rows before any LUT header are ignored.
	}

	if (lut3dSize === null) {
		if (lut1dSize !== null) {
			throw new Error("Only a 1D LUT was found; a LUT_3D_SIZE is required.");
		}
		throw new Error("No LUT_3D_SIZE header found.");
	}
	if (!Number.isInteger(lut3dSize) || lut3dSize < 2 || lut3dSize > 65) {
		throw new Error(`LUT_3D_SIZE must be an integer between 2 and 65, got ${lut3dSize}.`);
	}

	const expected = lut3dSize * lut3dSize * lut3dSize * 3;
	if (data3d.length < expected) {
		throw new Error(
			`LUT_3D_SIZE ${lut3dSize} requires ${expected} values, found ${data3d.length}.`,
		);
	}

	return {
		size: lut3dSize,
		data: data3d.slice(0, expected),
		domainMin,
		domainMax,
	};
}

function stripComment(line: string): string {
	const index = line.indexOf("#");
	return index === -1 ? line : line.slice(0, index);
}

function readHeaderValue(line: string, keyword: string): number | null {
	const match = line.match(new RegExp(`^${keyword}\\s+(\\S+)`, "i"));
	if (!match) return null;
	const value = Number.parseFloat(match[1]);
	return Number.isFinite(value) ? value : null;
}

function parseTriplet(line: string): [number, number, number] | null {
	const parts = line.trim().split(/\s+/).map(Number);
	if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
	return [parts[0], parts[1], parts[2]];
}
