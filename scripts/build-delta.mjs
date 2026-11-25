import {fetchForeverDbBuildPage} from './foreverdb-api.mjs';
const validBuild=value=>typeof value==='string'&&/^\d+\.\d+\.\d+\.\d+$/.test(value);
const types=new Set(['item','spell','ability','talent','set']);
const kinds=new Set(['added','removed','changed']);
function positiveId(value){return Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null}
export async function readBuildDelta(build,{readPage=fetchForeverDbBuildPage,fetchImpl=fetch,maxPages=3}={}){
  const unavailable=reason=>({build,complete:false,reason});
  if(!validBuild(build))return unavailable('invalid-build');
  let previous=null,total=null,offset=0;
  const changed={item:new Set(),spell:new Set()};
  let spellCoverage=true;
  for(let page=0;page<maxPages;page++){
    const payload=await readPage(build,{offset,fetchImpl});
    const body=payload?.data,meta=payload?.meta||{};
    const rows=Array.isArray(body)?body:body?.changes;
    // Do not infer an empty result or an immediate predecessor from missing fields.
    const actual=body?.build??meta.build;
    const prior=body?.previousBuild??meta.previousBuild;
    const count=meta.total;
    if(actual!==build||!validBuild(prior)||prior===build||!Array.isArray(rows)||!Number.isSafeInteger(count)||count<0)return unavailable('schema-unverified');
    if(page&& (previous!==prior||total!==count))return unavailable('inconsistent-pages');
    previous=prior;total=count;
    if(rows.length>100||offset+rows.length>total||(!rows.length&&offset<total))return unavailable('incomplete-page');
    for(const row of rows){
      if(!types.has(row?.type)||!kinds.has(row?.change))return unavailable('unknown-change');
      if(row.type==='item'||row.type==='spell'){
        // Typed object ID only; a generic diff-row ID is not guaranteed to be the entity ID.
        const id=positiveId(row.type==='item'?row.itemId:row.spellId);
        if(!id)return unavailable('unverified-entity-id');
        changed[row.type].add(id);
      }
      // Ability/talent changes may alter spell ranks. Until the exact rank-ID
      // mapping is proven, do not reuse old spell entries in those builds.
      if(row.type==='ability'||row.type==='talent')spellCoverage=false;
    }
    offset+=rows.length;
    if(offset===total)return {build,previousBuild:previous,complete:true,total,changedItemIds:[...changed.item],changedSpellIds:[...changed.spell],spellCoverage};
  }
  return unavailable('page-budget');
}
export function unchangedAcrossDelta(delta,type,id){
  if(delta?.complete!==true||!validBuild(delta.previousBuild)||!validBuild(delta.build)||!positiveId(id))return false;
  if(type==='item'&&Array.isArray(delta.changedItemIds))return !delta.changedItemIds.includes(Number(id));
  if(type==='spell'&&delta.spellCoverage===true&&Array.isArray(delta.changedSpellIds))return !delta.changedSpellIds.includes(Number(id));
  return false;
}
