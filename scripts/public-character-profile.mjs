// Public wire contract, not a serializer of Redis records. Unknown fields
// at every profile depth are omitted. Only explicit scalar data is allowed.
const fields=s=>s.split(' ');
const scalar=value=>value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)?value:undefined;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const pick=(value,keys)=>Object.fromEntries(keys.flatMap(key=>{
  const v=scalar(object(value)[key]);
  return v===undefined?[]:[[key,v]];
}));
const array=(v,fn)=>Array.isArray(v)?v.map(fn).filter(x=>x!==undefined):undefined;
const strings=v=>array(v,x=>typeof x==='string'?x:undefined);
const numbers=v=>array(v,x=>Number.isSafeInteger(x)?x:undefined);
const item=v=>v===null?null:pick(v,fields('id name quantity icon iconUrl'));
const recipe=v=>({...pick(v,fields('id name iconUrl iconId recipeDetailsStatus recipeDetailsSource knowledgeKind professionId requiredSkill requiredLevel')),
  ...(v?.craftedItem!==undefined?{craftedItem:item(v.craftedItem)}:{}),
  ...(v?.craftedQuantity!==undefined?{craftedQuantity:v.craftedQuantity===null?null:pick(v.craftedQuantity,fields('minimum maximum min max variable'))}:{}),
  ...(Array.isArray(v?.reagents)?{reagents:array(v.reagents,item)}:{})});
const profession=v=>({...pick(v,fields('id name sourceName tierId tierName current max unverified iconUrl iconId')),
  ...(Array.isArray(v?.knownRecipes)?{knownRecipes:array(v.knownRecipes,recipe)}:{})});
const talent=v=>({...pick(v,fields('id name rank spellId description castTime powerCost iconId iconUrl'))});
const tree=v=>({...pick(v,fields('id name spentPoints')),talents:array(v?.talents,talent)||[]});
const reputation=v=>({...pick(v,fields('id name iconUrl')),
  ...(v?.standing!==undefined?{standing:pick(v.standing,fields('raw value max tier name'))}:{})});
const pet=v=>({...pick(v,fields('id name creatureId displayId level active summoned slot iconUrl imageUrl storedIconUrl storedImageUrl source')),
  ...(v?.family!==undefined?{family:pick(v.family,fields('id name enum slug'))}:{})});
