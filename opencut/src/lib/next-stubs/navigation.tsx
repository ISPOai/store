// next/navigation drop-in for OpenCut running inside a ISPO iframe.
//
// OpenCut's editor-provider uses `useParams` to get `project_id` from the
// route AND uses `useRouter.replace` to switch to a freshly-created project
// when the requested one doesn't exist. If router.replace is a no-op,
// useParams keeps returning the old id and the editor loops creating
// orphan projects forever.
//
// Solution: a single module-level project-id store, wired to useParams via
// useSyncExternalStore. router.push/replace parse `/editor/<id>` out of the
// href and write to the store, which triggers all useParams subscribers to
// re-read. Persist the active id in localStorage so it survives reloads.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "opencut.active-project-id";
const DEFAULT_PROJECT_ID = "default";

let currentProjectId: string | null = null;
const listeners = new Set<() => void>();

function loadInitial(): string {
	if (currentProjectId !== null) return currentProjectId;
	if (typeof localStorage !== "undefined") {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			currentProjectId = stored;
			return stored;
		}
	}
	currentProjectId = DEFAULT_PROJECT_ID;
	return DEFAULT_PROJECT_ID;
}

function setCurrentProjectId(next: string): void {
	if (next === currentProjectId) return;
	currentProjectId = next;
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(STORAGE_KEY, next);
	}
	for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

function getSnapshot(): string {
	return currentProjectId ?? loadInitial();
}

export function useParams(): Record<string, string> {
	const id = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	return { project_id: id };
}

interface StubRouter {
	push(href: string): void;
	replace(href: string): void;
	back(): void;
	forward(): void;
	refresh(): void;
	prefetch(href: string): void;
}

function extractEditorProjectId(href: string): string | null {
	const match = /\/editor\/([^/?#]+)/.exec(href);
	return match ? decodeURIComponent(match[1]) : null;
}

// Stable singleton — OpenCut's editor-provider has `[projectId, router]` in a
// useEffect deps array. Returning a fresh object on every render would tear
// the editor down on every commit and (combined with the not-found ->
// createNewProject -> router.replace catch path) create infinite orphan
// projects. The router carries no per-call state; one instance for the whole
// iframe lifetime is correct.
const stubRouter: StubRouter = {
	push: (href) => {
		const id = extractEditorProjectId(href);
		if (id) setCurrentProjectId(id);
	},
	replace: (href) => {
		const id = extractEditorProjectId(href);
		if (id) setCurrentProjectId(id);
	},
	back: () => {},
	forward: () => {},
	refresh: () => {},
	prefetch: () => {},
};

export function useRouter(): StubRouter {
	return stubRouter;
}

export function useSearchParams(): URLSearchParams {
	return new URLSearchParams();
}

export function usePathname(): string {
	return "/";
}

export function notFound(): never {
	throw new Error("notFound() called — no router inside a ISPO iframe");
}

export function redirect(href: string): never {
	throw new Error(`redirect("${href}") called — no router inside a ISPO iframe`);
}
