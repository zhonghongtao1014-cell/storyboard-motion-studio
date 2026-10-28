export async function readScriptFile(file){
  if(file.size>8*1024*1024)throw new Error('脚本文件请控制在 8 MB 内');
  const extension=file.name.split('.').pop().toLowerCase();
  if(['txt','md','markdown','csv','fountain'].includes(extension)){
    const bytes=await file.arrayBuffer();let text=new TextDecoder('utf-8').decode(bytes);
    if(text.includes('\ufffd')){try{text=new TextDecoder('gb18030',{fatal:true}).decode(bytes)}catch{throw new Error('无法识别编码，请另存为 UTF-8 文本')}}
    return {text,format:extension==='csv'?'csv':'text'};
  }
  if(extension!=='docx')throw new Error('当前支持 TXT、Markdown、CSV、Fountain 和 DOCX。PDF 请先复制文本；扫描件需要 OCR');
  const buffer=await file.arrayBuffer(),view=new DataView(buffer),bytes=new Uint8Array(buffer),decoder=new TextDecoder();
  let end=bytes.length-22;for(;end>=Math.max(0,bytes.length-65557);end--)if(view.getUint32(end,true)===0x06054b50)break;
  if(end<0||view.getUint32(end,true)!==0x06054b50)throw new Error('DOCX 文件损坏，未找到文档目录');
  let cursor=view.getUint32(end+16,true);const count=view.getUint16(end+10,true);
  for(let i=0;i<count;i++){
    if(cursor+46>bytes.length||view.getUint32(cursor,true)!==0x02014b50)break;
    const nameLength=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),name=decoder.decode(bytes.slice(cursor+46,cursor+46+nameLength));
    if(name==='word/document.xml'){
      const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),size=view.getUint32(cursor+20,true),unpacked=view.getUint32(cursor+24,true),offset=view.getUint32(cursor+42,true);
      if(flags&1)throw new Error('请先移除 Word 文档的密码保护');
      if(unpacked>4*1024*1024)throw new Error('Word 文本过长，请拆分后导入');
      if(offset+30>bytes.length||view.getUint32(offset,true)!==0x04034b50)throw new Error('Word 文档结构错误');
      const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);let content=bytes.slice(start,start+size);
      if(method===8){
        if(!globalThis.DecompressionStream)throw new Error('浏览器不支持 DOCX 解压，请改用 TXT');
        const reader=new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let total=0;
        while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>4*1024*1024){await reader.cancel();throw new Error('Word 文本过长，请拆分后导入')}chunks.push(part.value)}
        content=new Uint8Array(await new Blob(chunks).arrayBuffer());
      }else if(method!==0)throw new Error('不支持该 Word 压缩格式，请另存为 DOCX 或 TXT');
      const xml=new DOMParser().parseFromString(decoder.decode(content),'application/xml');if(xml.getElementsByTagName('parsererror').length)throw new Error('Word 正文损坏');
      const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      return {text:[...xml.getElementsByTagNameNS(ns,'p')].map(p=>[...p.getElementsByTagNameNS(ns,'t')].map(t=>t.textContent).join('')).join('\n'),format:'text'};
    }
    cursor+=46+nameLength+extra+comment;
  }
  throw new Error('未找到 Word 正文，请使用 DOCX 文档');
}
