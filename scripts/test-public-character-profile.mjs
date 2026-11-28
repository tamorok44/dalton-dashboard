import assert from 'node:assert/strict';
import {publicCharacterData,publicQuestCatalog} from './public-character-profile.mjs';
import handler from '../api/characters.js';

const marker='PRIVATE_TEST_SENTINEL_NOT_PUBLIC';
const record={generatedAt:'2026-11-27T18:00:00.000Z',internal:marker,characters:[{
  slug:'cole-dalton',name:'Cole Dalton',classId:8,level:12,player:'QA',
  internal:marker,deviceToken:marker,inventory:{secret:marker},
  scrapeOk:false,scrapeError:marker,
  stats:{Gesundheit:200,Tempowertung:9125,'Tempo (Nahkampf)':7,unknown:777,Blockwert:9125},statsByEnum:{HEALTH:200,HASTE:42,MELEEHASTE:7,SECRET:777,UNKNOWN_HASTE:9125},
  statsDetails:[{enum:'HEALTH',name:'Gesundheit',value:200,private:marker},{enum:'HASTE',name:'Tempowertung',value:42},{enum:'MELEEHASTE',name:'Tempo (Nahkampf)',value:7},{enum:'SECRET',name:'unknown',value:777},{enum:'UNKNOWN_HASTE',name:'Tempowertung',value:9125}],
  statsFreshEnums:['HEALTH','HASTE','MELEEHASTE','SECRET','UNKNOWN_HASTE'],statsFreshKeys:['Gesundheit','Tempowertung','Tempo (Nahkampf)','SECRET','Blockwert'],
  equipment:[{id:10,slot:'Kopf',item:'Hut',level:4,internal:marker}],
  professions:[{id:171,name:'Alchemie',current:10,max:75,knownRecipes:[{id:11,name:'Trank',craftedItem:{id:12,name:'Trank',secret:marker},craftedQuantity:{minimum:1,maximum:2,secret:marker},reagents:[{id:13,name:'Kraut',quantity:2,private:marker}],secret:marker}],private:marker}],
  talentDetails:[{id:3,name:'Frost',spentPoints:1,talents:[{id:14,name:'Frost',rank:1,private:marker}],secret:marker}],
  knownClassAbilities:[{id:133,name:'Feuerball',rank:'Rang 1',private:marker}],
  reputations:[{id:15,name:'Stormwind',standing:{value:10,max:100,tier:4,private:marker},internal:marker}],
  activeQuests:[{id:16,name:'Quest',secret:marker}],completedQuestIds:[17],
  hunterPets:{active:[{id:18,name:'Fuchs',family:{id:1,slug:'fox',name:'Fuchs',private:marker},private:marker}],stable:[],internal:marker}
}]};
const projected=publicCharacterData(record);
assert.ok(!JSON.stringify(projected).includes(marker));
assert.equal(projected.characters[0].stats.Gesundheit,200);
assert.deepEqual(projected.characters[0].statsByEnum,{HEALTH:200,HASTE:42,MELEEHASTE:7});
assert.deepEqual(projected.characters[0].statsFreshEnums,[]);
assert.equal(projected.characters[0].statsVerified,false);
assert.equal(projected.characters[0].stats.Tempowertung,42);
assert.equal(projected.characters[0].stats['Tempo (Nahkampf)'],7);
assert.ok(!Object.hasOwn(projected.characters[0].stats,'unknown'));
assert.deepEqual(projected.characters[0].statsFreshKeys,[]);
const freshProjected=publicCharacterData({...record,characters:[{...record.characters[0],scrapeOk:true}]}).characters[0];
assert.ok(freshProjected.statsFreshKeys.includes('Tempo (Nahkampf)'));
assert.deepEqual(freshProjected.statsFreshEnums,['HEALTH','HASTE','MELEEHASTE']);
assert.ok(!JSON.stringify(projected).includes('9125'),'Unknown enum must not leak via a recognized label');
assert.equal(record.characters[0].stats.Tempowertung,9125,'Stored raw value is not modified');
const profile=fields=>publicCharacterData({characters:[fields]}).characters[0];
assert.deepEqual(profile({stats:{Tempowertung:9125}}).stats,{},'Unproven legacy storage is not public');
assert.deepEqual(publicCharacterData({characters:[{stats:{Gesundheit:200,unknown:9125}}]},{allowLegacyStats:true}).characters[0].stats,{Gesundheit:200});
assert.deepEqual(profile({stats:{Tempowertung:9125},statsByEnum:{UNKNOWN_HASTE:9125},statsDetails:[{enum:'UNKNOWN_HASTE',name:'Tempowertung',value:9125}],statsFreshEnums:['UNKNOWN_HASTE'],statsFreshKeys:['Tempowertung']}).stats,{});
const staleAlias=profile({stats:{Tempowertung:9125},statsByEnum:{HASTE:13,UNKNOWN_HASTE:9125},statsDetails:[{enum:'HASTE',name:'Tempowertung',value:13},{enum:'UNKNOWN_HASTE',name:'Tempowertung',value:9125}],statsFreshEnums:['UNKNOWN_HASTE'],statsFreshKeys:['Tempowertung']});
assert.equal(staleAlias.stats.Tempowertung,13);
assert.deepEqual(staleAlias.statsFreshKeys,[],'Unknown fresh enum cannot mark known value fresh');
const ambiguous=profile({stats:{Tempowertung:9125},statsByEnum:{HASTE:13,HASTERATING:42},statsDetails:[{enum:'HASTE',name:'Tempowertung',value:13},{enum:'HASTERATING',name:'Tempowertung',value:42}],statsFreshEnums:['HASTE','HASTERATING']});
assert.deepEqual(ambiguous.stats,{});
assert.equal(ambiguous.statsDetails.length,2);
assert.equal(ambiguous.statsByEnum.HASTE,13);
assert.deepEqual(ambiguous.statsFreshKeys,[]);
const conflict=profile({stats:{Tempowertung:9125},statsByEnum:{HASTE:13},statsDetails:[{enum:'HASTE',name:'Tempowertung',value:13},{enum:'HASTE',name:'Tempowertung',value:9125}],statsFreshEnums:['HASTE']});
assert.equal(conflict.statsByEnum.HASTE,13);
assert.deepEqual(conflict.stats,{});
assert.deepEqual(conflict.statsDetails,[]);
assert.deepEqual(conflict.statsFreshEnums,[]);
assert.deepEqual(profile({stats:{Tempowertung:9125},statsDetails:[{enum:'HASTE',name:'Tempowertung',value:13}]}).stats,{Tempowertung:13});
assert.deepEqual(profile({stats:{Tempowertung:9125},statsByEnum:{HASTE:13}}).stats,{Tempowertung:13});
const quest={id:16,title:'Quest',description:'Aufgabe',area:'Stormwind',minimumLevel:5,locale:'de_DE',namespace:'static-1-forever-eu',fetchedAt:'2026-11-27T18:00:00Z',private:{token:marker},reward:{secret:marker}};
assert.deepEqual(publicQuestCatalog({'16':quest,'17':{id:16,title:marker},'18':{id:18,title:{secret:marker}}}),{'16':{id:16,title:'Quest',description:'Aufgabe',area:'Stormwind',minimumLevel:5,locale:'de_DE',namespace:'static-1-forever-eu',fetchedAt:'2026-11-27T18:00:00Z'},'18':{id:18}});
assert.equal(projected.characters[0].professions[0].knownRecipes[0].reagents[0].quantity,2);
assert.equal(projected.characters[0].talentDetails[0].talents[0].rank,1);
assert.equal(projected.characters[0].hunterPets.active[0].family.slug,'fox');
assert.equal(projected.characters[0].scrapeError,'Letzter Profilabruf fehlgeschlagen');
assert.equal(record.characters[0].deviceToken,marker,'projection must not mutate authoritative stored data');
const envKeys=['VERCEL_ENV','KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','FOREVERDB_API_KEY','BLOB_STORE_ID','BLOB_READ_WRITE_TOKEN'];
const prior=Object.fromEntries(envKeys.map(k=>[k,process.env[k]])),original=globalThis.fetch;
try{
  for(const key of envKeys)delete process.env[key];
  process.env.VERCEL_ENV='production';
  process.env.KV_REST_API_URL='https://public-profile-fixture.invalid';
  process.env.KV_REST_API_TOKEN='synthetic';
  let reads=0;
  globalThis.fetch=async(url,options)=>{
    assert.equal(String(url),'https://public-profile-fixture.invalid','never reach real providers');
    const cmd=JSON.parse(options.body);
    if(cmd[0]==='GET'&&cmd[1]==='dalton-dashboard:characters:v1'){reads++;return Response.json({result:JSON.stringify(record)})}
    if(cmd[0]==='HMGET'&&cmd[1]==='dalton-dashboard:quest-catalog:latest:v1')return Response.json({result:['de_DE:static-1-forever-eu:16']});
    if(cmd[0]==='HMGET'&&cmd[1]==='dalton-dashboard:quest-catalog:v1')return Response.json({result:[JSON.stringify(quest)]});
    if(cmd[0]==='MGET'||cmd[0]==='HMGET')return Response.json({result:cmd.slice(1).map(()=>null)});
    return Response.json({result:null});
  };
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:'GET',query:{}},res);
  assert.equal(res.code,200,JSON.stringify(res.body));
  assert.equal(reads,1);
  assert.ok(!JSON.stringify(res.body).includes(marker),'Actual GET must not leak nested or root private data');
  assert.equal(res.body.data.characters[0].stats.Tempowertung,42);
  assert.equal(res.body.data.characters[0].statsByEnum.HASTE,42);
  assert.ok(!JSON.stringify(res.body).includes('9125'));
  assert.deepEqual(res.body.data.characters[0].statsFreshKeys,[]);
  assert.deepEqual(res.body.data.characters[0].statsFreshEnums,[]);
  assert.equal(res.body.data.characters[0].statsVerified,false);
  assert.equal(res.body.questCatalog['16'].title,'Quest');
  assert.deepEqual(res.body.questCatalog,publicQuestCatalog({'16':quest}));
  assert.equal(res.body.data.characters[0].knownClassAbilities[0].id,133);
  assert.equal(res.body.data.characters[0].professions[0].knownRecipes[0].craftedItem.id,12);
}finally{
  globalThis.fetch=original;
  for(const [k,v] of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
console.log('Public profile: recursive allowlist, stored sentinel and actual API regression OK');
