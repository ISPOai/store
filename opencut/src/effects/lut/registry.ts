import { parseCubeLut, type ParsedCubeLut } from "./cube";

export interface LutDefinition {
	id: string;
	name: string;
	source: "bundled" | "user";
	lut: ParsedCubeLut;
}

export interface BundledLutSource {
	id: string;
	name: string;
	cube: string;
}

class LutRegistry {
	private entries = new Map<string, LutDefinition>();

	register(definition: LutDefinition): void {
		this.entries.set(definition.id, definition);
	}

	unregister(id: string): void {
		this.entries.delete(id);
	}

	get(id: string): LutDefinition | undefined {
		return this.entries.get(id);
	}

	getParsed(id: string): ParsedCubeLut | undefined {
		return this.entries.get(id)?.lut;
	}

	has(id: string): boolean {
		return this.entries.has(id);
	}

	list(): LutDefinition[] {
		return [...this.entries.values()];
	}
}

export const lutRegistry = new LutRegistry();

export function registerBundledLuts({ sources }: { sources: BundledLutSource[] }): void {
	for (const source of sources) {
		if (lutRegistry.has(source.id)) continue;
		lutRegistry.register({
			id: source.id,
			name: source.name,
			source: "bundled",
			lut: parseCubeLut(source.cube),
		});
	}
}
