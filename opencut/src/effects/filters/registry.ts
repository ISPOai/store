import type { FilterDefinition } from "./types";
import { FILTER_PRESETS } from "./presets";

class FilterRegistry {
	private entries = new Map<string, FilterDefinition>();

	constructor() {
		for (const definition of FILTER_PRESETS) {
			this.entries.set(definition.id, definition);
		}
	}

	get(id: string): FilterDefinition | undefined {
		return this.entries.get(id);
	}

	has(id: string): boolean {
		return this.entries.has(id);
	}

	list(): FilterDefinition[] {
		return [...this.entries.values()];
	}
}

export const filterRegistry = new FilterRegistry();
