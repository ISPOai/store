import type { ProductionDocumentSdk } from "@/project/production-document-service";
import { lutRegistry } from "@/effects/lut/registry";
import { storageService } from "@/services/storage/service";

export interface ListLutsResult {
	kind: "json";
	data: {
		luts: Array<{ id: string; name: string; source: "bundled" | "user" }>;
	};
}

export async function listLuts(_sdk: ProductionDocumentSdk): Promise<ListLutsResult> {
	const bundled = lutRegistry
		.list()
		.filter((lut) => lut.source === "bundled")
		.map(({ id, name, source }) => ({ id, name, source }));

	let user: Array<{ id: string; name: string; source: "user" }> = [];
	try {
		const { luts } = await storageService.loadLuts();
		user = luts.map((lut) => ({ id: lut.id, name: lut.name, source: "user" as const }));
	} catch (error) {
		console.error("Failed to read user LUTs:", error);
	}

	return {
		kind: "json",
		data: { luts: [...bundled, ...user] },
	};
}
