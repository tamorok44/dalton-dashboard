import {join} from 'node:path';
import {addonRequest,cronRequest,endpoint,installRedisEnv,redisCommand,reply} from '../pr116-recheck-177b147/redis-fixture.mjs';
const {tree,socket,phase,payload,date}=JSON.parse(process.argv[2]);
installRedisEnv();

async function checkpoint(){
  process.stdout.write('redis-commit-checkpoint\n');
  setInterval(()=>{},1000);
  await new Promise(()=>{});
}

let proofAttempts=0;
globalThis.fetch=async (url,options={})=>{
  if(String(url)!==endpoint)throw Error('External access disabled');
  const command=JSON.parse(options.body);
  if(phase==='addon-proof-retry'&&command[0]==='HGET'&&String(command[2]).startsWith('__quarantine:v1:')){
    if(++proofAttempts===3)await checkpoint();
    throw Error('Synthetic proof transport failure before retry');
  }
  const isAddonCommit=command[0]==='EVAL'&&command[3]?.startsWith('dalton-dashboard:addon-sync:v1:');
  const isProfileCommit=command[0]==='EVAL'&&command[3]==='dalton-dashboard:refresh:lock'&&command[4]==='dalton-dashboard:characters:v1'&&command[9]?.includes('"source":"daily"');
  const isObservation=command[0]==='EVAL'&&command[3]==='dalton-dashboard:live-knowledge:v1:production:records:v2';
  const isReadQuarantine=command[0]==='HSETNX'&&String(command[2]).startsWith('__quarantine:v1:');
  const isDailyIndex=command[0]==='EVAL'&&command[3]==='dalton-dashboard:history:daily:index:v1';
  if((isAddonCommit&&phase==='addon-before')||(isProfileCommit&&phase==='profile-before')||(isDailyIndex&&phase==='daily-before-index')||(isObservation&&phase==='addon-before-observation')||(isReadQuarantine&&phase==='read-before-quarantine'))await checkpoint();
  const result=redisCommand(socket,command);
  if((isAddonCommit&&phase==='addon-after')||(isProfileCommit&&phase==='profile-after')||(isDailyIndex&&phase==='daily-after-index')||(isObservation&&phase==='addon-after-observation')||(isReadQuarantine&&phase==='read-after-quarantine'))await checkpoint();
  return Response.json({result});
};

if(phase.startsWith('read-')){
  const {loadLiveKnowledge}=await import(join(tree,'scripts/live-knowledge-store.mjs'));
  await loadLiveKnowledge({build:'1.60.1.71139',kind:'trainer'});
}else if(phase.startsWith('addon-')){
  const {default:addon}=await import(join(tree,'api/addon-sync.js'));
  await addon(addonRequest(payload),reply());
}else{
  const {createDailySnapshotHandler,refreshDailyCharacters}=await import(join(tree,'api/daily-snapshot.js'));
  const {saveCharacters,loadCharacters}=await import(join(tree,'scripts/character-store.mjs'));
  const handler=createDailySnapshotHandler({
    configured:()=>true,blizzardApiConfigured:()=>true,dailySnapshotStoreConfigured:()=>false,
    berlinClock:()=>({date,hour:5,minute:7}),
    ensurePetRuleState:async()=>({}),publicPetRuleState:()=>({}),
    refreshDailyCharacters:day=>refreshDailyCharacters(day,{refresh:async({lockToken})=>{
      const {data}=await loadCharacters();
      data.generatedAt=day+'T04:08:00Z';
      const dailyReceipt={date:day,roster:data.characters.map(c=>({slug:c.slug,id:c.blizzardCharacterId??null})),source:'daily',success:data.characters.length,total:data.characters.length,
        persisted:true,generatedAt:data.generatedAt};
      await saveCharacters(data,lockToken,{dailyReceipt});
      return {dailyReceipt};
    }})
  });
  await handler(cronRequest,reply());
}
