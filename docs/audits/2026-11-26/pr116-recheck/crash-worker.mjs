import {join} from 'node:path';
import {addonRequest,cronRequest,endpoint,installRedisEnv,redisCommand,reply} from './redis-fixture.mjs';
const {tree,socket,phase,payload,date}=JSON.parse(process.argv[2]);
installRedisEnv();

async function checkpoint(){
  process.stdout.write('redis-commit-checkpoint\n');
  setInterval(()=>{},1000);
  await new Promise(()=>{});
}

globalThis.fetch=async (url,options={})=>{
  if(String(url)!==endpoint)throw Error('External access disabled');
  const command=JSON.parse(options.body);
  const isAddonCommit=command[0]==='EVAL'&&command[3]?.startsWith('dalton-dashboard:addon-sync:v1:');
  const isProfileCommit=command[0]==='EVAL'&&command[3]==='dalton-dashboard:refresh:lock'&&command[4]==='dalton-dashboard:characters:v1'&&command[9]?.includes('"source":"daily"');
  const isDailyIndex=command[0]==='EVAL'&&command[3]==='dalton-dashboard:history:daily:index:v1';
  if((isAddonCommit&&phase==='addon-before')||(isProfileCommit&&phase==='profile-before')||(isDailyIndex&&phase==='daily-before-index'))await checkpoint();
  const result=redisCommand(socket,command);
  if((isAddonCommit&&phase==='addon-after')||(isProfileCommit&&phase==='profile-after')||(isDailyIndex&&phase==='daily-after-index'))await checkpoint();
  return Response.json({result});
};

if(phase.startsWith('addon-')){
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
      const dailyReceipt={date:day,source:'daily',success:data.characters.length,total:data.characters.length,
        persisted:true,generatedAt:data.generatedAt};
      await saveCharacters(data,lockToken,{dailyReceipt});
      return {dailyReceipt};
    }})
  });
  await handler(cronRequest,reply());
}
