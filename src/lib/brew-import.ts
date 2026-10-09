/* eslint-disable @typescript-eslint/no-explicit-any */
// Import any kind of homebrew from notes, with the DM's own AI doing the reading (like the class import,
// src/lib/class-import.ts): one prompt per kind, in a friendly JSON format, and a reader that turns the
// AI's answer into that kind's editor data. Anything the answer leaves out stays blank.

import { SKILL_NAMES } from '@/config/homebrew';
import { ALL_LANGUAGES } from '@/config/proficiencies';
import { IMPORT_PROMPT, ab, abs, choiceOf, giveOf, int, parseClassImport, pickName, str, type ImportResult } from './class-import';
import { srdListFor, type SpellOption } from './class-spells';

export const BREW_KINDS: [string, string][] = [
  ['class', 'Class'], ['subclass', 'Subclass'], ['race', 'Race or species'], ['background', 'Background'], ['feat', 'Feat'],
  ['spell', 'Spell'], ['item', 'Item'], ['monster', 'Monster'], ['resource', 'Custom resource'],
];

const head = (what: string, id: string) => `I am going to give you my notes for a homebrew fifth edition ${what}. Turn them into one JSON object in exactly the format below, so a website can fill in its editor.

Rules:
- Use ONLY what my notes say. Do not invent, balance or "complete" anything.
- If my notes do not mention something, leave that key out (or use an empty list). Never guess.
- Copy descriptions in my own words; do not rewrite them.
- If my notes say this is a reskin, reflavor or variant of an official fifth edition one (from the SRD), put the official name in "basedOn". For each part that reflavors an official part, put the official part's name in "reskinOf". Leave out everything my notes do not change: the website fills it in from the official one.
- Use the structured keys (gives, grows, chooses, limit) for anything the rules track; keep "description" for the words players read.
- Answer with the JSON only: no explanation before or after it.

Format (every key is optional except "format"):
{
  "format": "dungeons-by-bryce-${id}-1",
  "basedOn": "the official ${what} this reskins, if my notes say so",`;
const tail = `
}

My notes:
`;

// the parts every trait, benefit or feature can have (the same as a class feature's)
const GIVES_DOC = `"gives": [                                // what it adds to the character by itself
        { "type": "proficiency", "in": "skill" | "save" | "armor" | "weapon" | "tool" | "language", "what": "Perception" }
        | { "type": "armorClass", "bonus": 1 }
        | { "type": "speed", "kind": "walk" | "fly" | "swim" | "climb" | "burrow", "feet": 10 }
        | { "type": "resistance", "damage": "fire", "immune": false }
        | { "type": "conditionImmunity", "condition": "Charmed" }
        | { "type": "sense", "sense": "Darkvision" | "Blindsight" | "Tremorsense" | "Truesight", "feet": 60 }
        | { "type": "hitPointsPerLevel", "amount": 1 }
        | { "type": "abilityIncrease", "ability": "str" | "any", "amount": 1 }
        | { "type": "advantage", "on": "save" | "check" | "attack" | "initiative", "ability": "wis", "when": "against being Frightened" }
        | { "type": "extraDamage", "amount": "1d4" | "cha", "damageType": "radiant", "when": "against Undead" }
        | { "type": "bonus", "to": "save" | "check" | "attack" | "initiative" | "damage", "amount": 1 | "proficiency" | "cha", "when": "while in your aura" }
        | { "type": "spell", "name": "a spell always prepared or known" }
        | { "type": "note", "text": "anything else" }
      ]`;
const TRAIT_DOC = (word: string, levels: boolean) => `{
      ${levels ? '"level": 1,                               // the character level it starts at\n      ' : ''}"name": "${word} name",
      "reskinOf": "the official ${word} this one reflavors, if my notes say so",
      "description": "what it does, in my words",
      "limit": { "times": 1 | "proficiency", "per": "turn" | "round" | "short" | "long" },   // only if it has limited uses
      "chooses": {                               // only if the player picks something
        "count": 1,
        "from": "Fighting Styles" | "Origin feats" | "General feats" | "Weapons" | "Skills" | "Any skills" | "Spells" | "Custom",
        "spellLevel": 0,                         // for "Spells": 0 for cantrips, 1-9, or leave out for any
        "spellLists": ["Wizard"],                // for "Spells": whose spell lists
        "options": [{ "name": "option name", "description": "what it does", "gives": [ ...as below ] }]   // only for "Custom"
      },
      "grows": [{ "name": "Damage", "kind": "distance" | "dice" | "bonus" | "count" | "duration" | "other", "values": [[5, "2d6"], [11, "3d6"]] }],
      ${GIVES_DOC}
    }`;

const SUBCLASS_PROMPT = `${head('subclass', 'subclass')}
  "name": "subclass name",
  "parentClass": "the class it belongs to, like Fighter",
  "description": "what the subclass is like",
  "features": [
    ${TRAIT_DOC('feature', true).replace('the character level it starts at', 'the class level it is gained at')}
  ]${tail}`;
const RACE_PROMPT = `${head('race (species)', 'race')}
  "name": "race name",
  "description": "what the people are like",
  "creatureType": "Humanoid",
  "sizes": ["Small", "Medium"],              // the sizes a player can pick from
  "speed": 30,                               // walking speed in feet
  "languages": { "known": ["Common"], "choose": 1 },
  "traits": [
    ${TRAIT_DOC('trait', true)}
  ]${tail}`;
