import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as wasmGlue from "../../node_modules/opencut-wasm/opencut_wasm_bg.js";
const wasmModule = new WebAssembly.Module(readFileSync(new URL("../../node_modules/opencut-wasm/opencut_wasm_bg.wasm", import.meta.url)));
const instance = new WebAssembly.Instance(wasmModule, { "./opencut_wasm_bg.js": wasmGlue });
wasmGlue.__wbg_set_wasm(instance.exports);
if (instance.exports.__wbindgen_start instanceof Function) instance.exports.__wbindgen_start();
mock.module("opencut-wasm", () => wasmGlue);
import type { MusicInput } from "./original-music";
const { atmosphericTechnoWav, musicDigest, verifyMusicWav, musicElement, validateMusic } = await import("./original-music");
const { resolveEffectiveAudioGain } = await import("@/timeline/audio-state");
const input: MusicInput={editId:"test",expectedRevision:{editId:"test",storageCasRevision:"1",intentRevision:"1",digest:"test"},durationSeconds:20,volumeDb:-22,fadeInSeconds:2,fadeOutSeconds:3,seed:7208};
test("short and long stereo WAVs contain non-silent unclipped PCM with exact frame counts",()=>{
  for(const seconds of [1,6,20,30]) {
    const bytes=atmosphericTechnoWav(seconds,7208),audio=verifyMusicWav(bytes,seconds);
    expect(bytes.length).toBe(44+seconds*48000*4);
    expect(audio.rms).toBeGreaterThan(0.05);expect(audio.peak).toBeLessThan(0.81);
    const view=new DataView(bytes.buffer);
    expect(view.getInt16(44,true)).toBe(0);expect(view.getInt16(bytes.length-2,true)).toBe(0);
    let difference=0;for(let i=44;i<bytes.length;i+=4) difference+=Math.abs(view.getInt16(i,true)-view.getInt16(i+2,true));
    expect(difference).toBeGreaterThan(100000);
  }
});
test("seed provides reproducible bytes and a distinct original variant",async()=>{
  const a=await musicDigest(atmosphericTechnoWav(20,7208));
  expect(await musicDigest(atmosphericTechnoWav(20,7208))).toBe(a);
  expect(await musicDigest(atmosphericTechnoWav(20,7209))).not.toBe(a);
});
test("verification rejects truncated, silent and clipped audio",()=>{
  const bytes=atmosphericTechnoWav(20,7208);
  expect(()=>verifyMusicWav(bytes.slice(0,-4),20)).toThrow();
  bytes.fill(0,44);expect(()=>verifyMusicWav(bytes,20)).toThrow();
  new DataView(bytes.buffer).setInt16(44,32767,true);expect(()=>verifyMusicWav(bytes,20)).toThrow();
});
test("music gain and fades use the actual preview/export animation evaluator",()=>{
  const element=musicElement(input,"media-test","clip-test");
  const gain=(localTime:number)=>resolveEffectiveAudioGain({element,localTime});
  expect(gain(0)).toBeCloseTo(0.001,5);
  expect(gain(2)).toBeCloseTo(10**(-22/20),5);
  expect(gain(10)).toBeCloseTo(10**(-22/20),5);
  expect(gain(18)).toBeLessThan(gain(17));expect(gain(20)).toBeCloseTo(0.001,5);
  const flat=musicElement({...input,fadeInSeconds:0,fadeOutSeconds:0},"m","e");
  expect(resolveEffectiveAudioGain({element:flat,localTime:0})).toBeCloseTo(10**(-22/20),5);
});
test("invalid direct service inputs fail before synthesis or persistence",()=>{
  for(const patch of [{durationSeconds:0},{durationSeconds:31},{volumeDb:0},{fadeInSeconds:-1},{startSeconds:NaN},{seed:1.5}]) expect(()=>validateMusic({...input,...patch})).toThrow();
});
