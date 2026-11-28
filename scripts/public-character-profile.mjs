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
const statEnums=fields('HEALTH MANA STRENGTH INTELLECT AGILITY STAMINA CRITICALSTRIKE SPIRIT ARMOR ATTACKPOWER SPELLPOWER MELEECRIT RANGEDCRIT SPELLCRIT DODGE PARRY BLOCK ATTACKDPS ATTACKSPEED MANAREGEN ITEMLEVEL DEFENSE MELEEATTACKPOWER RANGEDATTACKPOWER RANGEDAP MELEEAP HIT EXPERTISE');
const statNames=fields('Gesundheit|Mana|Stärke|Intelligenz|Beweglichkeit|Ausdauer|Willenskraft|Rüstung|Angriffskraft|Zaubermacht|Gegenstandsstufe|Verteidigung|Ausweichen|Parieren|Blocken'.replaceAll('|',' ')).concat(['Kritische Trefferchance','Nahkampf-Krit','Fernkampf-Krit','Zauber-Krit','Nahkampfangriffskraft','Fernkampfangriffskraft','Schaden pro Sekunde','Angriffstempo','Manaregeneration']);
const numericMap=(v,keys)=>Object.fromEntries(keys.flatMap(k=>{const x=object(v)[k];return x===null||typeof x==='number'&&Number.isFinite(x)?[[k,x]]:[]}));
const profileFields=fields('slug name player level class classId race gender faction gameStringsVerified gameStringsLocale talents url scrapeOk scrapedAt dataStatus imageUrl avatarUrl storedImageUrl storedAvatarUrl imageCheckedAt imageVerified statsVerified equipmentVerified talentsVerified source equipmentLanguage equipmentSource professionsVerified professionDetailsVerified sourceUpdatedLabel sourceUpdatedAt lastLoginAt apiProfileVerified apiProfileCheckedAt experience achievementPoints averageItemLevel equippedItemLevel hunterPetsVerified hunterPetsCheckedAt talentDetailsVerified reputationsVerified questsVerified completedQuestsVerified knownClassAbilitiesVerified knownClassAbilitiesSource knownClassAbilitiesCapturedAt knownClassAbilitiesSyncedAt knownClassAbilitiesCapturedLevel knownClassAbilitiesCheckedAt');
export function publicCharacterProfile(value){
  const c=object(value),out=pick(c,profileFields);
  // Errors are status flags, never raw internal provider diagnostics.
  if(c.scrapeOk===false)out.scrapeError='Letzter Profilabruf fehlgeschlagen';
  for(const key of ['ruleset','realm'])if(c[key]!==undefined)out[key]=typeof c[key]==='string'?c[key]:pick(c[key],fields('id name slug'));
  if(c.stats!==undefined)out.stats=numericMap(c.stats,statNames);
  if(c.statsByEnum!==undefined)out.statsByEnum=numericMap(c.statsByEnum,statEnums);
  if(Array.isArray(c.statsDetails))out.statsDetails=c.statsDetails.filter(x=>statEnums.includes(x?.enum)).map(x=>pick(x,fields('enum name value')));
  if(Array.isArray(c.statsFreshKeys))out.statsFreshKeys=strings(c.statsFreshKeys).filter(x=>statNames.includes(x));
  if(Array.isArray(c.statsFreshEnums))out.statsFreshEnums=strings(c.statsFreshEnums).filter(x=>statEnums.includes(x));
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
export function publicCharacterData(data){
  return {...pick(data,['generatedAt']),characters:array(data?.characters,publicCharacterProfile)||[]};
}
