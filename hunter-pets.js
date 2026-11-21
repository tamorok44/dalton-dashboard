// Versioniertes Forever-Jägerwissen. Live-Zustand eines konkreten Tiers kommt ausschließlich von Blizzard.
export const hunterPetFamilies=Object.freeze({
  fox:Object.freeze({
    name:'Fuchs',
    modifiers:Object.freeze({damage:0,armor:5,health:0}),
    diet:Object.freeze(['Fleisch']),
    abilities:Object.freeze([
      Object.freeze({
        name:'Beißen',
        kind:'Angriff',
        ranks:Object.freeze([
          {rank:1,level:1},{rank:2,level:8},{rank:3,level:16},{rank:4,level:24},
          {rank:5,level:32},{rank:6,level:40},{rank:7,level:48},{rank:8,level:56}
        ])
      }),
      Object.freeze({
        name:'Tanz des Täuschers',
        kind:'Fuchsfähigkeit',
        special:true,
        ranks:Object.freeze([{rank:1,level:20}]),
        description:'+50 % Ausweichchance und 30 % schnellere Angriffe für 12 Sek.',
        cooldown:'3 Min.'
      }),
      Object.freeze({
        name:'Spurt',
        kind:'Bewegung',
        ranks:Object.freeze([{rank:1,level:30},{rank:2,level:40},{rank:3,level:50}])
      })
    ]),
    sourceNote:'Forever 1.60.1 · Familienwerte und Ausbildungsstufen aus aktuellen Forever-Spieldaten'
  })
});

export function hunterPetFamily(slug){
  return hunterPetFamilies[String(slug||'').toLowerCase()]||null;
}
