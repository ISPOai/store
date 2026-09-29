import { ACTIONS, type TActionWithOptionalArgs } from "@/actions";
import { isKey, type ModifierKeys, type ShortcutKey } from "@/actions/keybinding";
import { runMigrations } from "./migrations";
import {
	getPersistedKeybindingsState,
	type PersistedKeybindingsState,
} from "./persisted-state";

export interface DecodedKeybindingsState {
	keybindings: Map<ShortcutKey, TActionWithOptionalArgs>;
	isCustomized: boolean;
}

const MODIFIER_KEYS: ReadonlySet<string> = new Set<ModifierKeys>([
	"ctrl",
	"alt",
	"shift",
	"ctrl+shift",
	"alt+shift",
	"ctrl+alt",
	"ctrl+alt+shift",
]);

const ACTIONS_REQUIRING_ARGS: ReadonlySet<string> = new Set([
	"remove-media-asset",
	"remove-media-assets",
]);

function isShortcutKey(value: string): value is ShortcutKey {
	const parts = value.split("+");
	const key = parts.pop();
	if (!key || !isKey(key)) return false;
	return parts.length === 0 || MODIFIER_KEYS.has(parts.join("+"));
}

function isActionWithOptionalArgs(
	value: string,
): value is TActionWithOptionalArgs {
	return Object.hasOwn(ACTIONS, value) && !ACTIONS_REQUIRING_ARGS.has(value);
}

export function serializeKeybindingsState({
	keybindings,
	isCustomized,
}: DecodedKeybindingsState): PersistedKeybindingsState {
	return {
		keybindings: Object.fromEntries(keybindings),
		isCustomized,
	};
}

export function migratePersistedKeybindingsState({
	state,
	fromVersion,
}: {
	state: unknown;
	fromVersion: number;
}): unknown {
	return runMigrations({ state, fromVersion });
}

/**
 * Decode a persisted/migrated keybindings blob into the in-memory shape.
 *
 * Lossy by design: invalid entries are dropped and a warning is emitted, so the
 * user falls back to (mostly) sensible defaults instead of a broken store.
 * Returns `null` if the top-level shape is unrecognizable, in which case the
 * caller should keep its current state.
 */
export function decodePersistedKeybindingsState({
	state,
}: {
	state: unknown;
}): DecodedKeybindingsState | null {
	const persisted = getPersistedKeybindingsState({ state });
	if (!persisted) {
		console.warn(
			"[keybindings] Persisted state has unexpected shape; keeping current keybindings.",
			state,
		);
		return null;
	}

	const keybindings = new Map<ShortcutKey, TActionWithOptionalArgs>();
	const dropped: Array<{ key: string; action: string | undefined }> = [];
	for (const [key, action] of Object.entries(persisted.keybindings)) {
		if (action === undefined) continue;
		if (!isShortcutKey(key) || !isActionWithOptionalArgs(action)) {
			dropped.push({ key, action });
			continue;
		}

		keybindings.set(key, action);
	}

	if (dropped.length > 0) {
		console.warn(
			"[keybindings] Dropped invalid persisted entries:",
			dropped,
		);
	}

	return {
		keybindings,
		isCustomized: persisted.isCustomized,
	};
}

/**
 * Parse a user-supplied keybindings configuration (typically the output of
 * `JSON.parse` on an imported file).
 *
 * Strict by design: throws on the first invalid entry so the caller can surface
 * the failure to the user instead of silently producing a half-applied import.
 * Accepts `unknown` because the input has already crossed a trust boundary.
 */
export function parseImportedKeybindings({
	config,
}: {
	config: unknown;
}): Map<ShortcutKey, TActionWithOptionalArgs> {
	if (typeof config !== "object" || config === null || Array.isArray(config)) {
		throw new Error("Imported keybindings must be a JSON object");
	}

	const result = new Map<ShortcutKey, TActionWithOptionalArgs>();
	for (const [key, action] of Object.entries(config)) {
		if (action === undefined) continue;
		if (typeof action !== "string") {
			throw new Error(
				`Invalid action for "${key}": expected string, got ${typeof action}`,
			);
		}
		if (!isShortcutKey(key)) {
			throw new Error(`Invalid shortcut key: ${JSON.stringify(key)}`);
		}
		if (!isActionWithOptionalArgs(action)) {
			throw new Error(
				`Invalid action for "${key}": ${JSON.stringify(action)}`,
			);
		}
		result.set(key, action);
	}
	return result;
}
