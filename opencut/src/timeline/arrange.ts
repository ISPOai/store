import type { MediaAsset } from "@/media/types";
import { whenEditorReady } from "@/services/editor-ready";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { buildElementFromMedia } from "@/timeline/element-utils";
import {
	addMediaTime,
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm";

export interface ArrangedElementSummary {
	name: string;
	type: string;
	startSeconds: number;
	durationSeconds: number;
}

export interface ArrangeTimelineData {
	elements: ArrangedElementSummary[];
	timelineEndSeconds: number;
}

interface ArrangeItemInput {
	mediaId?: string;
	mediaName?: string;
	durationSeconds?: number;
}

interface ArrangeTimelineInput {
	items: ArrangeItemInput[];
	atSeconds?: number;
}

const MAX_LISTED_MEDIA_NAMES = 20;

function listMediaNames({ assets }: { assets: MediaAsset[] }): string {
	const names = assets
		.slice(0, MAX_LISTED_MEDIA_NAMES)
		.map((asset) => `"${asset.name}"`);
	const overflow = assets.length - MAX_LISTED_MEDIA_NAMES;
	return overflow > 0
		? `${names.join(", ")} and ${overflow} more`
		: names.join(", ");
}

function normalizeArrangeTimelineInput({
	input,
}: {
	input: unknown;
}): ArrangeTimelineInput {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return { items: [] };
	}
	const record = input as Record<string, unknown>;
	const normalized: ArrangeTimelineInput = { items: [] };
	if (Array.isArray(record.items)) {
		for (const raw of record.items) {
			if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
				continue;
			}
			const item = raw as Record<string, unknown>;
			normalized.items.push({
				...(typeof item.mediaId === "string" ? { mediaId: item.mediaId } : {}),
				...(typeof item.mediaName === "string"
					? { mediaName: item.mediaName }
					: {}),
				...(typeof item.durationSeconds === "number" &&
				Number.isFinite(item.durationSeconds) &&
				item.durationSeconds > 0
					? { durationSeconds: item.durationSeconds }
					: {}),
			});
		}
	}
	if (
		typeof record.atSeconds === "number" &&
		Number.isFinite(record.atSeconds) &&
		record.atSeconds >= 0
	) {
		normalized.atSeconds = record.atSeconds;
	}
	return normalized;
}

function resolveArrangeAsset({
	assets,
	item,
	index,
}: {
	assets: MediaAsset[];
	item: ArrangeItemInput;
	index: number;
}): MediaAsset {
	if (item.mediaId) {
		const byId = assets.find((asset) => asset.id === item.mediaId);
		if (byId) return byId;
		throw new Error(
			`items[${index}]: no loaded media item has id "${item.mediaId}".`,
		);
	}

	const wanted = item.mediaName?.trim() ?? "";
	if (wanted === "") {
		throw new Error(
			`items[${index}]: pass mediaName (or mediaId) to pick a loaded media item. Loaded: ${listMediaNames({ assets })}.`,
		);
	}

	const exact = assets.filter((asset) => asset.name === wanted);
	if (exact.length === 1) return exact[0];
	if (exact.length > 1) {
		throw new Error(
			`items[${index}]: multiple loaded media items are named "${wanted}". Rename the duplicates in OpenCut, then retry.`,
		);
	}

	const relaxed = assets.filter(
		(asset) => asset.name.toLowerCase() === wanted.toLowerCase(),
	);
	if (relaxed.length === 1) return relaxed[0];

	throw new Error(
		`items[${index}]: no loaded media item is named "${wanted}". Loaded: ${listMediaNames({ assets })}.`,
	);
}

function resolveElementDuration({
	asset,
	item,
}: {
	asset: MediaAsset;
	item: ArrangeItemInput;
}): MediaTime {
	if (asset.type === "image") {
		return item.durationSeconds != null
			? mediaTimeFromSeconds({ seconds: item.durationSeconds })
			: DEFAULT_NEW_ELEMENT_DURATION;
	}
	// Video/audio keep their intrinsic duration; trimming is a follow-up
	// (a shortened `duration` here would corrupt `sourceDuration`).
	return asset.duration != null
		? mediaTimeFromSeconds({ seconds: asset.duration })
		: DEFAULT_NEW_ELEMENT_DURATION;
}

/**
 * Runtime entry for the `arrange-timeline` command (metadata lives in
 * `@/services/project-commands`). Places media library items on the timeline
 * back to back: each item starts where the previous one ends, beginning at
 * `atSeconds` (default: the current end of the timeline). Inserts run through
 * the same InsertElementCommand path as drag-drop, so they are undoable and
 * track placement (main vs overlay vs audio) follows the normal rules.
 */
export async function runArrangeTimeline(
	input: unknown,
): Promise<ArrangeTimelineData> {
	const { items, atSeconds } = normalizeArrangeTimelineInput({ input });
	if (items.length === 0) {
		throw new Error(
			"Pass items: an ordered list of loaded media library entries, each { mediaName } or { mediaId }, with optional durationSeconds for images.",
		);
	}

	const editor = await whenEditorReady();
	const assets = editor.media.getAssets();
	if (assets.length === 0) {
		throw new Error(
			"The open OpenCut project has no media loaded. Import media first (e.g. with the import-assets command), then retry.",
		);
	}

	// Resolve everything before inserting anything, so a bad item fails the
	// whole call instead of arranging half a sequence.
	const resolved = items.map((item, index) => ({
		item,
		asset: resolveArrangeAsset({ assets, item, index }),
	}));

	let cursor: MediaTime =
		atSeconds != null
			? mediaTimeFromSeconds({ seconds: atSeconds })
			: editor.timeline.getTotalDuration();

	const placed: ArrangedElementSummary[] = [];
	for (const { item, asset } of resolved) {
		const duration = resolveElementDuration({ asset, item });
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration,
			startTime: cursor,
		});
		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
		placed.push({
			name: asset.name,
			type: asset.type,
			startSeconds: mediaTimeToSeconds({ time: cursor }),
			durationSeconds: mediaTimeToSeconds({ time: duration }),
		});
		cursor = addMediaTime({ a: cursor, b: duration });
	}

	return {
		elements: placed,
		timelineEndSeconds: mediaTimeToSeconds({
			time: editor.timeline.getTotalDuration(),
		}),
	};
}
