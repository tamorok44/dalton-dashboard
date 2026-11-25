import {profileKey} from './talent-plan-core.mjs';

const ranks=Object.freeze([0,1,2,3,4,5]);
const levels=['unresearched','research','blocked','structurally_validated','approved'];

export function deriveTalentCoverage(coverage,tracks,plans,validatedRanks){
  const cells=new Map();
  for(const [classId,trees] of Object.entries(coverage.classes)){
    for(const tree of trees)for(const goal of coverage.goals)for(const role of tree.roles){
      const cell={classId:Number(classId),treeId:tree.treeId,goal,role,status:'unresearched',profiles:[],
        ...(tree.roleEvidence?{roleEvidence:tree.roleEvidence}:{})};
      cells.set(JSON.stringify([cell.classId,cell.treeId,goal,role]),cell);
    }
  }
  const planIds=new Set(plans.map(plan=>plan.id));
  const subjects=[
    ...tracks.filter(track=>!planIds.has(track.id)).map(track=>({...track,profiles:[track]})),
    ...plans.filter(plan=>plan.status!=='retired')
  ];
  for(const subject of subjects)for(const profile of subject.profiles){
    const key=profileKey(profile);
    if(!key)throw Error('Invalid coverage profile '+subject.id);
    const cell=cells.get(JSON.stringify([profile.classId,profile.treeId,profile.goal,profile.role]));
    if(!cell)throw Error('Missing coverage cell '+subject.id);
    let item=cell.profiles.find(entry=>profileKey(entry)===key);
    if(!item){
      const {classId,treeId,goal,role,playStyle,priority}=profile;
      item={classId,treeId,goal,role,playStyle,priority,status:'unresearched',candidates:[]};
      cell.profiles.push(item);
    }
    const tested=validatedRanks.get(JSON.stringify([subject.id,subject.version]))??[];
    const approved=subject.status==='approved'?subject.supportedLegacyRanks:[];
    const blockers=subject.research?.unresolved??subject.openChecks??[];
    const status=approved.length?'approved':tested.length?'structurally_validated':subject.releaseBlocker?'blocked':'research';
    const blocked=ranks.filter(rank=>!approved.includes(rank));
    item.candidates.push({
      id:subject.id,version:subject.version??null,status,
      structurallyValidatedRanks:tested,approvedRanks:approved,
      ...(blocked.length?{blockedRanks:blocked,blockers:subject.releaseBlocker?[subject.releaseBlocker,...blockers]:
        blockers.length?blockers:['no_applicable_approved_rule_pack']}:{})
    });
    if(levels.indexOf(status)>levels.indexOf(item.status))item.status=status;
    if(levels.indexOf(status)>levels.indexOf(cell.status))cell.status=status;
  }
  return [...cells.values()];
}
