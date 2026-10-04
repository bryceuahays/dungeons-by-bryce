// Loads the FULL SRD (every spell, monster and magic item) into the `entities` table,
// on top of the hand-written core set.
//
// It does not download anything. Put the SRD data files in seed/srd/full/ first:
//   5e-SRD-Spells.json   5e-SRD-Monsters.json   5e-SRD-Magic-Items.json
// (the layout used by the open "5e-database" project, which publishes the SRD 5.1 as
// JSON). Then:   node scripts/import-srd.mjs
//
// NOT YET RUN AGAINST REAL DATA. It was written from the published layout of those
// files. Run it once, read what it prints, and check a few entries in the SRD browser.
// Entries are matched by type and name, so running it again updates rather than doubles.

import fs from 'node:fs';
import path from 'node:path';
import { admin, ROOT } from '../tests/helpers.mjs';
import { slugify } from '../seed/srd/core.mjs';

const dir = path.join(ROOT, 'seed', 'srd', 'full');
const read = (name) => { const f = path.join(dir, name); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
const text = (v) => (Array.isArray(v) ? v.join('\n\n') : String(v ?? ''));
const list = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x?.name ?? '')).filter(Boolean).join(', ') : String(v ?? ''));
const cr = (n) => (n === 0.125 ? '1/8' : n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n ?? ''));
const out = [];

const spells = read('5e-SRD-Spells.json');
for (const s of spells ?? []) {
  out.push({ type: 'spell', name: s.name, data: {
    level: Number(s.level) || 0, school: s.school?.name ?? '', time: s.casting_time ?? '', range: s.range ?? '',
    comp: [list(s.components), s.material ? `(${s.material})` : ''].filter(Boolean).join(' '), duration: (s.concentration ? 'Concentration, ' : '') + String(s.duration ?? '').replace(/^Up to/, 'up to'),
    conc: !!s.concentration, ritual: !!s.ritual, classes: (s.classes ?? []).map((c) => c.name), desc: text(s.desc), higher: text(s.higher_level),
  } });
}

const monsters = read('5e-SRD-Monsters.json');
for (const m of monsters ?? []) {
  const profs = m.proficiencies ?? [];
  const pick = (prefix) => profs.filter((p) => String(p.proficiency?.name ?? '').startsWith(prefix)).map((p) => `${p.proficiency.name.slice(prefix.length)} +${p.value}`).join(', ');
  const speed = Object.entries(m.speed ?? {}).map(([k, v]) => (k === 'walk' ? v : `${k} ${v}`)).join(', ');
  const senses = Object.entries(m.senses ?? {}).filter(([k]) => k !== 'passive_perception').map(([k, v]) => `${k[0].toUpperCase() + k.slice(1).replace(/_/g, ' ')} ${v}`).join(', ');
  out.push({ type: 'monster', name: m.name, data: {
    size: m.size ?? 'Medium', mtype: String(m.type ?? '').replace(/^./, (c) => c.toUpperCase()), align: m.alignment ?? '',
    acv: Array.isArray(m.armor_class) ? Number(m.armor_class[0]?.value) : Number(m.armor_class), hpv: Number(m.hit_points), hdv: m.hit_points_roll ?? m.hit_dice ?? '', mspeed: speed,
    ab: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
    msaves: pick('Saving Throw: '), mskills: pick('Skill: '), senses, langs: m.languages ?? '', cr: cr(m.challenge_rating),
    vuln: list(m.damage_vulnerabilities), resist: list(m.damage_resistances), immune: list(m.damage_immunities),
    traits: (m.special_abilities ?? []).map((a) => ({ name: a.name, text: a.desc })),
    actions: [...(m.actions ?? []), ...(m.legendary_actions ?? []).map((a) => ({ ...a, name: 'Legendary: ' + a.name }))].map((a) => ({ name: a.name, text: a.desc })),
  } });
}

const items = read('5e-SRD-Magic-Items.json');
for (const i of items ?? []) {
  const desc = text(i.desc);
  out.push({ type: 'item', name: i.name, data: { kind: 'Magic item', rarity: i.rarity?.name ?? 'Varies', attune: /requires attunement/i.test(desc), desc } });
}

if (!out.length) {
  console.log(`No data files found in ${dir}.\nPut 5e-SRD-Spells.json, 5e-SRD-Monsters.json and 5e-SRD-Magic-Items.json there and run this again.`);
  process.exit(0);
}

const { data: existing } = await admin.from('entities').select('id, type, slug').eq('source', 'srd').limit(10000);
const have = new Map((existing ?? []).map((r) => [r.type + '/' + r.slug, r.id]));
let added = 0, updated = 0, failed = 0;
const fresh = [];
for (const e of out) {
  const slug = slugify(e.name);
  const row = { owner_id: null, source: 'srd', type: e.type, slug, name: e.name, status: 'live', depth: 'advanced', data: e.data };
  const id = have.get(e.type + '/' + slug);
  if (id) { const r = await admin.from('entities').update(row).eq('id', id); if (r.error) failed++; else updated++; }
  else if (!fresh.some((f) => f.type === row.type && f.slug === row.slug)) fresh.push(row);
}
for (let i = 0; i < fresh.length; i += 100) {
  const r = await admin.from('entities').insert(fresh.slice(i, i + 100));
  if (r.error) { failed += Math.min(100, fresh.length - i); console.error(r.error.message); } else added += Math.min(100, fresh.length - i);
}
console.log(`Full SRD: ${added} added, ${updated} updated, ${failed} failed. (${spells?.length ?? 0} spells, ${monsters?.length ?? 0} monsters, ${items?.length ?? 0} magic items read.)`);
