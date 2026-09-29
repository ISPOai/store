import { ProjectRpcError, type ProjectCommandSdk } from "@ispo/sdk";
import { pollCloudJob } from "./cloud-job-poll";
import { collectCloudFile } from "./cloud-job-files";

type ImageRequest = Parameters<ProjectCommandSdk["host"]["storyboardImage"]["generate"]>[0];
type VideoRequest = Parameters<ProjectCommandSdk["host"]["sceneVideo"]["generate"]>[0];
export interface GenerateImageInput {
  prompt: string;
  name: string;
  requestKey: string;
  aspectRatio?: ImageRequest["aspectRatio"];
  referencePublicIds?: string[];
  model?: ImageRequest["model"];
}
export interface GenerateVideoInput {
  prompt: string;
  name: string;
  requestKey: string;
  durationSeconds: number;
  aspectRatio?: VideoRequest["aspectRatio"];
  startImagePublicId?: string;
  generateAudio?: boolean;
  model?: VideoRequest["model"];
}
export interface GeneratedMediaResult { kind: "files"; refs: { publicId: string; path: string }[] }
type Resource = { publicId: string; path: string; digest: string; byteLength: number; mimeType: string };

export async function generateImage(input: GenerateImageInput, sdk: ProjectCommandSdk, signal?: AbortSignal): Promise<GeneratedMediaResult> {
  const request: ImageRequest = {
    prompt: input.prompt, format: "png", aspectRatio: input.aspectRatio ?? "1:1",
    filesDestination: { folder: "Generated", name: imageName(input.name) },
    idempotencyKey: input.requestKey, timeoutMs: 30_000,
  };
  if (input.referencePublicIds) request.referencePublicIds = input.referencePublicIds;
  if (input.model) request.model = input.model;
  const result = await generateAndCollect(() => sdk.host.storyboardImage.generate(request), sdk, "storyboard-image", input.requestKey, signal);
  return { kind: "files", refs: [{ publicId: result.publicId, path: result.path }] };
}

export async function generateVideo(input: GenerateVideoInput, sdk: ProjectCommandSdk, signal?: AbortSignal): Promise<GeneratedMediaResult> {
  const request: VideoRequest = {
    motionBrief: input.prompt, durationSeconds: input.durationSeconds, aspectRatio: input.aspectRatio ?? "16:9",
    generateAudio: input.generateAudio ?? false,
    filesDestination: { folder: "Generated", name: videoName(input.name) },
    idempotencyKey: input.requestKey, timeoutMs: 30_000,
  };
  if (input.startImagePublicId) request.startImagePublicId = input.startImagePublicId;
  if (input.model) request.model = input.model;
  const result = await generateAndCollect(() => sdk.host.sceneVideo.generate(request), sdk, "scene-video", input.requestKey, signal);
  return { kind: "files", refs: [{ publicId: result.publicId, path: result.path }] };
}

async function generateAndCollect(generate: () => Promise<{ resource: Resource }>, sdk: ProjectCommandSdk,
  route: "storyboard-image" | "scene-video", requestKey: string, signal?: AbortSignal): Promise<Resource> {
  signal?.throwIfAborted();
  try { return (await generate()).resource; }
  catch (error) {
    if (!(error instanceof ProjectRpcError) || (error.code !== "pending" && error.code !== "timeout")) throw error;
    const jobRef = error.jobRef ?? (await sdk.host.cloudJobs.get({ route, idempotencyKey: requestKey })).jobRef;
    const result = await pollCloudJob(jobRef, sdk.host.cloudJobs.get, signal ? { signal } : undefined);
    signal?.throwIfAborted();
    if (result.kind !== "succeeded") throw new Error(`Generation ${result.kind}; retain request key ${requestKey} to collect this same job.`);
    const collected = await collectCloudFile(result.job, sdk.files.list, route === "storyboard-image" ? "image" : "video", route === "storyboard-image" ? "image/png" : "video/mp4");
    return collected.file;
  }
}

function imageName(name: string): string { return name.endsWith(".png") ? name : `${name}.png`; }
function videoName(name: string): string { return name.endsWith(".mp4") ? name : `${name}.mp4`; }
