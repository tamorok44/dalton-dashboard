export const HUNTER_PET_RULEBOOK_VERSION='2026.11.25.1';
// Versioniertes Forever-Jägerwissen. Live-Zustand eines konkreten Tiers kommt ausschließlich von Blizzard.
export const hunterPetFamilies=Object.freeze({
  fox:Object.freeze({
    // Nur mechanische IDs/Werte. Sichtbare Namen, Fähigkeiten, Futterarten und Beschreibungen
    // werden erst aus einer verifizierten deutschen Forever-Datenquelle eingeblendet.
    ruleIds:Object.freeze({profile:'fox.family.profile',training:'fox.training'}),
    modifiers:Object.freeze({damage:0,armor:5,health:0})
  })
});

export function hunterPetFamily(slug){
  return hunterPetFamilies[String(slug||'').toLowerCase()]||null;
}


export const hunterPetMechanics=Object.freeze({
  inherited:Object.freeze({
    healthPerHunterStamina:Object.freeze({ruleId:'pet.scaling',factor:2,version:1}),
    armorFromHunter:Object.freeze({ruleId:'pet.scaling',factor:0.30,version:1}),
    critFromHunter:Object.freeze({ruleId:'pet.scaling',sourceRuleId:'pet.crit.inheritance',factor:1,displayKind:'inherited_component',version:2})
  }),
  focus:Object.freeze({ruleId:'pet.focus',maximum:150,regenPerSecond:10,version:1}),
  globalHealth:Object.freeze({ruleId:'pet.health.global',factor:1.15,percent:115,version:1})
});

function freshCharacterStat(character,enumKey){
  const stats=character?.statsByEnum||{};
  const fresh=new Set(Array.isArray(character?.statsFreshEnums)?character.statsFreshEnums:
    character?.statsVerified===true?Object.keys(stats):[]);
  const value=Number(stats[enumKey]);
  if(!fresh.has(enumKey)||!Number.isFinite(value))return null;
  const localizedName=(Array.isArray(character?.statsDetails)?character.statsDetails:[])
    .find(entry=>entry?.enum===enumKey&&typeof entry?.name==='string')?.name||null;
  return {value,name:localizedName};
}
function enduranceTraining(character){
  if(character?.talentDetailsVerified!==true)return null;
  for(const tree of Array.isArray(character?.talentDetails)?character.talentDetails:[]){
    for(const talent of Array.isArray(tree?.talents)?tree.talents:[]){
      if(Number(talent?.spellId)===19583){
        const rank=Number(talent.rank);
        return {
          rank:Number.isInteger(rank)&&rank>0?rank:null,
          name:typeof talent.name==='string'?talent.name:null,
          description:talent.description||null,
          spellId:Number(talent.spellId)||19583
        };
      }
    }
  }
  return null;
}

export function hunterPetCombatProfile(character){
  const stamina=freshCharacterStat(character,'STAMINA');
  const armor=freshCharacterStat(character,'ARMOR');
  const crit=freshCharacterStat(character,'CRITICALSTRIKE');
  const healthName=(Array.isArray(character?.statsDetails)?character.statsDetails:[])
    .find(entry=>entry?.enum==='HEALTH'&&typeof entry?.name==='string')?.name||null;
  return {
    inherited:{
      health:stamina===null?null:{
        ruleId:hunterPetMechanics.inherited.healthPerHunterStamina.ruleId,
        inputName:stamina.name,input:stamina.value,
        factor:hunterPetMechanics.inherited.healthPerHunterStamina.factor,
        value:stamina.value*hunterPetMechanics.inherited.healthPerHunterStamina.factor,
        unitName:healthName
      },
      armor:armor===null?null:{
        ruleId:hunterPetMechanics.inherited.armorFromHunter.ruleId,
        inputName:armor.name,input:armor.value,
        factor:hunterPetMechanics.inherited.armorFromHunter.factor,
        value:armor.value*hunterPetMechanics.inherited.armorFromHunter.factor,
        unitName:armor.name
      },
      crit:crit===null?null:{
        ruleId:hunterPetMechanics.inherited.critFromHunter.ruleId,
        inputName:crit.name,input:crit.value,
        factor:hunterPetMechanics.inherited.critFromHunter.factor,
        value:crit.value*hunterPetMechanics.inherited.critFromHunter.factor,
        unitName:crit.name
      },
      attackPower:{
        ruleId:'pet.scaling',
        value:null,
        reason:'Das 10-%-Modell bleibt Referenzwissen; Blizzard stellt in der aktuellen Online-Armory die höhere Nahkampf-/Fernkampf-Angriffskraft nicht getrennt und damit nicht eindeutig bereit.'
      },
      hitChance:{
        value:null,
        reason:'Für die Hunter→Pet-Trefferchance gibt es derzeit keinen belastbaren numerischen Vererbungsfaktor.'
      },
      expertise:{
        ruleId:'pet.expertise',
        value:null,
        reason:'Blizzard bestätigt, dass Begleiter von Expertise profitieren; ein numerischer Vererbungsfaktor ist jedoch nicht dokumentiert.'
      }
    },
    enduranceTraining:enduranceTraining(character),
    focus:hunterPetMechanics.focus,
    globalHealth:hunterPetMechanics.globalHealth
  };
}
