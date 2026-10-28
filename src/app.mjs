import { EFFECTS, STATUSES, SAMPLE, newShot, newProject, parseScript, normalizeProject, selection, clamp, shotListCSV } from './core.mjs';
import { DEMO_IMAGE, loadImage, loadMedia, hasMedia, createRenderer, estimateSelection, encodeGIF } from './media.mjs';
import { readDraft, saveDraft } from './storage.mjs';
import { readScriptFile } from './import.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$('#stage'),ctx=canvas.getContext('2d'),render=createRenderer();
let project=newProject(),parsed=[],filter='all',view='overview',media=null,loadToken=0,time=0,playing=false,started=0,raf=0,selecting=false,drag=null,busy=false,undoData=null,saveTimer=0,revision=0,toastTimer=0,exportController;
const current=()=>project.shots.find(s=>s.id===project.selectedId);
const index=()=>project.shots.findIndex(s=>s.id===project.selectedId);
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el};
const number=(s,i)=>s.number||String(i+1).padStart(2,'0');
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000)}
function checkpoint(){undoData=structuredClone(project);$('#undo').disabled=false}
function changed(shot,keepStatus=false){if(shot&&!keepStatus&&shot.status==='confirmed')shot.status='revise';if(shot?.id===project.selectedId)$('#shotStatus').value=shot.status;project.updatedAt=new Date().toISOString();revision++;$('#saveState').textContent='正在保存…';clearTimeout(saveTimer);saveTimer=setTimeout(persist,150);updateSummary()}
async function persist(){const r=revision;try{await saveDraft(structuredClone(project));if(r===revision)$('#saveState').textContent='● 本地草稿已保存'}catch{ $('#saveState').textContent='草稿保存失败，请保存工程';toast('本地存储不可用或空间不足，请点击“保存工程”备份') }}
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(saveTimer);persist()}});
function updateSummary(){
  $('#shotCount').textContent=project.shots.length;$('#summaryCount').textContent=project.shots.length;$('#summaryDuration').textContent=project.shots.reduce((a,s)=>a+s.duration,0).toFixed(1)+'s';$('#summaryConfirmed').textContent=project.shots.filter(s=>s.status==='confirmed').length;
}
function showView(name){
  if(busy)return;if(name==='editor'&&!current()){toast('请先导入脚本或新增镜头');name='import'}
  stop();view=name;for(const k of ['import','overview','editor'])$('#'+k+'View').classList.toggle('hidden',name!==k);
  $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  if(name==='overview')renderOverview();if(name==='editor')preview();
  history.replaceState(null,'','#'+name);
}
$$('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
$('.brand').onclick=e=>{e.preventDefault();showView('overview')};$('#goImport').onclick=()=>showView('import');$('#backOverview').onclick=()=>showView('overview');
function renderOverview(){
  updateSummary();const grid=$('#shotGrid');grid.replaceChildren();
  const shots=project.shots.filter(s=>filter==='all'||s.status===filter);
  if(!shots.length){const empty=node('div','empty');empty.append(node('span','','▤'),node('h3','',project.shots.length?'暂无此状态的镜头':'还没有镜头'),node('p','','从脚本导入开始，或新增一个镜头。'));grid.append(empty);return}
  shots.forEach(s=>{
    const i=project.shots.indexOf(s),card=node('article','shot-card'),image=node('button','card-image');image.setAttribute('aria-label','编辑镜头 '+number(s,i));
    const src=s.mode==='keyframe'?s.startData||s.endData:s.effect==='action'?s.actions[0]?.data:s.imageData;
    if(src){const img=node('img');img.src=src;img.alt=s.title||'镜头参考图';img.loading='lazy';image.append(img)}else{const p=node('div','card-placeholder');p.append(node('b','',String(i+1).padStart(2,'0')),node('span','','待上传参考画面'));image.append(p)}
    image.append(node('span','card-number','SHOT '+number(s,i)),node('span','card-duration',s.duration.toFixed(1)+'s'));image.onclick=()=>selectShot(s.id,true);
    const body=node('div','card-body'),heading=node('div','card-heading');heading.append(node('h3','',s.title||'未命名镜头'),node('span','status-pill '+s.status,STATUSES[s.status]));
    const footer=node('div','card-footer'),edit=node('button','card-edit','编辑镜头 ↗');edit.onclick=()=>selectShot(s.id,true);footer.append(node('span','',s.shotSize+' · '+EFFECTS[s.effect]),edit);
    body.append(heading,node('p','card-description',s.description||'添加画面描述，记录这一镜的意图。'),footer);card.append(image,body);grid.append(card);
  });
}
$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderOverview()});
function resetFilter(){filter='all';$$('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'))}
const fields={shotTitle:'title',shotNumber:'number',shotScene:'scene',shotDescription:'description',shotAction:'action',shotDialogue:'dialogue',shotSize:'shotSize',shotAngle:'angle',shotNotes:'notes',prompt:'prompt'};
Object.entries(fields).forEach(([id,key])=>$('#'+id).oninput=e=>{if(busy||!current())return;current()[key]=e.target.value;if(key==='description'&&!current().prompt)$('#prompt').value=current().description;changed(current());updateStrip()});
$('#projectTitle').oninput=e=>{if(busy)return;project.title=e.target.value;changed()};
$('#shotStatus').onchange=e=>{if(!current())return;current().status=e.target.value;changed(current(),true);updateStrip()};
function updateStrip(){
  $('#shotStrip').replaceChildren();project.shots.forEach((s,i)=>{const b=node('button','strip-shot'+(s.id===project.selectedId?' active':''),'SHOT '+number(s,i)+' · '+s.duration.toFixed(1)+'s');b.append(node('span','',s.title||'未命名镜头'));b.onclick=()=>selectShot(s.id);$('#shotStrip').append(b)});
}
function syncControls(){
  const s=current();if(!s)return;
  Object.entries(fields).forEach(([id,key])=>$('#'+id).value=s[key]);$('#shotStatus').value=s.status;
  for(const k of ['effect','duration','easing','fit','sweepDirection'])$('#'+k).value=s[k];$('#strength').value=s.strength*100;
  $('#durationNum').textContent=s.duration.toFixed(1)+' 秒';$('#strengthNum').textContent=Math.round(s.strength*100)+'%';
  $('#singleName').textContent=s.imageName?'当前：'+s.imageName:'尚未上传参考图';$('#keyNames').textContent='首帧：'+(s.startName||'未上传')+' / 尾帧：'+(s.endName||'未上传');
  $('#actionList').textContent=s.actions.map((a,i)=>(i+1)+'. '+a.name).join(' / ');
  $$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===s.mode));for(const k of ['upload','ai','keyframe'])$('#'+k+'Panel').classList.toggle('hidden',s.mode!==k);
  $('#actionPanel').classList.toggle('hidden',s.effect!=='action'||s.mode==='keyframe');$('#selectionPanel').classList.toggle('hidden',s.effect!=='sweep'||s.mode==='keyframe');
  $('#effect').disabled=s.mode==='keyframe';syncRegion();$('#reusePrevious').disabled=index()<=0;$('#prevShot').disabled=index()<=0;$('#nextShot').disabled=index()>=project.shots.length-1;
  $('#editorIndex').textContent='SHOT '+number(s,index())+' / '+String(project.shots.length).padStart(2,'0');$('#shotTag').textContent='SHOT '+number(s,index())+' · 16:9';
  $('#noMedia').classList.toggle('hidden',hasMedia(s));setExportButtons();updateStrip();
}
function setExportButtons(){const available=Boolean(current()&&hasMedia(current())&&media);for(const id of ['gifBtn','videoBtn','pngBtn','exportEndBtn','playBtn','replayBtn'])$('#'+id).disabled=!available||busy}
function syncRegion(){const s=current();if(!s)return;for(const [id,key] of [['regionX','x'],['regionY','y'],['regionW','w'],['regionH','h']])$('#'+id).value=Math.round(s.selection[key]*100);$('#selectionShape').value=s.selection.shape}
async function selectShot(id,open=false){
  if(busy)return;stop();selecting=false;canvas.classList.remove('selecting');drag=null;project.selectedId=id;time=0;media=null;const token=++loadToken;
  syncControls();preview();if(open)showView('editor');
  try{const loaded=await loadMedia(current());if(token!==loadToken)return;media=loaded;setExportButtons();preview();changed(null,true)}catch(e){if(token!==loadToken)return;toast(e.message);setExportButtons()}
}
$('#prevShot').onclick=()=>{if(index()>0)selectShot(project.shots[index()-1].id)};$('#nextShot').onclick=()=>{if(index()<project.shots.length-1)selectShot(project.shots[index()+1].id)};
$('#newShot').onclick=()=>{if(project.shots.length>=200)return toast('每个项目最多 200 镜');checkpoint();const s=newShot({number:String(project.shots.length+1).padStart(2,'0')});project.shots.push(s);resetFilter();changed();selectShot(s.id,true)};
$('#duplicateShot').onclick=()=>{if(!current()||project.shots.length>=200)return;checkpoint();const s=newShot({...structuredClone(current()),id:crypto.randomUUID(),title:current().title+' · 副本',number:String(project.shots.length+1).padStart(2,'0'),status:'draft'});project.shots.splice(index()+1,0,s);changed();selectShot(s.id)};
$('#deleteShot').onclick=()=>{if(!current())return;checkpoint();const i=index();project.shots.splice(i,1);project.selectedId=project.shots[Math.min(i,project.shots.length-1)]?.id||'';changed();if(current())selectShot(current().id);else{media=null;showView('overview')}toast('镜头已删除，可撤销')};
$('#undo').onclick=async()=>{if(!undoData||busy)return;project=undoData;undoData=null;$('#undo').disabled=true;$('#projectTitle').value=project.title;$('#scriptInput').value=project.script;invalidateParsed();resetFilter();changed();if(current())await selectShot(current().id);showView('overview');toast('已撤销上一操作')};
function invalidateParsed(){parsed=[];$('#parsedCount').textContent='尚未拆镜';$('#appendShots').disabled=$('#replaceShots').disabled=true;$('#importError').textContent='';$('#parsedShots').replaceChildren(node('div','empty','请点击“自动拆镜”查看结果。'))}
$('#scriptInput').oninput=()=>{project.script=$('#scriptInput').value;invalidateParsed();changed()};$('#scriptFormat').onchange=invalidateParsed;
$('#sampleScript').onclick=()=>{$('#scriptInput').value=SAMPLE;$('#scriptFormat').value='text';project.script=SAMPLE;invalidateParsed();changed()};
function parse(){try{parsed=parseScript($('#scriptInput').value,$('#scriptFormat').value);$('#importError').textContent='';$('#parsedShots').replaceChildren();parsed.forEach((s,i)=>{const p=node('article','parsed-shot');p.append(node('strong','','SHOT '+number(s,i)+' · '+s.title),node('p','',s.description),node('small','',[s.duration+'s',s.shotSize,EFFECTS[s.effect],s.dialogue?'旁白/对白：'+s.dialogue:''].filter(Boolean).join(' / ')));$('#parsedShots').append(p)});$('#parsedCount').textContent=parsed.length+' 镜 · '+parsed.reduce((a,s)=>a+s.duration,0).toFixed(1)+'s';$('#appendShots').disabled=$('#replaceShots').disabled=false;return true}catch(e){invalidateParsed();$('#importError').textContent=e.message;return false}}
$('#parseScript').onclick=parse;
async function applyParsed(replace){if(!parsed.length)return;if((replace?0:project.shots.length)+parsed.length>200)return toast('每个项目最多 200 镜，请拆分导入');checkpoint();const shots=structuredClone(parsed);project.shots=replace?shots:[...project.shots,...shots];project.script=$('#scriptInput').value;const first=shots[0].id;resetFilter();invalidateParsed();changed();await selectShot(first);showView('overview');toast('已导入 '+shots.length+' 个镜头，点击卡片继续编辑')}
$('#appendShots').onclick=()=>applyParsed(false);$('#replaceShots').onclick=()=>applyParsed(true);
$('#scriptFile').onchange=async e=>{const f=e.target.files[0];if(!f||busy)return;setBusy(true);try{const data=await readScriptFile(f);setBusy(false);$('#scriptInput').value=data.text;$('#scriptFormat').value=data.format;project.script=data.text;invalidateParsed();changed();parse()}catch(err){setBusy(false);$('#importError').textContent=err.message}finally{e.target.value=''}};
function preview(){
  const s=current();if(!s){ctx.clearRect(0,0,960,540);return}
  if(media)render(ctx,960,540,time,s,media);else{ctx.fillStyle='#071017';ctx.fillRect(0,0,960,540)}
  if(s.effect==='sweep'&&s.mode!=='keyframe'&&$('#showSelection').checked&&hasMedia(s)){
    const r=drag?.region||s.selection;ctx.save();ctx.strokeStyle='#dfbc82';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.beginPath();if(r.shape==='ellipse')ctx.ellipse((r.x+r.w/2)*960,(r.y+r.h/2)*540,r.w*480,r.h*270,0,0,Math.PI*2);else ctx.rect(r.x*960,r.y*540,r.w*960,r.h*540);ctx.stroke();ctx.restore();
  }
  $('#scrub').value=Math.round(time*1000);$('#timeLabel').textContent=(time*s.duration).toFixed(1)+' / '+s.duration.toFixed(1)+'s';$('#playhead').style.left=time*100+'%';
  const label=s.mode==='keyframe'?'首尾帧过渡':EFFECTS[s.effect];$('#screenDesc').textContent=label+' · '+s.duration.toFixed(1)+'s';$('#timelineName').textContent=label;$('#trackLabel').textContent='画面 · '+label;$('#endTime').textContent=s.duration.toFixed(1)+'s';
}
function stop(){playing=false;cancelAnimationFrame(raf);$('#playBtn').textContent='▶'}
function tick(now){if(!playing)return;time=clamp((now-started)/(1000*current().duration),0,1);preview();if(time>=1)stop();else raf=requestAnimationFrame(tick)}
function play(fromStart=false){if(busy||!media||!hasMedia(current()))return;if(playing){stop();return}if(fromStart||time>=1)time=0;playing=true;started=performance.now()-time*current().duration*1000;$('#playBtn').textContent='Ⅱ';raf=requestAnimationFrame(tick)}
$('#playBtn').onclick=()=>play();$('#replayBtn').onclick=()=>{stop();play(true)};$('#scrub').oninput=e=>{stop();time=+e.target.value/1000;preview()};$('#timelineTrack').onclick=e=>{stop();const r=e.currentTarget.getBoundingClientRect();time=clamp((e.clientX-r.left)/r.width,0,1);preview()};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&view==='editor'&&!busy&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();play()}if(e.code==='Escape'){selecting=false;drag=null;canvas.classList.remove('selecting');preview()}});
$$('[data-mode]').forEach(b=>b.onclick=()=>{if(busy||!current())return;stop();current().mode=b.dataset.mode;changed(current());syncControls();preview()});
for(const key of ['effect','easing','fit','sweepDirection'])$('#'+key).onchange=e=>{if(!current())return;stop();current()[key]=e.target.value;changed(current());syncControls();time=0;preview()};
for(const key of ['duration','strength'])$('#'+key).oninput=e=>{if(!current())return;stop();current()[key]=+e.target.value/(key==='strength'?100:1);changed(current());$('#durationNum').textContent=current().duration.toFixed(1)+' 秒';$('#strengthNum').textContent=Math.round(current().strength*100)+'%';updateStrip();preview()};
$('#showSelection').onchange=preview;$('#selectionShape').onchange=e=>{current().selection.shape=e.target.value;changed(current());preview()};
for(const [id,key] of [['regionX','x'],['regionY','y'],['regionW','w'],['regionH','h']])$('#'+id).onchange=e=>{current().selection=selection({...current().selection,[key]:+e.target.value/100});syncRegion();changed(current());preview()};
$('#selectRegion').onclick=()=>{if(!media?.image)return toast('请先上传本镜参考图');stop();selecting=!selecting;canvas.classList.toggle('selecting',selecting);$('#showSelection').checked=true;$('#selectionHint').textContent=selecting?'在画面上拖框选择主体；从右下向左上拖动也可以。按 Esc 取消。':'选区已设置。边框只用于编辑，不会导出。';canvas.focus();preview()};
const point=e=>{const r=canvas.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)}};
canvas.onpointerdown=e=>{if(!selecting||busy)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);drag={start:point(e),region:null}};
canvas.onpointermove=e=>{if(!drag)return;const p=point(e),a=drag.start;drag.region={x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),w:Math.abs(a.x-p.x),h:Math.abs(a.y-p.y),shape:current().selection.shape};preview()};
canvas.onpointerup=e=>{if(!drag)return;const region=drag.region;drag=null;selecting=false;canvas.classList.remove('selecting');if(region&&region.w>.02&&region.h>.02){current().selection=selection(region);syncRegion();changed(current());toast('主体选区已保存')}preview()};canvas.onpointercancel=()=>{drag=null;preview()};
$('#estimateRegion').onclick=()=>{if(!media?.image)return toast('请先上传本镜参考图');try{current().selection=estimateSelection(media.image,current().fit);$('#showSelection').checked=true;syncRegion();changed(current());preview();toast('已估计主体范围，请检查并手动微调')}catch(e){toast(e.message)}};
async function imageFile(file){if(!file.type.startsWith('image/')||/svg/i.test(file.type))throw new Error('请使用 PNG、JPG、WebP 或 GIF 图片');if(file.size>10*1024*1024)throw new Error('单张图片请控制在 10 MB 内');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('图片读取失败'));r.readAsDataURL(file)});const image=await loadImage(data);if(image.naturalWidth*image.naturalHeight>24000000)throw new Error('图片超过 2400 万像素，请缩小后导入');return {data,image,name:file.name}}
async function upload(which,files){if(!files.length||busy)return;const shot=current(),id=shot.id;setBusy(true);try{if(which==='actions'&&files.length>30)throw new Error('动作关键帧最多支持 30 张');const list=await Promise.all([...files].map(imageFile));checkpoint();if(which==='actions'){list.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));shot.actions=list.map(({data,name})=>({data,name}));shot.effect='action'}else{const key=which==='image'?'image':which;shot[key+'Data']=list[0].data;shot[key+'Name']=list[0].name}shot.status=shot.status==='confirmed'?'revise':'ready';changed(shot,true);toast('素材已导入本镜')}catch(e){toast(e.message)}finally{setBusy(false);await selectShot(id)}}
for(const [id,key] of [['singleFile','image'],['startFile','start'],['endFile','end'],['actionFile','actions']])$('#'+id).onchange=async e=>{await upload(key,e.target.files);e.target.value=''};
const drop=$('#singleDrop');drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging')};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');if(e.dataTransfer.files[0])upload('image',[e.dataTransfer.files[0]])};
$('#reusePrevious').onclick=async()=>{const prev=project.shots[index()-1];if(!prev?.imageData)return toast('上一镜还没有可沿用的参考图');checkpoint();Object.assign(current(),{imageData:prev.imageData,imageName:prev.imageName,mode:'upload',status:'ready'});changed(current(),true);await selectShot(current().id);toast('已沿用上一镜参考图，可单独调整运镜')};
$('#copyPrompt').onclick=async()=>{try{await navigator.clipboard.writeText($('#prompt').value||current().description);toast('已复制生图提示词')}catch{toast('剪贴板不可用，请手动选中并复制提示词')}};
const filename=s=>'SHOT_'+number(s,index()).replace(/[^\w\u4e00-\u9fff-]/g,'_');
function download(blob,name){const link=node('a');const url=URL.createObjectURL(blob);link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
let disabledState;
function setBusy(value){busy=value;document.body.classList.toggle('busy',value);if(value){disabledState=new Map();$$('button,input,textarea,select').forEach(el=>{disabledState.set(el,el.disabled);el.disabled=el.id!=='cancelExport'});$('#cancelExport').classList.toggle('hidden',!exportController)}else{disabledState?.forEach((disabled,el)=>el.disabled=disabled);$('#undo').disabled=!undoData;$('#cancelExport').classList.add('hidden');setExportButtons()}}
$('#cancelExport').onclick=()=>exportController?.abort();
$('#gifBtn').onclick=async()=>{if(busy||!media)return;stop();const s=structuredClone(current()),loaded=media;exportController=new AbortController();setBusy(true);try{const result=await encodeGIF(s,loaded,{signal:exportController.signal,onProgress:(n,total)=>$('#progress').textContent='GIF 编码中：'+n+' / '+total+' 帧'});download(result.blob,filename(s)+'_'+s.duration+'s.gif');$('#progress').textContent='GIF 导出完成 · '+result.frames+' 帧 · '+result.duration.toFixed(2)+' 秒 · 无限循环';toast('多帧 GIF 已保存')}catch(e){$('#progress').textContent=e.name==='AbortError'?'已取消导出':'GIF 导出失败：'+e.message}finally{setBusy(false);exportController=null;preview()}};
async function exportPNG(t){if(busy||!media)return;const s=structuredClone(current()),temp=document.createElement('canvas');temp.width=960;temp.height=540;render(temp.getContext('2d'),960,540,t,s,media);temp.toBlob(blob=>{if(blob){download(blob,filename(s)+(t===1?'_结束帧':'_当前帧')+'.png');toast('已导出不含选区边框的 PNG')}},'image/png')}
$('#pngBtn').onclick=()=>exportPNG(time);$('#exportEndBtn').onclick=()=>exportPNG(1);
$('#videoBtn').onclick=async()=>{
  if(busy||!media)return;if(!window.MediaRecorder||!canvas.captureStream)return toast('当前浏览器不支持视频导出，请使用 Chrome 或 Edge');
  const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)return toast('浏览器没有可用的视频编码器');
  stop();const s=structuredClone(current()),loaded=media,temp=document.createElement('canvas');temp.width=960;temp.height=540;const c=temp.getContext('2d'),stream=temp.captureStream(30);let rec,animation,aborted=false,finished=false;exportController=new AbortController();setBusy(true);
  const finish=()=>{if(finished)return;finished=true;cancelAnimationFrame(animation);stream.getTracks().forEach(t=>t.stop());setBusy(false);exportController=null;preview()};
  try{rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3000000});const chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onerror=e=>{aborted=true;$('#progress').textContent='视频导出失败：'+(e.error?.message||'编码错误');finish()};rec.onstop=()=>{if(!aborted&&chunks.length){download(new Blob(chunks,{type:mime}),filename(s)+(mime.startsWith('video/mp4')?'.mp4':'.webm'));$('#progress').textContent='视频导出完成：'+(mime.startsWith('video/mp4')?'MP4':'WebM')}finish()};exportController.signal.onabort=()=>{aborted=true;$('#progress').textContent='已取消视频导出';cancelAnimationFrame(animation);if(rec.state!=='inactive')rec.stop();else finish()};render(c,960,540,0,s,loaded);rec.start();const begin=performance.now();const run=now=>{if(aborted||finished)return;const t=clamp((now-begin)/(s.duration*1000),0,1);render(c,960,540,t,s,loaded);$('#progress').textContent='视频录制中：'+Math.round(t*100)+'%';if(t<1)animation=requestAnimationFrame(run);else setTimeout(()=>{if(rec.state!=='inactive')rec.stop()},50)};animation=requestAnimationFrame(run)}catch(e){$('#progress').textContent='视频导出失败：'+e.message;finish()}
};
$('#saveProject').onclick=()=>{download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),(project.title||'分镜项目').replace(/[<>:"/\\|?*]/g,'_')+'_V2工程.json');persist();toast('工程已保存，包含所有镜头、图片和选区')};
$('#openProject').onclick=()=>$('#projectInput').click();$('#projectInput').onchange=async e=>{const file=e.target.files[0];if(!file||busy)return;setBusy(true);try{if(file.size>80*1024*1024)throw new Error('工程文件请控制在 80 MB 内');const candidate=normalizeProject(JSON.parse(await file.text()));for(const s of candidate.shots)await loadMedia(s);checkpoint();project=candidate;$('#projectTitle').value=project.title;$('#scriptInput').value=project.script;invalidateParsed();resetFilter();changed();toast('工程导入成功')}catch(err){toast('工程导入失败：'+err.message)}finally{setBusy(false);if(current())await selectShot(current().id);showView('overview');e.target.value=''}};
$('#shotList').onclick=()=>download(new Blob([shotListCSV(project.shots)],{type:'text/csv;charset=utf-8'}),'分镜镜头表.csv');
async function boot(){
  try{const saved=await readDraft();if(saved)project=normalizeProject(saved);else{const shots=parseScript(SAMPLE);Object.assign(shots[0],{imageData:DEMO_IMAGE,imageName:'通用器物示意（非真实产品）',status:'ready',selection:selection({x:.4,y:.22,w:.27,h:.55})});project={...newProject(shots),title:'器物 · 一束光',script:SAMPLE}}}catch(e){toast('草稿读取失败：'+e.message);project=newProject()}
  $('#projectTitle').value=project.title;$('#scriptInput').value=project.script;if(current())await selectShot(current().id);showView(['import','editor'].includes(location.hash.slice(1))?location.hash.slice(1):'overview');await persist();
}
boot().catch(e=>{$('#bootError').classList.remove('hidden');$('#bootError').textContent='载入失败：'+e.message;console.error(e)});
