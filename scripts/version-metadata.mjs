// Tiny metadata fields written atomically alongside each authoritative payload.
// No dependency on character-store to avoid cyclic imports.
export const VERSION_METADATA_KEY='dalton-dashboard:data-version:meta:v1';
export function versionScope(){return process.env.VERCEL_ENV==='production'?'production':'preview'}
export function addonVersionField(slug){return 'addon:'+versionScope()+':'+slug}
export function characterVersionMetadata(data){return {generatedAt:data?.generatedAt||null,slugs:(data?.characters||[]).map(c=>c.slug).filter(Boolean)}}
export function petVersionMetadata(state){return state?{checkedAt:state.checkedAt||null,rulebookVersion:state.rulebookVersion||null,overall:state.overall||null}:null}
export function addonVersionMetadata(state){return state?{syncId:state.payload?.syncId||null,receivedAt:state.receivedAt||null}:null}
export function parseVersionMetadata(raw){try{return typeof raw==='string'?JSON.parse(raw):raw??null}catch{return null}}
