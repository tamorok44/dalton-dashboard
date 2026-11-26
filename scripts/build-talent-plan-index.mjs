import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {profileKey} from './talent-plan-core.mjs';

const folder=new URL('../data/talent-planning/',import.meta.url);
const target=new URL('./talent-plan-index.mjs',import.meta.url);
const approved=readdirSync(folder).filter(name=>name.endsWith('.json')).sort().flatMap(name=>{
  const plan=JSON.parse(readFileSync(new URL(name,folder),'utf8'));
  if(plan.status!=='approved')return [];
  if(!/^[a-z0-9-]+\.json$/.test(name)||typeof plan.treeName!=='string'||!plan.treeName.trim()||
     !Array.isArray(plan.profiles)||!plan.profiles.length||!plan.profiles.every(profileKey)){
    throw Error('Freigegebener Talentplan ohne gültige deutsche Baumbezeichnung oder Profile: '+name);
  }
  return [name];
});
const generated='// Generiert durch node scripts/build-talent-plan-index.mjs. Nicht manuell pflegen.\n'+
  approved.map((name,i)=>"import plan"+i+" from '../data/talent-planning/"+name+"' with {type:'json'};\n").join('')+
  'export const talentPlanLibrary=Object.freeze(['+approved.map((_,i)=>'plan'+i).join(',')+']);\n';
if(process.argv.includes('--check')){
  if(readFileSync(target,'utf8')!==generated)throw Error('Talentplan-Index veraltet: node scripts/build-talent-plan-index.mjs');
}else writeFileSync(target,generated);
