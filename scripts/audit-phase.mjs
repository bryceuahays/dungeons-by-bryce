// Audit for BRIEF item 18: search everything a player can receive while the phase is
// "before" for words that could give away what happens after session negative.
// Reads seed/to-be-a-god.json (run scripts/extract.mjs first). Prints every hit with
// its context so each one can be reviewed by a person.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'to-be-a-god.json'), 'utf8'));

const TERMS = ['dead', 'died', 'killed', 'kill', 'slayer', 'god-slayer', 'demigod', 'Spark', 'Faith', 'domain', 'realm', 'worshipper', 'faction', 'Concord', 'Makers', 'Reavers', 'Refusers', 'Faithful', 'Unbowed', 'Foundry', 'heir', 'gap years', 'session 0', 'level 1', 'To be a god', 'once', 'former', 'used to', 'no longer'];
const re = new RegExp('\\b(' + TERMS.map((t) => t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|') + ')\\b', 'gi');
const visible = (r) => r.phase == null || r.phase === 'before';

const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(/[<&]/.test(v) ? cheerio.load(v).text() : v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const hitsIn = (text) => [...String(text).matchAll(re)].map((m) => ({ term: m[1], context: String(text).replace(/\s+/g, ' ').slice(Math.max(0, m.index - 50), m.index + 60).trim() }));

const out = [];
for (const r of seed.content.filter((x) => x.visibility === 'player' && visible(x))) {
  for (const s of strings([r.title, r.body])) for (const h of hitsIn(s)) out.push({ where: `content ${r.section}/${r.kind}/${r.key}${r.phase ? ' [' + r.phase + ']' : ''}`, ...h });
}
const quiet = {};   // class and spell rows: counted, and listed only with --all (item 19: leave class and spell names alone)
for (const r of seed.rules.filter(visible)) {
  for (const s of strings(r.data)) for (const h of hitsIn(s)) {
    if ((r.kind === 'class' || r.kind === 'spell') && !process.argv.includes('--all')) { quiet[h.term.toLowerCase()] = (quiet[h.term.toLowerCase()] || 0) + 1; continue; }
    out.push({ where: `rules ${r.kind}/${r.key}${r.phase ? ' [' + r.phase + ']' : ''}`, ...h });
  }
}
for (const m of seed.media.filter(visible)) for (const h of hitsIn(m.key + ' ' + m.path)) out.push({ where: 'media ' + m.key, ...h });
for (const s of seed.sections.filter((x) => visible(x) && x.audience !== 'dm')) for (const h of hitsIn(s.title + ' ' + s.slug)) out.push({ where: 'tab ' + s.slug, ...h });
for (const f of seed.campaign.faces.filter((x) => x.phase === 'before')) for (const h of hitsIn([f.title, f.slug, f.tagline].join(' | '))) out.push({ where: 'campaign face (before)', ...h });
for (const h of hitsIn(JSON.stringify(seed.campaign.theme) + JSON.stringify(seed.campaign.phases))) out.push({ where: 'campaign theme/phases', ...h });

for (const h of out) console.log(`${h.where}\n    [${h.term}]  …${h.context}…`);
console.log(`\n${out.length} hit(s) in rows a player can receive while the phase is "before".`);
console.log('In class and spell rows (rules text and names, not listed):', JSON.stringify(quiet));
