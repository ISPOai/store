import { files } from "@ispo/sdk";

/**
 * Save a blob through the host powerbox Save dialog (`files.save`) so the
 * user places it in their Files library. Resolves `true` when saved, `false`
 * when the user cancelled the dialog.
 */
export async function saveBlobToFiles({
	blob,
	filename,
}: {
	blob: Blob;
	filename: string;
}): Promise<boolean> {
	const accept = blob.type ? [`${blob.type.split("/")[0]}/`] : undefined;
	const saved = await files.save({
		content: new Uint8Array(await blob.arrayBuffer()),
		name: filename,
		...(accept ? { accept } : {}),
	});
	return saved !== null;
}

export function findScrollParent({
	element,
}: {
	element: HTMLElement;
}): HTMLElement | null {
	let parent = element.parentElement;
	while (parent) {
		const { overflow, overflowX } = window.getComputedStyle(parent);
		if (/auto|scroll/.test(overflow + overflowX)) return parent;
		parent = parent.parentElement;
	}
	return null;
}

export function isTypableDOMElement({
	element,
}: {
	element: HTMLElement;
}): boolean {
	if (element.isContentEditable) return true;

	if (element.tagName === "INPUT") {
		return !(element as HTMLInputElement).disabled;
	}

	if (element.tagName === "TEXTAREA") {
		return !(element as HTMLTextAreaElement).disabled;
	}

	return false;
}
