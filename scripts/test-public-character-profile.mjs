import assert from 'node:assert/strict';
import {publicCharacterData} from './public-character-profile.mjs';
import handler from '../api/characters.js';

const marker='PRIVATE_TEST_SENTINEL_NOT_PUBLIC';
const record={generatedAt:'2026-11-27T18:00:00.000Z',internal:marker,characters:[{
  slug:'cole-dalton',name:'Cole Dalton',classId:8,level:12,player:'QA',
  internal:marker,deviceToken:marker,inventory:{secret:marker},
  scrapeOk:false,scrapeError:marker,
  stats:{Gesundheit:200,unknown:777},statsByEnum:{HEALTH:200,SECRET:777},
  statsDetails:[{enum:'HEALTH',name:'Gesundheit',value:200,private:marker}],
  statsFreshEnums:['HEALTH','SECRET'],statsFreshKeys:['Gesundheit','SECRET'],
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
assert.deepEqual(projected.characters[0].statsByEnum,{HEALTH:200});
assert.deepEqual(projected.characters[0].statsFreshEnums,['HEALTH']);
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
    if(cmd[0]==='MGET'||cmd[0]==='HMGET')return Response.json({result:cmd.slice(1).map(()=>null)});
    return Response.json({result:null});
  };
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:'GET',query:{}},res);
  assert.equal(res.code,200,JSON.stringify(res.body));
  assert.equal(reads,1);
  assert.ok(!JSON.stringify(res.body).includes(marker),'Actual GET must not leak nested or root private data');
  assert.equal(res.body.data.characters[0].knownClassAbilities[0].id,133);
  assert.equal(res.body.data.characters[0].professions[0].knownRecipes[0].craftedItem.id,12);
}finally{
  globalThis.fetch=original;
  for(const [k,v] of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
console.log('Public profile: recursive allowlist, stored sentinel and actual API regression OK');
