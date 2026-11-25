import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildTalentMaster} from './talent-tree-store.mjs';
import {talentRevisionDigest,talentSourcePairDigest,talentStructureDigest} from './talent-catalog-proof.mjs';
import {isTalentClientBuild} from './talent-rule-watch.mjs';

const [date,rawPath,localizedPath,independentPath]=process.argv.slice(2);
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&rawPath&&localizedPath&&independentPath,
  'Usage: node scripts/compare-mage-talent-sources.mjs YYYY-MM-DD classes.json classes-de.json mage.html');
const sha=value=>createHash('sha256').update(value).digest('hex');
const raw=readFileSync(rawPath),localized=readFileSync(localizedPath);
const independent=readFileSync(independentPath,'utf8');
const build=independent.match(/<small>build ([\d.]+)<\/small>/i)?.[1];
assert.ok(isTalentClientBuild(build),'Independent source has no verified build label');
const embedded=independent.match(/<script\s+type="application\/json"\s+data-tc-data>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(embedded,'Independent source is missing its talent data');
const secondary=JSON.parse(embedded);
assert.equal(secondary.cls,'mage');
const master=buildTalentMaster(JSON.parse(raw),JSON.parse(localized));
const primary=master.classes[8];
assert.ok(primary,'Primary source pair did not normalize Mage');

const slugIds={arcane:11582,fire:11594,frost:11601};
const sortNodes=nodes=>nodes.sort((a,b)=>a.id-b.id);
const sortEdges=edges=>edges.sort((a,b)=>a.id-b.id||a.rank-b.rank);
const primaryTrees=primary.trees.map(tree=>({id:tree.id,talents:sortNodes(tree.talents.map(node=>{
  assert.ok(node.prerequisites.every(pre=>pre.conditionKnown),'Primary edge still requires review');
  return {id:node.id,row:node.row,column:node.column,maxRank:node.maxRank,requiredPoints:node.requiredPoints,
    prerequisites:sortEdges(node.prerequisites.map(({id,rank})=>({id,rank})))};
}))}));
const secondaryTrees=secondary.trees.map(tree=>({id:slugIds[tree.slug],talents:sortNodes(tree.talents.map(node=>({
  id:node.id,row:node.row,column:node.col,maxRank:node.maxRank,requiredPoints:node.points,
  prerequisites:sortEdges(node.req.map(({talent,rank})=>({id:talent,rank})))
})))}));
assert.deepEqual(secondaryTrees,primaryTrees,'Mage tree structure differs across sources');

console.log(JSON.stringify({
  schemaVersion:1,kind:'mage_talent_source_comparison',date,build,
  talentCount:primaryTrees.flatMap(tree=>tree.talents).length,
  primary:{
    rawUrl:'https://foreverdb.net/data/classes.json',
    localizedUrl:'https://foreverdb.net/data/l10n/de/classes.json',
    rawSha256:sha(raw),localizedSha256:sha(localized),
    sourceRevision:talentSourcePairDigest(sha(raw),sha(localized)),
    catalogRevision:master.classMechanicsRevisions[8],
    normalizedSha256:talentRevisionDigest(primaryTrees)
  },
  independent:{
    url:'https://theforeverera.com/en/talents/mage/',
    captureSha256:sha(independent),normalizedSha256:talentRevisionDigest(secondaryTrees)
  },
  comparisonDigest:talentStructureDigest({trees:primaryTrees})
},null,2));
