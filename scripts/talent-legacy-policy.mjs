// Explicit common row gate evidence; no mutation of stored rank-zero plans.
export const LEGACY_GATE_POLICY=Object.freeze({"revision":"forever-talented-row-gates-71139-v1","clientBuild":"1.60.1.71139","hotfixRevision":"409f97269c59bb22c7ba4f8fc2c0bd68cb8d1b4898585883c6ffc598ca0af78d","sourceRevision":"9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b"});
export function matchesLegacyGatePolicy(rules){
 return rules?.legacyGatePolicy===LEGACY_GATE_POLICY.revision&&rules.clientBuild===LEGACY_GATE_POLICY.clientBuild&&rules.hotfixRevision===LEGACY_GATE_POLICY.hotfixRevision&&rules.sourceRevision===LEGACY_GATE_POLICY.sourceRevision&&Number.isInteger(rules.legacyTalentedRank)&&rules.legacyTalentedRank>=1&&rules.legacyTalentedRank<=5&&rules.pointSpendMode==='immediate'&&rules.gateMode==='earlier_rows';
}
