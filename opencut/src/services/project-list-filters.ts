import type { ProductionDocumentSdk } from "@/project/production-document-service";
import { filterRegistry } from "@/effects/filters/registry";
import type { FilterAdjustParams } from "@/effects/filters/types";

export interface ListFiltersResult {
	kind: "json";
	data: {
		filters: Array<{
			id: string;
			name: string;
			category: string;
			keywords: string[];
			adjust: FilterAdjustParams;
			lutId?: string;
		}>;
	};
}

export async function listFilters(_sdk: ProductionDocumentSdk): Promise<ListFiltersResult> {
	const filters = filterRegistry.list().map(({ id, name, category, keywords, adjust, lutId }) => ({
		id,
		name,
		category,
		keywords,
		adjust: { ...adjust },
		...(lutId ? { lutId } : {}),
	}));

	return {
		kind: "json",
		data: { filters },
	};
}
