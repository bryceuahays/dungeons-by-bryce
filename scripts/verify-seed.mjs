// BRIEF section 8.4: after seeding, compare the database with the source.
// Every heading, card, list item, race, faction, class, and spell in source/ must exist
// in the database. This recounts from the source files directly (it does not trust
// seed/to-be-a-god.json) and prints the counts for the final report.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const read = (p) => fs.readFileSync(path.join(ROOT, 'source', p), 'utf8');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

const { data: campaign } = await db.from('campaigns').select('id').eq('slug', 'to-be-a-god').single();
const all = async (table, cols) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).eq('campaign_id', campaign.id).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};
const [content, rules, sessions, media, sections] = await Promise.all([
  all('content', 'section, kind, key, title, body, visibility'), all('rules', 'kind, key, data, phase'),
  all('sessions', 'number, title, summary, meta, content'), all('media', 'key, path, phase'), all('sections', 'slug, title'),
]);

// all the text the database holds, as plain text
const strings = [];
const collect = (v) => {
  if (typeof v === 'string') strings.push(norm(/[<&]/.test(v) ? cheerio.load(v).text() : v));
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === 'object') Object.values(v).forEach(collect);
};
content.forEach((r) => { collect(r.title); collect(r.body); });
sessions.forEach((s) => { collect(s.title); collect(s.summary); collect(s.meta); collect(s.content); });
sections.forEach((s) => collect(s.title));
const corpus = strings.join(' \n ');
const has = (t) => corpus.includes(norm(t));

let failed = 0;
const report = {};
function check(label, items) {
  const missing = items.filter((t) => t && !has(t));
  report[label] = `${items.length - missing.length} of ${items.length}`;
  if (missing.length) { failed += missing.length; console.log(`MISSING ${label}:`); missing.slice(0, 20).forEach((m) => console.log('   ' + m.slice(0, 110))); }
}

// ---- static HTML: headings, cards, list items, table rows, paragraphs
const SKIP = { 'player-guide/index.html': ['sheet', 'combat'], 'dm-hub/index.html': ['players'] }; // forms and tools the app replaces
for (const file of ['player-guide/index.html', 'dm-hub/index.html', 'session-negative-run-sheet/index.html']) {
  const $ = cheerio.load(read(file));
  $('template').each((_, t) => { $(t).replaceWith($(t).html()); });
  (SKIP[file] || []).forEach((id) => $('#' + id).remove());
  // Navigation text of the old host ("They open in a new browser tab", "Open the run sheet") is not campaign content.
  $('#sessions > p.lede, #sessions .sess p.kv').remove();
  // Removed at Bryce's request: the ticks now save to the database.
  $('p').filter((_, e) => norm($(e).text()) === 'Ticks are saved in this browser only.').remove();
  const scope = file.startsWith('session') ? $('.wrap, .bar .name') : $('section[role=tabpanel]');
  const texts = (sel) => scope.find(sel).map((_, e) => norm($(e).text())).get().filter(Boolean);
  const short = file.split('/')[0];
  check(`${short}: headings`, texts('h1, h2, h3, h4'));
  check(`${short}: cards`, scope.find('.plate, .panel').map((_, e) => norm($(e).find('h3').first().text() || $(e).text().slice(0, 60))).get());
  check(`${short}: list items`, texts('li'));
  check(`${short}: paragraphs`, texts('p'));
  check(`${short}: table rows`, texts('tr'));
  check(`${short}: secret blocks`, scope.find('.secret').map((_, e) => { const sb = $(e).children('.sb'); return norm((sb.length ? sb : $(e)).text()); }).get());
  check(`${short}: secret labels`, texts('.secret > .tag'));
}

// ---- JS constants
const scriptOf = (h) => h.slice(h.lastIndexOf('<script>') + 8, h.lastIndexOf('</script>'));
const grab = (js, name) => {
  const m = js.match(new RegExp('const ' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\n\\];'));
  return m ? vm.runInNewContext('[' + m[1] + ']') : null;
};
const hubJs = scriptOf(read('dm-hub/index.html')), guideJs = scriptOf(read('player-guide/index.html')), buildJs = scriptOf(read('character-builder/index.html'));
const hubRaces = grab(hubJs, 'RACES'), hubFactions = grab(hubJs, 'FACTIONS'), todo = grab(hubJs, 'TODO');
const guideRaces = grab(guideJs, 'RACES'), guideFactions = grab(guideJs, 'FACTIONS');
const leaves = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => leaves(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => leaves(x, out)); return out; };
check('dm-hub RACES: every text field', leaves(hubRaces));
check('player-guide RACES: every text field', leaves(guideRaces));
check('dm-hub FACTIONS: every text field', leaves(hubFactions));
check('player-guide FACTIONS: every text field', leaves(guideFactions));
check('dm-hub TODO items', todo);

