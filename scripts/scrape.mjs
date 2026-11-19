import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const file = new URL('../data/characters.json', import.meta.url);
const previous = JSON.parse(await fs.readFile(file, 'utf8'));
const professionNames = {
  alchemy: 'Alchemie', herbalism: 'Kräuterkunde', mining: 'Bergbau',
  skinning: 'Kürschnerei', leatherworking: 'Lederverarbeitung',
  blacksmithing: 'Schmiedekunst', engineering: 'Ingenieurskunst',
  tailoring: 'Schneiderei', enchanting: 'Verzauberkunst',
  cooking: 'Kochkunst', fishing: 'Angeln', 'first-aid': 'Erste Hilfe',
  firstaid: 'Erste Hilfe'
};
const namesInText = {
  Alchemie: 'Alchemie', Alchimie: 'Alchemie', Alchemy: 'Alchemie',
  Kräuterkunde: 'Kräuterkunde', Herbalism: 'Kräuterkunde',
  Bergbau: 'Bergbau', Mining: 'Bergbau',
  Kürschnerei: 'Kürschnerei', Skinning: 'Kürschnerei',
  Lederverarbeitung: 'Lederverarbeitung', Leatherworking: 'Lederverarbeitung',
  Schmiedekunst: 'Schmiedekunst', Blacksmithing: 'Schmiedekunst',
  Ingenieurskunst: 'Ingenieurskunst', Engineering: 'Ingenieurskunst',
  Schneiderei: 'Schneiderei', Tailoring: 'Schneiderei',
  Verzauberkunst: 'Verzauberkunst', Enchanting: 'Verzauberkunst',
  Kochkunst: 'Kochkunst', Kochen: 'Kochkunst', Cooking: 'Kochkunst',
  Angeln: 'Angeln', Fishing: 'Angeln',
  'Erste Hilfe': 'Erste Hilfe', 'First Aid': 'Erste Hilfe'
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function clickTab(page, name) {
  const candidates = [
    page.getByRole('tab', { name: new RegExp('^' + name + '$', 'i') }),
    page.getByRole('button', { name: new RegExp('^' + name + '$', 'i') }),
    page.getByText(name, { exact: true })
  ];
  for (const candidate of candidates) {
    try {
      if (await candidate.count() && await candidate.first().isVisible()) {
        await candidate.first().click({ timeout: 5000 });
        await delay(600);
        return true;
      }
    } catch { /* try another tab locator */ }
  }
  return false;
}

function parseProfessionsFromText(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const name = namesInText[lines[i]];
    if (!name) continue;
    const nearby = lines.slice(i + 1, i + 5);
    const skill = nearby.map(s => s.match(/^(\d+)\s*\/\s*(\d+)$/)).find(Boolean);
    if (skill) entries.push({ name, current: Number(skill[1]), max: Number(skill[2]) });
  }
  return entries;
}

async function extractProfessions(page) {
  await clickTab(page, 'Berufe');
  const text = await page.locator('body').innerText();
  if (!/Hauptberufe|Main Professions|Professions/i.test(text)) {
    throw new Error('Berufe-Registerkarte nicht geladen');
  }
  const byLink = await page.locator('a[href*="/professions/"]').evaluateAll(links => {
    const found = [];
    for (const a of links) {
      const slug = (a.getAttribute('href') || '').match(/\/professions\/([a-z-]+)\/?/)?.[1];
      if (!slug) continue;
      let parent = a.parentElement;
      while (parent && parent !== document.body) {
        const t = parent.innerText || '';
        if (t.length < 420 && /\d+\s*\/\s*\d+/.test(t)) {
          const m = t.match(/(\d+)\s*\/\s*(\d+)/);
          if (m) found.push({ slug, current: Number(m[1]), max: Number(m[2]) });
          break;
        }
        parent = parent.parentElement;
      }
    }
    return found;
  });
  const candidates = [
    ...byLink.filter(p => professionNames[p.slug]).map(p => ({ name: professionNames[p.slug], current: p.current, max: p.max })),
    ...parseProfessionsFromText(text)
  ];
  const unique = new Map();
  for (const p of candidates) {
    if (p.current >= 0 && p.max > 0 && p.current <= p.max && !unique.has(p.name)) unique.set(p.name, p);
  }
  return [...unique.values()];
}


async function extractEquipment(page) {
  await clickTab(page, 'Ausrüstung');
  await page.locator('div.a-slot, .equipment-slot').first().waitFor({state:'attached',timeout:10000});
  const items = await page.locator('div.a-slot, .equipment-slot').evaluateAll(slots => {
    const result = [];
    for (const slot of slots) {
      const link = slot.querySelector('a.item-link, a[href*="/items/"]');
      if (!link) continue;
      const item = (slot.querySelector('.item-name')?.textContent || link.getAttribute('title') || link.getAttribute('data-tooltip') || link.textContent || '').trim();
      const slotName = (slot.querySelector('.item-slot, .slot-label')?.textContent || slot.getAttribute('data-slot') || '').trim();
      const levelText = (slot.querySelector('.item-level')?.textContent || '').trim();
      const image = slot.querySelector('img');
      const icon = image?.getAttribute('src') || image?.getAttribute('data-src') || '';
      const id = link.getAttribute('data-item-id') || link.getAttribute('href')?.match(/\/items\/(\d+)/)?.[1] || '';
      if (!item || /^(leer|empty)$/i.test(item) || !slotName) continue;
      result.push({slot:slotName,item,level:Number(levelText.match(/\d+/)?.[0]||0)||undefined,icon:icon ? new URL(icon,location.origin).href : (id ? new URL('/icons/'+id+'.webp',location.origin).href : '')});
    }
    return result;
  });
  const unique = new Map(items.map(i => [i.slot,i]));
  if (!unique.size) throw new Error('Keine Ausrüstung aus ForeverSpec auslesbar');
  return [...unique.values()];
}

