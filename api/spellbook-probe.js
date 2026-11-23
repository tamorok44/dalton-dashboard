import {probeForeverCharacter} from '../scripts/blizzard-api.mjs';

const ENDPOINTS=[
  'profile','professions','specializations',
  'spells','spellbook','skills','abilities','knownSpells','classSpells',
  'classAbilities','skillLines','playerSpells','learnedSpells','spellbookSpells','spellsKnown'
];

export default async function handler(req,res){
  res.setHeader('cache-control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method Not Allowed'});
  try{
    const result=await probeForeverCharacter('cole-dalton',{locale:'de_DE',endpointNames:ENDPOINTS});
    return res.status(200).json({success:true,result});
  }catch(error){
    return res.status(500).json({success:false,error:error?.message||String(error)});
  }
}
