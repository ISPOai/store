import { ProductionDocumentService, type ProductionDocumentSdk } from "@/project/production-document-service";
import { SdkProductionMediaLibrary, type ProductionMediaLibrary } from "@/services/storage/production-media-adapter";

import { validateMusic, atmosphericTechnoWav, musicDigest, verifyMusicWav, musicElement, type MusicInput, type MusicProvenance } from "@/media/original-music";

export async function addOriginalMusic(input: MusicInput,sdk: ProductionDocumentSdk,library?: ProductionMediaLibrary) {
  validateMusic(input);
  const documents=new ProductionDocumentService(sdk),current=await documents.readCurrent(input.editId);
  if(current?.kind!=="document") throw new Error("Saved edit required.");
  if(Object.entries(current.document.revision).some(([key,value])=>input.expectedRevision[key as keyof EditRevision]!==value)) throw new Error("Revision conflict; refresh the exact edit before generating music.");
  const project=structuredClone(current.document.project),scene=project.scenes.find(s=>s.id===project.currentSceneId);
  if(!scene) throw new Error("Current scene required.");
  if(scene.tracks.audio.some(t=>t.id==="original-background-music")) throw new Error("This scene already has original background music; edit its existing clip.");
  const seed=input.seed??7208,bytes=atmosphericTechnoWav(input.durationSeconds,seed),sha256=await musicDigest(bytes);
  verifyMusicWav(bytes,input.durationSeconds);
  const mediaId=`music-${sha256.slice(0,24)}`,trackId="original-background-music",elementId=`${trackId}-${sha256.slice(0,12)}`;
  const imported=await (library??new SdkProductionMediaLibrary(sdk)).import({editId:input.editId,mediaId,mediaRevision:sha256,role:"narration",name:"Original atmospheric techno.wav",mimeType:"audio/wav",digest:sha256,duration:input.durationSeconds,file:new File([bytes],"Original atmospheric techno.wav",{type:"audio/wav"})});
  const artifact=imported.filesRef;
  if(!artifact) throw new Error("Music publication did not return a durable file identity.");
  const published=(await sdk.files.list()).find(f=>f.publicId===artifact.publicId);
  if(!published) throw new Error("Published music cannot be read back.");
  const response=await fetch(published.url);
  if(!response.ok) throw new Error("Published music bytes cannot be read back.");
  const actual=new Uint8Array(await response.arrayBuffer()),audio=verifyMusicWav(actual,input.durationSeconds);
  if(await musicDigest(actual)!==sha256) throw new Error("Published music digest mismatch; timeline unchanged.");
  const provenance: MusicProvenance={generator:"opencut-atmospheric-techno-v1",seed,bpm:112,source:"Original oscillator and seeded noise synthesis; no sampled recording or copied melody",sha256,mediaId,trackId,elementId,artifact,byteLength:actual.length,durationSeconds:input.durationSeconds,volumeDb:input.volumeDb,fadeInSeconds:input.fadeInSeconds,fadeOutSeconds:input.fadeOutSeconds,startSeconds:input.startSeconds??0,sourceRevision:input.expectedRevision};
  scene.tracks.audio.push({id:trackId,name:"Original background music",type:"audio",muted:false,elements:[musicElement(input,mediaId,elementId)]});
  project.settings.musicProductions=[...(project.settings.musicProductions??[]),provenance];
  const saved=await documents.save({editId:input.editId,project,expectedRevision:input.expectedRevision});
  return {kind:"json" as const,data:{editId:input.editId,revision:saved.revision,provenance,audio,verifiedBytes:true}};
}
