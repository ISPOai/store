import { files } from "@ispo/sdk";

// ISPO: user artifacts leave this app through the Files powerbox, never a
// browser download. A downloaded file lands outside the platform's storage
// planes — invisible to Files, to other projects, and to agents — so the host
// build rejects `<a download>` exits (spec §25). The picker is the consent
// surface; `false` means the user cancelled, which is an ordinary outcome.
export async function saveBlobToFiles({
	blob,
	filename,
}: {
	blob: Blob;
	filename: string;
}): Promise<boolean> {
	const saved = await files.save({
		content: new Uint8Array(await blob.arrayBuffer()),
		name: filename,
		...(blob.type ? { accept: [blob.type] } : {}),
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
