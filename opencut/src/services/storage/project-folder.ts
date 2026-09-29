import { SdkAdapter, type EntityStorageApi } from "./sdk-adapter";

/**
 * Every edit owns one folder in the user's Files app, so an edit's assets,
 * renders, revisions, and transcripts sit together instead of pooling in a
 * single app-wide `Media` bin.
 *
 *   Files/OpenCut/<Edit name> (<short id>)/Media
 *                                         /Exports
 *                                         /Revisions
 *                                         /Transcripts
 *                                         /Storyboards
 *                                         /Animation
 *                                         /Narration
 *
 * The short id keeps two edits that share a display name apart and makes the
 * folder traceable back to the document. Renaming an edit changes the folder
 * for bytes published *after* the rename; already-published artifacts keep
 * their path (Files entries are addressed by publicId, never by path).
 */
export type ProjectFolderSection =
	| "Media"
	| "Exports"
	| "Revisions"
	| "Transcripts"
	| "Storyboards"
	| "Animation"
	| "Narration";

const PROJECT_ENTITY_TYPE = "opencut.project";
const FALLBACK_FOLDER_NAME = "Untitled edit";
const MAX_FOLDER_NAME_LENGTH = 48;
const EDIT_ID_SUFFIX_LENGTH = 8;

const knownNames = new Map<string, string>();
const inFlightLookups = new Map<string, Promise<string | null>>();

function sanitizeFolderName({ name }: { name: string }): string {
	// Folder segments must stay a single path segment and survive every host
	// filesystem, so path separators and control characters collapse to spaces.
	const cleaned = name
		.replace(/[\\/:*?"<>|]/g, " ")
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_FOLDER_NAME_LENGTH)
		.trim()
		// A trailing dot is a reserved name shape on Windows.
		.replace(/\.+$/, "")
		.trim();
	return cleaned || FALLBACK_FOLDER_NAME;
}

/** The per-edit folder segment, e.g. `The New Deck (44fc27eb)`. */
export function projectFolderName({
	editId,
	name,
}: {
	editId: string;
	name?: string;
}): string {
	const label = sanitizeFolderName({ name: name ?? "" });
	return `${label} (${editId.slice(0, EDIT_ID_SUFFIX_LENGTH)})`;
}

/**
 * Record an edit's display name so later publishes can name its folder without
 * a round trip. Callers that already hold project metadata should call this.
 */
export function rememberProjectName({
	editId,
	name,
}: {
	editId: string;
	name?: string;
}): void {
	if (!editId) return;
	const trimmed = name?.trim();
	if (!trimmed) return;
	knownNames.set(editId, trimmed);
}

/** Folder path for an edit whose name the caller already knows. */
export function projectFolder({
	editId,
	name,
	section,
}: {
	editId: string;
	name?: string;
	section: ProjectFolderSection;
}): string {
	rememberProjectName({ editId, name });
	return `${projectFolderName({ editId, name: name ?? knownNames.get(editId) })}/${section}`;
}

async function lookupProjectName({
	editId,
	entityApi,
}: {
	editId: string;
	entityApi?: EntityStorageApi;
}): Promise<string | null> {
	const adapter = new SdkAdapter<{ metadata?: { name?: unknown } }>({
		entityType: PROJECT_ENTITY_TYPE,
		...(entityApi ? { entityApi } : {}),
	});
	const value = await adapter.get(editId);
	const name = value?.metadata?.name;
	return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
}

/**
 * Folder path for an edit whose name the caller does not hold. Falls back to
 * one cached read of the stored document; a failed read still yields a stable
 * per-edit folder, just without the display name.
 */
export async function resolveProjectFolder({
	editId,
	section,
	entityApi,
}: {
	editId: string;
	section: ProjectFolderSection;
	entityApi?: EntityStorageApi;
}): Promise<string> {
	const cached = knownNames.get(editId);
	if (cached) return `${projectFolderName({ editId, name: cached })}/${section}`;

	let lookup = inFlightLookups.get(editId);
	if (!lookup) {
		lookup = lookupProjectName({ editId, ...(entityApi ? { entityApi } : {}) })
			.catch(() => null)
			.finally(() => inFlightLookups.delete(editId));
		inFlightLookups.set(editId, lookup);
	}
	const name = await lookup;
	if (name) knownNames.set(editId, name);
	return `${projectFolderName({ editId, ...(name ? { name } : {}) })}/${section}`;
}

/** Late-bound folder for `SdkBinaryAdapter`, resolved at publish time. */
export function projectFolderRef({
	editId,
	section,
	entityApi,
}: {
	editId: string;
	section: ProjectFolderSection;
	entityApi?: EntityStorageApi;
}): () => Promise<string> {
	return () =>
		resolveProjectFolder({
			editId,
			section,
			...(entityApi ? { entityApi } : {}),
		});
}
