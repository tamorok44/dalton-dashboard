// Presentation-only diagnostics; raw source text and mechanical revisions remain untouched.
export function unresolvedTalentText(value){
 return typeof value==='string'&&(/\?|\$[A-Za-z0-9]|\{\d+\}|<\/?[A-Za-z][^>]*>/.test(value));
}
export function displayedTalentText(value){
 if(typeof value!=='string'||!value.trim())return 'Deutscher Originaltext derzeit nicht verfügbar.';
 if(unresolvedTalentText(value))return 'Der deutsche Quelltext enthält nicht aufgelöste Angaben. Eine verlässliche vollständige Effektbeschreibung ist derzeit nicht verfügbar.';
 return value;
}
