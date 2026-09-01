import { buildMeshDataFromGlbBuffer } from "cadjs/lib/render/glbMeshData.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type GlbDecoder = (buffer: ArrayBuffer) => Promise<unknown>;

export async function loadGlbMesh(
  url: string,
  {
    fetcher = fetch,
    decode = buildMeshDataFromGlbBuffer,
  }: {
    fetcher?: Fetcher;
    decode?: GlbDecoder;
  } = {},
) {
  const response = await fetcher(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load GLB source: HTTP ${response.status}`);
  }
  return decode(await response.arrayBuffer());
}
