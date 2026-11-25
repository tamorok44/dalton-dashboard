import {createHash} from 'node:crypto';
import {configured,redis} from './character-store.mjs';
// Conservative internal limit: leave 1,000 requests of the announced 5,000/day
// Free quota for account-side usage, diagnostics and future small changes.
export const FOREVERDB_DAILY_BUDGET=4000;
export function foreverDbBudgetKey(apiKey,now=new Date()){
  const fingerprint=createHash('sha256').update(apiKey).digest('hex').slice(0,24);
  return 'dalton-dashboard:foreverdb:daily-budget:v1:'+fingerprint+':'+now.toISOString().slice(0,10);
}
export async function reserveForeverDbRequest({apiKey=process.env.FOREVERDB_API_KEY,now=new Date(),redisImpl=redis,enabled=configured()}={}){
  if(!apiKey)throw Error('ForeverDB API-Key fehlt');
  if(!enabled){
    if(process.env.VERCEL_ENV)throw Error('ForeverDB-Kontingentschutz nicht verfügbar');
    return null;
  }
  const key=foreverDbBudgetKey(apiKey,now);
  const script="local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>=tonumber(ARGV[1]) then return -1 end; n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],172800) end; return n";
  const used=Number(await redisImpl(['EVAL',script,1,key,String(FOREVERDB_DAILY_BUDGET)]));
  if(used===-1){const error=Error('Internes ForeverDB-Tagesbudget erreicht');error.code='FOREVERDB_INTERNAL_QUOTA';throw error;}
  if(!Number.isInteger(used)||used<1||used>FOREVERDB_DAILY_BUDGET)throw Error('ForeverDB-Kontingent konnte nicht reserviert werden');
  return used;
}