const BACKGROUND_PROMPT = `${head('background', 'background')}
  "name": "background name",
  "description": "who the character was",
  "abilityScores": ["str", "dex", "con"],   // the three abilities a player can raise
  "originFeat": { "name": "Alert", "note": "" },   // note: a version, like "Cleric" for Magic Initiate
  "skills": ["Athletics", "Survival"],
  "tools": ["Thieves' Tools"],
  "toolChoice": { "count": 1, "from": "Artisan's tools" | "Musical instruments" | "Gaming sets" | "Any tool" },
  "languages": { "known": [], "choose": 0 },
  "equipment": [                             // the packages a player picks one of
    { "items": [{ "name": "Rope", "count": 1 }], "gold": 10 },
    { "items": [], "gold": 50 }
  ],
  "traits": [
    ${TRAIT_DOC('feature', false)}
  ]${tail}`;
const FEAT_PROMPT = `${head('feat', 'feat')}
  "name": "feat name",
  "description": "a line about the feat",
  "category": "Origin" | "General" | "Fighting style" | "Epic boon",
  "prerequisite": { "level": 4, "feature": "Spellcasting", "abilities": [{ "ability": "str", "min": 13 }], "join": "or" | "and", "other": "anything else" },
  "repeatable": false,
  "repeatNote": "what changes when it is taken again",
  "benefits": [
    ${TRAIT_DOC('benefit', false)}
  ]${tail}`;
const SPELL_PROMPT = `${head('spell', 'spell')}
  "name": "spell name",
  "level": 0,                                // 0 for a cantrip
  "school": "Abjuration" | "Conjuration" | "Divination" | "Enchantment" | "Evocation" | "Illusion" | "Necromancy" | "Transmutation",
  "castingTime": "1 action" | "1 bonus action" | "1 reaction, which you take when ..." | "10 minutes",
  "ritual": false,
  "range": "60 feet" | "Self" | "Self (15-foot cone)" | "Touch" | "Sight",
  "components": "V, S, M",
  "material": "a pinch of sulfur",
  "duration": "Instantaneous" | "1 minute" | "Concentration, up to 1 hour",
  "description": "what the spell does, in my words",
  "higherLevels": "what changes when cast with a higher slot, or for a cantrip at higher character levels",
  "classes": ["Wizard", "Sorcerer"]${tail}`;
const ITEM_PROMPT = `${head('item', 'item')}
  "name": "item name",
  "kind": "Weapon" | "Armor" | "Gear" | "Magic item",
  "description": "what it is and does",
  "cost": { "amount": 15, "unit": "cp" | "sp" | "gp" | "pp" },
  "weight": 3,                               // pounds
  "weapon": {                                // a weapon, or a magic weapon of one kind
    "category": "simple" | "martial", "type": "melee" | "ranged",
    "damage": "1d8", "damageType": "slashing", "versatile": "1d10",
    "range": { "normal": 80, "long": 320 },
    "properties": ["Finesse" | "Heavy" | "Light" | "Loading" | "Reach" | "Thrown" | "Two-Handed" | "Versatile" | "Ammunition"],
    "mastery": "Cleave" | "Graze" | "Nick" | "Push" | "Sap" | "Slow" | "Topple" | "Vex"
  },
  "armor": {                                 // armor, a shield, or magic armor of one kind
    "type": "light" | "medium" | "heavy" | "shield", "baseAC": 14,
    "dexBonus": "full" | "max2" | "none", "strengthNeeded": 13, "stealthDisadvantage": false
  },
  "magic": {                                 // only for a magic item
    "type": "Armor" | "Weapon" | "Wondrous Item" | "Ring" | "Rod" | "Staff" | "Wand" | "Potion" | "Scroll",
    "rarity": "Common" | "Uncommon" | "Rare" | "Very Rare" | "Legendary" | "Artifact",
    "attunement": true, "attunementBy": "a Wizard",
    "bonus": { "amount": 1, "to": "weapon" | "ac" | "acAndSaves" | "spell" },
    "charges": { "count": 7, "regain": "1d6 + 1", "when": "dawn" | "long" | "short" | "never" },
    "spells": [{ "name": "Fireball", "charges": 3 }],
    "properties": [
      ${TRAIT_DOC('property', false)}
    ],
    ${GIVES_DOC.replace('what it adds to the character by itself', 'what it gives whoever wears or holds it')}
  }${tail}`;
const MONSTER_PROMPT = `${head('monster', 'monster')}
  "name": "monster name",
  "size": "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan",
  "type": "Beast" | "Dragon" | "Undead" | "...", "tags": "Goblinoid", "alignment": "Neutral Evil",
  "challengeRating": "1/2",
  "armorClass": 15, "armorNote": "natural armor",
  "hitPoints": 45, "hitDice": "6d10 + 12",
  "speed": { "walk": 30, "fly": 60, "swim": 0, "climb": 0, "burrow": 0 }, "hover": false,
  "abilities": { "str": 16, "dex": 12, "con": 14, "int": 6, "wis": 10, "cha": 8 },
  "savingThrows": { "dex": 3 },              // the bonuses printed in the stat block
  "skills": { "Stealth": 5 },
  "damageVulnerabilities": [], "damageResistances": ["cold"], "damageImmunities": [],
  "conditionImmunities": ["Charmed"],
  "senses": { "darkvision": 60, "blindsight": 0, "tremorsense": 0, "truesight": 0 },
  "languages": "Common, Goblin", "telepathy": 0,
  "traits": [ ACTION ], "actions": [ ACTION ], "bonusActions": [ ACTION ], "reactions": [ ACTION ],
  "legendaryActions": [ ACTION ], "legendaryPerRound": 3
}

Each ACTION is:
{
  "name": "Bite",
  "description": "the stat block text, in my words",
  "kind": "attack" | "save" | "multiattack" | "spellcasting" | "other",
  "attack": { "type": "melee" | "ranged" | "both", "bonus": 5, "reach": 5, "range": { "normal": 80, "long": 320 } },
  "damage": [{ "dice": "2d6 + 3", "type": "piercing" }],
  "save": { "ability": "dex", "dc": 13, "onSuccess": "half" | "none" | "other" },
  "limit": { "type": "recharge", "min": 5 } | { "type": "perDay", "times": 3 },
  "spellcasting": { "ability": "cha", "dc": 14, "attackBonus": 6, "spells": [{ "name": "Mage Hand", "use": "atWill" | "perDay" | "whenUsed", "times": 1, "level": 3 }] }
}

My notes:
`;
const RESOURCE_PROMPT = `${head('resource (a pool of points or uses every character in a campaign has)', 'resource')}
  "name": "resource name, like Divinity",
  "description": "what the pool is",
  "unit": "point", "units": "points",       // what one, and more than one, is called
  "amount": { "type": "fixed", "value": 2 }
          | { "type": "byLevel", "steps": [[1, 2], [5, 3]] }        // [from character level, amount]
          | { "type": "levelTimes", "value": 5 }                     // character level x value
          | { "type": "halfLevel" } | { "type": "proficiency" }
          | { "type": "ability", "ability": "wis" },
  "recharge": "long" | "short" | "oneOnShort" | "never",
  "fromLevel": 1,
  "waysToSpend": [
    ${TRAIT_DOC('way to spend it', true).replace('"name": "way to spend it name",', '"name": "what it is called",\n      "cost": 2,                                 // how many it spends; leave out if the player picks')}
  ]${tail}`;

