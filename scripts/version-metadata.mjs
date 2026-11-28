// Tiny metadata fields written atomically alongside each authoritative payload.
// No dependency on character-store to avoid cyclic imports.
export const VERSION_METADATA_KEY='dalton-dashboard:data-version:meta:v1';
// Compact authoritative core metadata is a string so it can participate in
// the same single MSET as the existing roster and Add-on payload strings.
export const CORE_COMPACT_KEY='dalton-dashboard:core:compact:v2:production';
export const PREVIEW_COMPACT_KEY='dalton-dashboard:core:compact:v2:preview';
export const addonCompactKey=()=>versionScope()==='production'?CORE_COMPACT_KEY:PREVIEW_COMPACT_KEY;
export function versionScope(){return process.env.VERCEL_ENV==='production'?'production':'preview'}
export function addonVersionField(slug){return 'addon:'+versionScope()+':'+slug}
export function characterVersionMetadata(data){return {generatedAt:data?.generatedAt||null,slugs:(data?.characters||[]).map(c=>c.slug).filter(Boolean)}}
export function petVersionMetadata(state){return state?{checkedAt:state.checkedAt||null,rulebookVersion:state.rulebookVersion||null,overall:state.overall||null}:null}
export function addonVersionMetadata(state){return state?{syncId:state.payload?.syncId||null,receivedAt:state.receivedAt||null}:null}
export function parseVersionMetadata(raw){try{return typeof raw==='string'?JSON.parse(raw):raw??null}catch{return null}}

// Accept the historical UTC spellings while keeping one sortable millisecond
// representation. Date.parse alone also accepts ambiguous or impossible dates.
export function canonicalProfileGeneration(value){
  const match=typeof value==='string'&&/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(?:Z|\+00:00)$/.exec(value);
  if(!match)return null;
  const canonical=match[1]+'.'+(match[2]||'').padEnd(3,'0').slice(0,3)+'Z';
  const time=Date.parse(canonical);
  return Number.isFinite(time)&&new Date(time).toISOString()===canonical?canonical:null;
}

// Shared logical profile generation, independent of capture/receipt time.
// Call while holding the common profile-writer lock. Every changed roster
// must advance, even with an equal millisecond or a backwards clock step.
export function nextProfileGeneration(previous,clock=Date.now()){
  const prior=Date.parse(canonicalProfileGeneration(previous?.generatedAt)??'');
  if(!Number.isFinite(prior)||!Number.isFinite(clock))throw Error('Ungültige Profilgeneration');
  return new Date(Math.max(Math.trunc(clock),prior+1)).toISOString();
}
