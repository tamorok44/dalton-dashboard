import {correctTalentDisplay,DISPLAY_CORRECTION_SOURCE,DISPLAY_CORRECTION_CLASSES} from './talent-display-corrections.mjs';
import {unresolvedTalentText} from '../talent-text-quality.js';
// Preview-only audit uses the already shared master; no extra requests per node.
export function auditTalentLocalization(master){
 const classes=Object.keys(DISPLAY_CORRECTION_CLASSES).map(Number).map(classId=>{
   const raw=master?.classes?.[classId];
   if(!raw)return {classId,available:false};
   const c=correctTalentDisplay(raw,master);
   const nodes=c.trees.flatMap(t=>t.talents);
   const issues=[];
   for(const node of nodes){
     if(!node.name?.trim())issues.push({id:node.id,kind:'missing_name'});
     for(let i=0;i<node.maxRank;i++){
       const d=node.descriptions?.[i];
       if(typeof d!=='string'||!d.trim())issues.push({id:node.id,name:node.name,rank:i+1,kind:'missing_description'});
       else if(unresolvedTalentText(d))issues.push({id:node.id,name:node.name,rank:i+1,kind:'unresolved_placeholder'});
     }
   }
   return {classId,available:true,exactReview:master.sourceRevision===DISPLAY_CORRECTION_SOURCE&&master.classMechanicsRevisions?.[classId]===DISPLAY_CORRECTION_CLASSES[classId],trees:c.trees.map(t=>({id:t.id,name:t.name,talents:t.talents.length})),talents:nodes.length,ranks:nodes.reduce((s,n)=>s+n.maxRank,0),notices:nodes.filter(n=>n.reviewNotice).length,issues};
 });
 return {ok:true,kind:'preview_localization_audit',sourceRevision:master?.sourceRevision??null,checkedAt:master?.checkedAt??null,stale:master?.stale!==false,classes,summary:{availableClasses:classes.filter(c=>c.available).length,exactReviewedClasses:classes.filter(c=>c.exactReview).length,talents:classes.reduce((s,c)=>s+(c.talents??0),0),ranks:classes.reduce((s,c)=>s+(c.ranks??0),0),issues:classes.reduce((s,c)=>s+(c.issues?.length??0),0),notices:classes.reduce((s,c)=>s+(c.notices??0),0)}};
}
