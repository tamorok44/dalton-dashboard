import {createHash} from 'node:crypto';
const urls=['https://wowforevertalents.com/mage/','https://www.forever-xp.com/talents/mage/','https://foreverdiff.com/builds/1.60.1.71139/mage/'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const results=await Promise.all(urls.map(async url=>{
  try{
    const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; DaltonDashboard/1.0; +https://dalton-dashboard-eight.vercel.app)'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const html=await response.text();
    const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m=>({attributes:m[1],length:m[2].length,preview:m[2].trim().slice(0,320),data:(()=>{try{const v=JSON.parse(m[2]);return {keys:Object.keys(v),sample:JSON.stringify(v).slice(0,1600)}}catch{return null}})()}));
    const tags=[...html.matchAll(/<(?:div|button|a)\b[^>]*(?:data-talent|data-node|data-tree|data-row|data-col)[^>]*>/gi)].slice(0,7).map(m=>m[0].slice(0,1400));
    // For compact embedded class data, emit only structural fields, not source tooltip text.
    const normalize=(v,path='')=>{
      if(!v||typeof v!=='object')return [];
      if(Array.isArray(v)){
        if(v.length>=15&&v.every(n=>n&&typeof n==='object'&&('row'in n||'tier'in n)&&('name'in n||'id'in n)))return [{path,count:v.length,nodes:v.map(n=>Object.fromEntries(Object.entries(n).filter(([k,val])=>/^(id|talentId|nodeId|name|row|col|column|tier|max|maxRank|ranks|rankCount|points|requiredPoints|pre|req|requires|prerequisites|tree|treeId)$/.test(k)&&JSON.stringify(val).length<500)))}];
        return v.flatMap((n,i)=>normalize(n,path+'/'+i));
      }
      return Object.entries(v).filter(([k])=>!['desc','description','tooltip','spellbook','classic'].includes(k)).flatMap(([k,n])=>normalize(n,path+'/'+k));
    };
    const structural=scripts.length?[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].flatMap((m,i)=>{try{return normalize(JSON.parse(m[2]),'script'+i)}catch{return []}}):[];
    return {url,sha256:hash(html),length:html.length,buildMarkers:[...new Set(html.match(/1\.60\.1\.\d+/g)||[])].slice(0,12),scripts:scripts.slice(0,15),tags,structural,ledger:/No Mage talent or spell changed between the Nov 25, 2026 build and the Nov 26, 2026 build/.test(html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '))};
  }catch(e){return {url,error:String(e.message).slice(0,200)}}
}));
console.log('TALENT_INDEPENDENT_RESULT '+JSON.stringify(results));
