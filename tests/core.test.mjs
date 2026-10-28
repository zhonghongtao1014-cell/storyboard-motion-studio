import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, SAMPLE, normalizeProject, newShot, newProject, selection, shotListCSV, parseCSV } from '../src/core.mjs';
test('Chinese numbered sample keeps durations, dialogue, actions and movement',()=>{
  const shots=parseScript(SAMPLE);assert.equal(shots.length,3);assert.deepEqual(shots.map(s=>s.duration),[2,4,3]);assert.deepEqual(shots.map(s=>s.effect),['sweep','panRight','zoomIn']);assert.equal(shots[0].dialogue,'让时间，慢一点。');assert.equal(shots[1].action,'走入，停下，看向杯子');assert.equal(shots[0].shotSize,'特写');assert(!shots[0].description.includes('2秒'));
});
test('explicit labels and scenes remain independent of blank lines',()=>{
  const shots=parseScript('场景一：展厅\n镜头 7：\n画面：陶瓷杯\n时长：2.5秒\n\n对白：你好\n运镜：后拉\n镜头 8：人走入。\n动作：停下');assert.equal(shots.length,2);assert.equal(shots[0].number,'7');assert.equal(shots[0].description,'陶瓷杯');assert.equal(shots[0].duration,2.5);assert.equal(shots[0].dialogue,'你好');assert.equal(shots[0].effect,'zoomOut');assert.equal(shots[1].scene,'场景一：展厅');
});
test('English SHOT / Fountain scene headings and plain paragraphs',()=>{
  assert.equal(parseScript('INT. GALLERY - DAY\nSHOT 001: A cup.\nSHOT 002: A person.').length,2);
  const shots=parseScript('第一段画面。\n描述补充。\n\n第二段画面。');assert.equal(shots.length,2);assert.equal(shots[0].description,'第一段画面。\n描述补充。');
});
test('CSV supports BOM, quoted commas, doubled quotes and multiline cells',()=>{
  const shots=parseScript('\uFEFF镜号,画面描述,时长,运镜,对白\r\n7,"杯子,\n""特写""",2.5,后拉,你好\r\n8,人物,4,定镜,','csv');assert.equal(shots.length,2);assert.equal(shots[0].description,'杯子,\n"特写"');assert.equal(shots[0].effect,'zoomOut');assert.equal(shots[0].duration,2.5);assert.equal(shots[1].effect,'still');
});
test('English CSV headers and explicit effect IDs',()=>{const [s]=parseScript('shot,description,duration (s),shot_size,motion\n01,cup,5,closeup,panLeft','csv');assert.equal(s.duration,5);assert.equal(s.effect,'panLeft');assert.equal(s.shotSize,'closeup')});
test('Markdown table import',()=>{const shots=parseScript('| 镜号 | 画面描述 | 时长 | 运镜 |\n| --- | --- | --- | --- |\n| 01 | 杯子 | 2s | 光扫 |\n| 02 | 手拿杯子 | 3s | 推近 |');assert.equal(shots.length,2);assert.equal(shots[0].effect,'sweep');assert.equal(shots[1].duration,3)});
test('reject empty, malformed CSV, missing visual header and excessive shots',()=>{assert.throws(()=>parseScript(''));assert.throws(()=>parseCSV('"unclosed'));assert.throws(()=>parseScript('x,y\na,b','csv'));assert.throws(()=>parseScript(Array.from({length:201},(_,i)=>`镜头${i+1}：画面`).join('\n')))});
test('duration is bounded and text is retained without executing markup',()=>{const s=parseScript('镜头1：<img src=x onerror=alert(1)>｜999s')[0];assert.equal(s.duration,30);assert(s.description.includes('<img'))});
test('selection clamps to canvas, with null or reversed input handled',()=>{assert.deepEqual(selection(null),selection());const s=selection({x:.97,y:-2,w:5,h:-1});assert(s.x+s.w<=1);assert(s.y>=0);assert(s.h>=.02)});
test('V1 imports migrate to one independent V2 shot',()=>{const p=normalizeProject({version:1,shotText:'旧镜头',duration:2,effect:'sweep',strength:.7});assert.equal(p.version,2);assert.equal(p.shots.length,1);assert.equal(p.shots[0].description,'旧镜头');assert.equal(p.shots[0].duration,2)});
test('project roundtrip keeps all independent parameters and image data',()=>{const s=newShot({imageData:'data:image/png;base64,AA==',selection:selection({x:.1,y:.2,w:.2,h:.3}),status:'confirmed'});const second=newShot({duration:4,effect:'zoomOut'});const p=normalizeProject(JSON.parse(JSON.stringify(newProject([s,second]))));assert.equal(p.shots[0].imageData,s.imageData);assert.deepEqual(p.shots[0].selection,s.selection);p.shots[1].selection.x=.8;assert.equal(p.shots[0].selection.x,.1);assert.equal(p.shots[0].status,'confirmed')});
test('untrusted project settings sanitize, duplicate ids regenerate, remote images reject',()=>{const p=normalizeProject({version:2,shots:[{id:'a',duration:'NaN',strength:100,effect:'unknown',selection:null},{id:'a',duration:-5}]});assert.equal(p.shots[0].duration,3);assert.equal(p.shots[0].strength,1);assert.equal(p.shots[0].effect,'still');assert.notEqual(p.shots[0].id,p.shots[1].id);assert.equal(p.shots[1].duration,.5);assert.throws(()=>normalizeProject({version:2,shots:[{imageData:'https://evil.test/image.png'}]}));assert.throws(()=>normalizeProject({version:99,shots:[]}))});
test('CSV export quotes fields, includes BOM and guards formula cells',()=>{const csv=shotListCSV([newShot({title:'=HYPERLINK("x")',description:'杯,子\n细节'})]);assert(csv.startsWith('\uFEFF'));const rows=parseCSV(csv.slice(1));assert(rows[1][1].startsWith("'="));assert.equal(rows[1][3],'杯,子\n细节')});
