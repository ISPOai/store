import type { EditRevision } from "@/project/production-types";
import { mediaTimeFromSeconds } from "@/wasm";
import type { AudioElement } from "@/timeline/types";
export interface MusicInput {
  editId: string; expectedRevision: EditRevision; durationSeconds: number;
  volumeDb: number; fadeInSeconds: number; fadeOutSeconds: number;
  startSeconds?: number; seed?: number;
}
export interface MusicProvenance {
  generator: string; seed: number; bpm: number; source: string; sha256: string;
  mediaId: string; trackId: string; elementId: string;
  artifact: { publicId: string; path: string }; byteLength: number;
  durationSeconds: number; volumeDb: number; fadeInSeconds: number; fadeOutSeconds: number;
  startSeconds: number; sourceRevision: EditRevision;
}
const RATE = 48000;
export function validateMusic(input: MusicInput) {
  for (const [value, min, max] of [[input.durationSeconds,1,30],[input.volumeDb,-40,-6],[input.fadeInSeconds,0,10],[input.fadeOutSeconds,0,10],[input.startSeconds ?? 0,0,86400],[input.seed ?? 7208,0,4294967295]]) {
    if (!Number.isFinite(value) || value < min || value > max) throw new Error("Invalid music duration, gain, fade, start or seed.");
  }
  if (!Number.isInteger(input.seed ?? 7208) || input.fadeInSeconds + input.fadeOutSeconds > input.durationSeconds) throw new Error("Invalid seed or overlapping fades.");
}
/** Original oscillator/noise composition. No samples, recordings or imported melodies. */
export function atmosphericTechnoWav(seconds: number, seed: number) {
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 30) throw new Error("Music duration must be 1–30 seconds.");
  const count = Math.round(seconds * RATE), pcm = new Float32Array(count * 2);
  const beat = 60 / 112, tau = Math.PI * 2;
  let rng = seed >>> 0, low = 0, peak = 0;
  const random = () => { rng = (Math.imul(rng,1664525)+1013904223) >>> 0; return rng / 2147483648 - 1; };
  const phases = Array.from({length: 4}, () => random() * Math.PI);
  const chords = [[45,52,59,62],[41,48,55,60],[48,55,62,64],[43,50,57,60]];
  for (let i=0;i<count;i++) {
    const t=i/RATE, bar=t/(beat*8), chordIndex=Math.floor(bar)%4, mix=bar%1;
    const noise=random(); low += 0.13*(noise-low);
    const eighth=Math.floor(t/(beat/2)), hit=t%(beat/2), kickTime=t%beat;
    const kick=0.22*Math.sin(tau*(48*kickTime+6*(1-Math.exp(-kickTime*35))))*Math.exp(-kickTime*17);
    const snare=([2,6,9,14].includes(eighth%16) ? 0.1 : 0)*low*Math.exp(-hit*25);
    const hat=(noise-low)*0.018*Math.exp(-hit*90)*(eighth%2 ? 0.65 : 1);
    const root=chords[chordIndex][0]-12, freq=440*2**((root-69)/12);
    const bass=0.12*(Math.sin(tau*freq*t)+0.2*Math.sin(tau*freq*2*t))*Math.min(1,kickTime/0.025)*(0.65+0.35*Math.exp(-kickTime*4));
    for(let channel=0;channel<2;channel++) {
      let pad=0;
      for(let voice=0;voice<4;voice++) for(let side=0;side<2;side++) {
        const chord=chords[(chordIndex+side)%4], f=440*2**((chord[voice]+12-69)/12);
        const weight=side ? (1-Math.cos(Math.PI*mix))/2 : (1+Math.cos(Math.PI*mix))/2;
        pad+=weight*Math.sin(tau*f*(1+(channel ? 0.0008 : -0.0008))*t+phases[voice]+0.3*Math.sin(tau*0.13*t+voice))*0.045;
      }
      const edge=Math.min(1,t/0.025,(seconds-t-1/RATE)/0.025);
      const sample=(pad+bass+kick+snare+hat)*Math.max(0,edge);
      pcm[i*2+channel]=sample; peak=Math.max(peak,Math.abs(sample));
    }
  }
  const bytes=new Uint8Array(44+count*4), view=new DataView(bytes.buffer);
  const tag=(offset:number,s:string)=>[...s].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
  tag(0,"RIFF");view.setUint32(4,bytes.length-8,true);tag(8,"WAVE");tag(12,"fmt ");view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,RATE,true);view.setUint32(28,RATE*4,true);
  view.setUint16(32,4,true);view.setUint16(34,16,true);tag(36,"data");view.setUint32(40,count*4,true);
  for(let i=0;i<pcm.length;i++) view.setInt16(44+i*2,Math.round(pcm[i]/Math.max(peak,0.001)*0.8*32767),true);
  return bytes;
}
export async function musicDigest(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes).buffer))].map(v=>v.toString(16).padStart(2,"0")).join("");
}
export function verifyMusicWav(bytes: Uint8Array, seconds: number) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const tag=(offset:number)=>String.fromCharCode(...bytes.slice(offset,offset+4));
  if(bytes.length!==44+Math.round(seconds*RATE)*4 || tag(0)!=="RIFF" || tag(8)!=="WAVE" || tag(36)!=="data" || view.getUint32(4,true)!==bytes.length-8 || view.getUint32(40,true)!==bytes.length-44 || view.getUint16(20,true)!==1 || view.getUint16(22,true)!==2 || view.getUint32(24,true)!==RATE || view.getUint16(34,true)!==16) throw new Error("Published music WAV format verification failed.");
  let energy=0, peak=0;
  for(let i=44;i<bytes.length;i+=2) {const x=view.getInt16(i,true)/32768;energy+=x*x;peak=Math.max(peak,Math.abs(x));}
  const rms=Math.sqrt(energy/((bytes.length-44)/2));
  if(rms<0.01 || peak>=0.99) throw new Error("Music is silent or clipped.");
  return {sampleRate:RATE,channels:2,bitsPerSample:16,rms,peak};
}
export function musicElement(input: MusicInput, mediaId: string, elementId: string): AudioElement {
  const time=(seconds:number)=>mediaTimeFromSeconds({seconds});
  const points: [number,number][]=[];
  if(input.fadeInSeconds>0) points.push([0,-60]);
  points.push([input.fadeInSeconds,input.volumeDb]);
  if(input.durationSeconds-input.fadeOutSeconds>input.fadeInSeconds) points.push([input.durationSeconds-input.fadeOutSeconds,input.volumeDb]);
  if(input.fadeOutSeconds>0) points.push([input.durationSeconds,-60]);
  return {id:elementId,name:"Original atmospheric techno",type:"audio",sourceType:"upload",mediaId,
    startTime:time(input.startSeconds??0),duration:time(input.durationSeconds),sourceDuration:time(input.durationSeconds),trimStart:time(0),trimEnd:time(0),
    params:{volume:input.volumeDb,muted:false},animations:{volume:{keys:points.map(([t,value],i)=>({id:`${elementId}-fade-${i}`,time:time(t),value,segmentToNext:"linear",tangentMode:"flat"}))}}};
}
