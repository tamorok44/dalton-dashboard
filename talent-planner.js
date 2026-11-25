const labels={
  leveling:'Leveln',dungeons:'Dungeons',pvp:'PvP',
  damage:'Schaden',tank:'Tanken',heal:'Heilen',
  mixed:'Solo und Gruppe',solo:'Solo',group:'Feste Gruppe',balanced:'Ausgewogen'
};
const blocking={
  unknown_character:'Der Charakter gehört nicht zum verfügbaren Roster.',
  roster_unavailable:'Der aktuelle Charakterstand ist derzeit nicht erreichbar.',
  invalid_profile:'Wähle ein gültiges Profil.',
  no_approved_recommendation:'Für diese Auswahl gibt es keinen freigegebenen Talentplan.',
  unverified_legacy_rank:'Prüfe den Vermächtnisrang „Talentiert“ im Spiel und bestätige deine Auswahl.',
  unsupported_legacy_rank:'Für diesen Vermächtnisrang ist der Plan nicht freigegeben.',
  unverified_current_catalog:'Der aktuelle Talentkatalog konnte nicht für diesen Plan bestätigt werden.',
  unverified_current_rules:'Die aktuelle Spielversion, Hotfixes und Talentdaten konnten nicht als gemeinsamer Stand bestätigt werden.',
  binding_unavailable:'Die gemerkte Planversion ist für diesen Charakter und diese Auswahl derzeit nicht verfügbar.',
  source_unavailable:'Die Datenquellen sind derzeit nicht erreichbar. Der Talentpfad ist gesperrt.'
};
const profileLabel=p=>[p.goal,p.role,p.playStyle,p.priority].map(value=>labels[value]||value).join(' · ')+' · '+p.name;
const treeKeys=['treeId','goal','role','playStyle','priority'];
const matches=(a,b)=>a&&b&&treeKeys.every(key=>a[key]===b[key])&&a.classId===b.classId;

export function compareTalentProgress(history,actual,level){
  if(!actual.verified||!Number.isInteger(level)||level<1)return {status:'unknown'};
  const count=[...actual.ranks.values()].reduce((sum,value)=>sum+value,0);
  const expected=new Map(history.slice(0,count).map(step=>[step.talentId,step.rank]));
  if(count>history.length||history[count-1]?.level>level||expected.size!==actual.ranks.size||
     [...actual.ranks].some(([id,rank])=>expected.get(id)!==rank)){
    return {status:'different'};
  }
  return {status:'matches',count,next:history[count]??null};
}

const bindingKey=identity=>'dalton-talent-plan:'+identity;
function storageBinding(storage,identity){
  try{
    const result=JSON.parse(storage.getItem(bindingKey(identity)));
    return result?.planId&&result?.identity&&result?.profile&&Number.isInteger(result.version)&&
      Number.isInteger(result.rank)&&result.rank>=0&&result.rank<=5?result:null;
  }catch{return null}
}

