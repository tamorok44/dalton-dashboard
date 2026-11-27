import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
function ordered(value){
  if(Array.isArray(value))return value.map(ordered);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])]));
  return value;
}
const shaValue=value=>digest(JSON.stringify(ordered(value)));
const shaRaw=value=>value===null?null:digest(value);
export function inventoryFor(bundle){
  return {
    rosterSha256:shaValue(bundle.roster),
    addons:bundle.addonStates.map(row=>({slug:row.characterSlug,sha256:shaValue(row)})),
    knowledge:bundle.knowledgePairs.map(row=>({key:row.key,modernSha256:shaRaw(row.modern),legacySha256:shaRaw(row.legacy)})),
    days:bundle.dailyRows.map(row=>({date:row.date,sha256:shaValue(row)})),
    quarantine:(bundle.quarantineRecords??[]).map(row=>({field:row.field,sha256:shaRaw(row.raw)}))
  };
}
