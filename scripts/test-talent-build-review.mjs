import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reviewTalentBuild,compareIndependentTalentClass,reviewHotfixDelta} from './talent-build-review.mjs';
import {talentHotfixRevision} from './talent-rule-watch.mjs';
import {hotfixArticleBody} from './pet-rulebook.mjs';
import {talentSourcePairDigest} from './talent-catalog-proof.mjs';
import {buildTalentMaster} from './talent-tree-store.mjs';

const build='1.60.1.71139';
const makeNode=(id,row,col,pre=[])=>({id,df:id+100,sp:id+200,row,col,max:1,lv:10+5*row,
  ...(row?{gate:[row*5,row-1]}:{}),ranks:[id+200],pre,d:['effect '+id]});
const raw=[{id:8,trees:[{id:1,talents:[makeNode(1,0,0),makeNode(2,1,1,[[1,1]])]},
  {id:2,talents:[makeNode(3,0,0)]},{id:3,talents:[makeNode(4,0,0)]}]}];
const de={8:{n:'Magier',trees:{1:{n:'Arkan'},2:{n:'Feuer'},3:{n:'Frost'}},talents:Object.fromEntries([1,2,3,4].map(id=>[id,{n:'Talent '+id,d:['Text']}]))}};
const secondary={cls:'mage',trees:[...raw[0].trees].reverse().map(t=>({talents:t.talents.map(n=>({
  id:n.id,row:n.row,col:n.col,maxRank:n.max,points:n.row*5,req:n.pre.map(p=>({talent:p[0],rank:p[1]}))
}))}))};
const html=(data=secondary,version=build)=>'<small>build '+version+'</small><script type="application/json" data-tc-data>'+JSON.stringify(data)+'</script>';
const body=JSON.stringify(raw),localizedBody=JSON.stringify(de);
const sha=s=>createHash('sha256').update(s).digest('hex');
const expectedSourceRevision=talentSourcePairDigest(sha(body),sha(localizedBody));
const input={date:'2026-11-26',build,rawBody:body,localizedBody,expectedSourceRevision,independentCaptures:{8:html()}};
const result=reviewTalentBuild(input);
assert.equal(result.approved,false);
assert.equal(result.classes.length,9);
assert.equal(result.classes.find(c=>c.classId===8).status,'structure_matches');
assert.equal(result.classes.find(c=>c.classId===3).status,'primary_incomplete');
assert.equal(result.catalogs.length,1);
assert.equal(result.sourcePair.revision,expectedSourceRevision);
const again=reviewTalentBuild({...input,baselineCatalogs:result.catalogs});
assert.equal(again.classes.find(c=>c.classId===8).mechanicsUnchanged,true);
const translated=structuredClone(de);translated[8].talents[1].d=['Andere Übersetzung'];
const translatedBody=JSON.stringify(translated);
const translation=reviewTalentBuild({...input,baselineCatalogs:result.catalogs,localizedBody:translatedBody,
  expectedSourceRevision:talentSourcePairDigest(sha(body),sha(translatedBody))});
assert.equal(translation.classes.find(c=>c.classId===8).mechanicsUnchanged,true);
const changed=structuredClone(raw);changed[0].trees[0].talents[0].d=['new effect'];
const changedBody=JSON.stringify(changed);
const effect=reviewTalentBuild({...input,baselineCatalogs:result.catalogs,rawBody:changedBody,
  expectedSourceRevision:talentSourcePairDigest(sha(changedBody),sha(localizedBody))});
assert.equal(effect.classes.find(c=>c.classId===8).mechanicsUnchanged,false);
assert.ok(effect.classes.find(c=>c.classId===8).mechanicsChanges.some(c=>c.id===1&&c.fields.includes('effectRevision')));
assert.throws(()=>reviewTalentBuild({...input,expectedSourceRevision:'a'.repeat(64)}),/does not match live/);
assert.equal(reviewTalentBuild({...input,independentCaptures:{8:html(secondary,'1.60.1.71091')}}).classes.find(c=>c.classId===8).status,'independent_capture_unverified');
const klass=buildTalentMaster(raw,de).classes[8];
const different=structuredClone(secondary);different.trees.at(-1).talents[1].col=2;
assert.equal(compareIndependentTalentClass(klass,html(different),build).status,'structure_differs');
const extra=structuredClone(secondary);extra.trees.at(-1).talents[1].req[0].operator='or';
assert.throws(()=>compareIndependentTalentClass(klass,html(extra),build),/Unknown independent prerequisite/);
const cycleRaw=structuredClone(raw);cycleRaw[0].trees[0].talents[0].pre=[[2,1]];
const cycleIndependent=structuredClone(secondary);cycleIndependent.trees.at(-1).talents[0].req=[{talent:2,rank:1}];
assert.equal(compareIndependentTalentClass(buildTalentMaster(cycleRaw,de).classes[8],html(cycleIndependent),build).status,'edge_review_required');
const article=lines=>'<section class="blog"><p>Here you will find a list of hotfixes that address various issues related to World of Warcraft: Forever.</p>'+lines.map(x=>'<p>'+x+'</p>').join('')+'</section>';
const old=article(['November 23, 2026','Old content','November 20, 2026','Retained']);
const current=article(['November 25, 2026','New content','November 23, 2026','Edited old content','November 20, 2026','Retained']);
const rev=s=>talentHotfixRevision(hotfixArticleBody(s));
const delta=reviewHotfixDelta(old,current,rev(old),rev(current));
assert.deepEqual(delta.dateSections.map(x=>[x.date,x.status]),[['November 23, 2026','changed'],['November 20, 2026','unchanged'],['November 25, 2026','added']]);
assert.equal(delta.completeHotfixReview,false);
assert.throws(()=>reviewHotfixDelta(old,current,rev(current),rev(current)),/Previous hotfix/);
console.log('Offline talent build review: exact source pair, all classes, independent structures, changed effects, cyclic edges and hotfix history: OK');
