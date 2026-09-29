import type { FilesStorageApi } from "./storage/sdk-adapter";

const signature = [137, 80, 78, 71, 13, 10, 26, 10];
function verifyPng(bytes: Uint8Array) {
  if (bytes.length < 24 || !signature.every((byte, i) => bytes[i] === byte)) throw new Error("Invalid PNG signature.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
async function digest(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), b => b.toString(16).padStart(2, "0")).join("");
}

export async function convertPng(input: { sourcePublicId: string; name: string; operationKey: string }, files: FilesStorageApi) {
  const source = (await files.list()).find(f => f.publicId === input.sourcePublicId);
  if (!source || !["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(source.mimeType)) throw new Error("Select an image in OpenCut Files.");
  if (source.size > 32 * 1024 * 1024) throw new Error("Image exceeds 32 MiB.");
  const response = await fetch(source.url);
  if (!response.ok) throw new Error("Cannot read the source image.");
  const original = new Uint8Array(await response.arrayBuffer());
  const url = URL.createObjectURL(new Blob([original], { type: source.mimeType }));
  const image = new Image();
  let bytes: Uint8Array;
  let width: number, height: number;
  try {
    image.src = url;
    await image.decode();
    const scale = source.mimeType === "image/svg+xml" ? 1024 / Math.max(image.naturalWidth, image.naturalHeight) : 1;
    width = Math.round(image.naturalWidth * scale);
    height = Math.round(image.naturalHeight * scale);
    if (!width || !height || width * height > 16_000_000) throw new Error("Image dimensions are invalid or exceed 16 million pixels.");
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG conversion is unavailable.");
    context.drawImage(image, 0, 0, width, height);
    bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
  verifyPng(bytes);
  const sha256 = await digest(bytes);
  const artifact = await files.publish({ content: bytes, name: input.name.endsWith(".png") ? input.name : `${input.name}.png`, folder: "Media", mimeType: "image/png", operationKey: input.operationKey });
  const saved = (await files.list()).find(f => f.publicId === artifact.publicId);
  if (!saved) throw new Error("Published PNG is missing from Files.");
  const readback = await fetch(saved.url);
  if (!readback.ok) throw new Error("Cannot verify the published PNG.");
  const actual = new Uint8Array(await readback.arrayBuffer());
  const dimensions = verifyPng(actual);
  if (await digest(actual) !== sha256 || dimensions.width !== width || dimensions.height !== height) throw new Error("Published PNG does not match conversion.");
  return { kind: "json" as const, data: { sourcePublicId: source.publicId, sourceMimeType: source.mimeType, sourceByteLength: original.length, sourceSha256: await digest(original), publicId: artifact.publicId, path: artifact.path, mimeType: "image/png", byteLength: actual.length, sha256, width, height, signature: "89504e470d0a1a0a", verifiedBytes: true } };
}
