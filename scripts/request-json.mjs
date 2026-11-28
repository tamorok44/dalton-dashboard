export class RequestJsonError extends Error {
  constructor(status,message){
    super(message);
    this.status=status;
  }
}

const tooLarge=()=>new RequestJsonError(413,'Anfrage ist zu groß');
const invalid=()=>new RequestJsonError(400,'Ungültige JSON-Anfrage');
const maxDepth=48;

function jsonObject(value,limit){
  let available=limit;
  const spend=bytes=>{
    available-=bytes;
    if(available<0)throw tooLarge();
  };
  const measure=(value,depth)=>{
    if(depth>maxDepth)throw invalid();
    if(typeof value==='string'){
      if(Buffer.byteLength(value)>available)throw tooLarge();
      spend(Buffer.byteLength(JSON.stringify(value)));
      return;
    }
    if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)){
      spend(Buffer.byteLength(JSON.stringify(value)));
      return;
    }
    if(typeof value!=='object')throw invalid();
    spend(2);
    if(Array.isArray(value)){
      spend(Math.max(0,value.length-1));
      for(const member of value)measure(member,depth+1);
      return;
    }
    const prototype=Object.getPrototypeOf(value);
    if(prototype!==null&&prototype!==Object.prototype)throw invalid();
    const entries=Object.entries(value);
    spend(Math.max(0,entries.length-1)+entries.length);
    for(const [name,member] of entries){
      measure(name,depth+1);
      measure(member,depth+1);
    }
  };
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
  measure(value,0);
  return value;
}

export async function readRequestJson(req,limit){
  const length=req.headers?.['content-length'];
  if(length!==undefined){
    if(typeof length!=='string'||!/^\d+$/.test(length))throw invalid();
    if(Number(length)>limit)throw tooLarge();
  }
  const chunks=[];
  let size=0;
  const add=chunk=>{
    if(typeof chunk!=='string'&&!(chunk instanceof Uint8Array))throw invalid();
    size+=typeof chunk==='string'?Buffer.byteLength(chunk):chunk.byteLength;
    if(size>limit)throw tooLarge();
    chunks.push(typeof chunk==='string'?Buffer.from(chunk):chunk);
  };
  if(typeof req.body==='string'||req.body instanceof Uint8Array)add(req.body);
  else if(req.body!==undefined&&req.body!==null)return jsonObject(req.body,limit);
  else if(typeof req[Symbol.asyncIterator]==='function'){
    for await(const chunk of req)add(chunk);
  }
  if(!size)throw invalid();
  let parsed;
  try{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size));
    parsed=JSON.parse(text);
  }catch{throw invalid();}
  return jsonObject(parsed,limit);
}