// Explicit public game-stat identities. Authoritative collection retains unknown source values for later review.
export const PUBLIC_STAT_ENUMS=Object.freeze(fields('HEALTH MANA STRENGTH INTELLECT AGILITY STAMINA CRITICALSTRIKE SPIRIT ARMOR ATTACKPOWER SPELLPOWER MELEECRIT RANGEDCRIT SPELLCRIT DODGE PARRY BLOCK ATTACKDPS ATTACKSPEED MANAREGEN ITEMLEVEL DEFENSE MELEEATTACKPOWER RANGEDATTACKPOWER RANGEDAP MELEEAP HIT EXPERTISE HASTE HASTERATING MELEEHASTE RANGEDHASTE SPELLHASTE HITRATING CRITRATING CRITICALSTRIKERATING EXPERTISERATING DEFENSERATING DODGERATING PARRYRATING BLOCKRATING BLOCKVALUE SPELLHIT MELEEHIT RANGEDHIT SPELLPENETRATION ARMORPENETRATION RESILIENCE RESILIENCERATING ARCANE_RESISTANCE FIRE_RESISTANCE FROST_RESISTANCE NATURE_RESISTANCE SHADOW_RESISTANCE HOLY_RESISTANCE'));
const statEnums=PUBLIC_STAT_ENUMS;
// Known legacy display keys are not a source of numeric values. They are
// only labels for recognized enum identities (or the bundled offline seed).
const legacyNames=Object.freeze({
  HEALTH:'Gesundheit',MANA:'Mana',STRENGTH:'Stärke',INTELLECT:'Intelligenz',AGILITY:'Beweglichkeit',STAMINA:'Ausdauer',
  SPIRIT:'Willenskraft',ARMOR:'Rüstung',ATTACKPOWER:'Angriffskraft',SPELLPOWER:'Zaubermacht',ITEMLEVEL:'Gegenstandsstufe',
  DEFENSE:'Verteidigung',DODGE:'Ausweichen',PARRY:'Parieren',BLOCK:'Blocken',CRITICALSTRIKE:'Kritische Trefferchance',
  MELEECRIT:'Nahkampf-Krit',RANGEDCRIT:'Fernkampf-Krit',SPELLCRIT:'Zauber-Krit',MELEEATTACKPOWER:'Nahkampfangriffskraft',
  RANGEDATTACKPOWER:'Fernkampfangriffskraft',ATTACKDPS:'Schaden pro Sekunde',ATTACKSPEED:'Angriffstempo',MANAREGEN:'Manaregeneration',
  HASTE:'Tempowertung',HASTERATING:'Tempo',HITRATING:'Trefferwertung',CRITRATING:'Kritische Trefferwertung',
  EXPERTISERATING:'Waffenkundewertung',EXPERTISE:'Waffenkunde',DEFENSERATING:'Verteidigungswertung',DODGERATING:'Ausweichwertung',
  PARRYRATING:'Parierwertung',BLOCKRATING:'Blockwertung',BLOCKVALUE:'Blockwert',SPELLPENETRATION:'Zauberdurchschlag',
  ARMORPENETRATION:'Rüstungsdurchschlag',RESILIENCE:'Abhärtung'
});
const validNumber=v=>typeof v==='number'&&Number.isFinite(v);
const validLabel=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=100&&!Object.hasOwn(Object.prototype,v)&&v!=='prototype';
const own=(o,k)=>Object.hasOwn(object(o),k);
function publicStats(c,{allowLegacyStats=false}={}){
  const hasIdentity=['statsByEnum','statsDetails','statsFreshEnums'].some(k=>own(c,k));
  if(!hasIdentity){
    // Name-only data has no provenance. Only an explicitly trusted bundled
    // offline seed may use the old display map; stored Redis values may not.
    return c.stats===undefined?{}:{stats:allowLegacyStats?Object.fromEntries(Object.values(legacyNames).filter(k=>own(c.stats,k)&&validNumber(c.stats[k])).map(k=>[k,c.stats[k]])):{}};
  }
  const enumValues=new Map();
  const rawDetails=Array.isArray(c.statsDetails)?c.statsDetails:[];
  const grouped=new Map();
  for(const entry of rawDetails){
    if(!statEnums.includes(entry?.enum)||!validNumber(entry.value))continue;
    const rows=grouped.get(entry.enum)||[];rows.push(entry);grouped.set(entry.enum,rows);
  }
  const hasEnumMap=own(c,'statsByEnum');
  for(const id of statEnums){
    if(own(c.statsByEnum,id)){
      const value=c.statsByEnum[id];
      if(validNumber(value)||value===null)enumValues.set(id,value);
    }else if(!hasEnumMap){
      // Earlier normalized records may contain identity-tagged detail rows only.
      const rows=grouped.get(id)||[];
      if(rows.length&&rows.every(row=>row.value===rows[0].value))enumValues.set(id,rows[0].value);
    }
  }
  const detailRows=[],byName=new Map(),conflictingEnums=new Set();
  for(const [id,value] of enumValues){
    if(!validNumber(value))continue;
    const rows=grouped.get(id)||[];
    const matching=rows.filter(row=>row.value===value&&validLabel(row.name));
    const names=[...new Set(matching.map(row=>row.name))];
    if(rows.some(row=>row.value!==value)||names.length>1)conflictingEnums.add(id);
    // A conflicting row must not establish a label or freshness. The explicit
    // enum value remains available; no value is ever taken from c.stats.
    if(conflictingEnums.has(id))continue;
    const label=names.length===1?names[0]:null;
    if(label)detailRows.push({enum:id,name:label,value});
    const name=label||((legacyNames[id]&&own(c.stats,legacyNames[id]))?legacyNames[id]:null);
    if(name){const owners=byName.get(name)||[];owners.push({id,value});byName.set(name,owners);}
  }
  // One display key cannot represent two distinct enum identities. Keep their
  // separate enum/detail values but omit the ambiguous compatibility alias.
  const unambiguous=[...byName].filter(([,owners])=>owners.length===1);
  const sourceConflicts=new Set((strings(c.statsConflictEnums)||[]).filter(id=>statEnums.includes(id)));
  const fresh=new Set(c.scrapeOk===false?[]:strings(c.statsFreshEnums)||[]);
  const freshEnums=[...enumValues].filter(([id,value])=>validNumber(value)&&fresh.has(id)&&!conflictingEnums.has(id)&&!sourceConflicts.has(id)).map(([id])=>id);
  const freshSet=new Set(freshEnums);
  return {
    stats:Object.fromEntries(unambiguous.map(([name,[owner]])=>[name,owner.value])),
    statsByEnum:Object.fromEntries(enumValues),
    statsDetails:detailRows,
    statsFreshEnums:freshEnums,
    ...(sourceConflicts.size?{statsConflictEnums:[...sourceConflicts]}:{}),
    statsFreshKeys:unambiguous.filter(([,owners])=>freshSet.has(owners[0].id)).map(([name])=>name)
  };
}
const profileFields=fields('slug name player level class classId race gender faction gameStringsVerified gameStringsLocale talents url scrapeOk scrapedAt dataStatus imageUrl avatarUrl storedImageUrl storedAvatarUrl imageCheckedAt imageVerified statsVerified equipmentVerified talentsVerified source equipmentLanguage equipmentSource professionsVerified professionDetailsVerified sourceUpdatedLabel sourceUpdatedAt lastLoginAt apiProfileVerified apiProfileCheckedAt experience achievementPoints averageItemLevel equippedItemLevel hunterPetsVerified hunterPetsCheckedAt talentDetailsVerified reputationsVerified questsVerified completedQuestsVerified knownClassAbilitiesVerified knownClassAbilitiesSource knownClassAbilitiesCapturedAt knownClassAbilitiesSyncedAt knownClassAbilitiesCapturedLevel knownClassAbilitiesCheckedAt');
export function publicCharacterProfile(value,options={}){
  const c=object(value),out=pick(c,profileFields);
  // Errors are status flags, never raw internal provider diagnostics.
  if(c.scrapeOk===false){out.scrapeError='Letzter Profilabruf fehlgeschlagen';out.statsVerified=false;}
  for(const key of ['ruleset','realm'])if(c[key]!==undefined)out[key]=typeof c[key]==='string'?c[key]:pick(c[key],fields('id name slug'));
  Object.assign(out,publicStats(c,options));
  if(out.statsConflictEnums?.length)out.statsVerified=false;
  if(Array.isArray(c.equipment))out.equipment=array(c.equipment,x=>pick(x,fields('id slotType sourceSlotType slot item icon iconUrl storedIconUrl level quality qualityName sourceName localized')));
  if(Array.isArray(c.professions))out.professions=array(c.professions,profession);
  if(Array.isArray(c.talentDetails))out.talentDetails=array(c.talentDetails,tree);
  if(Array.isArray(c.reputations))out.reputations=array(c.reputations,reputation);
  if(Array.isArray(c.activeQuests))out.activeQuests=array(c.activeQuests,x=>pick(x,fields('id name')));
  if(Array.isArray(c.completedQuestIds))out.completedQuestIds=numbers(c.completedQuestIds);
  if(Array.isArray(c.knownClassAbilities))out.knownClassAbilities=array(c.knownClassAbilities,x=>pick(x,fields('id name rank iconId iconUrl inferredFromHigherRank')));
  if(c.hunterPets!==undefined)out.hunterPets=c.hunterPets===null?null:{active:array(c.hunterPets?.active,pet)||[],stable:array(c.hunterPets?.stable,pet)||[]};
  return out;
}
export function publicCharacterData(data,options={}){
  return {...pick(data,['generatedAt']),characters:array(data?.characters,c=>publicCharacterProfile(c,options))||[]};
}


// The upstream normalizer returns exactly these scalar quest fields.
// Never forward unknown record properties or accept objects in scalar slots.
export function publicQuestCatalog(value){
  const entries=[];
  for(const [key,record] of Object.entries(object(value))){
    if(!/^[1-9]\d*$/.test(key)||!Number.isSafeInteger(Number(key))||!(typeof record?.id==='number'||typeof record?.id==='string')||Number(record.id)!==Number(key))continue;
    const out={id:Number(key)};
    for(const field of ['title','description','area','locale','namespace','fetchedAt']){
      if(record[field]===null||typeof record[field]==='string')out[field]=record[field];
    }
    if(record.minimumLevel===null||Number.isSafeInteger(record.minimumLevel)&&record.minimumLevel>=0)out.minimumLevel=record.minimumLevel;
    entries.push([key,out]);
  }
  return Object.fromEntries(entries);
}
