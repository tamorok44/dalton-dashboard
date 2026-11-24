function isDigit(char){return char>='0'&&char<='9'}
function isIdentifierStart(char){return /[A-Za-z_]/.test(char||'')}
function isIdentifierPart(char){return /[A-Za-z0-9_]/.test(char||'')}

class LuaReader{
  constructor(source,start=0){
    this.source=String(source||'');
    this.index=start;
    this.depth=0;
    this.entries=0;
  }
  error(message){throw new Error(message+' bei Position '+this.index)}
  skip(){
    while(this.index<this.source.length){
      const c=this.source[this.index];
      if(/\s/.test(c)){this.index++;continue}
      if(c==='-'&&this.source[this.index+1]==='-'){
        this.index+=2;
        if(this.source.slice(this.index,this.index+2)==='[['){
          const end=this.source.indexOf(']]',this.index+2);
          this.index=end<0?this.source.length:end+2;
        }else{
          while(this.index<this.source.length&&!/[\r\n]/.test(this.source[this.index]))this.index++;
        }
        continue;
      }
      break;
    }
  }
  expect(char){
    this.skip();
    if(this.source[this.index]!==char)this.error('Erwartet '+char);
    this.index++;
  }
  identifier(){
    this.skip();
    if(!isIdentifierStart(this.source[this.index]))this.error('Bezeichner erwartet');
    const start=this.index++;
    while(isIdentifierPart(this.source[this.index]))this.index++;
    return this.source.slice(start,this.index);
  }
  string(){
    this.skip();
    const quote=this.source[this.index++];
    let out='';
    while(this.index<this.source.length){
      const c=this.source[this.index++];
      if(c===quote)return out;
      if(c!=='\\'){out+=c;continue}
      if(this.index>=this.source.length)break;
      const e=this.source[this.index++];
      const simple={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v'};
      if(simple[e]!==undefined){out+=simple[e];continue}
      if(e==='z'){while(/\s/.test(this.source[this.index]||''))this.index++;continue}
      if(e==='x'){
        const hex=this.source.slice(this.index,this.index+2);
        if(/^[0-9a-fA-F]{2}$/.test(hex)){out+=String.fromCharCode(parseInt(hex,16));this.index+=2;continue}
      }
      if(isDigit(e)){
        let digits=e;
        for(let i=0;i<2&&isDigit(this.source[this.index]);i++)digits+=this.source[this.index++];
        out+=String.fromCharCode(Number(digits));
        continue;
      }
      out+=e;
    }
    this.error('Nicht geschlossener String');
  }
  number(){
    this.skip();
    const match=this.source.slice(this.index).match(/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/);
    if(!match)this.error('Zahl erwartet');
    this.index+=match[0].length;
    const value=Number(match[0]);
    if(!Number.isFinite(value))this.error('Ungültige Zahl');
    return value;
  }
  value(){
    this.skip();
    if(++this.depth>80)this.error('SavedVariables sind zu tief verschachtelt');
    try{
      const c=this.source[this.index];
      if(c==='{')return this.table();
      if(c==='"'||c==="'")return this.string();
      if(c==='+'||c==='-'||c==='.'||isDigit(c))return this.number();
      if(isIdentifierStart(c)){
        const word=this.identifier();
        if(word==='true')return true;
        if(word==='false')return false;
        if(word==='nil')return null;
        this.error('Nicht unterstützter Lua-Wert '+word);
      }
      this.error('Unbekannter Lua-Wert');
    }finally{
      this.depth--;
    }
  }
  table(){
    this.expect('{');
    const entries=[];
    let implicit=1;
    while(true){
      this.skip();
      if(this.source[this.index]==='}'){this.index++;break}
      if(++this.entries>150000)this.error('SavedVariables enthalten zu viele Einträge');

      let key,value;
      if(this.source[this.index]==='['){
        this.index++;
        key=this.value();
        this.expect(']');
        this.expect('=');
        value=this.value();
      }else if(isIdentifierStart(this.source[this.index])){
        const save=this.index;
        const candidate=this.identifier();
        this.skip();
        if(this.source[this.index]==='='){
          this.index++;
          key=candidate;
          value=this.value();
        }else{
          this.index=save;
          key=implicit++;
          value=this.value();
        }
      }else{
        key=implicit++;
        value=this.value();
      }
      entries.push([key,value]);
      this.skip();
      if(this.source[this.index]===','||this.source[this.index]===';')this.index++;
    }

    if(!entries.length)return {};
    const numeric=entries.every(([key])=>Number.isInteger(key)&&key>0);
    if(numeric){
      const sorted=[...entries].sort((a,b)=>a[0]-b[0]);
      if(sorted.every(([key],index)=>key===index+1))return sorted.map(([,value])=>value);
    }
    const out={};
    for(const [key,value] of entries)out[String(key)]=value;
    return out;
  }
}

export function parseLuaSavedVariable(source,variableName='DaltonDashboardCharDB'){
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variableName))throw new Error('Ungültiger Variablenname');
  const raw=String(source||'').replace(/^\uFEFF/,'');
  const pattern=new RegExp('(?:^|[\\r\\n])\\s*'+variableName+'\\s*=','m');
  const match=pattern.exec(raw);
  if(!match)throw new Error(variableName+' wurde in der SavedVariables-Datei nicht gefunden');
  const equals=raw.indexOf('=',match.index);
  const reader=new LuaReader(raw,equals+1);
  const value=reader.value();
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(variableName+' ist kein Tabellenobjekt');
  return value;
}
