export const EFFECTS = { still:'定镜', sweep:'主体局部光扫', fade:'黑场渐显', zoomIn:'推近', zoomOut:'后拉', panLeft:'向左平移', panRight:'向右平移', tiltUp:'上摇', tiltDown:'下摇', focus:'虚到实', action:'动作帧序列' };
export const STATUSES = { draft:'未生成', ready:'已生成', confirmed:'已确认', revise:'待修改' };
export const SAMPLE = `# 器物 · 一束光
镜头01｜全黑背景，一束光从左向右扫过陶瓷杯，呈现器身质感。｜2秒｜特写｜光扫
旁白：让时间，慢一点。

镜头02｜人物走进展厅，在展柜前停下，凝视杯子。｜4秒｜中景｜向右平移
动作：走入，停下，看向杯子

镜头03｜手轻轻拿起茶杯，镜头缓慢推近杯口的细节。｜3秒｜近景｜推近
旁白：握住此刻的温度。
备注：与第一镜保持同一产品。`;

const uid = () => globalThis.crypto?.randomUUID?.() || 'shot-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, fallback, lo, hi) => v!==null && v!=='' && typeof v!=='boolean' && Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : fallback;
const str = (v, max = 20000) => String(v ?? '').slice(0, max);
export function selection(value = {}) {
  if(!value || typeof value!=='object')value={};
  const x = num(value.x, .32, 0, .98), y = num(value.y, .15, 0, .98);
  return { x, y, w:num(value.w, .36, .02, 1-x), h:num(value.h, .7, .02, 1-y), shape:value.shape === 'ellipse' ? 'ellipse' : 'rect' };
}
export function newShot(values = {}) {
  return { id:uid(), number:'', title:'新镜头', scene:'', description:'', action:'', dialogue:'', duration:3, shotSize:'中景', angle:'正拍', notes:'', status:'draft', prompt:'',
    mode:'upload', effect:'still', strength:.65, easing:'ease', fit:'contain', sweepDirection:'right', selection:selection(),
    imageData:'', imageName:'', startData:'', startName:'', endData:'', endName:'', actions:[], ...values };
}
export function newProject(shots = []) { return { version:2, title:'未命名分镜项目', script:'', shots, selectedId:shots[0]?.id || '', updatedAt:new Date().toISOString() }; }

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i=0; i<text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i+1] === '"') { cell += '"'; i++; } else if (quoted || cell === '') quoted = !quoted; else cell += c; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i+1] === '\n') i++; row.push(cell); if (row.some(x=>x.trim())) rows.push(row); row=[]; cell=''; }
    else cell += c;
  }
  if (quoted) throw new Error('CSV 引号未闭合，请检查文件');
  row.push(cell); if (row.some(x=>x.trim())) rows.push(row);
  return rows;
}
const aliases = {
  number:['镜号','镜头','镜头号','shot','shotid','number'], title:['标题','名称','title'], scene:['场景','场次','scene'],
  description:['画面','画面描述','描述','文案','description','visual'], action:['动作','人物动作','action'], dialogue:['对白','旁白','对白/旁白','台词','dialogue','voiceover'],
  duration:['时长','秒','duration','durations'], shotSize:['景别','shotsize','size'], angle:['机位','角度','angle'], effect:['运镜','动效','运动','motion','effect'], notes:['备注','notes']
};
const cleanHeader = s => s.trim().toLowerCase().replace(/[\s_()（）]/g,'');
function durationOf(s, fallback = 3) {
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*(?:秒|s(?:ec(?:onds?)?)?\b)/i) || String(s).match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  return m ? num(m[1], fallback, .5, 30) : fallback;
}
export function inferEffect(text) {
  if (/光扫|扫光/.test(text)) return 'sweep';
  if (/后拉|拉远/.test(text)) return 'zoomOut';
  if (/推近|推进|特写|微距/.test(text)) return 'zoomIn';
  if (/向左|左移/.test(text)) return 'panLeft';
  if (/向右|右移|平移|跟随/.test(text)) return 'panRight';
  if (/上摇/.test(text)) return 'tiltUp';
  if (/下摇/.test(text)) return 'tiltDown';
  if (/虚实|虚到实|对焦/.test(text)) return 'focus';
  if (/渐显|淡入|黑场/.test(text)) return 'fade';
  return 'still';
}
function inferShot(text) {
  return { duration:durationOf(text), shotSize:(text.match(/大特写|特写|近景|中景|全景|远景/) || ['中景'])[0],
    angle:(text.match(/俯拍|仰拍|侧拍|正拍/) || ['正拍'])[0], effect:inferEffect(text) };
}
function fromCSV(text) {
  const rows = parseCSV(text); if (rows.length < 2) throw new Error('CSV 需要表头和至少一行镜头');
  const keys = rows.shift().map(h => Object.keys(aliases).find(k => aliases[k].includes(cleanHeader(h))) || '');
  if (!keys.includes('description')) throw new Error('CSV 缺少“画面描述”或 description 列');
  return rows.map((row,i) => {
    const values = {}; keys.forEach((k,j) => { if (k) values[k] = row[j]?.trim() || ''; });
    if (!values.description) return null;
    const inferred = inferShot(Object.values(values).join(' '));
    const effect = EFFECTS[values.effect] ? values.effect : inferEffect(values.effect || values.description);
    return newShot({ ...inferred, ...values, duration:durationOf(values.duration || '', inferred.duration), effect, number:values.number || String(i+1).padStart(2,'0'), title:values.title || values.description.slice(0,26), prompt:values.description });
  }).filter(Boolean);
}
const shotMarker = /^\s*(?:#{1,6}\s*)?(?:(?:SHOT|镜头|镜号)\s*[-#：:]?\s*(\d+)|(?:镜|第)\s*(\d+)\s*(?:镜|[：:、.])|(\d{1,3})\s*[.、)）｜|])\s*[：:、.｜|\-]?\s*/i;
const fieldMarker = /^(画面描述|画面|描述|文案|动作|人物动作|旁白|对白|台词|时长|景别|机位|角度|运镜|动效|备注)\s*[：:]\s*(.*)$/;
export function parseScript(input, format = 'text') {
  const text = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('请先粘贴或导入脚本');
  if (text.length > 250000) throw new Error('首个测试版支持 25 万字以内的脚本');
  if (format === 'csv') return limited(fromCSV(text));
  const tableLines=text.split('\n').filter(l=>l.trim().includes('|'));
  if(tableLines.length>2&&/^\s*\|?\s*:?-{3,}/.test(tableLines[1])){
    const rows=tableLines.filter((_,i)=>i!==1).map(l=>l.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(c=>c.trim().replace(/\\\|/g,'|')));
    return limited(fromCSV(rows.map(row=>row.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\n')));
  }
  const lines = text.split('\n'), explicit = lines.some(l => shotMarker.test(l));
  let blocks = [], scene = '', current;
  const flush = () => { if (current?.lines.length) blocks.push(current); current = null; };
  for (const raw of lines) {
    const line = raw.trim();
    const marker = line.match(shotMarker);
    if (marker) { flush(); current={ number:marker[1] || marker[2] || marker[3], scene, lines:[] }; const rest=line.slice(marker[0].length); if(rest)current.lines.push(rest); continue; }
    if (/^(?:#{1,6}\s+|(?:场景|场次)\s*[^：:]*[：:]|(?:INT\.|EXT\.))/i.test(line) && !fieldMarker.test(line)) { scene=line.replace(/^#+\s*/, ''); continue; }
    if (!line) { if(!explicit)flush(); continue; }
    if (!current) { if(explicit)continue; current={number:'',scene,lines:[]}; }
    current.lines.push(line.replace(/^[-*]\s+/, ''));
  }
  flush();
  return limited(blocks.map((block,i) => {
    const text = block.lines.join('\n'), values={ description:'', action:'', dialogue:'', notes:'' };
    for(const line of block.lines) {
      const f=line.match(fieldMarker);
      if (!f) { values.description += (values.description ? '\n' : '') + line; continue; }
      const k=Object.keys(aliases).find(k=>aliases[k].includes(f[1])) || ({'动效':'effect','角度':'angle'}[f[1]]);
      if(k)values[k] = (values[k] ? values[k]+'\n' : '')+f[2];
    }
    const inferred = inferShot(text);
    const description = (values.description || values.dialogue || text).split(/[｜|]/).filter(s => !/^\s*(?:\d+(?:\.\d+)?\s*(?:s|秒)|特写|近景|中景|全景|远景|光扫|推近|后拉|上摇|下摇|定镜|向[左右]平移)\s*$/i.test(s)).join(' · ').trim();
    return newShot({ ...inferred, ...values, description, duration:values.duration ? durationOf(values.duration) : inferred.duration, effect:values.effect ? inferEffect(values.effect) : inferred.effect, number:block.number || String(i+1).padStart(2,'0'), scene:block.scene, title:description.slice(0,26), prompt:description });
  }));
}
function limited(shots) {
  if (!shots.length) throw new Error('未识别到镜头，请检查脚本内容');
  if (shots.length > 200) throw new Error('首个测试版每个项目最多支持 200 个镜头');
  return shots;
}
const imageValue = v => {
  if (!v) return '';
  if (typeof v !== 'string' || v.length > 16000000 || !/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)[;,]/i.test(v)) throw new Error('工程图片必须为有效的本地图片数据');
  return v;
};
export function normalizeShot(s = {}) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('镜头数据格式错误');
  const clean = {};
  for (const k of ['number','title','scene','description','action','dialogue','notes','prompt','imageName','startName','endName']) clean[k] = str(s[k]);
  const actions = s.actions || []; if (!Array.isArray(actions) || actions.length > 30) throw new Error('动作关键帧最多支持 30 张');
  return newShot({ ...clean, id:str(s.id,100)||uid(), duration:num(s.duration,3,.5,30), strength:num(s.strength,.65,0,1),
    mode:['upload','ai','keyframe'].includes(s.mode)?s.mode:'upload', effect:EFFECTS[s.effect]?s.effect:'still', status:STATUSES[s.status]?s.status:'draft',
    shotSize:str(s.shotSize || '中景',30), angle:str(s.angle || '正拍',30), fit:s.fit==='cover'?'cover':'contain',
    easing:['linear','ease','easeIn','easeOut'].includes(s.easing)?s.easing:'ease', sweepDirection:s.sweepDirection==='left'?'left':'right', selection:selection(s.selection),
    imageData:imageValue(s.imageData), startData:imageValue(s.startData), endData:imageValue(s.endData), actions:actions.map(a=>({name:str(a.name,200),data:imageValue(a.data)})) });
}
export function normalizeProject(p) {
  if (!p || typeof p !== 'object') throw new Error('无效的工程文件');
  if(p.version === 1) {
    const shot = normalizeShot({ ...p, description:p.shotText||'', title:'从 V1 导入的镜头', status:p.imageData?'ready':'draft' });
    return { ...newProject([shot]), title:'V1 工程迁移' };
  }
  if (p.version !== 2 || !Array.isArray(p.shots) || p.shots.length > 200) throw new Error('不支持的工程版本或镜头数量');
  const shots=p.shots.map(normalizeShot), ids=new Set();
  shots.forEach(s=>{if(ids.has(s.id))s.id=uid();ids.add(s.id)});
  return { ...newProject(shots), title:str(p.title||'未命名分镜项目',200), script:str(p.script,250000), selectedId:shots.some(s=>s.id===p.selectedId)?p.selectedId:shots[0]?.id||'' };
}
export function shotListCSV(shots) {
  const rows = [['镜号','标题','场景','画面描述','动作','对白/旁白','时长','景别','机位','运镜','状态','备注'], ...shots.map((s,i)=>[s.number||i+1,s.title,s.scene,s.description,s.action,s.dialogue,s.duration,s.shotSize,s.angle,EFFECTS[s.effect],STATUSES[s.status],s.notes])];
  return '\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@\-]/,"'$&")+'"').join(',')).join('\r\n');
}
