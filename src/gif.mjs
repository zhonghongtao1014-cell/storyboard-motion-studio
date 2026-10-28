// GIF89a encoder. A 9-bit dictionary is cleared before a code-width change.
// This keeps the LZW stream simple and decoder-compatible while compressing runs.
export function lzwPixels(pixels) {
  const bytes=[]; let buffer=0, bits=0, next=258, dictionary=new Map();
  const write=code=>{buffer|=code<<bits;bits+=9;while(bits>=8){bytes.push(buffer&255);buffer>>>=8;bits-=8}};
  write(256);
  if(pixels.length){
    let prefix=pixels[0];
    for(let i=1;i<pixels.length;i++){
      const pixel=pixels[i], key=prefix*256+pixel, found=dictionary.get(key);
      if(found!==undefined){prefix=found;continue}
      write(prefix);
      if(next<510)dictionary.set(key,next++);
      else{write(256);dictionary=new Map();next=258}
      prefix=pixel;
    }
    write(prefix);
  }
  write(257);if(bits)bytes.push(buffer&255);
  const blocks=[];
  for(let i=0;i<bytes.length;i+=255){const count=Math.min(255,bytes.length-i);blocks.push(count,...bytes.slice(i,i+count))}
  blocks.push(0);return new Uint8Array(blocks);
}
const word=(a,n)=>a.push(n&255,(n>>8)&255);
export function gifHeader(width,height,palette){
  const a=[71,73,70,56,57,97];word(a,width);word(a,height);a.push(0xf7,0,0,...palette);
  a.push(0x21,0xff,11,...new TextEncoder().encode('NETSCAPE2.0'),3,1,0,0,0);
  return new Uint8Array(a);
}
export function gifFrame(width,height,pixels,delay){
  const a=[0x21,0xf9,4,8];word(a,delay);a.push(0,0,0x2c);word(a,0);word(a,0);word(a,width);word(a,height);a.push(0,8);
  return [new Uint8Array(a),lzwPixels(pixels)];
}
export function frameDelays(duration,fps=12){
  const ticks=Math.round(duration*100), count=Math.max(2,Math.round(duration*fps));
  return Array.from({length:count},(_,i)=>Math.round((i+1)*ticks/count)-Math.round(i*ticks/count));
}

// Median-cut palette sampled across the animation, including dark gradients.
export function makePalette(samples){
  const histogram=new Map();
  for(const data of samples)for(let i=0;i<data.length;i+=16){
    const r=data[i],g=data[i+1],b=data[i+2],key=(r<<16)|(g<<8)|b;
    const old=histogram.get(key);if(old)old.n++;else histogram.set(key,{r,g,b,n:1});
  }
  const info=colors=>{
    const ranges=['r','g','b'].map(k=>{let lo=255,hi=0;for(const c of colors){lo=Math.min(lo,c[k]);hi=Math.max(hi,c[k])}return hi-lo});
    const axis=ranges.indexOf(Math.max(...ranges));
    return {colors,axis:['r','g','b'][axis],range:ranges[axis],weight:colors.reduce((n,c)=>n+c.n,0)};
  };
  const boxes=[info([...histogram.values()])];
  while(boxes.length<256){
    let candidate=-1,score=-1;
    boxes.forEach((box,i)=>{const s=box.range*Math.sqrt(box.weight);if(box.colors.length>1&&s>score){score=s;candidate=i}});
    if(candidate<0)break;
    const box=boxes.splice(candidate,1)[0];box.colors.sort((a,b)=>a[box.axis]-b[box.axis]);
    let total=0,split=1;for(let i=0;i<box.colors.length-1;i++){total+=box.colors[i].n;split=i+1;if(total>=box.weight/2)break}
    boxes.push(info(box.colors.slice(0,split)),info(box.colors.slice(split)));
  }
  const palette=new Uint8Array(768);
  boxes.forEach((box,i)=>['r','g','b'].forEach((k,j)=>palette[i*3+j]=Math.round(box.colors.reduce((s,c)=>s+c[k]*c.n,0)/box.weight)));
  // True black remains black in the exported frame.
  if(boxes.length<256)palette.set([0,0,0],boxes.length*3);else{let darkest=0;for(let i=1;i<256;i++)if(palette[i*3]+palette[i*3+1]+palette[i*3+2]<palette[darkest*3]+palette[darkest*3+1]+palette[darkest*3+2])darkest=i;palette.set([0,0,0],darkest*3)}
  return palette;
}
export function quantizer(palette){
  const cache=new Map();
  return data=>{
    const out=new Uint8Array(data.length/4);
    for(let i=0,j=0;i<data.length;i+=4,j++){
      const key=(data[i]<<16)|(data[i+1]<<8)|data[i+2];let best=cache.get(key);
      if(best===undefined){let error=Infinity;best=0;for(let p=0;p<256;p++){const d=(data[i]-palette[p*3])**2+(data[i+1]-palette[p*3+1])**2+(data[i+2]-palette[p*3+2])**2;if(d<error){error=d;best=p;if(d===0)break}}cache.set(key,best)}
      out[j]=best;
    }
    return out;
  };
}
