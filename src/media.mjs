import { clamp, selection } from './core.mjs';
import { gifHeader, gifFrame, frameDelays, makePalette, quantizer } from './gif.mjs';
export const DEMO_IMAGE='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#17232c"/><stop offset="1" stop-color="#08141b"/></linearGradient><linearGradient id="cup"><stop stop-color="#27383a"/><stop offset=".3" stop-color="#8b9b8e"/><stop offset=".6" stop-color="#485e56"/><stop offset="1" stop-color="#1b302c"/></linearGradient><radialGradient id="light"><stop stop-color="#637b73" stop-opacity=".24"/><stop offset="1" stop-color="#637b73" stop-opacity="0"/></radialGradient></defs><rect width="960" height="540" fill="url(#bg)"/><ellipse cx="480" cy="260" rx="350" ry="250" fill="url(#light)"/><path d="M0 425H960" stroke="#35443f"/><ellipse cx="480" cy="428" rx="134" ry="14" fill="#03090c" opacity=".7"/><path d="M400 152 Q480 128 560 152 L546 360 Q542 405 480 405 Q418 405 414 360Z" fill="url(#cup)" stroke="#a3b1a0" stroke-opacity=".4" stroke-width="2"/><ellipse cx="480" cy="152" rx="80" ry="18" fill="#182d29" stroke="#a2b29e" stroke-width="3"/><path d="M557 192C669 170 653 326 550 318" fill="none" stroke="#566e60" stroke-width="21"/><path d="M433 181L441 347" stroke="#bcc7b2" stroke-opacity=".18" stroke-width="5"/><text x="52" y="66" fill="#adc0be" font-family="Arial" font-size="11" letter-spacing="5">STILL / OBJECT STUDY</text><text x="52" y="482" fill="#79958f" font-family="Arial" font-size="11" letter-spacing="3">GENERIC REFERENCE · NOT A REAL PRODUCT</text></svg>`);
export const loadImage=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('图片无法解码，请换用 PNG / JPG / WebP'));image.src=src});
export async function loadMedia(shot){
  const [image,start,end,actions]=await Promise.all([shot.imageData?loadImage(shot.imageData):null,shot.startData?loadImage(shot.startData):null,shot.endData?loadImage(shot.endData):null,Promise.all(shot.actions.map(async a=>({...a,image:await loadImage(a.data)})))]);
  return {image,start,end,actions};
}
export const hasMedia=(shot)=>shot.mode==='keyframe'?Boolean(shot.startData||shot.endData):shot.effect==='action'?Boolean(shot.actions.length):Boolean(shot.imageData);
const easing=(t,type)=>type==='linear'?t:type==='easeIn'?t*t:type==='easeOut'?1-(1-t)**2:t*t*(3-2*t);
function fit(c,image,w,h,type,scale=1,dx=0,dy=0){
  if(!image)return;const ratio=(type==='cover'?Math.max:Math.min)(w/image.naturalWidth,h/image.naturalHeight);
  c.save();c.translate(w/2+dx,h/2+dy);c.scale(scale,scale);c.drawImage(image,-image.naturalWidth*ratio/2,-image.naturalHeight*ratio/2,image.naturalWidth*ratio,image.naturalHeight*ratio);c.restore();
}
function clip(c,region,w,h){c.beginPath();if(region.shape==='ellipse')c.ellipse((region.x+region.w/2)*w,(region.y+region.h/2)*h,region.w*w/2,region.h*h/2,0,0,Math.PI*2);else c.rect(region.x*w,region.y*h,region.w*w,region.h*h);c.clip()}
export function createRenderer(){
  const scratch=document.createElement('canvas'), sc=scratch.getContext('2d',{willReadFrequently:true});
  return function render(c,w,h,t,shot,media){
    c.save();c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';c.fillStyle='#071017';c.fillRect(0,0,w,h);
    const e=easing(clamp(t,0,1),shot.easing), amount=shot.strength;
    if(shot.mode==='keyframe'){
      if(media.start)fit(c,media.start,w,h,shot.fit);
      if(media.end){c.globalAlpha=media.start?e:1;fit(c,media.end,w,h,shot.fit)}
    }else if(shot.effect==='action'){
      const frames=media.actions;
      if(frames.length){const position=e*(frames.length-1),index=Math.floor(position);fit(c,frames[index].image,w,h,shot.fit);if(frames[index+1]){c.globalAlpha=position-index;fit(c,frames[index+1].image,w,h,shot.fit)}}
    }else if(media.image){
      const image=media.image, effect=shot.effect;
      let scale=1,dx=0,dy=0;
      if(effect==='zoomIn')scale+=amount*.32*e;
      if(effect==='zoomOut')scale+=amount*.32*(1-e);
      if(effect==='panLeft'||effect==='panRight'){scale+=amount*.3;dx=(effect==='panLeft'?1:-1)*amount*w*.12*(1-2*e)}
      if(effect==='tiltUp'||effect==='tiltDown'){scale+=amount*.3;dy=(effect==='tiltUp'?1:-1)*amount*h*.13*(1-2*e)}
      if(effect==='fade')c.globalAlpha=e;
      if(effect==='focus')c.filter=`blur(${(1-e)*amount*17*w/960}px)`;
      fit(c,image,w,h,shot.fit,scale,dx,dy);
      if(effect==='sweep'&&amount>0){
        if(scratch.width!==w||scratch.height!==h){scratch.width=w;scratch.height=h}
        sc.clearRect(0,0,w,h);sc.save();const region=selection(shot.selection);clip(sc,region,w,h);
        fit(sc,image,w,h,shot.fit);sc.restore();
        sc.save();sc.globalCompositeOperation='destination-in';
        const fraction=shot.sweepDirection==='left'?1-e:e, band=region.w*w*.38, x=region.x*w-band+(region.w*w+2*band)*fraction;
        const g=sc.createLinearGradient(x-band,0,x+band,0);g.addColorStop(0,'#fff0');g.addColorStop(.5,'#ffff');g.addColorStop(1,'#fff0');sc.fillStyle=g;sc.fillRect(0,0,w,h);sc.restore();
        c.save();c.globalCompositeOperation='screen';c.globalAlpha=amount*.9;c.filter='brightness(1.8)';c.drawImage(scratch,0,0);c.restore();
      }
    }
    c.restore();
  };
}
export function estimateSelection(image,fitMode='contain'){
  const temp=document.createElement('canvas');temp.width=240;temp.height=135;const c=temp.getContext('2d',{willReadFrequently:true});
  c.fillStyle='#071017';c.fillRect(0,0,240,135);fit(c,image,240,135,fitMode);
  const {data}=c.getImageData(0,0,240,135), corners=[[12,10],[228,10],[12,125],[228,125]], bg=[0,0,0];
  corners.forEach(([x,y])=>{for(let k=0;k<3;k++)bg[k]+=data[(y*240+x)*4+k]/4});
  let minX=240,minY=135,maxX=0,maxY=0,count=0;
  for(let y=5;y<130;y++)for(let x=5;x<235;x++){const i=(y*240+x)*4,delta=Math.sqrt((data[i]-bg[0])**2+(data[i+1]-bg[1])**2+(data[i+2]-bg[2])**2);if(delta>58){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++}}
  if(count<60||count>240*135*.75)throw new Error('背景复杂，无法可靠估计。请在预览上拖框选择主体');
  return selection({x:Math.max(0,(minX-4)/240),y:Math.max(0,(minY-4)/135),w:Math.min(1,(maxX-minX+8)/240),h:Math.min(1,(maxY-minY+8)/135)});
}
export async function encodeGIF(shot,media,{onProgress=()=>{},signal}={}){
  if(!hasMedia(shot))throw new Error('请先为本镜上传参考图或关键帧');
  const width=480,height=270,temp=document.createElement('canvas');temp.width=width;temp.height=height;
  const c=temp.getContext('2d',{willReadFrequently:true}),render=createRenderer(),delays=frameDelays(shot.duration),samples=[];
  const check=()=>{if(signal?.aborted)throw new DOMException('已取消导出','AbortError')};
  for(let i=0;i<7;i++){check();render(c,width,height,i/6,shot,media);samples.push(c.getImageData(0,0,width,height).data)}
  const palette=makePalette(samples),quantize=quantizer(palette),parts=[gifHeader(width,height,palette)];
  for(let i=0;i<delays.length;i++){
    check();render(c,width,height,i/(delays.length-1),shot,media);const pixels=quantize(c.getImageData(0,0,width,height).data);
    parts.push(...gifFrame(width,height,pixels,delays[i]));onProgress(i+1,delays.length);
    if(i%2===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  parts.push(new Uint8Array([0x3b]));return {blob:new Blob(parts,{type:'image/gif'}),frames:delays.length,duration:delays.reduce((a,b)=>a+b,0)/100};
}
