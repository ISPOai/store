import type { FilesStorageApi } from "./storage/sdk-adapter";

export async function createContactSheet(input: { sourcePublicIds: string[]; name: string; operationKey: string }, files: FilesStorageApi) {
  const entries = await files.list();
  const width = 960, height = Math.ceil(input.sourcePublicIds.length / 2) * 306;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image preview is unavailable.");
  context.fillStyle = "#171717";
  context.fillRect(0, 0, width, height);
  for (const [index, publicId] of input.sourcePublicIds.entries()) {
    const source = entries.find(entry => entry.publicId === publicId);
    if (!source || !["image/png", "image/jpeg", "image/webp"].includes(source.mimeType) || source.size > 32 * 1024 * 1024) throw new Error("Select owned raster images smaller than 32 MiB.");
    const response = await fetch(source.url);
    if (!response.ok) throw new Error("Cannot read preview source.");
    const bitmap = await createImageBitmap(await response.blob());
    try {
      if (bitmap.width * bitmap.height > 16_000_000) throw new Error("Image exceeds 16 million pixels.");
      const x = (index % 2) * 480, y = Math.floor(index / 2) * 306;
      const scale = Math.min(480 / bitmap.width, 274 / bitmap.height);
      const w = bitmap.width * scale, h = bitmap.height * scale;
      context.drawImage(bitmap, x + (480 - w) / 2, y + (274 - h) / 2, w, h);
      context.fillStyle = "#ffffff";
      context.font = "16px sans-serif";
      context.fillText(`${index + 1}. ${source.name.slice(0, 60)}`, x + 12, y + 296, 456);
    } finally { bitmap.close(); }
  }
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (blob.type !== "image/jpeg" || bytes.length >= 1024 * 1024) throw new Error("Preview exceeds JPEG size bound.");
  const hash = async (value: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value.slice().buffer)), b => b.toString(16).padStart(2, "0")).join("");
  const sha256 = await hash(bytes);
  const artifact = await files.publish({ content: bytes, name: input.name.endsWith(".jpg") ? input.name : `${input.name}.jpg`, folder: "Reviews", mimeType: "image/jpeg", operationKey: input.operationKey });
  const saved = (await files.list()).find(entry => entry.publicId === artifact.publicId);
  if (!saved || saved.mimeType !== "image/jpeg") throw new Error("Published preview is missing.");
  const readback = await fetch(saved.url);
  if (!readback.ok) throw new Error("Cannot verify preview.");
  const actual = new Uint8Array(await readback.arrayBuffer());
  if (actual.length !== bytes.length || saved.size !== actual.length || await hash(actual) !== sha256 || actual[0] !== 255 || actual[1] !== 216) throw new Error("Published preview differs from encoded bytes.");
  const decoded = await createImageBitmap(new Blob([actual], { type: "image/jpeg" }));
  try { if (decoded.width !== width || decoded.height !== height) throw new Error("Preview dimensions differ."); } finally { decoded.close(); }
  let binary = "";
  for (let i = 0; i < actual.length; i += 8192) binary += String.fromCharCode(...actual.subarray(i, i + 8192));
  return { kind: "json" as const, data: { publicId: artifact.publicId, path: artifact.path, mimeType: "image/jpeg", byteLength: actual.length, width, height, sha256, verifiedBytes: true, previewBase64: btoa(binary) } };
}
