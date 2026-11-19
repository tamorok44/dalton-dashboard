import fs from 'node:fs/promises';
import { refreshCharacters } from './armory-core.mjs';
const file=new URL('../data/characters.json',import.meta.url);
const previous=JSON.parse(await fs.readFile(file,'utf8'));
const {data,success}=await refreshCharacters(previous.characters);
if(!success){console.error('Alle Abrufe fehlgeschlagen; Daten bleiben unverändert');process.exitCode=1}
else{await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');console.log('Profile aktualisiert: '+success+'/'+data.characters.length)}
