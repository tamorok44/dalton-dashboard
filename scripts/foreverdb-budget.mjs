import {createHash} from 'node:crypto';
import {configured,redis} from './character-store.mjs';
// Conservative internal limit: leave 1,000 requests of the announced 5,000/day
// Free quota for account-side usage, diagnostics and future small changes.
export const FOREVERDB_DAILY_BUDGET=4000;
// Internal conservative fixed UTC-minute budget; not a provider quota claim.
export const FOREVERDB_MINUTE_BUDGET=30;
export function foreverDbBudgetKey(apiKey,now=new Date()){
  const fingerprint=createHash('sha256').update(apiKey).digest('hex').slice(0,24);
  return 'dalton-dashboard:foreverdb:daily-budget:v1:'+fingerprint+':'+now.toISOString().slice(0,10);
}
export function foreverDbMinuteBudgetKey(apiKey,now=new Date()){
  const fingerprint=createHash('sha256').update(apiKey).digest('hex').slice(0,24);
  return 'dalton-dashboard:foreverdb:minute-budget:v1:'+fingerprint+':'+now.toISOString().slice(0,16);
}
export async function reserveForeverDbRequest({apiKey=process.env.FOREVERDB_API_KEY,now=new Date(),redisImpl=redis,enabled=configured()}={}){
  if(!apiKey)throw Error('ForeverDB API-Key fehlt');
  if(!enabled){
    if(process.env.VERCEL_ENV)throw Error('ForeverDB-Kontingentschutz nicht verfügbar');
    return null;
  }
  const key=foreverDbBudgetKey(apiKey,now);
  const minuteKey=foreverDbMinuteBudgetKey(apiKey,now);
  // Read and validate both counters before writes. Count minute first: a
  // later denied daily increment wastes allowance but cannot authorize a call.
  const script=`
local d=tonumber(redis.call('GET',KEYS[1]) or '0')
local m=tonumber(redis.call('GET',KEYS[2]) or '0')
if not d or not m or d<0 or m<0 or d~=math.floor(d) or m~=math.floor(m) then return redis.error_reply('INVALID_BUDGET_COUNTER') end
if d>=tonumber(ARGV[1]) then return -1 end
if m>=tonumber(ARGV[2]) then return -2 end
redis.call('SET',KEYS[2],m+1,'EX',120)
d=redis.call('INCR',KEYS[1])
if d==1 then redis.call('EXPIRE',KEYS[1],172800) end
return d
`;
  const used=Number(await redisImpl(['EVAL',script,2,key,minuteKey,String(FOREVERDB_DAILY_BUDGET),String(FOREVERDB_MINUTE_BUDGET)]));
  if(used===-1){const error=Error('Internes ForeverDB-Tagesbudget erreicht');error.code='FOREVERDB_INTERNAL_QUOTA';throw error;}
  if(used===-2){const error=Error('Internes ForeverDB-Minutenbudget erreicht');error.code='FOREVERDB_INTERNAL_RATE_LIMIT';throw error;}
  if(!Number.isInteger(used)||used<1||used>FOREVERDB_DAILY_BUDGET)throw Error('ForeverDB-Kontingent konnte nicht reserviert werden');
  return used;
}
