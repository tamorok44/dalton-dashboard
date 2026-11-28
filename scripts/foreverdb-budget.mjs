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
  // Migrate numeric daily counters in place. Older writers fail closed on
  // the new format. The daily count, minute count and expiry share one SET.
  const script=`
local function count(n) return type(n)=='number' and n>=0 and n==math.floor(n) end
local raw=redis.call('GET',KEYS[1])
local d=0
local m=tonumber(redis.call('GET',KEYS[2]) or '0')
local minute=ARGV[3]
if not count(m) then return redis.error_reply('INVALID_BUDGET_COUNTER') end
if raw then
  d=tonumber(raw)
  if not d then
    local old=cjson.decode(raw)
    if type(old)~='table' or not count(old.day) or not count(old.used) or type(old.minute)~='string' or not string.match(old.minute,'^%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d$') then
      return redis.error_reply('INVALID_BUDGET_COUNTER')
    end
    d=old.day
    if old.minute>=minute then
      minute=old.minute
      m=math.max(m,old.used)
    end
  end
end
if not count(d) then return redis.error_reply('INVALID_BUDGET_COUNTER') end
if d>=tonumber(ARGV[1]) then return -1 end
if m>=tonumber(ARGV[2]) then return -2 end
local state=cjson.encode({day=d+1,minute=minute,used=m+1})
redis.call('SET',KEYS[1],state,'EX',172800)
return d+1
`;
  const used=await redisImpl(['EVAL',script,2,key,minuteKey,String(FOREVERDB_DAILY_BUDGET),String(FOREVERDB_MINUTE_BUDGET),now.toISOString().slice(0,16)]);
  if(used===-1){const error=Error('Internes ForeverDB-Tagesbudget erreicht');error.code='FOREVERDB_INTERNAL_QUOTA';throw error;}
  if(used===-2){const error=Error('Internes ForeverDB-Minutenbudget erreicht');error.code='FOREVERDB_INTERNAL_RATE_LIMIT';throw error;}
  if(!Number.isInteger(used)||used<1||used>FOREVERDB_DAILY_BUDGET)throw Error('ForeverDB-Kontingent konnte nicht reserviert werden');
  return used;
}
