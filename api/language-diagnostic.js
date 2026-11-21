import {fetchForeverSnapshot} from '../scripts/blizzard-api.mjs';

function collectStrings(value,path='$',out=[],depth=0){
  if(out.length>=500||depth>8||value==null)return out;
  if(typeof value==='string'){
    const text=value.trim();
    if(text)out.push({path,value:text.slice(0,300)});
    return out;
  }
  if(Array.isArray(value)){
    for(let i=0;i<Math.min(value.length,20);i++)collectStrings(value[i],path+'['+i+']',out,depth+1);
    return out;
  }
  if(typeof value==='object'){
    for(const [key,item] of Object.entries(value))collectStrings(item,path+'.'+key,out,depth+1);
  }
  return out;
}
export default async function handler(req,res){
  try{
    const snapshot=await fetchForeverSnapshot(['cole-dalton'],{locale:'de_DE',endpointNames:['profile','statistics']});
    const endpoints=snapshot.characters?.['cole-dalton']||{};
    const result={};
    for(const [name,entry] of Object.entries(endpoints)){
      result[name]={
        ok:entry.ok,status:entry.status,
        keys:entry.data&&typeof entry.data==='object'&&!Array.isArray(entry.data)?Object.keys(entry.data):[],
        strings:collectStrings(entry.data)
      };
    }
    res.status(200).json(result);
  }catch(error){
    res.status(500).json({error:String(error.message)});
  }
}
