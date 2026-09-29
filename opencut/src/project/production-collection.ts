// ponytail: serialize media collection per edit in the mounted app. Durable CAS
// remains authoritative across app reloads and other document writers.
const collections = new Map<string, Promise<void>>();

export function isProductionCollectionActive(editId: string): boolean {
	return collections.has(editId);
}

export async function serializeProductionCollection<T>(
	editId: string,
	operation: () => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	const work = (collections.get(editId) ?? Promise.resolve()).then(() => {
		signal?.throwIfAborted();
		return operation();
	});
	const settled = work.then(() => undefined, () => undefined);
	collections.set(editId, settled);
	try {
		return await work;
	} finally {
		if (collections.get(editId) === settled) collections.delete(editId);
	}
}