export function createTalentPlanner(root,{esc,displayList,personalTalentRanks,talentGraph,talentNodeDetail,fetchImpl=fetch,storage}){
  let characters=[],rosterVersion,character='',identity=null,profiles=[],profile=null,rank='',binding=null;
  let busy=false,message='',plan=null,level=10,treeId=null,nodeId=null,requestId=0,expiry=null;
  const warn=code=>blocking[code]||blocking.source_unavailable;
  const clearPlan=()=>{
    clearTimeout(expiry);
    plan=null;
  };
  async function request(query){
    const reply=await fetchImpl('/api/characters?view=talent-planner&'+new URLSearchParams(query),{cache:'no-store'});
    return reply.json();
  }
  async function selectCharacter(value,{focus=false,keepSelection=false}={}){
    const id=++requestId;
    const previous=keepSelection?{identity,profile,rank}:null;
    clearPlan();
    character=value;
    identity=null;
    binding=null;
    rank='';
    profiles=[];
    profile=null;
    message='';
    busy=Boolean(character);
    render(focus?'#talentPlannerCharacter':null);
    if(!character)return;
    try{
      const result=await request({character});
      if(id!==requestId)return;
      if(!result.ok)message=warn(result.code);
      else{
        profiles=result.profiles;
        identity=result.identity;
        binding=identity?storageBinding(storage,identity):null;
        const selected=previous&&previous.identity===identity?profiles.find(option=>matches(option,previous.profile)):null;
        profile=binding?.profile??selected??(profiles.length===1?profiles[0]:null);
        rank=binding?.rank?.toString()??(selected?previous.rank:'');
        if(binding&&binding.identity!==result.identity)message=warn('binding_unavailable');
        if(!binding&&!profiles.length)message=warn('no_approved_recommendation');
      }
    }catch{
      if(id===requestId)message=warn('source_unavailable');
    }finally{
      if(id===requestId){
        busy=false;
        render(focus&&root.contains(document.activeElement)?'#talentPlannerCharacter':null);
      }
    }
  }
  async function resolve(){
    if(!profile||busy)return;
    const id=++requestId;
    clearPlan();
    message='';
    if(rank===''){
      message=warn('unverified_legacy_rank');
      render('#talentPlannerLegacy');
      return;
    }
    const {treeId:tree,goal,role,playStyle,priority}=profile;
    const query={character,tree,goal,role,playStyle,priority,rank,rankSource:'player_confirmed'};
    if(binding)Object.assign(query,{identity:binding.identity,planId:binding.planId,version:binding.version});
    busy=true;
    render();
    try{
      const result=await request(query);
      if(id!==requestId)return;
      if(!result.ok){message=warn(result.code);return}
      plan=result;
      treeId=profile.treeId;
      nodeId=null;
      level=Math.min(60,Math.max(result.history[0].level,result.character.level||result.history[0].level));
      const ms=Date.parse(result.evidence.validUntil)-Date.now();
      if(!(ms>0)){
        clearPlan();
        message=warn('unverified_current_catalog');
        return;
      }
      expiry=setTimeout(()=>{
        clearPlan();
        message=warn('unverified_current_catalog');
        render();
      },ms);
    }catch{
      if(id===requestId)message=warn('source_unavailable');
    }finally{
      if(id===requestId){busy=false;render(plan?'#talentPlannerPath':'#talentPlannerMessage')}
    }
  }
  function remember(){
    if(!plan?.identity||binding)return;
    const value={planId:plan.planId,version:plan.version,identity:plan.identity,profile:plan.profile,rank:plan.legacyRank.rank};
    try{
      if(storageBinding(storage,plan.identity)){selectCharacter(character);return}
      storage.setItem(bindingKey(plan.identity),JSON.stringify(value));
      binding=value;
      message='Dieser Browser hat die Planversion und deine Auswahl für den Charakter gemerkt.';
    }catch{message='Dieser Browser konnte die Bindung nicht speichern.'}
    render('#talentPlannerMessage');
  }
  function forget(){
    try{storage.removeItem(bindingKey(identity))}
    catch{message='Dieser Browser konnte die Bindung nicht entfernen.';render('#talentPlannerMessage');return}
    selectCharacter(character,{focus:true});
  }
  function renderPath(focus){
    const result=root.querySelector('[data-plan-result]');
    if(!plan||!result)return;
    const tree=plan.klass.trees.find(value=>value.id===treeId);
    const names=new Map(plan.klass.trees.flatMap(value=>value.talents.map(node=>[node.id,node.name])));
    const actual=personalTalentRanks(plan.character,plan.klass);
    const progress=compareTalentProgress(plan.history,actual,plan.character.level);
    const shown=plan.history.filter(step=>step.level<=level);
    const planned={verified:true,ranks:new Map(shown.map(step=>[step.talentId,step.rank]))};
    const pick=tree.talents.find(node=>node.id===nodeId);
    const next=progress.next;
    const progressText=progress.status==='unknown'?'Der erlernte Talentstand ist nicht vollständig bestätigt.'
      :progress.status==='different'?'Die erlernten Talente weichen vom chronologischen Plan ab.'
      :progress.count+' von '+plan.history.length+' Planpunkten stimmen mit dem erlernten Talentstand überein.';
    const nextText=next
      ?'Auf Stufe '+next.level+' sieht der Plan '+names.get(next.talentId)+' (Rang '+next.rank+') vor.'
      :progress.status==='matches'?'Du hast alle vorgesehenen Talentpunkte erlernt.':'Der nächste Punkt lässt sich aus dem erlernten Stand nicht ableiten.';
    const rationale=(profiles.find(value=>matches(value,plan.profile)))?.recommendation;
    result.innerHTML=
      '<h3 id="talentPlannerPath" tabindex="-1">'+esc(plan.klass.trees.find(t=>t.id===plan.profile.treeId).name)+' · Planversion '+esc(plan.version)+'</h3>'+
      (rationale?'<p>'+esc(rationale)+'</p>':'')+
      '<p><strong>Vermächtnisrang „Talentiert“ '+esc(plan.legacyRank.rank)+'</strong> · von dir im Spiel bestätigt</p>'+
      '<p><strong>Ist-Abgleich</strong> '+esc(progressText)+'</p>'+
      '<p><strong>Nächster Punkt</strong> '+esc(nextText)+'</p>'+
      (next?'<p class="talent-point-note">Der Abgleich bestätigt keine unverteilten Talentpunkte.</p>':'')+
      '<label class="talent-planner-field" for="talentPlannerLevel">Geplante Talente auf dieser Stufe<select id="talentPlannerLevel">'+
      displayList('fixedControls',Array.from({length:61-plan.history[0].level},(_,index)=>plan.history[0].level+index),
        value=>'<option value="'+value+'"'+(value===level?' selected':'')+'>'+value+'</option>').join('')+'</select></label>'+
      '<div class="talent-tree-switch" dir="ltr" role="group" aria-label="Talentbäume">'+displayList('fixedControls',plan.klass.trees,value=>
        '<button type="button" class="talent-tree-option'+(value.id===treeId?' is-active':'')+'" data-plan-tree="'+value.id+'" aria-pressed="'+(value.id===treeId)+'">'+esc(value.name)+'</button>'
      ).join('')+'</div>'+
      '<div class="talent-tree talent-visual-tree">'+talentGraph(tree,planned,level,false,nodeId,'planner')+'</div>'+
      (pick?talentNodeDetail(pick,tree,planned,level,false,{planned:true}):'')+
      '<h4>Chronologischer Talentpfad bis Stufe '+esc(level)+'</h4>'+
      '<ol class="talent-planner-steps">'+displayList('fixedControls',shown,step=>'<li>Stufe '+step.level+' · '+esc(names.get(step.talentId))+' (Rang '+step.rank+')</li>').join('')+'</ol>'+
      '<p class="workshop-credit">Talentstruktur und deutsche Texte <a href="https://foreverdb.net" target="_blank" rel="noopener noreferrer">ForeverDB.net</a></p>'+
      (!binding&&plan.identity?'<button type="button" class="talent-planner-action" data-plan-remember>Plan für diesen Charakter merken</button>':
        !binding?'<p>Ohne bestätigte Charakterkennung ist die Planbindung nicht verfügbar.</p>':'');
    result.querySelector('#talentPlannerLevel').addEventListener('change',event=>{
      level=Number(event.target.value);renderPath('#talentPlannerLevel');
    });
    result.querySelectorAll('[data-plan-tree]').forEach(button=>button.addEventListener('click',()=>{
      treeId=Number(button.dataset.planTree);nodeId=null;renderPath('[data-plan-tree="'+treeId+'"]');
    }));
    result.querySelectorAll('[data-talent-node]').forEach(button=>button.addEventListener('click',()=>{
      nodeId=Number(button.dataset.talentNode);renderPath('[data-talent-node="'+nodeId+'"]');
    }));
    result.querySelector('[data-plan-remember]')?.addEventListener('click',remember);
    if(focus)result.querySelector(focus)?.focus({preventScroll:true});
  }
  function render(focus){
    const disabled=busy?' disabled':'';
    root.innerHTML='<form class="talent-planner-card">'+
      '<label class="talent-planner-field" for="talentPlannerCharacter">Charakter<select id="talentPlannerCharacter"><option value="">Charakter wählen</option>'+
      displayList('alphabetical',characters,c=>'<option value="'+esc(c.slug)+'"'+(c.slug===character?' selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label>'+
      (binding?'<p><strong>Gemerkter Plan · Version '+esc(binding.version)+'</strong> · '+esc(profileLabel({...binding.profile,name:profiles.find(value=>matches(value,binding.profile))?.name||'gemerkte Spezialisierung'}))+' · Talentiert Rang '+esc(binding.rank)+'</p>':
        profiles.length?'<label class="talent-planner-field" for="talentPlannerProfile">Spielprofil und Spezialisierung<select id="talentPlannerProfile"'+disabled+'><option value="">Profil wählen</option>'+
        displayList('fixedControls',profiles,value=>'<option value="'+profiles.indexOf(value)+'"'+(matches(value,profile)?' selected':'')+'>'+esc(profileLabel(value))+'</option>').join('')+'</select></label>':'')+
      (profile&&!binding?'<label class="talent-planner-field" for="talentPlannerLegacy">Vermächtnisrang „Talentiert“<select id="talentPlannerLegacy"'+disabled+'><option value="">Rang im Spiel nachsehen</option>'+
        displayList('fixedControls',[0,1,2,3,4,5],value=>'<option value="'+value+'"'+(rank===String(value)?' selected':'')+'>Rang '+value+'</option>').join('')+
        '</select></label>':'')+
      (profile?'<button type="submit" class="talent-planner-action"'+disabled+'>'+(binding?'Gemerkten Plan prüfen':'Rang bestätigen und Plan prüfen')+'</button>':'')+
      (binding?'<button type="button" class="talent-planner-action" data-plan-forget'+disabled+'>Bindung lösen</button>':'')+
      '<p id="talentPlannerMessage" role="status" tabindex="-1">'+esc(busy?'Daten werden geprüft …':message)+'</p></form>'+
      (plan?'<section class="talent-planner-card" data-plan-result></section>':'');
    root.querySelector('form').addEventListener('submit',event=>{event.preventDefault();resolve()});
    root.querySelector('#talentPlannerCharacter').addEventListener('change',event=>selectCharacter(event.target.value,{focus:true}));
    root.querySelector('#talentPlannerProfile')?.addEventListener('change',event=>{
      profile=profiles[event.target.value]??null;
      message='';
      clearPlan();
      render('#talentPlannerProfile');
    });
    root.querySelector('#talentPlannerLegacy')?.addEventListener('change',event=>{
      rank=event.target.value;
      message='';
      clearPlan();
      render('#talentPlannerLegacy');
    });
    root.querySelector('[data-plan-forget]')?.addEventListener('click',forget);
    renderPath();
    if(focus)root.querySelector(focus)?.focus();
  }
  return {show(roster,version){
    const changed=version!==rosterVersion;
    rosterVersion=version;
    characters=roster;
    if(character&&!characters.some(c=>c.slug===character)){selectCharacter('');return}
    if(character&&changed){selectCharacter(character,{keepSelection:true});return}
    render();
  }};
}
