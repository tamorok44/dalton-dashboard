import {createHash} from 'node:crypto';
export function canonicalRoster(entries){
  if(!Array.isArray(entries)||!entries.length)throw new Error('Roster fehlt');
  const list=entries.map(entry=>{
    const slug=typeof entry==='string'?entry:entry?.slug;
    const raw=typeof entry==='string'?null:entry?.id??entry?.blizzardCharacterId;
    if(typeof slug!=='string'||!/^[a-z0-9-]+$/i.test(slug))throw new Error('Ungültiger Roster-Slug');
    const id=raw==null?null:Number(raw);
    if(id!==null&&(!Number.isSafeInteger(id)||id<=0))throw new Error('Ungültige Profil-ID');
    return {slug,id};
  }).sort((a,b)=>a.slug.localeCompare(b.slug,'en'));
  if(new Set(list.map(x=>x.slug)).size!==list.length||new Set(list.filter(x=>x.id!==null).map(x=>x.id)).size!==list.filter(x=>x.id!==null).length)throw new Error('Doppelte Roster-Identität');
  return list;
}
export function rosterKey(entries){return createHash('sha256').update(JSON.stringify(canonicalRoster(entries))).digest('hex');}
export function rosterMatches(a,b){try{return rosterKey(a)===rosterKey(b);}catch{return false;}}
