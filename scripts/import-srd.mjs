// Imports the full SRD, both versions, into the `entities` table.
//   2014 rules = SRD 5.1     2024 rules = SRD 5.2
//
//   node scripts/fetch-srd.mjs      download the data (see docs/srd-import.md for the source)
//   node scripts/import-srd.mjs     load it; writes docs/srd-import-report.md
//
// Repeatable: entries are matched by SRD version, type and name, and updated in place, so
// running it again never makes duplicates and keeps each entry's id (sheets that use an
// entry keep working). It only ever touches entries marked `srd`. Homebrew and private
// entries are never changed or removed.
//
// The data gives the official wording. What an entry DOES to a character sheet (ability
// bonuses, senses, resistances, resources, scaling values) is worked out here from the
// data's own structured fields, with the hand-written core set (seed/srd/core.mjs) used
// as a guide for the 5.1 races and classes where the data only has prose.

import fs from 'node:fs';
import path from 'node:path';
import { admin, ROOT } from '../tests/helpers.mjs';
import { SRD_CORE, slugify } from '../seed/srd/core.mjs';
import { parseSpell } from '../src/lib/spell-rules.mjs';

const dir = path.join(ROOT, 'seed', 'srd', 'full');
if (!fs.existsSync(path.join(dir, '2014'))) { console.log('No data yet. Run:  node scripts/fetch-srd.mjs'); process.exit(0); }
const load = (year, name) => { const f = path.join(dir, year, `5e-SRD-${name}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; };
const source = JSON.parse(fs.readFileSync(path.join(dir, 'SOURCE.json'), 'utf8'));

const text = (v) => (Array.isArray(v) ? v.join('\n\n') : String(v ?? '')).replace(/\r/g, '').trim();
const names = (v) => (v ?? []).map((x) => (typeof x === 'string' ? x : x?.name ?? '')).filter(Boolean);
const cap = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());
const title = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const crText = (n) => (n === 0.125 ? '1/8' : n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n ?? ''));
const money = (c) => (c ? `${c.quantity} ${c.unit}` : '');
const core = (type, name) => SRD_CORE.find((e) => e.type === type && e.name.toLowerCase() === String(name).toLowerCase());
// prerequisites come as a list, one object, or plain words, depending on the version
const prereqText = (p) => (!p ? '' : typeof p === 'string' ? p : (Array.isArray(p) ? p : [p]).map((x) => (typeof x === 'string' ? x : x.ability_score ? `${x.ability_score.name} ${x.minimum_score} or higher` : x.minimum_level ? `Level ${x.minimum_level} or higher` : x.feature_named ?? x.description ?? x.desc ?? x.name ?? '')).filter(Boolean).join(', '));
const out = [];           // { v, type, name, data }
const failed = [];
const add = (v, type, name, data) => { if (!name) return failed.push(`${v} ${type}: an entry with no name`); out.push({ v, type, name: String(name).slice(0, 120), data }); };

// ---- what a trait does, read from its own words (used when the data has no structured field for it)
function traitEffects(name, desc) {
  const fx = [];
  const d = `${name}. ${desc}`;
  const dark = /darkvision[^.]*?(\d+)\s*(?:feet|ft)/i.exec(d);
  if (/^darkvision/i.test(name) || dark) fx.push({ t: 'sense', v: 'Darkvision', n: Number(dark?.[1] ?? 60) });
  for (const m of d.matchAll(/resistance (?:to|against) (acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder) damage/gi)) fx.push({ t: 'resist', v: m[1].toLowerCase() });
  if (/toughness/i.test(name) && /hit point maximum increases by 1/i.test(desc)) fx.push({ t: 'hp', n: 1 });
  return fx;
}
// ---- a class's per-level numbers become resources (things you spend) and scales (things that grow)
const RESOURCES = { rage_count: ['Rage', 'long'], ki_points: ['Ki', 'short'], focus_points: ['Focus Points', 'short'], sorcery_points: ['Sorcery Points', 'long'], action_surges: ['Action Surge', 'short'], indomitable_uses: ['Indomitable', 'long'], channel_divinity_charges: ['Channel Divinity', 'short'], second_wind_uses: ['Second Wind', 'long'], wild_shape_uses: ['Wild Shape', 'long'] };
const SKIP = new Set(['creating_spell_slots', 'wild_shape_swim', 'wild_shape_fly']);
function levelEffects(levels) {
  const fx = [];
  const keys = new Set(levels.flatMap((l) => Object.keys(l.class_specific ?? {})));
  for (const k of keys) {
    if (SKIP.has(k)) continue;
    const steps = [];
    let last = null;
    for (const l of levels) {
      let v = l.class_specific?.[k];
      if (v && typeof v === 'object') v = v.dice_count != null ? `${v.dice_count}d${v.dice_value}` : null;
      if (v == null || v === 0 || v === false) continue;
      v = String(v);
      if (v !== last) { steps.push([l.level, v]); last = v; }
    }
    if (!steps.length) continue;
    if (RESOURCES[k]) fx.push({ t: 'resource', name: RESOURCES[k][0], max: 'step:' + steps.map(([l, v]) => `${l}=${Math.min(99, Number(v) || 99)}`).join(','), recharge: RESOURCES[k][1], ...(steps[0][0] > 1 ? { at: steps[0][0] } : {}) });
    else fx.push({ t: 'scale', name: title(k.replace(/_die$/, ' die').replace(/_dice$/, ' dice')), steps: steps.map(([l, v]) => [l, /^\d+$/.test(v) && /die/.test(k) ? 'd' + v : v]) });
  }
  return fx;
}
const castKind = (levels, index) => {
  const top = Math.max(0, ...levels.flatMap((l) => Object.entries(l.spellcasting ?? {}).filter(([k, n]) => /^spell_slots_level_/.test(k) && n > 0).map(([k]) => Number(k.slice(18)))));
  return !top ? 'none' : index === 'warlock' ? 'pact' : top >= 9 ? 'full' : 'half';
};
// A spellcasting number for each of the 20 class levels (cantrips known, prepared spells).
const perLevel = (levels, key) => Array.from({ length: 20 }, (_, i) => Number(levels.find((l) => l.level === i + 1)?.spellcasting?.[key] ?? 0));
// Pools the 2024 level tables do not list as a column.
const EXTRA_2024 = {
  paladin: [{ t: 'resource', name: 'Lay on Hands', max: 'level*5', recharge: 'long' }],
  // Font of Inspiration (level 5) makes it come back on a short rest too; the feature's text says so
  bard: [{ t: 'resource', name: 'Bardic Inspiration', max: 'cha', recharge: 'long' }],
  cleric: [{ t: 'resource', name: 'Divine Intervention', max: '1', recharge: 'long', at: 10 }],
  monk: [{ t: 'resource', name: 'Uncanny Metabolism', max: '1', recharge: 'long', at: 2 }],
  sorcerer: [{ t: 'resource', name: 'Innate Sorcery', max: '2', recharge: 'long' }],
  warlock: [{ t: 'resource', name: 'Magical Cunning', max: '1', recharge: 'long', at: 2 }],
  wizard: [{ t: 'resource', name: 'Arcane Recovery', max: '1', recharge: 'long' }],
  fighter: [{ t: 'resource', name: 'Action Surge', max: 'step:2=1,17=2', recharge: 'short', at: 2 }, { t: 'resource', name: 'Indomitable', max: 'step:9=1,13=2,17=3', recharge: 'long', at: 9 }],
};
// The 2024 data set flattens some subclass tables into the text (and mixes them up). The SRD 5.2
// itself gives these: an oath's always-prepared spells by Paladin level, what spends Channel Divinity.
const OATH_SPELLS = [[3, ['Protection from Evil and Good', 'Shield of Faith']], [5, ['Aid', 'Zone of Truth']], [9, ['Beacon of Hope', 'Dispel Magic']], [13, ['Freedom of Movement', 'Guardian of Faith']], [17, ['Commune', 'Flame Strike']]];
const spellTable = (cls, title, rows, intro) => ({
  text: intro + '\n' + rows.map(([l, sp]) => `${cls} level ${l}: ${sp.join(', ')}`).join('\n'),
  effects: rows.flatMap(([l, sp]) => sp.map((name) => ({ t: 'spell', name, ...(l > 3 ? { at: l } : {}) }))),
});
const ALWAYS = (cls, table) => `When you reach a ${cls} level listed in the ${table} table, you thereafter always have the listed spells prepared.`;
const SUBCLASS_SPELLS_2024 = {
  'Life Domain': ['Life Domain Spells', spellTable('Cleric', 'Life Domain Spells', [[3, ['Aid', 'Bless', 'Cure Wounds', 'Lesser Restoration']], [5, ['Mass Healing Word', 'Revivify']], [7, ['Aura of Life', 'Death Ward']], [9, ['Greater Restoration', 'Mass Cure Wounds']]], 'Your connection to this divine domain ensures you always have certain spells ready. ' + ALWAYS('Cleric', 'Life Domain Spells'))],
  'Draconic Sorcery': ['Draconic Spells', spellTable('Sorcerer', 'Draconic Spells', [[3, ['Alter Self', 'Chromatic Orb', 'Command', "Dragon's Breath"]], [5, ['Fear', 'Fly']], [7, ['Arcane Eye', 'Charm Monster']], [9, ['Legend Lore', 'Summon Dragon']]], ALWAYS('Sorcerer', 'Draconic Spells'))],
  'Fiend Patron': ['Fiend Spells', spellTable('Warlock', 'Fiend Spells', [[3, ['Burning Hands', 'Command', 'Scorching Ray', 'Suggestion']], [5, ['Fireball', 'Stinking Cloud']], [7, ['Fire Shield', 'Wall of Fire']], [9, ['Geas', 'Insect Plague']]], 'The magic of your patron ensures you always have certain spells ready. ' + ALWAYS('Warlock', 'Fiend Spells'))],
};
const SUBCLASS_2024 = {
  ...Object.fromEntries(Object.entries(SUBCLASS_SPELLS_2024).map(([sub, [feature, fix]]) => [sub, { [feature]: fix }])),
  'Oath of Devotion': {
    'Oath of Devotion Spells': {
      text: 'The magic of your oath ensures you always have certain spells ready; when you reach a Paladin level listed below, you thereafter always have the listed spells prepared.\n' + OATH_SPELLS.map(([l, sp]) => `Paladin level ${l}: ${sp.join(', ')}`).join('\n'),
      effects: OATH_SPELLS.flatMap(([l, sp]) => sp.map((name) => ({ t: 'spell', name, ...(l > 3 ? { at: l } : {}) }))),
    },
    'Sacred Weapon': { uses: { res: 'r:channel divinity', cost: 1 } },
    'Aura of Devotion': { effects: [{ t: 'condition', v: 'Charmed' }] },
  },
};
// each 2024 caster's usual spellcasting focus (the same list as SRD_FOCUS in src/lib/rules/engine.ts)
const SRD_FOCUS = { Bard: 'Musical Instrument', Cleric: 'Holy Symbol', Druid: 'Druidic Focus', Paladin: 'Holy Symbol', Ranger: 'Druidic Focus', Sorcerer: 'Arcane Focus', Warlock: 'Arcane Focus', Wizard: 'Arcane Focus' };
// 2024 starting equipment: packages the player picks one of. Read from the official wording
// ("(a) Spear, 2 Daggers, Arcane Focus (crystal), ... and 28 GP; or (b) 50 GP"): the data's item
// lists have mistakes (the Bard's instrument is missing, the Sorcerer gets Leather Armor for a Spear).
function startEquip(c) {
  const desc = String(c.starting_equipment_options?.[0]?.desc ?? '').replace(/[‘’]/g, "'");
  return desc.split(/;?\s*(?:or\s+)?\([a-z]\)\s*/i).map((p) => p.trim().replace(/[.;]$/, '')).filter(Boolean).map((p) => {
    const pkg = { items: [], gp: 0 };
    for (let part of p.split(/,\s*(?:and\s+)?|\s+and\s+(?=\d+ GP$)/)) {
      part = part.trim();
      const gp = part.match(/^(\d+)\s*GP$/i);
      if (gp) { pkg.gp += Number(gp[1]); continue; }
      const n = part.match(/^(\d+)\s+(.+)$/);
      if (part) pkg.items.push(n ? { name: n[2], count: Number(n[1]) } : { name: part, count: 1 });
    }
    return pkg;
  });
}
// 2024 multiclassing: the scores needed (all of them, or any one), and what joining the class gives
const MC_ARMOR = { 'Light Armor': 'light', 'Medium Armor': 'medium', 'Heavy Armor': 'heavy', Shields: 'shields' };
const MC_WEAPONS = { 'Simple Weapons': 'simple', 'Martial Weapons': 'martial' };
function multiclass(c) {
  const m = c.multi_classing;
  if (!m) return undefined;
  const any = m.prerequisite_options?.from?.options;
  const req = (any ?? m.prerequisites ?? []).map((p) => ({ ab: p.ability_score.index, min: p.minimum_score }));
  const profs = names(m.proficiencies);
  const choices = m.proficiency_choices ?? [];
  const count = (re) => choices.filter((p) => re.test(p.from?.options?.[0]?.item?.name ?? '')).reduce((n, p) => n + (p.choose ?? 1), 0);
  return {
    req, join: any ? 'or' : 'and',
    armor: profs.map((p) => MC_ARMOR[p]).filter(Boolean),
    weaponCats: profs.map((p) => MC_WEAPONS[p]).filter(Boolean),
    toolItems: profs.filter((p) => /^Tool: /.test(p)).map((p) => p.slice(6)),
    skills: count(/^Skill: /),
    tools: count(/^(?!Skill: )/),
  };
}
// Options the data set leaves out, from the SRD 5.2.1 document itself (seed/srd/class-options-5.2.json):
// the first feature with that name lists them; later ones (Metamagic at 10 and 17) pick more from it.
const CLASS_OPTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'srd', 'class-options-5.2.json'), 'utf8'));
const CHOICE_COUNT = { Metamagic: 2, 'Eldritch Invocations': 1 };
// What each option does to the sheet, from its SRD wording (the editor's Gives, Grows and choices).
const free = (name, self) => ({ t: 'spell', name, cast: 'free', ...(self ? { self: true } : {}) });
const cantrip = (any) => ({ count: 1, from: 'spells', spell: { level: 0, ...(any ? { any: true } : {}) } });
const OPTION_RULES = {
  'Agonizing Blast': { effects: [{ t: 'damage', amount: 'cha', type: '', when: 'with the chosen Warlock cantrip' }], choices: [cantrip()] },
  'Armor of Shadows': { effects: [free('Mage Armor', true)] },
  'Ascendant Step': { effects: [free('Levitate', true)] },
  "Devil's Sight": { effects: [{ t: 'sense', v: "Devil's Sight", n: 120, what: 'see normally in Dim Light and Darkness, magical or not' }] },
  'Devouring Blade': { effects: [{ t: 'attacks', n: 3, with: 'your pact weapon' }] },
  'Eldritch Mind': { effects: [{ t: 'adv', roll: 'save', ab: 'con', when: 'to maintain Concentration' }] },
  'Eldritch Smite': { effects: [{ t: 'damage', amount: '1d8', type: 'force', when: 'once per turn when you hit with your pact weapon and expend a Pact Magic slot, plus 1d8 per level of the slot' }] },
  'Eldritch Spear': { choices: [cantrip()], effects: [{ t: 'scale', name: 'Extra cantrip range', kind: 'distance', steps: Array.from({ length: 19 }, (_, i) => [i + 2, (i + 2) * 30 + ' ft']) }] },
  'Fiendish Vigor': { effects: [free('False Life', true)] },
  'Gift of the Depths': { effects: [{ t: 'speed', mode: 'swim', n: 'walk' }, { t: 'text', text: 'You can breathe underwater.' }, { t: 'spell', name: 'Water Breathing', cast: 'perRest', n: 1, recharge: 'long' }] },
  'Lessons of the First Ones': { choices: [{ count: 1, from: 'feat:Origin' }] },
  'Lifedrinker': { effects: [{ t: 'damage', amount: '1d6', type: 'choice', when: 'once per turn when you hit with your pact weapon (Necrotic, Psychic or Radiant)' }] },
  'Mask of Many Faces': { effects: [free('Disguise Self')] },
  'Master of Myriad Forms': { effects: [free('Alter Self')] },
  'Misty Visions': { effects: [free('Silent Image')] },
  'One with Shadows': { effects: [free('Invisibility', true)] },
  'Otherworldly Leap': { effects: [free('Jump', true)] },
  'Pact of the Blade': { effects: [{ t: 'prof', kind: 'weapon', v: 'Your pact weapon' }] },
  'Pact of the Chain': { effects: [{ t: 'spell', name: 'Find Familiar', cast: 'free' }] },
  'Pact of the Tome': { choices: [{ count: 3, from: 'spells', spell: { level: 0, any: true } }, { count: 2, from: 'spells', spell: { level: 1, ritual: true, any: true } }] },
  'Repelling Blast': { choices: [cantrip()] },
  'Thirsting Blade': { effects: [{ t: 'attacks', n: 2, with: 'your pact weapon' }] },
  'Visions of Distant Realms': { effects: [free('Arcane Eye')] },
  'Whispers of the Grave': { effects: [free('Speak with Dead')] },
  'Witch Sight': { effects: [{ t: 'sense', v: 'Truesight', n: 30 }] },
};
const withRules = (o) => ({ ...o, ...(OPTION_RULES[o.name] ?? {}) });
function withOptions(feats) {
  const seen = new Set();
  return feats.map((f) => {
    const options = CLASS_OPTIONS[f.name];
    if (!Array.isArray(options)) return f;
    const first = !seen.has(f.name);
    seen.add(f.name);
    const choice = first ? { count: CHOICE_COUNT[f.name] ?? 1, from: 'custom', options: options.map(withRules), ...(f.name === 'Eldritch Invocations' ? { byGrows: true } : {}) } : { count: CHOICE_COUNT[f.name] ?? 1, from: 'same' };
    return { ...f, choice };
  });
}
// 2024 feats as benefits (the bold-named parts of their wording), each with what it does to the sheet.
const boonAsi = { name: 'Ability Score Increase', effects: [{ t: 'ability', ab: 'any', n: 1, max: 30 }] };
const FEAT_RULES_2024 = {
  Alert: { 'Initiative Proficiency': { effects: [{ t: 'bonus', roll: 'initiative', amount: 'prof' }] } },
  'Magic Initiate': {
    'Two Cantrips': { choice: { count: 2, from: 'spells', spell: { level: 0, lists: ['Cleric', 'Druid', 'Wizard'] } } },
    'Level 1 Spell': { choice: { count: 1, from: 'spells', spell: { level: 1, lists: ['Cleric', 'Druid', 'Wizard'] } }, limit: { n: 1, per: 'long' } },
  },
  'Savage Attacker': { 'Savage Attacker': { limit: { n: 1, per: 'turn' } } },
  Skilled: { Skilled: { choice: { count: 3, from: 'anyskill' } } },
  'Ability Score Improvement': { 'Ability Score Improvement': { effects: [{ t: 'ability', ab: 'any', n: 2, split: true, max: 20 }] } },
  Grappler: {
    'Ability Score Increase': { effects: [{ t: 'ability', ab: 'any', n: 1, among: ['str', 'dex'], max: 20 }] },
    'Punch and Grab': { limit: { n: 1, per: 'turn' } },
    'Attack Advantage': { effects: [{ t: 'adv', roll: 'attack', ab: '', when: 'against a creature Grappled by you' }] },
  },
  Archery: { Archery: { effects: [{ t: 'bonus', roll: 'attack', amount: 2, when: 'with Ranged weapons' }] } },
  Defense: { Defense: { effects: [{ t: 'ac', n: 1, when: 'wearing Light, Medium, or Heavy armor' }] } },
  'Boon of Combat Prowess': { 'Ability Score Increase': boonAsi, 'Peerless Aim': { limit: { n: 1, per: 'turn' } } },
  'Boon of Dimensional Travel': { 'Ability Score Increase': boonAsi },
  'Boon of Fate': { 'Ability Score Increase': boonAsi, 'Improve Fate': { limit: { n: 1, per: 'initiative' } } },
  'Boon of Irresistible Offense': { 'Ability Score Increase': boonAsi },
  'Boon of Spell Recall': { 'Ability Score Increase': boonAsi },
  'Boon of the Night Spirit': { 'Ability Score Increase': boonAsi },
  'Boon of Truesight': { 'Ability Score Increase': boonAsi, Truesight: { effects: [{ t: 'sense', v: 'Truesight', n: 60 }] } },
};
const FEAT_CAT = { origin: 'Origin', general: 'General', 'fighting-style': 'Fighting style', 'epic-boon': 'Epic boon' };
function feat2024(f) {
  const desc = String(f.description ?? '');
  const parts = desc.split(/\*\*([^*]+?)\.\*\*\s*/);
  const intro = parts[0].trim();
  const named = [];
  for (let i = 1; i < parts.length; i += 2) named.push({ name: parts[i].trim(), text: parts[i + 1].trim() });
  const benefits = (named.length ? named : [{ name: f.name, text: intro }]).map((b) => ({ ...b, ...(FEAT_RULES_2024[f.name]?.[b.name] ?? {}) }));
  const p = f.prerequisites ?? {};
  const req = { ...(p.minimum_level ? { level: p.minimum_level } : {}), ...(p.feature_named ? { feature: p.feature_named } : {}) };
  return {
    category: FEAT_CAT[f.type] ?? '', desc: named.length ? intro : '', req, prereq: [req.level ? `Level ${req.level}+` : '', req.feature ? `${req.feature} feature` : ''].filter(Boolean).join(', '),
    ...(f.repeatable ? { repeatable: true, repeatNote: /different/i.test(f.repeatable) ? String(f.repeatable).replace(/^You can take this feat more than once,? ?(but )?/i, '').replace(/^./, (c) => c.toUpperCase()) : '' } : {}),
    benefits, effects: benefits.flatMap((b) => b.effects ?? []),
  };
}
// 2024 species: each trait's parts (limited uses, gives, choices), from its SRD wording. A lineage,
// legacy or ancestry is a choice on its trait; each option's Gives are listed here, its text comes from
// the data's subspecies.
const pb = (per) => ({ n: 'prof', per });
const once = (per) => ({ n: 1, per });
const known = (name) => ({ t: 'spell', name });
const later = (name, at) => ({ t: 'spell', name, cast: 'perRest', n: 1, recharge: 'long', at });
const advSave = (when, ab = '') => ({ t: 'adv', roll: 'save', ab, when });
const skillOpt = (v) => ({ name: v, text: `You have proficiency in the ${v} skill.`, effects: [{ t: 'prof', kind: 'skill', v }] });
const SPECIES_RULES = {
  Dragonborn: {
    'Breath Weapon': { limit: pb('long'), effects: [{ t: 'scale', name: 'Breath Weapon damage', kind: 'dice', steps: [[1, '1d10'], [5, '2d10'], [11, '3d10'], [17, '4d10']] }] },
    'Draconic Flight': { level: 5, limit: once('long') },
  },
  Dwarf: {
    'Dwarven Resilience': { effects: [{ t: 'resist', v: 'poison' }, advSave('to avoid or end the Poisoned condition')] },
    'Dwarven Toughness': { effects: [{ t: 'hp', n: 1 }] },
    Stonecunning: { limit: pb('long') },
  },
  Elf: {
    'Fey Ancestry': { effects: [advSave('to avoid or end the Charmed condition')] },
    'Keen Senses': { choice: { count: 1, from: 'custom', options: ['Insight', 'Perception', 'Survival'].map(skillOpt) } },
  },
  Gnome: { 'Gnomish Cunning': { effects: ['int', 'wis', 'cha'].map((ab) => advSave('', ab)) } },
  Goliath: { 'Giant Ancestry': { limit: pb('long') }, 'Large Form': { level: 5, limit: once('long') }, 'Powerful Build': { effects: [{ t: 'adv', roll: 'check', ab: '', when: 'to end the Grappled condition' }] } },
  Halfling: { Brave: { effects: [advSave('to avoid or end the Frightened condition')] } },
  Human: { Skillful: { choice: { count: 1, from: 'anyskill' } }, Versatile: { choice: { count: 1, from: 'feat:Origin' } } },
  Orc: { 'Adrenaline Rush': { limit: pb('short') }, 'Relentless Endurance': { limit: once('long') } },
  Tiefling: { 'Otherworldly Presence': { effects: [known('Thaumaturgy')] } },
};
// the lineage-like traits: which trait holds the choice, and each option's Gives (keyed by the part after "Lineage: ")
const LINEAGE_GIVES = {
  'Elven Lineage': {
    Drow: [{ t: 'sense', v: 'Darkvision', n: 120 }, known('Dancing Lights'), later('Faerie Fire', 3), later('Darkness', 5)],
    'High Elf': [known('Prestidigitation'), later('Detect Magic', 3), later('Misty Step', 5)],
    'Wood Elf': [{ t: 'speed', mode: 'walk', n: 5 }, known('Druidcraft'), later('Longstrider', 3), later('Pass without Trace', 5)],
  },
  'Gnomish Lineage': {
    'Forest Gnome': [known('Minor Illusion'), { t: 'spell', name: 'Speak with Animals', cast: 'perRest', n: 'prof', recharge: 'long' }],
    'Rock Gnome': [known('Mending'), known('Prestidigitation')],
  },
  'Fiendish Legacy': {
    Abyssal: [{ t: 'resist', v: 'poison' }, known('Poison Spray'), later('Ray of Sickness', 3), later('Hold Person', 5)],
    Chthonic: [{ t: 'resist', v: 'necrotic' }, known('Chill Touch'), later('False Life', 3), later('Ray of Enfeeblement', 5)],
    Infernal: [{ t: 'resist', v: 'fire' }, known('Fire Bolt'), later('Hellish Rebuke', 3), later('Darkness', 5)],
  },
  'Giant Ancestry': {
    "Fire's Burn": [{ t: 'damage', amount: '1d10', type: 'fire', when: 'when you hit a target with an attack roll and deal damage to it' }],
    "Frost's Chill": [{ t: 'damage', amount: '1d6', type: 'cold', when: 'when you hit a target with an attack roll and deal damage to it (and its Speed drops by 10 feet)' }],
    "Storm's Thunder": [{ t: 'damage', amount: '1d8', type: 'thunder', when: 'as a Reaction when a creature within 60 feet of you damages you' }],
  },
  'Draconic Ancestry': {},
};
// the Dragonborn's ancestry, breath and resistance are only in the data's subspecies: one trait each
const DRAGON_TYPES = { Black: 'acid', Blue: 'lightning', Brass: 'fire', Bronze: 'lightning', Copper: 'acid', Gold: 'fire', Green: 'poison', Red: 'fire', Silver: 'cold', White: 'cold' };
function species2024(r, subs, traitOf) {
  const mine = subs.filter((x) => x.species?.index === r.index);
  let traits = (r.traits ?? []).map(traitOf);
  if (r.index === 'dragonborn') {
    const breath = traitOf({ index: 'draconic-breath-weapon-acid' });
    traits = [
      traitOf({ index: 'draconic-ancestry' }),
      { name: 'Breath Weapon', level: 1, text: breath.text.replace('1d10 acid damage', '1d10 damage of the type determined by your Draconic Ancestry trait') },
      { name: 'Damage Resistance', level: 1, text: 'You have Resistance to the damage type determined by your Draconic Ancestry trait.' },
      ...traits,
    ];
  }
  const out = traits.map((t) => {
    const rules = SPECIES_RULES[r.name]?.[t.name] ?? {};
    const dark = t.name.match(/^Darkvision \((\d+) ft\.?\)$/);
    const base = { ...t, name: dark ? 'Darkvision' : t.name, ...rules, ...(dark ? { effects: [{ t: 'sense', v: 'Darkvision', n: Number(dark[1]) }] } : {}) };
    if (!(t.name in LINEAGE_GIVES)) return base;
    // the lineage-like trait: its options are the subspecies, each with its levels' text and its Gives
    const options = t.name === 'Draconic Ancestry'
      ? Object.entries(DRAGON_TYPES).map(([dragon, type]) => ({ name: dragon, text: `${type[0].toUpperCase() + type.slice(1)} damage: your Breath Weapon deals it, and you have Resistance to it.`, effects: [{ t: 'resist', v: type }] }))
      : mine.map((sub) => {
        const name = sub.name.split(': ').pop();
        const parts = (sub.traits ?? []).map((ref) => { const x = traitOf(ref); return `Level ${ref.level ?? 1}. ${x.text}`; });
        return { name, text: parts.join('\n'), effects: LINEAGE_GIVES[t.name][name] ?? [] };
      });
    // the trait's own text without the table of options (each option has it now), keeping the spellcasting-ability line
    const lines = base.text.split('\n');
    const cut = lines.findIndex((l) => /^(Elven Lineages|Fiendish Legacies|Draconic Ancestors)$/.test(l.trim()) || options.some((o) => l.replace(/^[-\s]+/, '').startsWith(o.name)));
    const ability = cut < 0 ? null : lines.slice(cut).find((l) => /is your spell-?casting ability/i.test(l));
    const text = cut < 0 ? base.text : [...lines.slice(0, cut), ...(ability ? [ability] : [])].join('\n');
    return { ...base, text, choice: { count: 1, from: 'custom', options } };
  });
  return out.map((t) => ({ level: t.level ?? 1, ...t }));
}
// 2024 backgrounds: the recipe's fields (see src/components/BackgroundPage.tsx), plus the text and
// sheet effects its Save writes.
const TOOL_CHOICE_FROM = { 'Gaming Set': 'Gaming sets', "Artisan's Tools": "Artisan's tools", 'Musical Instrument': 'Musical instruments' };
// the data leaves out the Sage's spell list; the SRD 5.2.1 document says "Magic Initiate (Wizard)"
const FEAT_NOTE_2024 = { Sage: 'Wizard' };
function background2024(b) {
  const profs = names(b.proficiencies);
  const skills = profs.filter((p) => /^Skill: /.test(p)).map((p) => p.slice(7));
  const toolItems = profs.filter((p) => /^Tool: /.test(p)).map((p) => p.slice(6));
  const pick = (b.proficiency_choices ?? [])[0];
  const kind = pick ? Object.keys(TOOL_CHOICE_FROM).find((k) => new RegExp(k.replace(/s$/, ''), 'i').test(pick.desc ?? '')) : null;
  const toolChoice = pick ? { n: pick.choose ?? 1, from: TOOL_CHOICE_FROM[kind] ?? 'Any tool' } : { n: 0, from: "Artisan's tools" };
  const abilities = (b.ability_scores ?? []).map((a) => a.index);
  const fake = { starting_equipment_options: [{ desc: String(b.equipment_options?.[0]?.desc ?? '').replace(/^Choose A or B:\s*/i, '') }] };
  const pkgs = startEquip(fake);
  return {
    desc: '', abilities, feat: b.feat ? { name: b.feat.name, note: b.feat.note ?? FEAT_NOTE_2024[b.name] ?? '' } : { name: '', note: '' }, skills, toolItems, toolChoice,
    tools: [...toolItems, ...(toolChoice.n ? [`Choose ${toolChoice.n}: ${toolChoice.from.toLowerCase()}`] : [])].join(', ') || 'None',
    toolProfs: [...toolItems, ...(toolChoice.n ? [`Choose ${toolChoice.n}: ${toolChoice.from.toLowerCase()}`] : [])].join(', ') || 'None',
    startEquip: pkgs, equipment: String(b.equipment_options?.[0]?.desc ?? ''),
    effects: [...skills.map((v) => ({ t: 'prof', kind: 'skill', v })), ...toolItems.map((v) => ({ t: 'prof', kind: 'tool', v })), ...(abilities.length ? [1, 2, 3].map(() => ({ t: 'ability', ab: 'any', n: 1, among: abilities, max: 20 })) : [])],
    features: [],
  };
}
// 2024 items as fields (see src/components/ItemPage.tsx). Equipment comes structured in the data;
// magic items are read from their wording: type and base from the first line, bonus, charges and
// the spells in their tables. The text fields stay as before for the rest of the site.
const WORD_N = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20 };
const GEAR_CAT = [['Equipment Packs', 'Equipment pack'], ['Ammunition', 'Ammunition'], ['Arcane Foci', 'Arcane focus'], ['Druidic Foci', 'Druidic focus'], ['Holy Symbols', 'Holy symbol'], ["Artisan's Tools", "Artisan's tools"], ['Musical Instruments', 'Musical instrument'], ['Gaming Sets', 'Gaming set'], ['Other Tools', 'Other tool']];
function item2024(e, cats) {
  const out = { costN: e.cost?.quantity ?? '', costUnit: e.cost?.unit ?? 'gp', lb: e.weight ?? '' };
  if (e.damage) {
    out.weapon = {
      cat: cats.some((c) => /martial/i.test(c)) ? 'martial' : 'simple', type: cats.some((c) => /ranged/i.test(c)) ? 'ranged' : 'melee',
      dice: e.damage.damage_dice, dtype: String(e.damage.damage_type?.name ?? '').toLowerCase(), props: names(e.properties),
      ...(e.mastery ? { mastery: e.mastery.name } : {}), ...(e.two_handed_damage ? { versatile: e.two_handed_damage.damage_dice } : {}),
      ...(e.range?.long ? { range: { normal: e.range.normal, long: e.range.long } } : e.throw_range ? { range: { normal: e.throw_range.normal, long: e.throw_range.long } } : {}),
      ...(e.ammunition ? { ammo: e.ammunition.name } : {}),
    };
  } else if (e.armor_class) {
    const type = cats.includes('Shields') ? 'shield' : cats.includes('Heavy Armor') ? 'heavy' : cats.includes('Medium Armor') ? 'medium' : 'light';
    out.armor = { type, base: e.armor_class.base, dex: !e.armor_class.dex_bonus ? 'none' : e.armor_class.max_bonus ? 'max2' : 'full', strMin: e.str_minimum || '', stealth: !!e.stealth_disadvantage, ...(e.don_time ? { don: e.don_time, doff: e.doff_time } : {}) };
  } else {
    const uses = String(e.description ?? '').match(/has (\w+) uses/i)?.[1];
    out.gear = {
      cat: GEAR_CAT.find(([c]) => cats.includes(c))?.[1] ?? 'Adventuring gear',
      ...(uses ? { uses: WORD_N[uses.toLowerCase()] ?? Number(uses) } : {}), ...(e.quantity > 1 ? { qty: e.quantity } : {}),
      ...(e.contents ? { contents: e.contents.map((c) => ({ name: c.item.name, count: c.quantity })) } : {}),
    };
  }
  return out;
}
function magic2024(m) {
  const [first, ...rest] = (m.desc ?? []).map(String);
  const all = rest.join('\n');
  const type = first.replace(/\s*\(.*$/, '').trim();
  const base = first.match(/\(([^)]*)\)/)?.[1] ?? '';
  const rarityName = String(m.rarity?.name ?? 'Varies');
  const rarity = /varies|,|\bor\b/i.test(rarityName) ? 'Varies' : rarityName.replace(/\s*\(.*$/, '');
  const bonusN = Number(all.match(/\+(\d) bonus/)?.[1]) || Number(rarityName.match(/\(\+(\d)\)/)?.[1]) || 0;
  const to = /\+\d bonus to Armor Class and saving throws/i.test(all) ? 'acsave' : /\+\d bonus to Armor Class/i.test(all) ? 'ac' : /\+\d bonus to spell attack/i.test(all) ? 'spell' : /\+\d bonus to attack (rolls )?and damage/i.test(all) ? 'weapon' : null;
  const charges = Number(all.match(/has (\d+) charges/i)?.[1]) || 0;
  const regain = all.match(/regains? (all|\d+d\d+(?:\s*\+\s*\d+)?|\d+) expended charges(?: daily at dawn)?/i);
  const spells = [...all.matchAll(/^\|\s*([A-Z][^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm)].map((x) => ({ name: x[1].trim(), cost: x[2].trim().replace(/ charges?/i, '') })).filter((x) => !/^(Spell|Charge Cost|---)/i.test(x.name) && /\d/.test(x.cost));
  // the rarity line some variant items repeat ("Uncommon (+1)") is dropped from the description
  // and the spell table, now the spells' own fields; the bold-italic markers become plain text
  const desc = text(rest.filter((l) => !/^(Common|Uncommon|Rare|Very Rare|Legendary)\s*\(\+\d\)$/i.test(l.trim()))
    .filter((l) => !(spells.length && /^\|/.test(l.trim()) && (/\|\s*(Spell|---)/i.test(l) || spells.some((sp) => l.includes(sp.name)))))
    .map((l) => l.replace(/\*\*_?([^*_]+?)_?\*\*/g, '$1').replace(/(^|\s)_([^_]+)_(?=\s|[.,]|$)/g, '$1$2')));
  return {
    kind: 'Magic item', desc,
    magic: {
      type, ...(base ? { base } : {}), rarity, attune: !!m.attunement,
      ...(bonusN && to ? { bonus: { n: bonusN, to } } : {}),
      ...(charges ? { charges: { n: charges, regain: regain ? regain[1] : '', when: /daily at dawn/i.test(regain?.[0] ?? '') ? 'dawn' : 'never' } } : {}),
      ...(spells.length ? { spells } : {}),
      effects: [], props: [],
    },
  };
}
// 2024 monsters as fields (see src/components/MonsterPage.tsx), next to the stat block's text.
const SENSE_KEYS = ['darkvision', 'blindsight', 'tremorsense', 'truesight'];
const feet = (v) => Number(String(v ?? '').match(/\d+/)?.[0]) || '';
function monsterAction(a) {
  const d = String(a.desc ?? a.description ?? '');
  const out = { name: a.name, text: text(d), kind: 'other' };
  if (a.multiattack_type || /^Multiattack$/i.test(a.name)) out.kind = 'multi';
  const dmg = (a.damage ?? []).filter((x) => x.damage_dice).map((x) => ({ dice: x.damage_dice, type: String(x.damage_type?.name ?? '').toLowerCase() }));
  if (a.attack_bonus !== undefined) {
    const type = /Melee or Ranged Attack/i.test(d) ? 'both' : /Ranged Attack/i.test(d) ? 'ranged' : 'melee';
    const range = d.match(/range (\d+)(?:\/(\d+))? ft/i);
    out.kind = 'attack';
    out.atk = { type, bonus: a.attack_bonus, ...(type !== 'ranged' ? { reach: Number(d.match(/reach (\d+) ft/i)?.[1]) || 5 } : {}), ...(range ? { range: { normal: Number(range[1]), ...(range[2] ? { long: Number(range[2]) } : {}) } } : {}) };
    out.damage = dmg;
  } else if (a.dc) {
    out.kind = 'save';
    out.save = { ab: a.dc.dc_type?.index ?? 'dex', dc: a.dc.dc_value, success: a.dc.success_type === 'half' ? 'half' : a.dc.success_type === 'none' ? 'none' : 'other' };
    out.damage = dmg;
  }
  const u = a.usage;
  if (u?.type === 'recharge on roll') out.limit = { type: 'recharge', min: u.min_value ?? 5 };
  else if (u?.type === 'per day') out.limit = { type: 'day', n: u.times ?? 1 };
  return out;
}
function monster2024(m) {
  const pb = m.proficiency_bonus ?? 2;
  const profs = m.proficiencies ?? [];
  const saveB = Object.fromEntries(profs.filter((p) => /^Saving Throw: /.test(p.proficiency?.name ?? '')).map((p) => [p.proficiency.name.slice(14).toLowerCase(), p.value]));
  const skillB = Object.fromEntries(profs.filter((p) => /^Skill: /.test(p.proficiency?.name ?? '')).map((p) => [p.proficiency.name.slice(7), p.value]));
  const ac = Array.isArray(m.armor_class) ? m.armor_class[0] : { value: m.armor_class };
  const langs = String(m.languages ?? '');
  const tele = langs.match(/telepathy (\d+) ft\.?/i);
  const legendary = (m.legendary_actions ?? []).map(monsterAction);
  return {
    ctype: cap(m.type ?? 'humanoid'), tags: m.subtype ? cap(m.subtype) : '',
    acNote: ac?.armor ? names(ac.armor).join(', ') : ac?.type && ac.type !== 'dex' && ac.type !== 'armor' ? ac.type : '',
    speeds: Object.fromEntries(Object.entries(m.speed ?? {}).filter(([k]) => k !== 'hover').map(([k, v]) => [k, feet(v)])), hover: !!m.speed?.hover,
    saveB, skillB,
    vulnL: names(m.damage_vulnerabilities).map((x) => x.toLowerCase()), resistL: names(m.damage_resistances).map((x) => x.toLowerCase()), immuneL: names(m.damage_immunities).map((x) => x.toLowerCase()),
    condImm: names(m.condition_immunities),
    sensesN: Object.fromEntries(SENSE_KEYS.filter((k) => m.senses?.[k]).map((k) => [k, feet(m.senses[k])])),
    langsText: langs.replace(/[;,]?\s*telepathy \d+ ft\.?/i, '').trim(), ...(tele ? { telepathy: Number(tele[1]) } : {}),
    traits: (m.special_abilities ?? []).map(monsterAction), actions: (m.actions ?? []).map(monsterAction),
    bonus: (m.bonus_actions ?? []).map(monsterAction), reactions: (m.reactions ?? []).map(monsterAction),
    legendary, ...(legendary.length ? { legendaryN: 3 } : {}),
    gear: m.gear ?? '', pb,
  };
}
const ONE_BACK_ON_SHORT = new Set(['Rage', 'Channel Divinity', 'Wild Shape', 'Second Wind']);
function fix2024(index, fx) {
  return fx.flatMap((x) => {
    if (x.t === 'resource' && ONE_BACK_ON_SHORT.has(x.name)) return [{ ...x, recharge: 'short1' }];
    if (index === 'ranger' && x.t === 'scale' && x.name === 'Favored Enemies') return [{ t: 'resource', name: 'Favored Enemy', max: 'step:' + x.steps.map(([l, n]) => l + '=' + n).join(','), recharge: 'long' }];
    return [x];
  });
}
const CAST_ABILITY = { bard: 'cha', cleric: 'wis', druid: 'wis', paladin: 'cha', ranger: 'wis', sorcerer: 'cha', warlock: 'cha', wizard: 'int' };
function classProfs(c) {
  const all = names(c.proficiencies).filter((n) => !/^Saving Throw/.test(n));
  const armor = all.filter((n) => /armor|shield/i.test(n)), weapons = all.filter((n) => /weapon|sword|bow|crossbow|dagger|dart|sling|staff|mace|club|javelin|sickle|spear|scimitar|rapier/i.test(n) && !armor.includes(n));
  const tools = all.filter((n) => !armor.includes(n) && !weapons.includes(n));
  const pick = (c.proficiency_choices ?? []).find((p) => JSON.stringify(p).includes('skill-'));
  const skillList = [...new Set([...JSON.stringify(pick ?? {}).matchAll(/"name":"Skill: ([^"]+)"/g)].map((m) => m[1]))];
  return { armor: armor.join(', ') || 'None', weapons: weapons.join(', ') || 'None', tools: tools.join(', ') || 'None', skillCount: pick?.choose ?? 2, skillList: skillList.length >= 18 ? [] : skillList };
}

for (const [year, v] of [['2014', '5.1'], ['2024', '5.2']]) {
  const is51 = v === '5.1';
  const traits = load(year, 'Traits');
  const traitOf = (ref) => { const t = traits.find((x) => x.index === ref.index); return t ? { name: t.name, text: text(t.desc ?? t.description), level: ref.level ?? 1 } : { name: ref.name, text: '', level: 1 }; };

  // ---- races (5.1) and species (5.2)
  if (is51) {
    const subraces = load(year, 'Subraces');
    for (const r of load(year, 'Races')) {
      const sub = subraces.filter((s) => s.race?.index === r.index);
      const feats = [...(r.traits ?? []).map(traitOf), ...sub.flatMap((s) => (s.racial_traits ?? []).map((t) => ({ ...traitOf(t), name: `${t.name} (${s.name})` })))];
      const guide = core('race', r.name);
      const derived = [...(r.ability_bonuses ?? []), ...sub.flatMap((s) => s.ability_bonuses ?? [])].map((b) => ({ t: 'ability', ab: b.ability_score.index, n: b.bonus }));
      add(v, 'race', r.name, {
        size: r.size, speed: r.speed, languages: r.language_desc ?? names(r.languages).join(', '),
        desc: [sub.length ? `${sub.map((s) => s.desc).join(' ')} (This entry includes the ${sub.map((s) => s.name).join(' and ')} traits.)` : '', r.age, r.size_description].filter(Boolean).join('\n\n'),
        effects: guide?.data.effects ?? [...derived, ...feats.flatMap((f) => traitEffects(f.name, f.text))],
        features: feats.map((f) => ({ level: 1, name: f.name, text: f.text })),
      });
    }
  } else {
    const subs = load(year, 'Subspecies');
    for (const r of load(year, 'Species')) {
      // sizes: the ones a player picks from (the Tiefling: Small or Medium)
      const sizes = r.size_options ? r.size_options.from.options.map((o) => o.size) : [r.size ?? 'Medium'];
      add(v, 'race', r.name, {
        type: r.type ?? 'Humanoid', sizes, size: sizes.join(' or '), speed: r.speed, desc: '',
        // the traits' own effects are what the sheet reads; nothing is given apart from a trait
        effects: [], features: species2024(r, subs, traitOf),
      });
    }
  }

  // ---- classes and subclasses
  const levels = load(year, 'Levels'), features = load(year, 'Features'), classes = load(year, 'Classes');
  const featLevel = (f) => Number(typeof f.level === 'object' ? String(f.level?.index ?? '').split('-').pop() : f.level) || 1;
  const featText = (f) => text(f.desc ?? f.description);
  for (const c of classes) {
    const own = levels.filter((l) => l.class?.index === c.index && !l.subclass).sort((a, b) => a.level - b.level);
    const mine = features.filter((f) => f.class?.index === c.index && !f.subclass);
    const kids = mine.filter((f) => f.parent);
    const feats = mine.filter((f) => !f.parent).map((f) => {
      const options = kids.filter((k) => k.parent.index === f.index);
      return { level: featLevel(f), name: f.name, text: [featText(f), ...options.map((k) => `${k.name}: ${featText(k)}`)].filter(Boolean).join('\n\n') };
    }).sort((a, b) => a.level - b.level);
    // The level table lists a feature at every level it comes up (Ability Score Improvement at
    // 4, 8, 12, 16; the subclass at 3, 7, ...), but the feature list has each one once: repeat it.
    for (const l of own) for (const ref of l.features ?? []) {
      if (feats.some((f) => f.level === l.level && f.name === ref.name)) continue;
      const first = feats.find((f) => f.name === ref.name);
      if (first) feats.push({ level: l.level, name: first.name, text: first.text });
    }
    feats.sort((p, q) => p.level - q.level);
    const guide = is51 ? core('class', c.name) : null;
    const kind = castKind(own, c.index);
    const saves = names(c.saving_throws).map((s) => s.toLowerCase());
    const derived = [...saves.map((s) => ({ t: 'prof', kind: 'save', v: s })), ...(is51 ? levelEffects(own) : fix2024(c.index, levelEffects(own))), ...(is51 ? [] : EXTRA_2024[c.index] ?? [])];
    add(v, 'class', c.name, {
      hd: c.hit_die, primary: c.primary_ability?.desc ?? guide?.data.primary ?? '', saves, ...classProfs(c),
      casting: kind === 'none' ? { kind } : { kind, ability: c.spellcasting?.spellcasting_ability?.index ?? CAST_ABILITY[c.index] ?? 'int', ...(is51 ? {} : { rules: '2024', ...(SRD_FOCUS[c.name] ? { focus: SRD_FOCUS[c.name] } : {}), cantrips: perLevel(own, 'cantrips_known'), prepared: perLevel(own, 'prepared_spells') }) },
      desc: guide?.data.desc ?? '', effects: guide?.data.effects ?? derived, features: is51 ? feats : withOptions(feats),
      ...(is51 ? {} : { startEquip: startEquip(c), multiclass: multiclass(c) }),
    });
  }
  for (const s of load(year, 'Subclasses')) {
    const parent = s.class?.name ?? '';
    const feats = is51
      ? features.filter((f) => f.subclass?.index === s.index && !f.parent).map((f) => ({ level: featLevel(f), name: f.name, text: [featText(f), ...features.filter((k) => k.parent?.index === f.index).map((k) => `${k.name}: ${featText(k)}`)].join('\n\n') }))
      : (s.features ?? []).map((f) => ({ level: Number(f.level) || 3, name: f.name, text: text(f.description ?? f.desc) }));
    const guide = is51 ? SRD_CORE.find((e) => e.type === 'subclass' && e.data.parent === parent) : null;
    if (!is51 && SUBCLASS_2024[s.name]) for (const f of feats) Object.assign(f, SUBCLASS_2024[s.name][f.name] ?? {});
    add(v, 'subclass', s.name, {
      parent, desc: [s.subclass_flavor ? `${s.subclass_flavor}.` : '', s.summary ?? '', text(s.desc ?? s.description)].filter(Boolean).join(' '),
      features: feats.sort((a, b) => a.level - b.level).map((f) => { const g = guide?.data.features.find((x) => x.name.toLowerCase().replace(/^channel divinity: /, '') === f.name.toLowerCase().replace(/^channel divinity: /, '')); return g?.effects ? { ...f, effects: g.effects } : f; }),
    });
  }

  // ---- backgrounds, feats
  for (const b of load(year, 'Backgrounds')) {
    if (!is51) { add(v, 'background', b.name, background2024(b)); continue; }
    const profs = names(b.starting_proficiencies ?? b.proficiencies);
    const skills = profs.filter((p) => /^Skill: /.test(p)).map((p) => p.slice(7)), tools = profs.filter((p) => !/^Skill: /.test(p)).map((p) => p.replace(/^Tool: /, ''));
    const abil = names(b.ability_scores);
    add(v, 'background', b.name, {
      skills, toolProfs: tools.join(', ') || 'None', languages: b.language_options ? `${b.language_options.choose} of your choice` : '',
      equipment: text((b.equipment_options ?? []).map((o) => o.desc).filter(Boolean)) || (b.starting_gold ? `Starting gold: ${money(b.starting_gold)}` : ''),
      desc: abil.length ? `Ability scores: ${abil.join(', ')}. Increase one of them by 2 and another by 1, or all three by 1 (none above 20).${b.feat ? ` Feat: ${b.feat.name}${b.feat.note ? ` (${b.feat.note})` : ''}.` : ''}` : '',
      effects: [...skills.map((s) => ({ t: 'prof', kind: 'skill', v: s })), ...tools.map((t) => ({ t: 'prof', kind: 'tool', v: t })), ...(abil.length ? [1, 2, 3].map(() => ({ t: 'ability', ab: 'any', n: 1 })) : [])],
      features: b.feature ? [{ level: 1, name: b.feature.name, text: text(b.feature.desc) }] : [],
    });
  }
  for (const f of load(year, 'Feats')) {
    add(v, 'feat', f.name, is51 ? { prereq: prereqText(f.prerequisites), category: f.type ? cap(String(f.type).replace(/-/g, ' ')) : '', desc: text(f.desc ?? f.description) } : feat2024(f));
  }

  // ---- spells
  for (const s of load(year, 'Spells')) {
    add(v, 'spell', s.name, {
      level: Number(s.level) || 0, school: s.school?.name ?? '', time: s.casting_time ?? '', range: s.range ?? '',
      comp: [names(s.components).join(', '), s.material ? `(${s.material})` : ''].filter(Boolean).join(' '),
      duration: (s.concentration && !/^concentration/i.test(String(s.duration)) ? 'Concentration, ' : '') + String(s.duration ?? '').replace(/^Up to/, 'up to'),
      conc: !!s.concentration, ritual: !!s.ritual, classes: names(s.classes), desc: text(s.desc ?? s.description), higher: text(s.higher_level),
      // the 2024 rules as fields the site can track (src/lib/spell-rules.mjs); the text above stays the official wording
      ...(is51 ? {} : { rules: parseSpell(s) }),
    });
  }

  // ---- equipment, magic items, poisons
  for (const e of load(year, 'Equipment')) {
    const cats = names(e.equipment_categories ?? [e.equipment_category]);
    const isWeapon = !!e.damage || cats.some((c) => /weapon/i.test(c)), isArmor = !!e.armor_class || cats.some((c) => /armor|shield/i.test(c));
    const ac = e.armor_class ? `${e.armor_class.base}${e.armor_class.dex_bonus ? ' + Dex' + (e.armor_class.max_bonus ? ` (max ${e.armor_class.max_bonus})` : '') : ''}` : '';
    add(v, 'item', e.name, {
      kind: isWeapon ? 'Weapon' : isArmor ? 'Armor' : 'Gear', rarity: 'Standard', cost: money(e.cost), weight: e.weight ? `${e.weight} lb.` : '',
      damage: e.damage ? `${e.damage.damage_dice} ${String(e.damage.damage_type?.name ?? '').toLowerCase()}`.trim() : '', ac,
      props: [cats.filter((c) => !/^(Weapons?|Armor|Adventuring Gear|Equipment)$/i.test(c)).slice(0, 2).join(', '), names(e.properties).join(', '), e.mastery ? `Mastery: ${e.mastery.name}` : '', e.two_handed_damage ? `Versatile (${e.two_handed_damage.damage_dice})` : '', e.str_minimum ? `Strength ${e.str_minimum}` : '', e.stealth_disadvantage ? 'Disadvantage on Stealth' : '', e.range?.long ? `Range ${e.range.normal}/${e.range.long}` : ''].filter(Boolean).join('. '),
      desc: text(e.desc ?? e.description),
      ...(is51 ? {} : item2024(e, cats)),
    });
  }
  for (const m of load(year, 'Magic-Items')) {
    const desc = text(m.desc ?? m.description);
    if (!is51) { const x = magic2024(m); add(v, 'item', m.name, { ...x, rarity: x.magic.rarity, attune: x.magic.attune }); continue; }
    add(v, 'item', m.name, { kind: 'Magic item', rarity: m.rarity?.name ?? 'Varies', attune: m.attunement ?? /requires attunement/i.test(desc), desc });
  }
  for (const p of load(year, 'Poisons')) add(v, 'item', p.name, { kind: 'Gear', rarity: 'Standard', cost: p.cost ? `${p.cost} gp` : '', props: `Poison (${p.type})`, desc: text(p.description ?? p.desc) });

  // ---- monsters
  for (const m of load(year, 'Monsters')) {
    const profs = m.proficiencies ?? [];
    const pick = (prefix) => profs.filter((p) => String(p.proficiency?.name ?? '').startsWith(prefix)).map((p) => `${p.proficiency.name.slice(prefix.length)} +${p.value}`).join(', ');
    const act = (list, label) => (list ?? []).map((a) => ({ name: (label ? label + ': ' : '') + a.name, text: text(a.desc ?? a.description) }));
    add(v, 'monster', m.name, {
      size: m.size ?? 'Medium', mtype: cap(m.type) + (m.subtype ? ` (${m.subtype})` : ''), align: m.alignment ?? '',
      acv: Number(Array.isArray(m.armor_class) ? m.armor_class[0]?.value : m.armor_class) || 10, hpv: Number(m.hit_points) || 1, hdv: m.hit_points_roll ?? m.hit_dice ?? '',
      mspeed: Object.entries(m.speed ?? {}).map(([k, val]) => (k === 'walk' ? val : `${k} ${val}`)).join(', '),
      ab: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
      msaves: pick('Saving Throw: '), mskills: pick('Skill: '),
      senses: Object.entries(m.senses ?? {}).map(([k, val]) => `${cap(k.replace(/_/g, ' '))} ${val}`).join(', '), langs: m.languages ?? '', cr: crText(m.challenge_rating),
      vuln: names(m.damage_vulnerabilities).join(', '), resist: names(m.damage_resistances).join(', '), immune: [names(m.damage_immunities).join(', '), names(m.condition_immunities).join(', ')].filter(Boolean).join('; '),
      traits: act(m.special_abilities), actions: [...act(m.actions), ...act(m.bonus_actions, 'Bonus action'), ...act(m.reactions, 'Reaction'), ...act(m.legendary_actions, 'Legendary')],
      ...(is51 ? {} : monster2024(m)),
    });
  }

  // ---- conditions and rules reference text
  for (const c of load(year, 'Conditions')) add(v, 'condition', c.name, { desc: text(c.desc ?? c.description) });
  const rules = load(year, 'Rules');
  const chapterOf = new Map(rules.filter((r) => r.children).flatMap((r) => r.children.map((k) => [k.index, r.name])));
  for (const r of rules.filter((x) => x.desc)) add(v, 'rule', r.name, { section: chapterOf.get(r.index) ?? 'Rules', desc: text(r.desc) });
  for (const [file, section] of [['Skills', 'Skills'], ['Damage-Types', 'Damage types'], ['Weapon-Properties', 'Weapon properties'], ['Weapon-Mastery-Properties', 'Weapon mastery'], ['Languages', 'Languages'], ['Alignments', 'Alignments'], ['Magic-Schools', 'Schools of magic'], ['Ability-Scores', 'Ability scores']]) {
    for (const x of load(year, file)) {
      const body = text(x.desc ?? x.description) || [x.type ? `Type: ${x.type}.` : '', x.typical_speakers?.length ? `Typical speakers: ${names(x.typical_speakers).join(', ')}.` : '', x.script ? `Script: ${x.script}.` : ''].filter(Boolean).join(' ');
      if (body) add(v, 'rule', `${section}: ${x.full_name ?? x.name}`, { section, desc: body });
    }
  }
}

// ================================================================ write to the database

const all = [];
for (let from = 0; ; from += 1000) { const { data, error } = await admin.from('entities').select('id, type, slug, name, source, srd_version, data').range(from, from + 999); if (error) { console.error(error.message); process.exit(1); } all.push(...data); if (data.length < 1000) break; }
const srdNow = new Map(all.filter((e) => e.source === 'srd').map((e) => [`${e.srd_version}/${e.type}/${e.slug}`, e]));
const others = all.filter((e) => e.source !== 'srd');
const stable = (o) => JSON.stringify(o, (_, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, val[k]])) : val));

const seen = new Set(), fresh = [], replaced = [], collisions = [];
const counts = {};
let unchanged = 0, updated = 0;
for (const e of out) {
  let slug = slugify(e.name) || 'entry';
  for (let n = 2; seen.has(`${e.v}/${e.type}/${slug}`); n++) slug = `${slugify(e.name)}-${n}`;
  const key = `${e.v}/${e.type}/${slug}`;
  seen.add(key);
  (counts[e.v] ||= {})[e.type] = (counts[e.v][e.type] || 0) + 1;
  const row = { owner_id: null, source: 'srd', srd_version: e.v, type: e.type, slug, name: e.name, status: 'live', depth: 'advanced', data: e.data };
  const was = srdNow.get(key);
  if (!was) fresh.push(row);
  else if (was.name === row.name && stable(was.data) === stable(row.data)) unchanged++;
  else {
    const r = await admin.from('entities').update(row).eq('id', was.id);
    if (r.error) failed.push(`${key}: ${r.error.message}`); else { updated++; replaced.push(`${e.v} ${e.type}: ${was.name}`); }
  }
  const clash = others.filter((o) => o.type === e.type && o.name.toLowerCase() === e.name.toLowerCase());
  clash.forEach((o) => collisions.push(`${e.type} "${e.name}" (SRD ${e.v}) and a ${o.source} entry of the same name: both kept`));
}
let added = 0;
for (let i = 0; i < fresh.length; i += 200) {
  const r = await admin.from('entities').insert(fresh.slice(i, i + 200));
  if (r.error) { failed.push(`insert ${fresh[i].type} ${fresh[i].name}…: ${r.error.message}`); } else added += Math.min(200, fresh.length - i);
}
// entries that were marked srd but are not in the official data (the hand-written stand-ins)
const gone = [...srdNow].filter(([k]) => !seen.has(k)).map(([, e]) => e);
const removed = [];
for (const e of gone) {
  const r = await admin.from('entities').delete().eq('id', e.id).eq('source', 'srd');
  if (r.error) failed.push(`remove ${e.type} ${e.name}: ${r.error.message}`); else removed.push(`${e.srd_version} ${e.type}: ${e.name}`);
}

const types = ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'item', 'monster', 'condition', 'rule'];
const label = { race: 'Races / species', class: 'Classes', subclass: 'Subclasses', background: 'Backgrounds', feat: 'Feats', spell: 'Spells', item: 'Equipment, magic items and poisons', monster: 'Monsters', condition: 'Conditions', rule: 'Rules reference text' };
const firstRun = !fs.existsSync(path.join(ROOT, 'docs', 'srd-import-report.md'));
const report = `# SRD import report

Written by \`scripts/import-srd.mjs\`. Source: \`${source.repo}\` at \`${source.ref}\` (fetched ${source.fetched.slice(0, 10)}). See \`docs/srd-import.md\`.

## Counts

| Category | SRD 5.1 (2014 rules) | SRD 5.2 (2024 rules) |
|---|---|---|
${types.map((t) => `| ${label[t]} | ${counts['5.1']?.[t] ?? 0} | ${counts['5.2']?.[t] ?? 0} |`).join('\n')}
| **Total** | **${Object.values(counts['5.1'] ?? {}).reduce((a, b) => a + b, 0)}** | **${Object.values(counts['5.2'] ?? {}).reduce((a, b) => a + b, 0)}** |

This run: ${added} added, ${updated} replaced, ${unchanged} already up to date, ${removed.length} removed, ${failed.length} failed.

## Failed to import

${failed.length ? failed.map((f) => `- ${f}`).join('\n') : 'Nothing failed.'}

## Not in the source data

- The 2024 data has no rules chapters (the 2014 data has ${counts['5.1']?.rule ?? 0} rules entries, most of them chapter text). For 5.2 the reference text imported is: skills, damage types, weapon properties, weapon mastery, languages, alignments, schools of magic and ability scores, plus conditions.
- Subraces (5.1) and lineages, legacies and ancestries (5.2) are folded into their race or species entry as traits, because the character sheet has no separate subrace choice.

## Entries marked \`srd\` that did not match the official SRD and were replaced

${replaced.length ? replaced.map((f) => `- ${f}`).join('\n') : (firstRun ? 'None.' : 'None in this run.')}

## Entries marked \`srd\` that are not in the official SRD and were removed

${removed.length ? removed.map((f) => `- ${f}`).join('\n') : (firstRun ? 'None.' : 'None in this run.')}

## Names shared with homebrew or private entries (both kept)

${collisions.length ? [...new Set(collisions)].map((f) => `- ${f}`).join('\n') : 'None.'}
`;
if (firstRun || added || updated || removed.length || failed.length) fs.writeFileSync(path.join(ROOT, 'docs', 'srd-import-report.md'), report);
console.log(`SRD import: ${added} added, ${updated} replaced, ${unchanged} unchanged, ${removed.length} removed, ${failed.length} failed.`);
console.log(JSON.stringify(counts));
if (failed.length) console.log(failed.slice(0, 10).join('\n'));
