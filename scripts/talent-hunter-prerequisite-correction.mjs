// Own, exact-source correction; the raw catalog and revision are never rewritten.
import {talentPlanEvidenceDigest} from './talent-catalog-proof.mjs';
export const HUNTER_CORRECTION_REVISION='hunter-intimidation-swiftness-71139-v1';
export const HUNTER_CORRECTION_REVIEW_DIGEST='6a103625fa5ff805d40ea0b81a080923af6e5e4c739e10220bddcdd2d3904b34';
const source='9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b',catalog='2fb7fcb0bdd7aeed67de0e09cf62a46c1803be51e7ea089ae3e79107f4d63119',hotfix='409f97269c59bb22c7ba4f8fc2c0bd68cb8d1b4898585883c6ffc598ca0af78d',build='1.60.1.71139';
const allocations=Object.freeze({"hunter-beast-mastery-leveling":"ae45116e0a7b2ea4758a3753aef83b571a12151922fdc79fb513e63ca7febfc7","hunter-beast-mastery-dungeons":"6e72eb05897c7f0041068af436c9fb716bd8529652c88684431a6d733af469dc","hunter-beast-mastery-pvp":"d015b4a0f728ccdc9d5629c9b828af858e418efb8593e78abf0506e805bbe135"});
const exact=(actual,ids)=>Array.isArray(actual)&&actual.length===ids.length&&ids.every(id=>actual.some(p=>p.id===id&&p.rank===1&&p.conditionKnown===true));
export function correctHunterPlanningClass(plan,master,rules){
 const request=rules?.prerequisiteCorrection,klass=master?.classes?.[3];
 if(!request||plan?.classId!==3||plan.treeId!==11372||plan.version!==1||rules.classId!==3||rules.legacyTalentedRank!==0||
    request.revision!==HUNTER_CORRECTION_REVISION||request.reviewDigest!==HUNTER_CORRECTION_REVIEW_DIGEST||
    request.allocationDigest!==allocations[plan.id]||request.allocationDigest!==talentPlanEvidenceDigest(plan)||
    rules.sourceRevision!==source||master.sourceRevision!==source||rules.catalogRevision!==catalog||
    master.classMechanicsRevisions?.[3]!==catalog||rules.clientBuild!==build||rules.hotfixRevision!==hotfix)return null;
 const tree=klass?.trees.find(t=>t.id===11372),nodes=new Map((tree?.talents??[]).map(t=>[t.id,t]));
 const intimidation=nodes.get(104964),wrath=nodes.get(104961),swiftness=nodes.get(104970);
 if(intimidation?.spellId!==19577||intimidation.row!==4||intimidation.requiredPoints!==20||intimidation.maxRank!==1||
    wrath?.spellId!==19574||wrath.row!==6||wrath.requiredPoints!==30||wrath.maxRank!==1||
    swiftness?.spellId!==19596||swiftness.row!==2||swiftness.maxRank!==1||
    !exact(intimidation.prerequisites,[104961,104970])||!exact(wrath.prerequisites,[104964])||!exact(swiftness.prerequisites,[]))return null;
 return {...klass,trees:klass.trees.map(t=>t.id!==11372?t:{...t,talents:t.talents.map(n=>n.id!==104964?n:{...n,prerequisites:n.prerequisites.filter(p=>p.id===104970)})})};
}
