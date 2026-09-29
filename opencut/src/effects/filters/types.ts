/**
 * A movie-style color preset composed of color-adjustment deltas and an
 * optional 3D LUT. Each delta is a full-strength offset from neutral (0) in
 * the same -100..100 space as the adjust effect's scalar parameters.
 */
export interface FilterAdjustParams {
	exposure?: number;
	contrast?: number;
	saturation?: number;
	temperature?: number;
	tint?: number;
	highlights?: number;
	shadows?: number;
}

export const FILTER_ADJUST_KEYS = [
	"exposure",
	"contrast",
	"saturation",
	"temperature",
	"tint",
	"highlights",
	"shadows",
] as const;

export type FilterAdjustKey = (typeof FILTER_ADJUST_KEYS)[number];

export interface FilterDefinition {
	id: string;
	name: string;
	category: string;
	keywords: string[];
	/** Full-strength adjust deltas. Omitted keys are neutral (0). */
	adjust: FilterAdjustParams;
	/** Optional bundled LUT id applied at the filter's intensity. */
	lutId?: string;
}
