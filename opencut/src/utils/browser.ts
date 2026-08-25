import { files } from "@ispo/sdk";

export function downloadBlob({
	blob,
	filename,
}: {
	blob: Blob;
	filename: string;
}): Promise<boolean> {
	return blob.arrayBuffer().then(async (buffer) => {
		const content = new Uint8Array(buffer);
		const saved = await files.save(blob.type
			? { content, name: filename, accept: [blob.type] }
			: { content, name: filename });
		return saved !== null;
	});
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
