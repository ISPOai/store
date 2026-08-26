export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// rAF in real tabs; setTimeout fallback for hidden/throttled headless tabs.
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(settle);
    setTimeout(settle, 50);
  });
}

// Port seam. Upstream hands the artifact to the browser as a download. A
// `.download` assignment is a hard build error in this host (spec §25): a
// browser download lands outside the storage planes, invisible to Files, other
// projects and agents. The artifact goes to the host save dialog instead, which
// is its own consent surface, so nothing has to be granted up front.
export function downloadBlob(blob: Blob, filename: string): void {
  void saveBlobThroughFiles(blob, filename);
}

async function saveBlobThroughFiles(blob: Blob, filename: string): Promise<void> {
  const { files } = await import('@ispo/sdk');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await files.save({ suggestedName: filename, data: bytes, mimeType: blob.type || undefined });
}

export function dragHasFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'Files') return true;
  }
  return false;
}