export const PROMPTS: Record<string, string> = {
  class: IMPORT_PROMPT, subclass: SUBCLASS_PROMPT, race: RACE_PROMPT, background: BACKGROUND_PROMPT, feat: FEAT_PROMPT,
  spell: SPELL_PROMPT, item: ITEM_PROMPT, monster: MONSTER_PROMPT, resource: RESOURCE_PROMPT,
};

// ---------------------------------------------------------------- reading the answer

const PER: Record<string, string> = { turn: 'turn', round: 'round', short: 'short', shortrest: 'short', long: 'long', longrest: 'long', day: 'long', initiative: 'initiative' };
const KINDS = ['distance', 'dice', 'bonus', 'count', 'duration', 'other'];
const list = (v: unknown) => (Array.isArray(v) ? v : []);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
const oneOf = (v: unknown, opts: string[], fallback = '') => opts.find((o) => o.toLowerCase() === str(v).toLowerCase()) ?? fallback;

// a trait, benefit, feature, property or way to spend: the same parts as a class feature
function traitOf(t: any, notes: string[], levels: boolean) {
  const name = str(t?.name, 120);
  if (!name) return null;
  const out: any = { name, text: str(t.description) };
  if (levels) out.level = int(t.level, 1, 20) ?? 1;
  if (t.limit && (t.limit.times === 'proficiency' || int(t.limit.times, 1, 20))) out.limit = { n: t.limit.times === 'proficiency' ? 'prof' : int(t.limit.times, 1, 20), per: PER[str(t.limit.per).toLowerCase().replace(/\s/g, '')] ?? 'long' };
  const ch = choiceOf(t.chooses);
  if (ch?.from === 'custom' && Array.isArray(t.chooses?.options)) ch.options = ch.options.map((o: any, i: number) => ({ ...o, effects: list(t.chooses.options[i]?.gives).map((g: any) => giveOf(g, name + ': ' + o.name, notes)).filter(Boolean) }));
  if (ch) out.choice = ch;
  const grows = list(t.grows).filter((g: any) => str(g?.name) && Array.isArray(g.values)).map((g: any) => ({ t: 'scale', name: str(g.name, 60), kind: KINDS.includes(g.kind) ? g.kind : 'other', steps: g.values.map((v: any) => [int(v?.[0], 1, 20) ?? 1, str(v?.[1], 40)]).filter((v: any) => v[1]) }));
  const effects = [...grows, ...list(t.gives).map((g: any) => giveOf(g, name, notes)).filter(Boolean)];
  if (effects.length) out.effects = effects;
  return out;
}
const traits = (v: unknown, notes: string[], levels: boolean) => list(v).map((t) => traitOf(t, notes, levels)).filter(Boolean);
const langsOf = (l: any) => (l && typeof l === 'object' ? { known: list(l.known).map((x) => pickName(x, ALL_LANGUAGES) ?? str(x, 40)).filter(Boolean), choose: int(l.choose, 0, 9) ?? 0 } : null);
const amountOf = (a: any) => (a?.type === 'byLevel' && Array.isArray(a.steps) ? { mode: 'steps', steps: a.steps.map((s: any) => [int(s?.[0], 1, 20) ?? 1, int(s?.[1], 0, 999) ?? 0]) }
  : a?.type === 'levelTimes' ? { mode: 'level', n: int(a.value, 1, 99) ?? 1 }
  : a?.type === 'halfLevel' ? { mode: 'half' } : a?.type === 'proficiency' ? { mode: 'prof' }
  : a?.type === 'ability' && ab(a.ability) ? { mode: 'ability', ab: ab(a.ability) }
  : { mode: 'fixed', n: int(a?.value, 0, 999) ?? 1 });
const RECHARGE: Record<string, string> = { long: 'long', short: 'short', oneOnShort: 'short1', never: 'none' };

