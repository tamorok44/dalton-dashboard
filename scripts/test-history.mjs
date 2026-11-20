import assert from 'node:assert/strict';
import {diffMeaningfulChanges,historyProjection} from './history-store.mjs';

const base={
  generatedAt:'2026-11-20T10:00:00.000Z',
  characters:[{
    slug:'cole-dalton',name:'Cole Dalton',level:11,class:'Magier',race:'Himmelsgeborene',
    experience:100,lastLoginAt:'2026-11-20T09:00:00.000Z',
    professions:[{name:'Alchemie',current:58,max:75}],
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
const changes=diffMeaningfulChanges(base,changed);
assert.ok(changes.some(x=>x.path==='level'&&x.before===11&&x.after===12));
assert.ok(changes.some(x=>x.path==='experience'&&x.before===100&&x.after===250));
assert.ok(changes.some(x=>x.path==='professions.Alchemie.current'&&x.after===63));
assert.ok(changes.some(x=>x.path==='equipment.Brust.item'&&x.after==='Neues Wams'));
assert.ok(!Object.hasOwn(historyProjection(changed.characters[0]),'scrapedAt'));
console.log('Historie: nur fachliche Änderungen, keine Abrufzeitstempel: OK');
