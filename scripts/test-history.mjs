import assert from 'node:assert/strict';
import {diffMeaningfulChanges,historyProjection} from './history-store.mjs';
import {berlinClock} from '../api/daily-snapshot.js';

const base={
  generatedAt:'2026-11-20T10:00:00.000Z',
  characters:[{
    slug:'cole-dalton',name:'Cole Dalton',level:11,class:'Magier',race:'Himmelsgeborene',
    experience:100,lastLoginAt:'2026-11-20T09:00:00.000Z',
    professions:[{name:'Alchemie',current:58,max:75}],
    activeQuests:[{id:9001,name:'Ein großes Abenteuer'}],
    completedQuestIds:[8123],
    stats:{Gesundheit:200,Mana:500},
    equipment:[{slot:'Brust',item:'Altes Wams',level:8,quality:'COMMON',icon:'https://example.test/a.jpg'}],
    scrapedAt:'2026-11-20T10:00:00.000Z',imageCheckedAt:'2026-11-20T10:00:00.000Z',
    apiProfileCheckedAt:'2026-11-20T10:00:00.000Z'
  }]
};
const onlyVolatile=structuredClone(base);
onlyVolatile.generatedAt='2026-11-20T11:00:00.000Z';
onlyVolatile.characters[0].scrapedAt='2026-11-20T11:00:00.000Z';
onlyVolatile.characters[0].imageCheckedAt='2026-11-20T11:00:00.000Z';
onlyVolatile.characters[0].apiProfileCheckedAt='2026-11-20T11:00:00.000Z';
assert.deepEqual(diffMeaningfulChanges(base,onlyVolatile),[],'Abrufzeitpunkte erzeugen keine Historienereignisse');

const changed=structuredClone(onlyVolatile);
changed.characters[0].level=12;
changed.characters[0].experience=250;
changed.characters[0].professions[0].current=63;
changed.characters[0].equipment[0].item='Neues Wams';
changed.characters[0].completedQuestIds.push(9001);
changed.characters[0].hunterPets={active:[{name:'Slydris',level:6,family:{id:319,name:'Fuchs',slug:'fox'},active:true,summoned:true,slot:0}],stable:[]};
const changes=diffMeaningfulChanges(base,changed);
assert.ok(changes.some(x=>x.path==='level'&&x.before===11&&x.after===12));
assert.ok(changes.some(x=>x.path==='experience'&&x.before===100&&x.after===250));
assert.ok(changes.some(x=>x.path==='professions.Alchemie.current'&&x.after===63));
assert.ok(changes.some(x=>x.path==='equipment.Brust.item'&&x.after==='Neues Wams'));
assert.ok(changes.some(x=>x.path==='hunterPets.active'&&Array.isArray(x.after)&&x.after[0]?.name==='Slydris'),'Ein neuer Jägerbegleiter wird historisiert');
assert.ok(changes.some(x=>x.path==='completedQuests.9001'&&x.before===null&&x.after===true),'Ein neuer Questabschluss wird als einzelne ID statt als komplette Liste historisiert');
assert.ok(!changes.some(x=>x.path==='completedQuests'&&Array.isArray(x.after)),'Completed-Liste darf die Historie nicht mit Vollkopien aufblasen');
assert.ok(!Object.hasOwn(historyProjection(changed.characters[0]),'scrapedAt'));
console.log('Historie: nur fachliche Änderungen, keine Abrufzeitstempel: OK');

const winter=berlinClock(new Date('2026-01-15T04:07:00.000Z'));
const summer=berlinClock(new Date('2026-07-15T04:07:00.000Z'));
assert.equal(winter.hour,5,'04:07 UTC corresponds to 05:07 in Berlin winter time');
assert.equal(summer.hour,6,'04:07 UTC corresponds to 06:07 in Berlin summer time');
