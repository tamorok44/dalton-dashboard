function slug(value){
  return String(value||'').trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
function integer(value){const n=Number(value);return Number.isInteger(n)&&n>0?n:null}
function text(value,max=120){return typeof value==='string'&&value.trim()?value.trim().slice(0,max):null}
function decode(value){
  try{return decodeURIComponent(String(value||''))}catch{return ''}
}
export function parseSpellbookCode(input){
  const raw=String(input||'').trim();
  const parts=raw.split('|');
  if(parts.length!==7||parts[0]!=='DALTON1')throw new Error('Ungültiger Spellbook-Code');
  const token=text(parts[1],160);
  const characterSlug=text(parts[2],80);
  const classId=integer(parts[3]);
  const level=integer(parts[4]);
  const epoch=Number(parts[5]);
  if(!token||!characterSlug||!/^[a-z0-9-]+$/.test(characterSlug)||!classId||!level||level>60||!Number.isInteger(epoch)||epoch<=0)throw new Error('Spellbook-Code unvollständig');
  const entries=[];
  const seen=new Set();
  for(const rawEntry of String(parts[6]||'').split(',')){
    if(!rawEntry)continue;
    const [idRaw,nameRaw='',rankRaw='']=rawEntry.split(':');
    const id=integer(idRaw);
    if(!id||seen.has(id))continue;
    seen.add(id);
    entries.push({id,name:text(decode(nameRaw)),rank:text(decode(rankRaw),80)});
    if(entries.length>600)throw new Error('Spellbook-Code enthält zu viele Einträge');
  }
  if(!entries.length)throw new Error('Spellbook-Code enthält keine Klassenfähigkeiten');
  return {
    version:1,
    token,
    characterSlug,
    classId,
    level,
    capturedAt:new Date(epoch*1000).toISOString(),
    entries
  };
}
export function expandKnownClassAbilities(entries=[],classMaster=null,localized={}){
  const byId=new Map((Array.isArray(entries)?entries:[]).map(entry=>[integer(entry?.id),{...entry,id:integer(entry?.id)}]).filter(([id])=>id));
  for(const ability of Array.isArray(classMaster?.abilities)?classMaster.abilities:[]){
    const ranks=[...(Array.isArray(ability?.ranks)?ability.ranks:[])].filter(rank=>integer(rank?.id)).sort((a,b)=>(Number(a.requiredLevel)||0)-(Number(b.requiredLevel)||0));
    let highest=-1;
    ranks.forEach((rank,index)=>{if(byId.has(integer(rank.id)))highest=Math.max(highest,index)});
    if(highest<0)continue;
    for(let index=0;index<=highest;index++){
      const rank=ranks[index],id=integer(rank.id);
      if(!id||byId.has(id))continue;
      const loc=localized[id]||{};
      byId.set(id,{
        id,
        name:text(loc.name)||null,
        rank:text(loc.rank)||null,
        iconId:integer(rank.iconId)||integer(loc.iconId),
        inferredFromHigherRank:true
      });
    }
  }
  return [...byId.values()].map(entry=>{
    const loc=localized[entry.id]||{};
    const masterRank=(Array.isArray(classMaster?.abilities)?classMaster.abilities:[])
      .flatMap(ability=>Array.isArray(ability?.ranks)?ability.ranks:[])
      .find(rank=>integer(rank?.id)===entry.id);
    return {
      id:entry.id,
      name:text(entry.name)||text(loc.name)||null,
      rank:text(entry.rank,80)||text(loc.rank,80)||null,
      iconId:integer(entry.iconId)||integer(loc.iconId)||integer(masterRank?.iconId),
      inferredFromHigherRank:entry.inferredFromHigherRank===true
    };
  }).sort((a,b)=>(a.name||'').localeCompare(b.name||'','de')||(a.rank||'').localeCompare(b.rank||'','de')||a.id-b.id);
}
export function resolveSpellbookCharacter(data,snapshot){
  if(!data||!Array.isArray(data.characters))throw new Error('Charakterdaten ungültig');
  const requested=slug(snapshot?.characterSlug);
  const exact=data.characters.find(character=>character?.slug===requested);
  if(exact)return exact;
  const candidates=data.characters.filter(character=>
    Number(character?.classId)===Number(snapshot?.classId)&&(
      slug(character?.name)===requested||
      slug(character?.slug).startsWith(requested+'-')
    )
  );
  if(candidates.length===1)return candidates[0];
  throw new Error('Charakter nicht gefunden');
}
export function applySpellbookSnapshot(data,snapshot,{classMaster=null,localized={},syncedAt=new Date().toISOString()}={}){
  const current=resolveSpellbookCharacter(data,snapshot);
  const index=data.characters.findIndex(character=>character?.slug===current.slug);
  if(Number(current.classId)!==Number(snapshot.classId))throw new Error('Klasse des Spellbook-Codes passt nicht zum Charakter');
  const currentLevel=Number(current.level),capturedLevel=Number(snapshot.level);
  if(Number.isFinite(currentLevel)&&Math.abs(currentLevel-capturedLevel)>2)throw new Error('Spellbook-Code passt nicht zum aktuellen Charakterlevel');
  const capturedTime=Date.parse(snapshot.capturedAt);
  if(!Number.isFinite(capturedTime)||capturedTime>Date.now()+10*60*1000||capturedTime<Date.now()-30*24*60*60*1000)throw new Error('Spellbook-Code ist zeitlich nicht plausibel');
  const knownClassAbilities=expandKnownClassAbilities(snapshot.entries,classMaster,localized);
  const nextCharacter={
    ...current,
    knownClassAbilities,
    knownClassAbilitiesVerified:true,
    knownClassAbilitiesSource:'WoW-Spellbook',
    knownClassAbilitiesCapturedAt:snapshot.capturedAt,
    knownClassAbilitiesSyncedAt:syncedAt,
    knownClassAbilitiesCapturedLevel:capturedLevel
  };
  const characters=[...data.characters];
  characters[index]=nextCharacter;
  return {
    ...data,
    generatedAt:syncedAt,
    characters
  };
}