const browser = await chromium.launch({ headless: true });
const results = [];
let successful = 0;
try {
  for (const character of previous.characters) {
    const page = await browser.newPage({ locale: 'de-DE' });
    try {
      await page.goto(character.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.getByText(character.name, { exact: false }).first().waitFor({ state: 'visible', timeout: 25000 });

      if (character.slug === 'chucky-dalton') {
        const images = await page.locator('img').evaluateAll(els => els.map(e => ({ src: e.getAttribute('src'), currentSrc: e.currentSrc, loaded: e.complete && e.naturalWidth > 0 })).filter(e => (e.src || e.currentSrc || '').includes('render.worldofwarcraft.com')));
        console.log('DIAG images', JSON.stringify(images).slice(0,2200));
        await clickTab(page, 'Ausrüstung');
        console.log('DIAG equipment', JSON.stringify(await page.locator('div.a-slot').allInnerTexts()).slice(0,2600));
        console.log('DIAG equipment html', (await page.locator('div.a-slot').first().evaluate(e => e.outerHTML)).slice(0,1500));
        await clickTab(page, 'Talente');
        console.log('DIAG talents', (await page.locator('body').innerText()).slice(-4000));
        try {
          const official = await page.request.get('https://worldofwarcraft.blizzard.com/en-gb/forever/eu/armory/character/' + character.slug, { timeout: 15000 });
          console.log('DIAG official status', official.status());
          if (official.ok()) {
            const html = await official.text();
            const match = html.match(/var characterProfileInitialState = (\{.*?\});\s*<\/script>/s);
            if (match) {
              const state = JSON.parse(match[1]);
              console.log('DIAG state keys', Object.keys(state));
              console.log('DIAG character keys', Object.keys(state.character || {}));
              console.log('DIAG stats groups', JSON.stringify(state.character?.stats?.basic?.groups?.map(g=>({name:g.name,stats:g.stats?.map(v=>({enum:v.enum,slug:v.slug,value:v.value}))}))).slice(0,8000));
              for (const key of ['gear','specs','stats','media','professions']) {
                if (state.character?.[key]) console.log('DIAG state.' + key, JSON.stringify(state.character[key]).slice(0,key==='gear'||key==='specs'?8500:2200));
              }
            } else console.log('DIAG no embedded JSON, HTML length', html.length);
          }
        } catch(e) { console.log('DIAG official request error', e.message); }
      }

      const headerText = await page.locator('body').innerText();
      if (!headerText.toLowerCase().includes(character.name.toLowerCase())) throw new Error('Charaktername nicht gefunden');
      const levelMatch = headerText.match(/\b(?:Stufe|Level)\s+(\d{1,2})\b/i);
      if (!levelMatch) throw new Error('Charakterlevel nicht gefunden');
      const level = Number(levelMatch[1]);
      if (level < 10 || level > 60) throw new Error('Unplausibles Level ' + level);

      const equipment = await extractEquipment(page);
      const professions = await extractProfessions(page);
      if (professions.length === 0) throw new Error('Keine Berufe auslesbar; vorhandene Daten bleiben erhalten');

      await clickTab(page, 'Talente');
      const talentText = await page.locator('body').innerText();
      const talents = /Noch keine Talentpunkte verteilt/i.test(talentText) ? 'noch keine verteilt' : character.talents;
      const canonicalName = name => name === 'Kochen' ? 'Kochkunst' : name === 'Alchimie' ? 'Alchemie' : name;
      const mergedProfessions = new Map((character.professions || []).map(p => [canonicalName(p.name), { ...p, name: canonicalName(p.name), unverified: true }]));
      for (const p of professions) mergedProfessions.set(p.name, { ...p, unverified: false });
      const result = {
        ...character,
        level,
        professions: [...mergedProfessions.values()],
        equipment,
        equipmentVerified: true,
        talents,
        scrapeOk: true,
        scrapedAt: new Date().toISOString(),
        scrapeError: undefined,
        dataStatus: 'auto'
      };
      results.push(result);
      successful++;
      console.log(character.name + ': Level ' + level + ', Berufe ' + professions.map(p => p.name + ' ' + p.current + '/' + p.max).join(', '));
    } catch (error) {
      results.push({ ...character, scrapeOk: false, scrapeError: String(error.message).slice(0, 180) });
      console.warn(character.name + ': ' + error.message + ' – letzter bestätigter Stand bleibt erhalten');
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
if (successful === 0) {
  console.error('Kein einziges Profil erfolgreich gelesen. Datei bleibt unverändert.');
  process.exitCode = 1;
} else {
  const result = { generatedAt: new Date().toISOString(), characters: results };
  await fs.writeFile(file, JSON.stringify(result, null, 2) + '\n');
  console.log('Erfolgreich aktualisiert: ' + successful + '/' + results.length);
}
