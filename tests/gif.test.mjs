import test from 'node:test';
import assert from 'node:assert/strict';
import { lzwPixels, frameDelays, makePalette, quantizer, gifHeader, gifFrame } from '../src/gif.mjs';
// Independent LZW decoder exercises resets, reused dictionary codes and end-of-data.
function decode(blocks){
  const bytes=[];for(let i=0;blocks[i];){const n=blocks[i++];bytes.push(...blocks.slice(i,i+n));i+=n}
  let bit=0,width=9,dictionary=[],next=258,previous=null;const out=[];
  while(bit+width<=bytes.length*8){let code=0;for(let i=0;i<width;i++)code|=((bytes[(bit+i)>>3]>>((bit+i)&7))&1)<<i;bit+=width;
    if(code===256){dictionary=Array.from({length:256},(_,i)=>[i]);next=258;width=9;previous=null;continue}if(code===257)return new Uint8Array(out);
    const entry=dictionary[code] || (code===next&&previous?[...previous,previous[0]]:null);assert(entry,'invalid dictionary code '+code);out.push(...entry);
    if(previous){dictionary[next++]=[...previous,entry[0]];if(next===1<<width&&width<12)width++}previous=entry;
  }throw new Error('missing EOI');
}
test('LZW roundtrip across dictionary resets and full-size noisy frames',()=>{let seed=12;for(const count of [1,255,480*270]){const p=Uint8Array.from({length:count},()=>{seed=(1664525*seed+1013904223)>>>0;return seed&255});assert.deepEqual(decode(lzwPixels(p)),p)}});
test('LZW compresses runs and special next-code case',()=>{const p=new Uint8Array(10000).fill(45);const encoded=lzwPixels(p);assert(encoded.length<1000);assert.deepEqual(decode(encoded),p)});
test('frame timing matches duration exactly from 0.5 through 30 seconds',()=>{for(const duration of [.5,1,2,2.5,3,4,5,30]){const delays=frameDelays(duration);assert.equal(delays.length,Math.round(duration*12));assert.equal(delays.reduce((a,b)=>a+b,0),duration*100);assert(delays.every(x=>x>0))}});
test('palette preserves dark grayscale steps and real black',()=>{const data=Uint8Array.from({length:64*4*4},(_,i)=>i%4===3?255:Math.floor(i/16));const p=makePalette([data]),q=quantizer(p)(data);assert(new Set(q).size>25);assert(p.some(v=>v===0))});
test('GIF has loop extension, full frame descriptor and no transparency',()=>{const p=new Uint8Array(768),header=gifHeader(10,8,p);assert.equal(new TextDecoder().decode(header.slice(0,6)),'GIF89a');assert(new TextDecoder().decode(header).includes('NETSCAPE2.0'));const [frame]=gifFrame(10,8,new Uint8Array(80),8);assert.equal(frame[3],8);assert.equal(frame[8],0x2c)});
