const labels={
  leveling:'Leveln und Questen',dungeons:'Dungeons',pvp:'PvP',
  damage:'Schaden austeilen',tank:'Tanken',heal:'Heilen',
  mixed:'Mal alleine, mal gemeinsam',solo:'Meist alleine',group:'Meist gemeinsam',balanced:'Ausgewogen'
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
const profileLabel=p=>[p.goal,p.role,p.playStyle].map(value=>labels[value]||value).join(' · ')+' · '+p.name;
const treeKeys=['treeId','goal','role','playStyle','priority'];
const guideFields=[
  ['goal','Was möchtest du hauptsächlich machen?'],
  ['role','Welche Aufgabe möchtest du in der Gruppe übernehmen?'],
  ['playStyle','Bist du meistens alleine oder gemeinsam unterwegs?']
];
const allGoals=['leveling','dungeons','pvp'];
const pathKey=p=>JSON.stringify([p.planId??null,p.version??null,p.treeId,
  ...(p.planId?[]:[p.role,p.playStyle,p.priority])]);
const pathSet=profiles=>JSON.stringify([...new Set(profiles.map(pathKey))].sort());
const preferredValues={role:['damage','tank','heal'],playStyle:['mixed','solo','group']};

function groupedOptions(profiles,key){
  const groups=new Map();
  for(const p of profiles){
    const value=p[key];
    if(!groups.has(value))groups.set(value,[]);
    groups.get(value).push(p);
  }
  const order=preferredValues[key]??[];
  return [...groups.entries()].sort(([a],[b])=>{
    const rank=v=>order.includes(v)?order.indexOf(v):order.length;
    return rank(a)-rank(b)||String(a).localeCompare(String(b));
  });
}

// Ask only about choices that distinguish approved paths. Editorially balanced
// profiles are the novice-facing default; priorities remain library metadata.
// Specialized priorities are not silently substituted for this default.
export function talentGuideOptions(profiles,selection={}){
  const balanced=profiles.filter(p=>p.priority==='balanced');
  const goalGroups=allGoals.map(goal=>balanced.filter(p=>p.goal===goal));
  const identicalGoals=goalGroups.every(group=>group.length>0)&&new Set(goalGroups.map(pathSet)).size===1;
  const goal=allGoals.includes(selection.goal)?selection.goal:identicalGoals?allGoals[0]:'';
  const fields=identicalGoals?[]:[{key:'goal',label:guideFields[0][1],values:allGoals,chosen:goal}];
  const inferred=identicalGoals?{goal}:{};
  if(!goal)return {fields,profiles:[],complete:false,inferred,unavailable:false};
  let remaining=balanced.filter(p=>p.goal===goal);
  if(!remaining.length)return {fields,profiles:[],complete:false,inferred,unavailable:true};
  for(const [key,label] of guideFields.slice(1)){
    const groups=groupedOptions(remaining,key);
    if(!groups.length)return {fields,profiles:[],complete:false,inferred,unavailable:true};
    const values=groups.map(([value])=>value);
    const distinctPaths=new Set(groups.map(([,items])=>pathSet(items)));
    if(distinctPaths.size===1){
      // A single answer, or several answers that lead to exactly the same
      // plan versions, does not justify a separate question.
      const chosen=values.includes(selection[key])?selection[key]:values[0];
      inferred[key]=chosen;
      remaining=groups.find(([value])=>value===chosen)[1];
      continue;
    }
    const chosen=values.includes(selection[key])?selection[key]:'';
    fields.push({key,label,values,chosen});
    if(!chosen)return {fields,profiles:[],complete:false,inferred,unavailable:false};
    remaining=groups.find(([value])=>value===chosen)[1];
  }
  const trees=new Map();
  for(const p of remaining){
    if(!trees.has(p.treeId))trees.set(p.treeId,[]);
    trees.get(p.treeId).push(p);
  }
  // An ambiguous specialization is not a valid single recommendation.
  // Never pick the first distinct path simply because of iteration order.
  const choices=[...trees.values()].filter(items=>new Set(items.map(pathKey)).size===1).map(items=>items[0]);
  return {fields,profiles:choices,complete:choices.length>0,inferred,unavailable:!choices.length};
}
// Bind a comparative editorial decision to the exact available profiles and
// versions. Adding or replacing a plan invalidates the comparative default.
export const specializationOptionKey=p=>JSON.stringify([p.classId,p.treeId,p.goal,p.role,p.playStyle,p.priority,p.planId,p.version]);
export const specializationOptionSet=profiles=>JSON.stringify(profiles.map(specializationOptionKey).sort());

export function specializationRecommendation(choices,advice=[]){
  if(choices.length===1)return {
    profile:choices[0],kind:'available',
    reason:choices[0].summary||choices[0].recommendation||''
  };
  if(!choices.length)return null;
  const optionSet=specializationOptionSet(choices);
  const reviewed=advice.filter(entry=>Array.isArray(entry.options)&&
    specializationOptionSet(entry.options)===optionSet&&
    typeof entry.reason==='string'&&entry.reason.trim()&&
    Array.isArray(entry.evidenceIds)&&entry.evidenceIds.length&&entry.preferred);
  if(reviewed.length!==1)return null;
  const profile=choices.find(p=>specializationOptionKey(p)===specializationOptionKey(reviewed[0].preferred));
  return profile?{profile,kind:'comparative',reason:reviewed[0].reason}:null;
}

export function specializationSelection(guide,selection={},advice=[]){
  const recommended=specializationRecommendation(guide.profiles,advice);
  const treeId=Number.isSafeInteger(selection.treeId)&&selection.treeId>0
    ?selection.treeId:recommended?.profile.treeId??null;
  return {treeId,profile:guide.profiles.find(p=>p.treeId===treeId)??null,recommended};
}

export function planIsCurrent(plan,now=Date.now()){
  return Boolean(plan&&Date.parse(plan.evidence?.validUntil)>now);
}

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

// Compare the allocation at the actual character level, not the selected
// preview level or the count of points spent. A missing planned rank may
// simply be unspent; this is never a respec or available-point instruction.
export function talentAllocationDifference(history,actual,level){
  if(!actual?.verified||!(actual.ranks instanceof Map)||!Number.isInteger(level)||level<1)return null;
  if([...actual.ranks].some(([id,rank])=>!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(rank)||rank<=0))return null;
  const target=new Map(history.filter(step=>step.level<=level).map(step=>[step.talentId,step.rank]));
  const rows=[];
  for(const id of new Set([...target.keys(),...actual.ranks.keys()])){
    const planned=target.get(id)??0,learned=actual.ranks.get(id)??0;
    if(planned!==learned)rows.push({talentId:id,planned,learned});
  }
  return {level,plannedPoints:[...target.values()].reduce((sum,n)=>sum+n,0),
    learnedPoints:[...actual.ranks.values()].reduce((sum,n)=>sum+n,0),rows};
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
  let characters=[],rosterVersion,character='',identity=null,profiles=[],profile=null,rank='',binding=null,selection={},specializations=[],advice=[];
  let busy=false,message='',plan=null,level=10,treeId=null,nodeId=null,requestId=0,expiry=null;
  const warn=(code,evidence)=>{
    const changes=evidence?.review?.reasons??[];
    if(changes.some(item=>item.code==='client_build_changed'||item.code==='hotfix_changed')){
      return 'WoW Forever wurde aktualisiert. Dieser Talentplan wird für den neuen Spielstand erneut geprüft. Deine Auswahl bleibt erhalten.';
    }
    return blocking[code]||blocking.source_unavailable;
  };
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
    const previous=keepSelection?{identity,profile,rank,selection}:null;
    clearPlan();
    character=value;
    identity=null;
    binding=null;
    rank='';
    profiles=[];
    specializations=[];
    advice=[];
    profile=null;
    selection={};
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
        specializations=result.specializations??[];
        advice=result.specializationAdvice??[];
        identity=result.identity;
        binding=identity?storageBinding(storage,identity):null;
        const selected=previous&&previous.identity===identity?profiles.find(option=>matches(option,previous.profile)):null;
        selection=binding?.profile??(previous&&previous.identity===identity?previous.selection:{});
        const guide=talentGuideOptions(profiles,selection);
        profile=binding?.profile??specializationSelection(guide,selection,advice).profile;
        rank=binding?.rank?.toString()??(selected&&matches(selected,profile)?previous.rank:'');
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
      if(!result.ok){message=warn(result.code,result.evidence);return}
      plan=result;
      treeId=profile.treeId;
      nodeId=null;
      level=Math.min(60,Math.max(1,result.character.level||result.history[0].level));
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
  function ensureCurrent(){
    if(!plan||planIsCurrent(plan))return true;
    clearPlan();
    message=warn('unverified_current_catalog');
    return false;
  }
  function remember(){
    if(!ensureCurrent()){render('#talentPlannerMessage');return}
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
    if(!ensureCurrent()){render();return}
    const result=root.querySelector('[data-plan-result]');
    if(!plan||!result)return;
    const tree=plan.klass.trees.find(value=>value.id===treeId);
    const names=new Map(plan.klass.trees.flatMap(value=>value.talents.map(node=>[node.id,node.name])));
    const personalFresh=plan.character.talentDetailsFresh===true&&Date.parse(plan.character.personalValidUntil)>Date.now();
    const actual=personalTalentRanks({...plan.character,talentDetailsVerified:personalFresh&&plan.character.talentDetailsVerified},plan.klass);
    const progress=compareTalentProgress(plan.history,actual,plan.character.level);
    const difference=talentAllocationDifference(plan.history,actual,plan.character.level);
    const differenceHtml=difference?.rows.length
      ?'<details class="talent-point-note"><summary>Abgleich auf Charakterstufe '+esc(difference.level)+' ('+esc(difference.rows.length)+' Talente)</summary>'+
        '<p>Geplant: '+esc(difference.plannedPoints)+' Punkte · Erlernt: '+esc(difference.learnedPoints)+' Punkte</p>'+
        '<ul>'+difference.rows.map(row=>'<li>'+esc(names.get(row.talentId)??'Unbekanntes Talent')+
          ': erlernt '+esc(row.learned)+' / geplant '+esc(row.planned)+'</li>').join('')+'</ul>'+
        '<p>Fehlende Ränge können auch unverteilte Punkte sein. Dies ist keine Empfehlung zum Umskillen.</p></details>':'';
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
    const rationale=plan.recommendation??(profiles.find(value=>matches(value,plan.profile)))?.recommendation;
    result.innerHTML=
      '<h3 id="talentPlannerPath" tabindex="-1">'+esc(plan.klass.trees.find(t=>t.id===plan.profile.treeId).name)+' · Planversion '+esc(plan.version)+'</h3>'+
      (rationale?'<p>'+esc(rationale)+'</p>':'')+
      '<p><strong>Vermächtnisrang „Talentiert“ '+esc(plan.legacyRank.rank)+'</strong> · von dir im Spiel bestätigt</p>'+
      '<p><strong>Ist-Abgleich</strong> '+esc(progressText)+'</p>'+
      (!personalFresh?'<p class="talent-point-note">Der persönliche Spielstand ist nicht ausreichend aktuell. Aktualisiere die Charakterdaten über die vorhandene Funktion.</p>':'')+
      differenceHtml+
      '<p><strong>Nächster Punkt</strong> '+esc(nextText)+'</p>'+
      (next?'<p class="talent-point-note">Der Abgleich bestätigt keine unverteilten Talentpunkte.</p>':'')+
      '<label class="talent-planner-field" for="talentPlannerLevel">Geplante Talente auf dieser Stufe<select id="talentPlannerLevel">'+
      displayList('fixedControls',Array.from({length:60},(_,index)=>index+1),
        value=>'<option value="'+value+'"'+(value===level?' selected':'')+'>'+value+'</option>').join('')+'</select></label>'+
      '<div class="talent-tree-switch" dir="ltr" role="group" aria-label="Talentbäume">'+displayList('fixedControls',plan.klass.trees,value=>
        '<button type="button" class="talent-tree-option'+(value.id===treeId?' is-active':'')+'" data-plan-tree="'+value.id+'" aria-pressed="'+(value.id===treeId)+'">'+esc(value.name)+'</button>'
      ).join('')+'</div>'+
      '<div class="talent-tree talent-visual-tree">'+talentGraph(tree,planned,level,false,nodeId,'planner')+'</div>'+
      (pick?talentNodeDetail(pick,tree,planned,level,false,{planned:true}):'')+
      '<h4>Chronologischer Talentpfad bis Stufe '+esc(level)+'</h4>'+
      '<ol class="talent-planner-steps">'+displayList('fixedControls',shown,step=>'<li>Stufe '+step.level+' · '+esc(names.get(step.talentId))+' (Rang '+step.rank+')</li>').join('')+'</ol>'+
      '<p class="workshop-credit">Eigenständiger Dalton-Talentplaner: charakterbezogene Empfehlungen und Soll-Ist-Abgleich. Talentstruktur und deutsche Texte: <a href="https://foreverdb.net" target="_blank" rel="noopener noreferrer">ForeverDB.net</a></p>'+
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
  function renderGuide(disabled){
    if(!character||binding||busy||(!profiles.length&&!specializations.length))return '';
    const guide=talentGuideOptions(profiles,selection);
    const fieldHtml=guide.fields.map(field=>'<label class="talent-planner-field" for="talentGuide-'+field.key+'">'+esc(field.label)+'<select id="talentGuide-'+field.key+'" data-guide-field="'+field.key+'"'+disabled+'><option value="">Bitte wählen</option>'+field.values.map(value=>'<option value="'+esc(value)+'"'+(field.chosen===value?' selected':'')+'>'+esc(labels[value]||value)+'</option>').join('')+'</select></label>').join('');
    if(!guide.profiles.length&&!guide.unavailable)return fieldHtml;
    const {treeId,recommended}=specializationSelection(guide,selection,advice);
    const options=new Map(specializations.map(p=>[p.treeId,p.name]));
    for(const p of guide.profiles)options.set(p.treeId,p.name);
    const context=profile?[profile.role,profile.playStyle].map(value=>labels[value]||value).join(' · '):'';
    const explanation=recommended
      ?'<p><strong>Unsere Empfehlung: '+esc(recommended.profile.name)+'</strong></p>'+
        (recommended.reason?'<p>'+esc(recommended.reason)+'</p>':'')+
        (recommended.kind==='available'?'<p class="talent-point-note">Derzeit einziger fachlich freigegebener Plan für diese Auswahl; kein abschließender Vergleich aller Spezialisierungen.</p>':'')
      :guide.unavailable?'<p>Für diese Ausrichtung ist noch kein fachlich freigegebener Talentplan verfügbar.</p>'
      :'<p class="talent-point-note">Eine vergleichende Empfehlung ist für diese Auswahl noch nicht fachlich bestätigt.</p>';
    const specialization=options.size
      ?'<label class="talent-planner-field" for="talentPlannerProfile">Welche Spezialisierung möchtest du spielen?<select id="talentPlannerProfile"'+disabled+'><option value="">Spezialisierung wählen</option>'+[...options].map(([id,name])=>{
        const available=guide.profiles.some(p=>p.treeId===id);
        const label=name+(recommended?.profile.treeId===id?' (empfohlen)':available?'':' (Plan noch nicht verfügbar)');
        return '<option value="'+esc(id)+'"'+(treeId===id?' selected':'')+'>'+esc(label)+'</option>';
      }).join('')+'</select></label>':'';
    const missing=treeId&&!profile?'<p role="status">Für deine gewählte Spezialisierung steht bei dieser Ausrichtung noch kein fachlich freigegebener Plan bereit. Wir ersetzen deine Wahl nicht automatisch.</p>':'';
    return fieldHtml+explanation+specialization+missing+(guide.profiles.length?'<p class="talent-point-note">Die Empfehlung beruht auf redaktionell geprüften Pfaden. Die Gültigkeit für den aktuellen Spielstand wird beim Erstellen des Plans geprüft.</p>':'')+(context?'<p class="talent-point-note">Der Plan ist ausgelegt auf: '+esc(context)+'.</p>':'');
  }
  function render(focus){
    const disabled=busy?' disabled':'';
    root.innerHTML='<form class="talent-planner-card">'+
      '<label class="talent-planner-field" for="talentPlannerCharacter">Für welchen Charakter möchtest du planen?<select id="talentPlannerCharacter"><option value="">Charakter wählen</option>'+
      displayList('alphabetical',characters,c=>'<option value="'+esc(c.slug)+'"'+(c.slug===character?' selected':'')+'>'+esc(c.name+(c.class?' · '+c.class:''))+'</option>').join('')+'</select></label>'+
      (binding?'<p><strong>Gemerkter Plan · Version '+esc(binding.version)+'</strong> · '+esc(profileLabel({...binding.profile,name:profiles.find(value=>matches(value,binding.profile))?.name||'gemerkte Spezialisierung'}))+' · Talentiert Rang '+esc(binding.rank)+'</p>':
        renderGuide(disabled))+
      (binding?'<p class="talent-point-note">Nur in diesem Browser gespeichert; keine geräteübergreifende Synchronisierung.</p>':'')+
      (profile&&!binding?'<p class="talent-point-note">Für die korrekte Anzahl der Talentpunkte benötigen wir noch eine Angabe aus dem Spiel.</p><label class="talent-planner-field" for="talentPlannerLegacy">Vermächtnisrang „Talentiert“<select id="talentPlannerLegacy"'+disabled+'><option value="">Rang im Spiel nachsehen</option>'+
        displayList('fixedControls',[0,1,2,3,4,5],value=>'<option value="'+value+'"'+(rank===String(value)?' selected':'')+'>Rang '+value+'</option>').join('')+
        '</select></label>':'')+
      (profile?'<button type="submit" class="talent-planner-action"'+disabled+'>'+(binding?'Gemerkten Plan prüfen':'Rang bestätigen und Plan prüfen')+'</button>':'')+
      (binding?'<button type="button" class="talent-planner-action" data-plan-forget'+disabled+'>Bindung lösen</button>':'')+
      '<p id="talentPlannerMessage" role="status" tabindex="-1">'+esc(busy?'Daten werden geprüft …':message)+'</p></form>'+
      (plan?'<section class="talent-planner-card" data-plan-result></section>':'');
    root.querySelector('form').addEventListener('submit',event=>{event.preventDefault();resolve()});
    root.querySelector('#talentPlannerCharacter').addEventListener('change',event=>selectCharacter(event.target.value,{focus:true}));
    root.querySelectorAll('[data-guide-field]').forEach(control=>control.addEventListener('change',event=>{
      const key=control.dataset.guideField;
      const index=guideFields.findIndex(([field])=>field===key);
      for(const [field] of guideFields.slice(index+1))delete selection[field];
      delete selection.treeId;
      selection[key]=event.target.value;
      const guide=talentGuideOptions(profiles,selection);
      profile=specializationSelection(guide,selection,advice).profile;
      rank='';message='';clearPlan();render('#talentGuide-'+key);
    }));
    root.querySelector('#talentPlannerProfile')?.addEventListener('change',event=>{
      const treeId=Number(event.target.value);
      if(Number.isSafeInteger(treeId)&&treeId>0)selection.treeId=treeId;
      else delete selection.treeId;
      profile=specializationSelection(talentGuideOptions(profiles,selection),selection,advice).profile;
      rank='';
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
  const recheck=()=>{if(!ensureCurrent())render();else if(plan&&root.querySelector('[data-plan-result]'))renderPath();};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)recheck()});
  window.addEventListener('focus',recheck);
  window.addEventListener('pageshow',recheck);
  return {show(roster,version){
    const changed=version!==rosterVersion;
    rosterVersion=version;
    characters=roster;
    if(character&&!characters.some(c=>c.slug===character)){selectCharacter('');return}
    if(character&&changed){selectCharacter(character,{keepSelection:true});return}
    render();
  }};
}
