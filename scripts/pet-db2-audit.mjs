import {PET_DB2_BASELINE,PET_DB2_REVIEWED_BUILD} from './pet-db2-baseline.mjs';

const ROOT='https://wago.tools/db2/';
const ids=new Set([17253,17255,17256,17257,17258,17259,17260,17261,23099,23109,23110,1310612]);
const groups={
  db2FoxProfile:{label:'Wago DB2 · Fuchs-Familie und Passiv',keys:['family','passive']},
  db2FoxTraining:{label:'Wago DB2 · Fuchs-Fähigkeiten und Ausbildung',keys:['family','training','power','levels',...Array.from(ids,id=>'effect'+id)]},
  db2Scaling:{label:'Wago DB2 · Skalierungsaura (Struktur, keine Serverkoeffizienten)',keys:['scaling']},
  db2Focus:{label:'Wago DB2 · Fokus und Skalierungsaura',keys:['focus','scaling']}
};

export function petDb2Url(spec,build){
  const u=new URL(ROOT+spec.table+'/csv');
  u.searchParams.set('build',build);
  if(spec.filter)u.searchParams.set('filter['+spec.filter+']',String(spec.value));
  return u.toString();
}
function csvRows(text,spec,key){
  // Gefilterte Datensätze enthalten ausschließlich einfache numerische Felder
  // und ggf. unquotierte Bezeichnungen. Schema-/Formatwechsel sperren statt raten.
  const lines=String(text).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const header=lines.shift();
  if(header!==spec.header)throw Error('db2_schema_changed');
  const columns=header.split(',');
  const index=columns.indexOf(spec.filter||'SpellID');
  if(index<0)throw Error('db2_schema_changed');
  const relevant=lines.filter(line=>{
    const field=line.split(',')[index];
    return spec.filter?Number(field)===spec.value:ids.has(Number(field));
  });
  if(!relevant.length||relevant.some(line=>line.split(',').length!==columns.length))throw Error('db2_missing_or_malformed_rows');
  if(spec.filter&&relevant.length!==lines.length)throw Error('db2_filter_not_applied');
  return relevant.sort();
}
async function inspect(key,spec,build,fetchImpl){
  try{
    const res=await fetchImpl(petDb2Url(spec,build),{
      headers:{'accept':'text/csv','user-agent':'DaltonDashboard/1.0 (+https://dalton-dashboard-eight.vercel.app)'},
      signal:AbortSignal.timeout(8000)
    });
    if(!res.ok)return {status:'source_unavailable',reason:'HTTP '+res.status};
    const body=await res.text();
    // Nur kleine, gezielte Tabellen; ein ignorierter Filter darf keinen großen Scan auslösen.
    if(body.length>1500000)return {status:'source_unavailable',reason:'db2_response_too_large'};
    let rows;
    try{rows=csvRows(body,spec,key)}catch(e){return {status:'review_required',reason:e.message}}
    return {status:JSON.stringify(rows)===JSON.stringify(spec.rows)?'verified':'review_required',reason:JSON.stringify(rows)===JSON.stringify(spec.rows)?null:'db2_fields_changed'};
  }catch(e){return {status:'source_unavailable',reason:String(e.message||e).slice(0,160)}}
}
export async function inspectPetDb2({build,fetchImpl=fetch}={}){
  const entries=Object.entries(PET_DB2_BASELINE);
  const results={};
  if(/^1\.60\.1\.\d+$/.test(build||'')&&Number(build.split('.').at(-1))>=Number(PET_DB2_REVIEWED_BUILD.split('.').at(-1))){
    // Bounded concurrency: no game-client requests, no full SpellEffect scan.
    for(let i=0;i<entries.length;i+=8){
      await Promise.all(entries.slice(i,i+8).map(async([key,spec])=>{results[key]=await inspect(key,spec,build,fetchImpl)}));
    }
  }
  return Object.fromEntries(Object.entries(groups).map(([id,g])=>{
    const checks=g.keys.map(key=>({key,...(results[key]||{status:'source_unavailable',reason:'current_build_unknown_or_older'})}));
    const failed=checks.filter(c=>c.status!=='verified');
    const status=failed.some(c=>c.status==='review_required')?'review_required':failed.length?'source_unavailable':'verified';
    return [id,{id,label:g.label,url:ROOT,build:build||null,status,reason:failed.length?failed.map(c=>c.key+':'+c.reason).join('; ').slice(0,300):null,checkedKeys:g.keys,reviewedBuild:PET_DB2_REVIEWED_BUILD}];
  }));
}