const count = (label, got, want) => { report[label] = `${got} of ${want}`; if (got !== want) { failed++; console.log(`COUNT MISMATCH ${label}: database ${got}, source ${want}`); } };
count('races (lore)', content.filter((r) => r.kind === 'race').length, hubRaces.length);
count('factions', content.filter((r) => r.kind === 'faction').length, hubFactions.length);
count('races with DM notes', content.filter((r) => r.kind === 'race-dm').length, hubRaces.filter((r) => r.dm).length);
count('factions with DM moves', content.filter((r) => r.kind === 'faction-dm').length, hubFactions.filter((f) => f.idle).length);

// builder constants, counted from the source text itself
const idsIn = (name) => { const start = buildJs.indexOf('const ' + name + '=['); const end = buildJs.indexOf('\n];', start); return [...buildJs.slice(start, end).matchAll(/\{id:'([a-z_]+)'/g)].map((m) => m[1]); };
const raceIds = idsIn('RACES'), classIds = idsIn('CLASSES');
const spellLines = buildJs.slice(buildJs.indexOf('const SPELLS=`') + 14, buildJs.indexOf("`.split('\\n')")).split('\n');
const arr = (name) => vm.runInNewContext('(' + buildJs.match(new RegExp('const ' + name + '=(\\[[\\s\\S]*?\\]);\\n'))[1] + ')');
const of = (kind) => rules.filter((r) => r.kind === kind);
count('builder races', of('race').filter((r) => raceIds.includes(r.key)).length, raceIds.length);
count('classes', of('class').filter((r) => classIds.includes(r.key)).length, classIds.length);
count('classes converted from older editions (src and conv kept)', of('class').filter((r) => r.data.src && r.data.conv).length, classIds.length - 13);
count('spells', of('spell').length, spellLines.length);
count('spells matching the source line for line', of('spell').filter((r) => spellLines.includes([r.data.n, r.data.l, r.data.c, r.data.t, r.data.f, r.data.d].join('|'))).length, spellLines.length);
count('backgrounds', of('background').length, arr('BGS').length);
count('armor', of('armor').length, arr('ARMOR').length);
count('weapons', of('weapon').length, arr('WEAPONS').length);
count('ancestry damage types', (of('misc').find((r) => r.key === 'ANCESTRY')?.data.v ?? []).length, arr('ANCESTRY').length);
// every class feature, by name
const featNames = [...buildJs.slice(buildJs.indexOf('const CLASSES=['), buildJs.indexOf('const FULL=')).matchAll(/\[(\d+),'((?:[^'\\]|\\.)*)','(?:Passive|Action|Bonus action|Reaction|Free)'/g)].length;
count('class features', of('class').reduce((n, r) => n + r.data.feats.length, 0), featNames);
count('race traits', of('race').reduce((n, r) => n + r.data.traits.length, 0), [...buildJs.slice(buildJs.indexOf('const RACES=['), buildJs.indexOf('const ANCESTRY')).matchAll(/traits:\[/g)].length ? vm.runInNewContext(buildJs.slice(0, buildJs.indexOf('/* ---------- state')) + ';RACES.reduce((n,r)=>n+r.traits.length,0)', { document: { querySelector: () => null } }) : 0);

// ---- sessions and media
count('sessions', sessions.length, 2);
count('run sheet beats', sessions.find((s) => s.number === -1)?.content?.beats?.length ?? 0, cheerio.load(read('session-negative-run-sheet/index.html'))('.wrap > section').length);
const files = ['t', 'v'].flatMap((d) => fs.readdirSync(path.join(ROOT, 'source/character-builder', d)).map((f) => d + '/' + f));
count('media rows', media.length, files.length);
const stored = new Set();
for (const d of ['t', 'v']) { const { data } = await db.storage.from('campaign-media').list('to-be-a-god/' + d, { limit: 200 }); (data ?? []).forEach((o) => stored.add(d + '/' + o.name)); }
count('media files in the private bucket', files.filter((f) => stored.has(f)).length, files.length);
count('media marked "before"', media.filter((m) => m.phase === 'before').length, files.filter((f) => /_before\./.test(f)).length);
count('media marked "after"', media.filter((m) => m.phase === 'after').length, files.filter((f) => /_after\./.test(f)).length);

// ---- visibility: nothing DM-only is stored as player-visible
const playerText = JSON.stringify(content.filter((r) => r.visibility === 'player')) + JSON.stringify(rules);
const leak = [/\bAdo\b/, /Zandrioch/, /Ideas in reserve/, /Still to decide/].filter((re) => re.test(playerText));
report['DM words in player-visible rows'] = leak.length ? leak.join(', ') : 'none';
if (leak.length) failed++;
report['content rows'] = `${content.length} (${content.filter((r) => r.visibility === 'player').length} player, ${content.filter((r) => r.visibility === 'dm').length} DM only)`;
report['rules rows'] = String(rules.length);

console.table(report);
console.log(failed ? `\nFAILED: ${failed} item(s) from the source are not in the database.` : '\nOK: everything in the source is in the database.');
process.exit(failed ? 1 : 0);
