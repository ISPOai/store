// Stub for `content-collections`. OpenCut uses this for build-time blog and
// changelog content; we dropped both. The changelog notification component
// still calls getSortedReleases() against `allChangelogs`, so returning an
// empty array makes that surface render nothing — correct behavior for a
// vendored editor that isn't publishing release notes from inside ISPO.

export interface ChangelogEntry {
	version: string;
	published?: boolean;
	[key: string]: unknown;
}

export const allChangelogs: ChangelogEntry[] = [];
