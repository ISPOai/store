import { useEffect, useState } from "react";
import { connectToHost } from "@ispo/sdk";

export type Theme = "dark" | "light";

// The ISPO host owns the theme. Its SDK (`connectToHost`, called once in
// main.tsx) receives the host's `ispo:theme` messages and does all the DOM
// work for us: it toggles the `.dark` class, sets `color-scheme`, writes
// `data-ispo-theme` on <html>, and re-dispatches an `ispo:theme` CustomEvent
// on window. OpenCut's CSS keys off `.dark` / `[data-ispo-theme="dark"]`, so
// the visual theme already follows the host with zero work here.
//
// This hook exists only to expose the current mode to React components that
// need the *value* (e.g. the Sonner toaster's `theme` prop). It is read-only:
// there is no project-side API to set the host theme, so we never write it.
//
// `connectToHost()` is ref-counted and idempotent — main.tsx holds the primary
// handle; reading it here just gives us the host's most recent value.
const connection = connectToHost();

function readHostTheme(): Theme {
	// `connection.theme` is the host's most recent value, or null before its
	// first message lands. Fall back to whatever the SDK already wrote on
	// <html> so we match the rendered theme during that startup window.
	if (connection.theme) return connection.theme;
	if (typeof document !== "undefined") {
		const attr = document.documentElement.dataset.ispoTheme;
		if (attr === "light" || attr === "dark") return attr;
		if (document.documentElement.classList.contains("dark")) return "dark";
	}
	return "light";
}

export function useTheme() {
	const [theme, setTheme] = useState<Theme>(readHostTheme);

	useEffect(() => {
		const sync = () => setTheme(readHostTheme());
		// The host's first theme message can land between initial render and
		// this effect committing, so re-read once on mount, then follow every
		// later host theme change.
		sync();
		window.addEventListener("ispo:theme", sync);
		return () => window.removeEventListener("ispo:theme", sync);
	}, []);

	return { theme };
}