function subclassOf(j: any, notes: string[]) {
  return { ...(j.description ? { desc: str(j.description) } : {}), ...(str(j.parentClass) ? { parent: str(j.parentClass, 60) } : {}), features: traits(j.features, notes, true).sort((a: any, b: any) => a.level - b.level) };
}
function raceOf(j: any, notes: string[]) {
  const sizes = list(j.sizes).map((s) => oneOf(s, ['Tiny', 'Small', 'Medium', 'Large'])).filter(Boolean);
  const langs = langsOf(j.languages);
  return { ...(j.description ? { desc: str(j.description) } : {}), type: oneOf(j.creatureType, ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'], 'Humanoid'),
    ...(sizes.length ? { sizes, size: sizes.join(' or ') } : {}), ...(int(j.speed, 0, 120) !== null ? { speed: int(j.speed, 0, 120) } : {}), ...(langs ? { langs } : {}), features: traits(j.traits, notes, true) };
}
function backgroundOf(j: any, notes: string[]) {
  const skills: string[] = [];
  for (const s of list(j.skills)) { const m = pickName(s, SKILL_NAMES); if (m) skills.push(m); else notes.push(`"${str(s)}" is not a fifth edition skill, so it was left out.`); }
  const langs = langsOf(j.languages);
  return {
    ...(j.description ? { desc: str(j.description) } : {}), ...(abs(j.abilityScores).length ? { abilities: abs(j.abilityScores).slice(0, 3) } : {}),
    ...(str(j.originFeat?.name) ? { feat: { name: str(j.originFeat.name, 80), note: str(j.originFeat.note, 60) } } : {}),
    skills, toolItems: list(j.tools).map((t) => str(t, 60)).filter(Boolean), ...(int(j.toolChoice?.count, 1, 9) ? { toolChoice: { n: int(j.toolChoice.count, 1, 9), from: str(j.toolChoice.from, 60) || 'Any tool' } } : {}),
    ...(langs ? { langs } : {}),
    ...(list(j.equipment).length ? { startEquip: list(j.equipment).map((p: any) => ({ items: list(p?.items).map((i: any) => ({ name: str(i?.name, 80), count: int(i?.count, 1, 999) ?? 1 })).filter((i) => i.name), gp: int(p?.gold, 0, 99999) ?? '' })) } : {}),
    features: traits(j.traits, notes, false),
  };
}
function featOf(j: any, notes: string[]) {
  const p = j.prerequisite ?? {};
  const req: any = {};
  if (int(p.level, 1, 20)) req.level = int(p.level, 1, 20);
  if (str(p.feature)) req.feature = str(p.feature, 80);
  const pabs = list(p.abilities).map((a: any) => ({ ab: ab(a?.ability), min: int(a?.min, 1, 30) ?? 13 })).filter((a) => a.ab);
  if (pabs.length) { req.abilities = pabs; req.join = p.join === 'and' ? 'and' : 'or'; }
  if (str(p.other)) req.other = str(p.other, 200);
  return { ...(j.description ? { desc: str(j.description) } : {}), category: oneOf(j.category, ['Origin', 'General', 'Fighting style', 'Epic boon'], 'General'), req, repeatable: !!j.repeatable, ...(str(j.repeatNote) ? { repeatNote: str(j.repeatNote, 300) } : {}), benefits: traits(j.benefits, notes, false) };
}
function spellOf(j: any) {
  const comp = str(j.components, 40);
  return {
    level: int(j.level, 0, 9) ?? 0, school: oneOf(j.school, ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'], 'Evocation'),
    time: str(j.castingTime, 200), ritual: !!j.ritual, range: str(j.range, 80), comp: comp + (str(j.material) && !/\(/.test(comp) ? ` (${str(j.material, 200)})` : ''), material: str(j.material, 200),
    duration: str(j.duration, 80), conc: /concentration/i.test(str(j.duration)), desc: str(j.description), higher: str(j.higherLevels), classes: list(j.classes).map((c) => cap(str(c, 30))).filter(Boolean).join(', '),
  };
}
function itemOf(j: any, notes: string[]) {
  const kind = oneOf(j.kind, ['Weapon', 'Armor', 'Gear', 'Magic item'], j.magic ? 'Magic item' : j.weapon ? 'Weapon' : j.armor ? 'Armor' : 'Gear');
  const out: any = { kind, ...(j.description ? { desc: str(j.description) } : {}) };
  if (j.cost && int(j.cost.amount, 0, 9999999) !== null) { out.costN = int(j.cost.amount, 0, 9999999); out.costUnit = oneOf(j.cost.unit, ['cp', 'sp', 'ep', 'gp', 'pp'], 'gp'); }
  if (j.weight !== undefined && Number.isFinite(Number(j.weight))) out.lb = Number(j.weight);
  const w = j.weapon;
  if (w && typeof w === 'object') out.weapon = {
    cat: w.category === 'martial' ? 'martial' : 'simple', type: w.type === 'ranged' ? 'ranged' : 'melee', dice: str(w.damage, 20), dtype: str(w.damageType, 20).toLowerCase(),
    ...(str(w.versatile) ? { versatile: str(w.versatile, 20) } : {}), ...(int(w.range?.normal, 1, 9999) ? { range: { normal: int(w.range.normal, 1, 9999), long: int(w.range.long, 1, 9999) ?? '' } } : {}),
    props: list(w.properties).map((p) => oneOf(p, ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Reach', 'Thrown', 'Two-Handed', 'Versatile'])).filter(Boolean), mastery: oneOf(w.mastery, ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex']),
  };
  const a = j.armor;
  if (a && typeof a === 'object') {
    const type = oneOf(a.type, ['light', 'medium', 'heavy', 'shield'], 'light');
    out.armor = { type, base: int(a.baseAC, 0, 30) ?? (type === 'shield' ? 2 : 11), dex: oneOf(a.dexBonus, ['full', 'max2', 'none'], type === 'light' ? 'full' : type === 'medium' ? 'max2' : 'none'), ...(int(a.strengthNeeded, 1, 30) ? { strMin: int(a.strengthNeeded, 1, 30) } : {}), stealth: !!a.stealthDisadvantage };
  }
  const m = j.magic;
  if (m && typeof m === 'object') {
    const to = { weapon: 'weapon', ac: 'ac', acandsaves: 'acsave', spell: 'spell' }[str(m.bonus?.to).toLowerCase()] ?? 'weapon';
    out.magic = {
      type: oneOf(m.type, ['Armor', 'Weapon', 'Wondrous Item', 'Ring', 'Rod', 'Staff', 'Wand', 'Potion', 'Scroll'], 'Wondrous Item'), rarity: oneOf(m.rarity, ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies'], 'Uncommon'),
      attune: !!m.attunement, ...(str(m.attunementBy) ? { attuneBy: str(m.attunementBy, 80) } : {}),
      ...(int(m.bonus?.amount, 1, 5) ? { bonus: { n: int(m.bonus.amount, 1, 5), to } } : {}),
      ...(int(m.charges?.count, 1, 99) ? { charges: { n: int(m.charges.count, 1, 99), regain: str(m.charges.regain, 30), when: oneOf(m.charges.when, ['dawn', 'long', 'short', 'never'], 'dawn') } } : {}),
      spells: list(m.spells).map((s: any) => ({ name: str(s?.name, 80), cost: int(s?.charges, 0, 99) ?? 1 })).filter((s) => s.name),
      props: traits(m.properties, notes, false), effects: list(m.gives).map((g) => giveOf(g, str(j.name, 80) || 'the item', notes)).filter(Boolean),
    };
  }
  return out;
}
const DMG = (v: unknown) => list(v).map((x) => str(x, 20).toLowerCase()).filter(Boolean);
function actionOf(a: any) {
  const name = str(a?.name, 120);
  if (!name) return null;
  const kind = { attack: 'attack', save: 'save', multiattack: 'multi', spellcasting: 'cast' }[str(a.kind).toLowerCase()] ?? 'other';
  const out: any = { name, text: str(a.description), kind };
  if (kind === 'attack' && a.attack) out.atk = { type: oneOf(a.attack.type, ['melee', 'ranged', 'both'], 'melee'), bonus: int(a.attack.bonus, -5, 30) ?? 0, ...(int(a.attack.reach, 5, 100) ? { reach: int(a.attack.reach, 5, 100) } : {}), ...(int(a.attack.range?.normal, 1, 9999) ? { range: { normal: int(a.attack.range.normal, 1, 9999), ...(int(a.attack.range.long, 1, 9999) ? { long: int(a.attack.range.long, 1, 9999) } : {}) } } : {}) };
  if (kind === 'save' && a.save) out.save = { ab: ab(a.save.ability) || 'dex', dc: int(a.save.dc, 1, 40) ?? 12, success: oneOf(a.save.onSuccess, ['half', 'none', 'other'], 'half') };
  if (kind === 'attack' || kind === 'save') out.damage = list(a.damage).map((d: any) => ({ dice: str(d?.dice, 30), type: str(d?.type, 20).toLowerCase() })).filter((d) => d.dice);
  if (kind === 'cast' && a.spellcasting) {
    const sc = a.spellcasting;
    out.cast = { ab: ab(sc.ability) || 'cha', ...(int(sc.dc, 1, 40) ? { dc: int(sc.dc, 1, 40) } : {}), ...(int(sc.attackBonus, -5, 30) !== null && sc.attackBonus !== undefined ? { atk: int(sc.attackBonus, -5, 30) } : {}), comps: { v: true, s: true, m: false },
      spells: list(sc.spells).map((s: any) => ({ name: str(s?.name, 80), use: { atwill: 'will', perday: 'day', whenused: 'action' }[str(s?.use).toLowerCase()] ?? 'will', ...(int(s?.times, 1, 9) ? { n: int(s.times, 1, 9) } : {}), ...(int(s?.level, 1, 9) ? { level: int(s.level, 1, 9) } : {}) })).filter((s) => s.name) };
  }
  if (a.limit?.type === 'recharge') out.limit = { type: 'recharge', min: int(a.limit.min, 2, 6) ?? 5 };
  else if (a.limit?.type === 'perDay') out.limit = { type: 'day', n: int(a.limit.times, 1, 9) ?? 1 };
  return out;
}
function monsterOf(j: any) {
  const acts = (v: unknown) => list(v).map(actionOf).filter(Boolean);
  const nums = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => int(o?.[k], 0, 9999)).map((k) => [k, int(o[k], 0, 9999)]));
  const legendary = acts(j.legendaryActions);
  const CRS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
  return {
    size: oneOf(j.size, ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'], 'Medium'), ctype: cap(str(j.type, 30)) || 'Beast', tags: str(j.tags, 60), align: str(j.alignment, 40),
    ...(CRS.includes(str(j.challengeRating)) ? { cr: str(j.challengeRating) } : {}), ...(int(j.armorClass, 1, 40) ? { acv: int(j.armorClass, 1, 40) } : {}), acNote: str(j.armorNote, 60),
    ...(int(j.hitPoints, 1, 9999) ? { hpv: int(j.hitPoints, 1, 9999) } : {}), hdv: str(j.hitDice, 30),
    speeds: { walk: 30, ...nums(j.speed, ['walk', 'fly', 'swim', 'climb', 'burrow']) }, hover: !!j.hover,
    ...(j.abilities ? { ab: Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => [k, int(j.abilities[k], 1, 30) ?? 10])) } : {}),
    saveB: Object.fromEntries(Object.entries(j.savingThrows ?? {}).map(([k, v]) => [ab(k), int(v, -5, 30)]).filter(([k, v]) => k && v !== null)),
    skillB: Object.fromEntries(Object.entries(j.skills ?? {}).map(([k, v]) => [pickName(k, SKILL_NAMES), int(v, -5, 30)]).filter(([k, v]) => k && v !== null)),
    vulnL: DMG(j.damageVulnerabilities), resistL: DMG(j.damageResistances), immuneL: DMG(j.damageImmunities), condImm: list(j.conditionImmunities).map((c) => cap(str(c, 30))).filter(Boolean),
    sensesN: nums(j.senses, ['darkvision', 'blindsight', 'tremorsense', 'truesight']), langsText: str(j.languages, 200), ...(int(j.telepathy, 1, 999) ? { telepathy: int(j.telepathy, 1, 999) } : {}),
    traits: acts(j.traits), actions: acts(j.actions), bonus: acts(j.bonusActions), reactions: acts(j.reactions), legendary, ...(legendary.length ? { legendaryN: int(j.legendaryPerRound, 1, 9) ?? 3 } : {}),
  };
}
function resourceOf(j: any, notes: string[]) {
  return {
    ...(j.description ? { desc: str(j.description) } : {}), unit: str(j.unit, 40) || 'point', ...(str(j.units) ? { units: str(j.units, 40) } : {}),
    amount: amountOf(j.amount), recharge: RECHARGE[str(j.recharge)] ?? 'long', from: int(j.fromLevel, 1, 20) ?? 1,
    spend: list(j.waysToSpend).map((t: any) => { const x = traitOf(t, notes, true); return x ? { ...x, cost: t.cost === undefined || t.cost === null || t.cost === '' ? '' : int(t.cost, 0, 99) ?? '' } : null; }).filter(Boolean),
  };
}

const readKind = (type: string, j: any, notes: string[]): any => (type === 'subclass' ? subclassOf(j, notes) : type === 'race' ? raceOf(j, notes) : type === 'background' ? backgroundOf(j, notes) : type === 'feat' ? featOf(j, notes)
  : type === 'spell' ? spellOf(j) : type === 'item' ? itemOf(j, notes) : type === 'monster' ? monsterOf(j) : type === 'resource' ? resourceOf(j, notes) : null);
// what the reader fills in when the answer says nothing (a spell's level 0, a monster's Medium size):
// on a reskin those are not changes, so the official values stay
const defaultsOf = (type: string): any => (type === 'class' ? {} : readKind(type, {}, []) ?? {});

export function parseBrewImport(type: string, text: string, spells: SpellOption[]): ImportResult {
  if (type === 'class') return parseClassImport(text, spells);
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'There is nothing to import in that text. Paste the whole answer your AI gave, starting with { and ending with }.' };
  let j: any;
  try { j = JSON.parse(text.slice(start, end + 1).replace(/\/\/[^\n"]*$/gm, '')); }
  catch { return { ok: false, error: 'That answer is not complete or has a typo in it. Ask your AI to "send the JSON again, with nothing else", then paste it here.' }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, error: 'That answer is not in the expected format. Copy the prompt again and give it to your AI with your notes.' };
  const said = str(j.format).match(/^dungeons-by-bryce-([a-z]+)-/)?.[1];
  if (said && said !== type) return { ok: false, error: `That answer is for a ${said}, but you picked ${BREW_KINDS.find(([k]) => k === type)?.[1].toLowerCase() ?? type} above. Pick ${said} in the list, or give your AI the ${type} prompt.` };
  const notes: string[] = [];
  const data = readKind(type, j, notes);
  if (!data) return { ok: false, error: 'That kind of homebrew cannot be imported yet.' };
  const name = str(j.name, 120);
  if (!name && Object.keys(data).length <= 1) return { ok: false, error: 'The answer did not contain anything to import. Check that your AI received your notes after the prompt.' };
  return { ok: true, name, data, notes };
}

// ---------------------------------------------------------------- reskins of an official entry

// The answer says it is "basedOn" an official entry (a Warlock reskin): start from that entry, so
// everything the notes do not change is the official one's, rename what the notes reflavor ("reskinOf"),
// and lay the notes' own changes on top. Renames reach everything that refers to a part by name:
// the class's resources and growing numbers, the features that spend a resource, and the rules text.
const PARTS: Record<string, string> = { class: 'features', subclass: 'features', race: 'features', background: 'features', feat: 'benefits' };
const RAW_PARTS: Record<string, string> = { class: 'features', subclass: 'features', race: 'traits', background: 'traits', feat: 'benefits', resource: 'waysToSpend' };
const meaningful = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What the answer says it reskins. When the AI left "basedOn" out, the notes often still say it
// ("Warlock variant", "a reskin of the Ranger"): that is tried too (guessed: true), and only used
// if such an entry exists.
const RESKIN_WORDS = '[Rr]eskin|[Rr]e-skin|[Rr]eflavou?r|[Rr]e-flavou?r|[Vv]ariant|[Vv]ersion|[Tt]ake';
export function reskinNamed(s: unknown) {
  const t = str(s);
  return t.match(new RegExp(`\\b(?:${RESKIN_WORDS})(?:ed)? (?:of|on) (?:the |a |an )?([A-Z][\\w'’-]+(?: [A-Z][\\w'’-]+){0,3})`))?.[1]
    ?? t.match(new RegExp(`\\b([A-Z][\\w'’-]+(?: [A-Z][\\w'’-]+){0,3}) (?:${RESKIN_WORDS})\\b`))?.[1] ?? '';
}
export function basedOnOf(text: string): { name: string; guessed: boolean } {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  try {
    const j = JSON.parse(text.slice(start, end + 1).replace(/\/\/[^\n"]*$/gm, ''));
    if (str(j.basedOn)) return { name: str(j.basedOn, 80), guessed: false };
    const g = reskinNamed(j.description) || reskinNamed(j.name);
    return { name: g, guessed: !!g };
  } catch { return { name: '', guessed: false }; }
}

// The AI's answer as an object (null when it cannot be read).
export function readAnswer(text: string): any {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  try { return JSON.parse(text.slice(start, end + 1).replace(/\/\/[^\n"]*$/gm, '')); } catch { return null; }
}

export function applyBase(type: string, base: { name: string; data: any; id?: string; source?: string }, imported: { name: string; data: any; notes: string[] }, j: any, spells: SpellOption[] = []) {
  const notes = [...imported.notes];
  const out: any = structuredClone(base.data);
  const key = PARTS[type];
  const baseParts: any[] = key ? out[key] ?? [] : [];

  // what is renamed: the entry itself, and each part the notes reflavor
  const renames: [string, string][] = [];
  if (imported.name && imported.name.toLowerCase() !== base.name.toLowerCase()) renames.push([base.name, imported.name]);
  const reskinned = new Map<string, string>(); // new name -> official name
  for (const p of list(j[RAW_PARTS[type]])) {
    const to = str(p?.name, 120);
    // the official part it reflavors: as the answer says, as its description says ("Reflavor of Pact
    // Magic"), or a part with the very same name (the notes change it rather than add one)
    const said = str(p?.reskinOf, 120) || reskinNamed(p?.description);
    const from = said && baseParts.some((b) => str(b.name).toLowerCase() === said.toLowerCase()) ? said : baseParts.some((b) => str(b.name).toLowerCase() === to.toLowerCase()) ? to : said;
    if (!from || !to) continue;
    // the same name, or failing that the one sharing a key word: the 2014 "Divine Smite" is the
    // 2024 "Paladin's Smite", "Wild Shape" is still "Wild Shape"
    const words = (n: string) => lcs(n).replace(/'s\b/g, '').split(/[^a-z]+/).filter((w) => w.length > 3 && !['your', 'with', 'from', 'feature', 'subclass'].includes(w));
    const hit = baseParts.find((b) => str(b.name).toLowerCase() === from.toLowerCase())
      ?? baseParts.filter((b) => !isMarkerName(b.name) && ![...reskinned.values()].includes(b.name)).find((b) => words(b.name).some((w) => words(from).includes(w)));
    if (!hit) { notes.push(`"${to}" reflavors "${from}", which the official ${base.name} does not have, so it was added as a new ${type === 'feat' ? 'benefit' : 'feature'}.`); continue; }
    if (hit.name.toLowerCase() !== from.toLowerCase()) notes.push(`"${to}" reflavors "${from}": the official ${base.name} calls it "${hit.name}", so that is the one renamed.`);
    reskinned.set(to.toLowerCase(), hit.name);
    if (hit.name.toLowerCase() !== to.toLowerCase()) renames.push([hit.name, to]);
  }
  // longest first, so "Mystic Arcanum" is renamed before a shorter name inside it
  renames.sort((a, b) => b[0].length - a[0].length);
  const swap = (s: string) => renames.reduce((t, [a, b]) => t.replace(new RegExp(`\\b${esc(a)}(s?)\\b`, 'g'), b + '$1'), s);
  const named = (n: string) => renames.find(([a]) => a.toLowerCase() === String(n ?? '').toLowerCase())?.[1] ?? n;
  const rid = (id: string) => (String(id).startsWith('r:') ? 'r:' + named(String(id).slice(2)).toLowerCase() : id);
  const fixFx = (fx: any[] | undefined) => (fx ?? []).map((x) => ({ ...x, ...(x.name && (x.t === 'resource' || x.t === 'scale') ? { name: named(x.name) } : {}), ...(x.text ? { text: swap(x.text) } : {}) }));
  if (out.desc) out.desc = swap(out.desc);
  if (out.effects) out.effects = fixFx(out.effects);
  if (Array.isArray(out.resources)) out.resources = out.resources.map((r: any) => ({ ...r, id: rid(r.id ?? 'r:' + r.name), name: named(r.name) }));
  if (key) out[key] = baseParts.map((b) => ({
    ...b, name: isMarkerName(b.name) ? swap(b.name) : named(b.name), text: swap(b.text ?? ''), effects: fixFx(b.effects),
    ...(b.uses?.res ? { uses: { ...b.uses, res: rid(b.uses.res) } } : {}),
    ...(b.choice?.options ? { choice: { ...b.choice, options: b.choice.options.map((o: any) => ({ ...o, text: swap(o.text ?? '') })) } } : {}),
  }));

  // the notes' own parts: a reskin keeps the official mechanics and takes the notes' words and changes;
  // anything else is new
  if (key) {
    for (const p of imported.data[key] ?? []) {
      const of = reskinned.get(String(p.name).toLowerCase());
      const targets = of ? out[key].filter((b: any) => String(b.name).toLowerCase() === String(p.name).toLowerCase()) : [];
      if (!targets.length) { out[key].push(p); continue; }
      const raw = list(j[RAW_PARTS[type]]).find((r: any) => str(r?.name).toLowerCase() === String(p.name).toLowerCase());
      const t = targets.find((b: any) => raw?.level !== undefined && Number(b.level) === Number(raw.level)) ?? targets[0];
      if (str(raw?.description)) t.text = p.text;
      if (raw?.level !== undefined && p.level) t.level = p.level;
      if (meaningful(p.effects)) t.effects = [...(t.effects ?? []).filter((x: any) => x.t === 'scale'), ...p.effects];
      if (p.choice) t.choice = p.choice;
      if (p.uses) t.uses = p.uses;
      if (p.limit) t.limit = p.limit;
    }
    if (type === 'class' || type === 'subclass' || type === 'race') out[key].sort((a: any, b: any) => (Number(a.level) || 1) - (Number(b.level) || 1));
  }

  // everything else the notes set: on top (objects like spellcasting are merged key by key)
  const defaults = defaultsOf(type);
  for (const [k, v] of Object.entries(imported.data)) {
    if (k === key || !meaningful(v) || JSON.stringify(v) === JSON.stringify(defaults[k])) continue;
    // spells the notes name are added to the official class's list, not a list of their own
    if (k === 'spellList' && type === 'class') { out.spellList = [...new Set([...(out.spellList?.length ? out.spellList : srdListFor(spells, base.name)), ...(v as string[])])]; continue; }
    if (k === 'resources' && Array.isArray(out.resources)) { out.resources = [...out.resources.filter((r: any) => !(v as any[]).some((x) => x.name.toLowerCase() === r.name.toLowerCase())), ...(v as any[])]; continue; }
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? { ...out[k], ...v } : v;
  }
  if (type === 'class') out.baseClass = out.baseClass || base.name;
  // an official class keeps its spells on the spells themselves: its reskin starts with that list
  if (type === 'class' && out.casting?.kind && out.casting.kind !== 'none' && !out.spellList?.length) out.spellList = srdListFor(spells, base.name);
  // made to replace an SRD entry: players in its campaigns get this one instead (see getSheetEntities)
  out.replaces = base.id && base.source === 'srd' ? [base.id] : [];
  const kept = baseParts.filter((b) => ![...reskinned.values()].includes(b.name)).length;
  const moved = [...reskinned].filter(([to, from]) => to !== from.toLowerCase());
  const part = type === 'feat' ? 'benefit' : 'feature';
  notes.unshift(`Started from the official ${base.name}: everything your notes did not change is the ${base.name}'s.${moved.length ? ` ${moved.length} ${part}${moved.length > 1 ? 's were' : ' was'} renamed from the ${base.name}'s (${moved.map(([to, from]) => `${from} → ${list(j[RAW_PARTS[type]]).find((r: any) => str(r?.name).toLowerCase() === to)?.name ?? to}`).join(', ')}).` : ''}${kept ? ` ${kept} more ${kept > 1 ? 'were' : 'was'} kept as they are.` : ''}${type === 'class' && imported.data.spellList?.length ? ` The spells your notes name were added to the ${base.name}'s spell list.` : ''}`);
  return { name: imported.name || base.name, data: out, notes };
}
const isMarkerName = (n: string) => /\bsubclass\b/i.test(n ?? '');

// ---------------------------------------------------------------- a class's subclasses

// A class answer's subclasses become real subclasses of it (saved with the class, like ones made on its
// Subclasses tab): the answer's "subclasses", and a feature whose choice is really a subclass pick
// (patrons, oaths, paths: "Pact Origins", with options like "Reflavor of The Fiend"), which is taken out
// of the class. One that reflavors an official subclass starts from it, the same as a reskinned class.
export type NewSub = { id: string; name: string; mine: true; dirty: true; cloned_from: string | null; data: any };
const SUB_WORDS = /\b(patrons?|oaths?|paths?|circles?|colleges?|domains?|traditions?|archetypes?|subclass(?:es)?|schools?|origins?|orders?|bloodlines?|conclaves?|ways?)\b/i;
const lcs = (s: unknown) => String(s ?? '').toLowerCase().trim();
// "The Fiend" finds "Fiend Patron"; "Oath of Devotion" finds itself
export function findSubclass(name: string, all: { id: string; name: string; mine: boolean; data: any }[]) {
  const t = lcs(name).replace(/^the /, '');
  if (!t) return null;
  const srd = all.filter((s) => !s.mine);
  return srd.find((s) => lcs(s.name) === t) ?? srd.find((s) => lcs(s.name).split(/\s+/).includes(t) || lcs(s.name).startsWith(t + ' ') || lcs(s.name).endsWith(' ' + t)) ?? null;
}

export function classSubclasses(j: any, data: any, notes: string[], all: { id: string; name: string; mine: boolean; data: any }[], spells: SpellOption[]) {
  const raw: any[] = [...list(j?.subclasses)];
  // a feature whose options are subclasses: by its name, or by options that reflavor official subclasses
  const features: any[] = data.features ?? [];
  const pick = features.find((f) => f.choice?.from === 'custom' && (f.choice.options ?? []).length >= 2
    && (SUB_WORDS.test(f.name) || (f.choice.options as any[]).filter((o) => findSubclass(reskinNamed(o.text), all)).length >= 2));
  if (pick && !raw.length) {
    for (const o of pick.choice.options) raw.push({ name: o.name, description: o.text, basedOn: reskinNamed(o.text) });
    data.features = features.filter((f) => f !== pick);
    notes.push(`"${pick.name}" lists ${pick.choice.options.length} ${/patron/i.test(pick.name + JSON.stringify(pick.choice.options)) ? 'patrons' : 'options'} a player picks one of, so each became a subclass of this class (see the Subclasses tab), picked at the class's subclass levels.`);
  }
  const subs: NewSub[] = [];
  for (const s of raw) {
    const name = str(s?.name, 120);
    if (!name) continue;
    const own: { name: string; data: any; notes: string[] } = { name, data: subclassOf(s, notes), notes: [] };
    const baseName = str(s.basedOn, 80) || reskinNamed(s.description);
    const base = baseName ? findSubclass(baseName, all) : null;
    let made = own;
    if (base) {
      made = applyBase('subclass', { name: base.name, data: base.data, id: base.id, source: base.mine ? 'homebrew' : 'srd' }, own, s, spells);
      notes.push(`${name} starts from the official ${base.name}: its features, renamed where your notes say so.`);
    } else if (!(own.data.features ?? []).length) {
      notes.push(`${name} has no features in your notes${baseName ? ` (${baseName} is not in the SRD)` : ''}, so it was made with its description only. Add its features on the Subclasses tab.`);
    }
    const { parent: _p, parentClassId: _pc, ...rest } = made.data;
    subs.push({ id: 'new:' + Math.random().toString(36).slice(2), name, mine: true, dirty: true, cloned_from: base?.id ?? null, data: rest });
  }
  return subs;
}
