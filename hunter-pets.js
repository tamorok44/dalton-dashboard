export const HUNTER_PET_RULEBOOK_VERSION='2026.11.21.3';
// Versioniertes Forever-Jägerwissen. Live-Zustand eines konkreten Tiers kommt ausschließlich von Blizzard.
export const hunterPetFamilies=Object.freeze({
  fox:Object.freeze({
    name:'Fuchs',
    ruleIds:Object.freeze({profile:'fox.family.profile',training:'fox.training'}),
    modifiers:Object.freeze({damage:0,armor:5,health:0}),
    diet:Object.freeze(['Fleisch']),
    abilities:Object.freeze([
      Object.freeze({
        name:'Beißen',
        kind:'Angriff',
        ranks:Object.freeze([
          {rank:1,level:1,trainingPoints:1},{rank:2,level:8,trainingPoints:4},{rank:3,level:16,trainingPoints:7},{rank:4,level:24,trainingPoints:10},
          {rank:5,level:32,trainingPoints:13},{rank:6,level:40,trainingPoints:17},{rank:7,level:48,trainingPoints:21},{rank:8,level:56,trainingPoints:25}
        ])
      }),
      Object.freeze({
        name:'Tanz des Täuschers',
        kind:'Fuchsfähigkeit',
        special:true,
        ranks:Object.freeze([{rank:1,level:20,trainingPoints:10}]),
        description:'+50 % Ausweichchance und 30 % schnellere Angriffe für 12 Sek.',
        cooldown:'3 Min.'
      }),
      Object.freeze({
        name:'Spurt',
        kind:'Bewegung',
        ranks:Object.freeze([{rank:1,level:30,trainingPoints:15},{rank:2,level:40,trainingPoints:20},{rank:3,level:50,trainingPoints:25}])
      })
    ]),
    sourceNote:'Regelwerte werden nur bei bestätigtem zentralem Pet-Regelwerk angezeigt'
  })
});

export function hunterPetFamily(slug){
  return hunterPetFamilies[String(slug||'').toLowerCase()]||null;
}


export const hunterPetMechanics=Object.freeze({
  inherited:Object.freeze({
    healthPerHunterStamina:Object.freeze({ruleId:'pet.scaling',factor:2,version:1}),
    armorFromHunter:Object.freeze({ruleId:'pet.scaling',factor:0.30,version:1}),
    critFromHunter:Object.freeze({ruleId:'pet.scaling',factor:1,version:1})
  }),
  focus:Object.freeze({ruleId:'pet.focus',maximum:150,regenPerSecond:10,version:1}),
  globalHealth:Object.freeze({ruleId:'pet.health.global',factor:1.15,percent:115,version:1})
});

function freshCharacterStat(character,name){
  const stats=character?.stats||{};
  const fresh=new Set(Array.isArray(character?.statsFreshKeys)?character.statsFreshKeys:
    character?.statsVerified===true?Object.keys(stats):[]);
  const value=Number(stats[name]);
  return fresh.has(name)&&Number.isFinite(value)?value:null;
}
function enduranceTraining(character){
  if(character?.talentDetailsVerified!==true)return null;
  for(const tree of Array.isArray(character?.talentDetails)?character.talentDetails:[]){
    for(const talent of Array.isArray(tree?.talents)?tree.talents:[]){
      if(Number(talent?.spellId)===19583||String(talent?.name||'').toLowerCase()==='belastbarkeit-ausbildung'){
        const rank=Number(talent.rank);
        return {
          rank:Number.isInteger(rank)&&rank>0?rank:null,
          name:talent.name||'Belastbarkeit-Ausbildung',
          description:talent.description||null,
          spellId:Number(talent.spellId)||19583
        };
      }
    }
  }
  return null;
}

export function hunterPetCombatProfile(character){
  const stamina=freshCharacterStat(character,'Ausdauer');
  const armor=freshCharacterStat(character,'Rüstung');
  const crit=freshCharacterStat(character,'Kritische Trefferchance');
  return {
    inherited:{
      health:stamina===null?null:{
        ruleId:hunterPetMechanics.inherited.healthPerHunterStamina.ruleId,
        inputName:'Ausdauer',input:stamina,
        factor:hunterPetMechanics.inherited.healthPerHunterStamina.factor,
        value:stamina*hunterPetMechanics.inherited.healthPerHunterStamina.factor,
        unit:'Gesundheit'
      },
      armor:armor===null?null:{
        ruleId:hunterPetMechanics.inherited.armorFromHunter.ruleId,
        inputName:'Rüstung',input:armor,
        factor:hunterPetMechanics.inherited.armorFromHunter.factor,
        value:armor*hunterPetMechanics.inherited.armorFromHunter.factor,
        unit:'Rüstung'
      },
      crit:crit===null?null:{
        ruleId:hunterPetMechanics.inherited.critFromHunter.ruleId,
        inputName:'Kritische Trefferchance',input:crit,
        factor:hunterPetMechanics.inherited.critFromHunter.factor,
        value:crit*hunterPetMechanics.inherited.critFromHunter.factor,
        unit:'Prozentpunkte'
      },
      attackPower:{
        ruleId:'pet.scaling',
        value:null,
        reason:'Blizzard stellt in der aktuellen Online-Armory die höhere Nahkampf-/Fernkampf-Angriffskraft nicht getrennt und damit nicht eindeutig bereit.'
      }
    },
    enduranceTraining:enduranceTraining(character),
    focus:hunterPetMechanics.focus,
    globalHealth:hunterPetMechanics.globalHealth
  };
}
