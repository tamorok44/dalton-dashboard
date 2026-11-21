export default async function handler(req,res){
  try{
    const url='https://worldofwarcraft.blizzard.com/de-de/forever/eu/armory/character/cole-dalton';
    const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0','accept-language':'de-DE,de;q=0.9'},signal:AbortSignal.timeout(15000)});
    const html=await response.text();
    const needles=['Gesundheit','Mana','Stärke','Intelligenz','Beweglichkeit','Ausdauer','Kritische Trefferchance','Willenskraft','CharacterStat-name','color-stat-HEALTH','characterProfileInitialState'];
    const hits={};
    for(const needle of needles){
      const index=html.indexOf(needle);
      hits[needle]={index,snippet:index>=0?html.slice(Math.max(0,index-300),index+700):null};
    }
    const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].slice(0,100).map((m,i)=>({
      i,attrs:m[1].slice(0,300),length:m[2].length,
      hasGesundheit:m[2].includes('Gesundheit'),hasCharacterState:m[2].includes('characterProfileInitialState')
    })).filter(x=>x.hasGesundheit||x.hasCharacterState||/locale|initial|state|i18n|translation/i.test(x.attrs));
    res.status(200).json({status:response.status,length:html.length,hits,scripts});
  }catch(error){res.status(500).json({error:String(error.message)})}
}
