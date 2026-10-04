// Builds the official free pack, "Bryce's Originals", from the original races in
// "To be a god", and lists what was left out and why in docs/originals-report.md.
//
//   node scripts/seed-originals.mjs
//
// What goes in: a race the campaign itself marks as "Original", with the traits that are
// the site owner's own. What stays out: any race the campaign marks as imported from a
// published edition, every class (all of them come from published rules), and, inside an
// original race, any single trait whose own note says it was adapted from a published
// book. Nothing held back for a later stage of the campaign is used: only what a player
// of that campaign can already read on its Races tab today.
//
// Safe to run again: entries are matched by name and updated in place.

import fs from 'node:fs';
import path from 'node:path';
import { admin, campaign, ROOT } from '../tests/helpers.mjs';
import { STORE } from '../src/config/store.ts';

const C = await campaign();
const { data: head } = await admin.from('profiles').select('id').eq('role', 'head').order('created_at').limit(1).single();
const [{ data: lore }, { data: rules }, { data: classes }] = await Promise.all([
  admin.from('content').select('key, body').eq('campaign_id', C.id).eq('kind', 'race').is('phase', null).order('sort'),
  admin.from('rules').select('key, data').eq('campaign_id', C.id).eq('kind', 'race'),
  admin.from('rules').select('key, data').eq('campaign_id', C.id).eq('kind', 'class').order('key'),
]);

const included = [], leftOut = [];
const entries = [];
for (const r of lore) {
  const b = r.body, rule = rules.find((x) => x.key === r.key)?.data;
  if (b.kind !== 'Original') { leftOut.push(`**${b.name}** (race): ${b.kind === 'Imported' ? `imported from published editions (${b.src})` : `marked "${b.kind}", built on another published race`}.`); continue; }
  if (!rule) { leftOut.push(`**${b.name}** (race): it has lore but no rules in the character builder.`); continue; }
  const cited = new Map((b.traits ?? []).filter((t) => t[2]).map((t) => [t[0], t[2]]));
  const kept = [], dropped = [];
  for (const [name, text, opts] of rule.traits ?? []) {
    if (cited.has(name)) dropped.push(`"${name}" (its note says: ${cited.get(name)})`);
    else kept.push({ level: Number(opts?.min) || 1, name, text: text + (opts?.uses ? ` (${opts.uses} use${opts.uses === 1 ? '' : 's'} per long rest)` : '') });
  }
  if (rule.up) kept.push({ level: 7, name: 'At level 7', text: rule.up });
  if (rule.nat) kept.push({ level: 1, name: rule.nat.name, text: `A natural weapon dealing ${rule.nat.die} ${rule.nat.type} damage.` });
  entries.push({ name: b.name, data: { size: rule.size || 'Medium', speed: Number(rule.walk) || 30, languages: 'Common and one more of your choice', desc: [b.pron ? `Pronounced ${b.pron}.` : '', b.look ?? ''].filter(Boolean).join(' '), effects: [{ t: 'ability', ab: 'any', n: 2 }, { t: 'ability', ab: 'any', n: 1 }], features: kept.sort((a, c) => a.level - c.level) } });
  included.push(`**${b.name}** (race): ${kept.length} traits.`);
  dropped.forEach((d) => leftOut.push(`**${b.name}**, one trait: ${d}. The rest of the race is in the pack.`));
}
const standard = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];
for (const c of classes) leftOut.push(`**${c.data.name}** (class): ${standard.includes(c.key) ? 'a class from the published fifth edition rules (its SRD version is already free to every account)' : c.key === 'artificer' ? 'from a published fifth edition book that is not in the SRD' : 'converted from a class published in another edition'}.`);

// ---- the entries, the pack, and its free store listing
const ids = [];
for (const e of entries) {
  const slug = 'originals-' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const row = { owner_id: head.id, source: 'homebrew', type: 'race', slug, name: e.name, status: 'live', depth: 'advanced', data: e.data };
  const { data: was } = await admin.from('entities').select('id').eq('owner_id', head.id).eq('type', 'race').eq('slug', slug).maybeSingle();
  const r = was ? await admin.from('entities').update(row).eq('id', was.id).select('id').single() : await admin.from('entities').insert(row).select('id').single();
  if (r.error) { console.error(r.error.message); process.exit(1); }
  ids.push(r.data.id);
}
let { data: pack } = await admin.from('packs').select('id').eq('owner_id', head.id).eq('name', STORE.originals.name).maybeSingle();
if (!pack) pack = (await admin.from('packs').insert({ owner_id: head.id, name: STORE.originals.name, description: STORE.originals.pitch, official: true, free: true }).select('id').single()).data;
else await admin.from('packs').update({ official: true, free: true, description: STORE.originals.pitch }).eq('id', pack.id);
await admin.from('pack_entities').delete().eq('pack_id', pack.id);
if (ids.length) await admin.from('pack_entities').insert(ids.map((entity_id) => ({ pack_id: pack.id, entity_id })));
const first = entries[0];
const listing = { slug: STORE.originals.slug, seller_id: head.id, kind: 'pack', pack_id: pack.id, title: STORE.originals.name, pitch: STORE.originals.pitch, price_cents: 0, status: 'live', includes: entries.map((e) => `${e.name} (race)`), preview: first ? [{ title: first.name, entity: { type: 'race', name: first.name, data: first.data } }] : [] };
const { data: prod } = await admin.from('products').select('id').eq('slug', STORE.originals.slug).maybeSingle();
const saved = prod ? await admin.from('products').update(listing).eq('id', prod.id) : await admin.from('products').insert(listing);
if (saved.error) { console.error(saved.error.message); process.exit(1); }

fs.writeFileSync(path.join(ROOT, 'docs', 'originals-report.md'), `# Bryce's Originals: what is in the pack, and what was left out

Written by \`scripts/seed-originals.mjs\`. Review this list. To change the pack, open **Homebrew**, then the pack, and tick or untick entries; to put a left-out trait back, edit the race in the homebrew builder and add it in your own words.

## In the pack (${included.length})

${included.map((x) => `- ${x}`).join('\n') || 'Nothing.'}

Each race gives +2 to one ability score and +1 to another of the player's choice, as in the campaign.

## Left out (${leftOut.length})

${leftOut.map((x) => `- ${x}`).join('\n') || 'Nothing.'}

## Why so strict

The pack is public and free, so anything in it has to be yours alone. A race you marked "Original" is in. A single trait is left out when its own note in the campaign says it was adapted from a published book, even where the adaptation is your own work, because that is the call the brief asked for. No class is in the pack: every class in the campaign comes from published rules.
`);
console.log(`Pack "${STORE.originals.name}": ${ids.length} entries. Left out: ${leftOut.length}. See docs/originals-report.md.`);
