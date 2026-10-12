// A game system: everything a DM can change about the rules, filled with fifth edition's values.
// A saved system stores only the sections it changed (changesOf); the rest comes from its base (resolve).
import { spellSlots } from '@/lib/rules/engine';
import { DAMAGE_TYPES } from '@/config/homebrew';

export type Ab = { id: string; abbr: string; name: string; desc: string; save: boolean };
export type Skill = { id: string; name: string; ab: string; desc: string; passive: boolean };
export type Condition = { name: string; text: string };
export type Currency = { name: string; abbr: string; rate: number }; // rate: how many of the smallest coin
export type Tracker = { id: string; name: string; max: number; look: 'bar' | 'boxes'; refill: 'long' | 'short' | 'never'; desc: string };
export type JobKey = 'toughness' | 'agility' | 'might' | 'awareness';

export const JOBS: { key: JobKey; label: string; does: string }[] = [
  { key: 'toughness', label: 'Toughness', does: 'Hit points per level, holding concentration' },
  { key: 'agility', label: 'Agility', does: 'Initiative, Armor Class in light and medium armor, finesse and ranged weapons' },
  { key: 'might', label: 'Might', does: 'Carrying capacity, heavy armor, melee weapons, grappling' },
  { key: 'awareness', label: 'Awareness', does: 'Passive scores, noticing hidden things' },
];

export type Sys = {
  name: string; base: '2024' | '2014';
  abilities: { list: Ab[]; min: number; max: number; cap: number; mod: 'half' | 'score' | 'none'; jobs: Record<JobKey, string> };
  skills: { list: Skill[]; expertise: boolean; expertiseKind: 'double' | 'plus2'; toolsAsSkills: boolean };
  proficiency: { on: boolean; table: number[]; armor: string[]; weapons: string[] };
  creation: { roll: boolean; rollDice: string; pointBuy: boolean; budget: number; costs: Record<string, number>; array: boolean; arrayValues: number[]; manual: boolean; increasesFrom: 'background' | 'species' | 'none'; startLevel: number; startGold: 'equipment' | 'roll' | 'fixed'; gold: number };
  leveling: { kind: 'xp' | 'milestone' | 'none'; maxLevel: number; xp: number[]; asiLevels: number[]; feats: boolean; multiclass: boolean };
  health: { kind: 'hp' | 'wounds'; level1: 'max' | 'roll'; later: 'average' | 'roll' | 'choice'; wounds: number; deathSaves: boolean; deathCount: number; deathDC: number; temp: boolean; massive: boolean };
  rests: { short: boolean; shortLength: string; long: boolean; longLength: string; hitDice: boolean; longHeals: 'all' | 'half' | 'none'; slotsBack: 'long' | 'short' };
  combat: { acBase: number; critOn: number; crit: 'dice' | 'max' | 'none'; flanking: boolean; conditions: Condition[]; damage: string[] };
  magic: { on: boolean; kind: 'slots' | 'mana'; levels: number; cantrips: boolean; slots: number[][]; mana: number[]; concentration: boolean; rituals: boolean; components: boolean; schools: string[] };
  equipment: { currencies: Currency[]; carry: 'strength' | 'slots' | 'none'; carryMult: number; encumbrance: boolean; props: string[]; masteries: boolean; masteryList: string[] };
  details: { alignment: boolean; alignments: string[]; inspiration: 'heroic' | 'classic' | 'off'; languages: string[]; sizes: string[]; creatureTypes: string[] };
  trackers: { list: Tracker[] };
  names: { species: string; class: string; subclass: string; background: string; feat: string; spell: string; kinds: Record<string, boolean> };
  monsters: { cr: boolean; crXp: [string, number][]; legendary: boolean; lair: boolean };
  // words replaced in written text (spell and feature descriptions) when something is renamed
  text: { replace: TextRename[] };
};
export type TextRename = { from: string; to: string; types: string[] };
export type SectionKey = Exclude<keyof Sys, 'name' | 'base' | 'text'>;

const ab = (id: string, abbr: string, name: string, desc: string): Ab => ({ id, abbr, name, desc, save: true });
const sk = (name: string, a: string, desc: string, passive = false): Skill => ({ id: name.toLowerCase().replace(/\W+/g, '-'), name, ab: a, desc, passive });

export const FIFTH: Sys = {
  name: 'Fifth Edition (2024)', base: '2024',
  abilities: {
    list: [
      ab('str', 'STR', 'Strength', 'Physical power: lifting, climbing, hitting hard.'),
      ab('dex', 'DEX', 'Dexterity', 'Agility and reflexes: dodging, sneaking, aiming.'),
      ab('con', 'CON', 'Constitution', 'Health and stamina: shrugging off harm.'),
      ab('int', 'INT', 'Intelligence', 'Reasoning and memory: study and recall.'),
      ab('wis', 'WIS', 'Wisdom', 'Awareness and insight: noticing and judging.'),
      ab('cha', 'CHA', 'Charisma', 'Force of personality: persuading and performing.'),
    ],
    min: 3, max: 18, cap: 20, mod: 'half',
    jobs: { toughness: 'con', agility: 'dex', might: 'str', awareness: 'wis' },
  },
  skills: {
    list: [
      sk('Acrobatics', 'dex', 'Keeping your balance, tumbling.'), sk('Animal Handling', 'wis', 'Calming and directing animals.'),
      sk('Arcana', 'int', 'Knowing magic and its lore.'), sk('Athletics', 'str', 'Climbing, jumping, swimming.'),
      sk('Deception', 'cha', 'Lying convincingly.'), sk('History', 'int', 'Knowing past events and people.'),
      sk('Insight', 'wis', 'Reading intentions.'), sk('Intimidation', 'cha', 'Influencing through threats.'),
      sk('Investigation', 'int', 'Finding clues and working things out.'), sk('Medicine', 'wis', 'Treating wounds and illness.'),
      sk('Nature', 'int', 'Knowing plants, animals and weather.'), sk('Perception', 'wis', 'Noticing things with your senses.', true),
      sk('Performance', 'cha', 'Entertaining an audience.'), sk('Persuasion', 'cha', 'Influencing with tact and charm.'),
      sk('Religion', 'int', 'Knowing gods and rites.'), sk('Sleight of Hand', 'dex', 'Pickpocketing, tricks of the hand.'),
      sk('Stealth', 'dex', 'Moving unseen and unheard.'), sk('Survival', 'wis', 'Tracking, foraging, finding the way.'),
    ],
    expertise: true, expertiseKind: 'double', toolsAsSkills: false,
  },
  proficiency: { on: true, table: [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6], armor: ['Light', 'Medium', 'Heavy', 'Shields'], weapons: ['Simple', 'Martial'] },
  creation: {
    roll: true, rollDice: '4d6, drop the lowest', pointBuy: true, budget: 27, costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 },
    array: true, arrayValues: [15, 14, 13, 12, 10, 8], manual: true, increasesFrom: 'background', startLevel: 1, startGold: 'equipment', gold: 50,
  },
  leveling: { kind: 'xp', maxLevel: 20, xp: [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000], asiLevels: [4, 8, 12, 16, 19], feats: true, multiclass: true },
  health: { kind: 'hp', level1: 'max', later: 'choice', wounds: 5, deathSaves: true, deathCount: 3, deathDC: 10, temp: true, massive: true },
  rests: { short: true, shortLength: '1 hour', long: true, longLength: '8 hours', hitDice: true, longHeals: 'all', slotsBack: 'long' },
  combat: {
    acBase: 10, critOn: 20, crit: 'dice', flanking: false, damage: [...DAMAGE_TYPES],
    conditions: [
      { name: 'Blinded', text: 'Cannot see; attacks against it have advantage, its own have disadvantage.' },
      { name: 'Charmed', text: 'Cannot harm the charmer, who has advantage on social checks against it.' },
      { name: 'Deafened', text: 'Cannot hear.' },
      { name: 'Exhaustion', text: 'Levels that add up to penalties on every roll; too many and the creature dies.' },
      { name: 'Frightened', text: 'Disadvantage while it can see the source of its fear; cannot move closer.' },
      { name: 'Grappled', text: 'Speed 0 while held.' },
      { name: 'Incapacitated', text: 'Cannot take actions or reactions.' },
      { name: 'Invisible', text: 'Cannot be seen; advantage on its attacks, disadvantage against it.' },
      { name: 'Paralyzed', text: 'Incapacitated and cannot move; hits from close by are critical.' },
      { name: 'Petrified', text: 'Turned to stone.' },
      { name: 'Poisoned', text: 'Disadvantage on attacks and ability checks.' },
      { name: 'Prone', text: 'Lying down; crawls, and close attacks against it have advantage.' },
      { name: 'Restrained', text: 'Speed 0; disadvantage on attacks and Dexterity saves.' },
      { name: 'Stunned', text: 'Incapacitated; fails Strength and Dexterity saves.' },
      { name: 'Unconscious', text: 'Incapacitated, prone and unaware.' },
    ],
  },
  magic: {
    on: true, kind: 'slots', levels: 9, cantrips: true,
    slots: Array.from({ length: 20 }, (_, l) => { const r = spellSlots('full', l + 1); return Array.from({ length: 9 }, (_, i) => r[i] ?? 0); }),
    mana: [2, 3, 5, 6, 7, 9, 10, 11, 13], concentration: true, rituals: true, components: true,
    schools: ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'],
  },
  equipment: {
    currencies: [{ name: 'Copper', abbr: 'cp', rate: 1 }, { name: 'Silver', abbr: 'sp', rate: 10 }, { name: 'Electrum', abbr: 'ep', rate: 50 }, { name: 'Gold', abbr: 'gp', rate: 100 }, { name: 'Platinum', abbr: 'pp', rate: 1000 }],
    carry: 'strength', carryMult: 15, encumbrance: false,
    props: ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Range', 'Reach', 'Thrown', 'Two-Handed', 'Versatile'],
    masteries: true, masteryList: ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'],
  },
  details: {
    alignment: true, alignments: ['Lawful good', 'Neutral good', 'Chaotic good', 'Lawful neutral', 'Neutral', 'Chaotic neutral', 'Lawful evil', 'Neutral evil', 'Chaotic evil'],
    inspiration: 'heroic',
    languages: ['Common', 'Common Sign Language', 'Draconic', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon'],
    sizes: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'],
    creatureTypes: ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'],
  },
  trackers: { list: [] },
  names: { species: 'Species', class: 'Class', subclass: 'Subclass', background: 'Background', feat: 'Feat', spell: 'Spell', kinds: { species: true, class: true, subclass: true, background: true, feat: true, spell: true, item: true, monster: true, resource: true } },
  monsters: {
    cr: true, legendary: true, lair: true,
    crXp: [['0', 10], ['1/8', 25], ['1/4', 50], ['1/2', 100], ['1', 200], ['2', 450], ['3', 700], ['4', 1100], ['5', 1800], ['6', 2300], ['7', 2900], ['8', 3900], ['9', 5000], ['10', 5900], ['11', 7200], ['12', 8400], ['13', 10000], ['14', 11500], ['15', 13000], ['16', 15000], ['17', 18000], ['18', 20000], ['19', 22000], ['20', 25000]],
  },
  text: { replace: [] },
};

// The 2014 rules differ from 2024 here in what a system sets (the rest is content: classes, spells...).
export const FIFTH_2014: Sys = {
  ...FIFTH, name: 'Fifth Edition (2014)', base: '2014',
  creation: { ...FIFTH.creation, increasesFrom: 'species' },
  details: { ...FIFTH.details, inspiration: 'classic' },
  equipment: { ...FIFTH.equipment, masteries: false },
  names: { ...FIFTH.names, species: 'Race' },
};

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'abilities', label: 'Abilities' }, { key: 'skills', label: 'Skills' }, { key: 'proficiency', label: 'Proficiency' },
  { key: 'creation', label: 'Making a character' }, { key: 'leveling', label: 'Leveling' }, { key: 'health', label: 'Health and dying' },
  { key: 'rests', label: 'Rests' }, { key: 'combat', label: 'Combat' }, { key: 'magic', label: 'Magic' },
  { key: 'equipment', label: 'Equipment and money' }, { key: 'details', label: 'Character details' }, { key: 'trackers', label: 'Trackers' },
  { key: 'names', label: 'Names of things' }, { key: 'monsters', label: 'Monsters' },
];

// ---------------------------------------------------------------- saved systems

export type Base = '2014' | '2024';
export const presetOf = (base: string | null | undefined): Sys => (base === '2014' ? FIFTH_2014 : FIFTH);
const CHANGEABLE: (SectionKey | 'text')[] = [...SECTIONS.map((s) => s.key), 'text'];
// what a saved system stores: the sections that differ from its base
export function changesOf(sys: Sys): Partial<Sys> {
  const base = presetOf(sys.base);
  return Object.fromEntries(CHANGEABLE.filter((k) => JSON.stringify(sys[k]) !== JSON.stringify(base[k])).map((k) => [k, sys[k]])) as Partial<Sys>;
}
// a saved system put back together: its base, with its changes on top
export function resolve(row: { name?: string; base?: string | null; changes?: unknown } | null | undefined): Sys {
  const base = presetOf(row?.base);
  const ch = (row?.changes && typeof row.changes === 'object' ? row.changes : {}) as Record<string, unknown>;
  const out: Sys = { ...base, name: row?.name || base.name };
  for (const k of CHANGEABLE) if (ch[k] && typeof ch[k] === 'object') (out as Record<string, unknown>)[k] = { ...(base[k] as object), ...(ch[k] as object) };
  return out;
}

// what the rules engine needs from a system (see RulesSystem in src/lib/rules/engine.ts)
export function engineSystem(sys: Sys) {
  return {
    abilities: sys.abilities.list.map((a) => ({ key: a.id, label: a.name, abbr: a.abbr, save: a.save })),
    skills: sys.skills.list.map((s) => ({ name: s.name, ab: s.ab, passive: s.passive })),
    mod: sys.abilities.mod, prof: sys.proficiency.on ? sys.proficiency.table : ('none' as const),
    maxLevel: sys.leveling.kind === 'none' ? 1 : sys.leveling.maxLevel,
    jobs: sys.abilities.jobs, acBase: sys.combat.acBase,
  };
}

// Written text in a system: whole-word replacements (Intelligence -> Insanity), applied to the
// string fields of the entries of the kinds each rename was ticked for.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function renameText<T>(value: T, renames: TextRename[]): T {
  if (!renames.length) return value;
  const rx = renames.map((r) => [new RegExp(`\\b${esc(r.from)}\\b`, 'g'), r.to] as const);
  const walk = (v: unknown): unknown => (typeof v === 'string' ? rx.reduce((s, [re, to]) => s.replace(re, to), v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  return walk(value) as T;
}
export function applyText<E extends { type: string; data: unknown }>(entities: E[], sys: Sys | null | undefined): E[] {
  const list = sys?.text?.replace ?? [];
  if (!list.length) return entities;
  return entities.map((e) => { const r = list.filter((x) => x.types.includes(e.type)); return r.length ? { ...e, data: renameText(e.data, r) } : e; });
}

// Which pages each section changes, and how. Shown on the Affects tab.
export const AFFECTS: Record<SectionKey, [string, string][]> = {
  abilities: [
    ['Character creator', 'The abilities step: names, how many, the score range; point buy and the standard array resize to fit; species or background increases list these'],
    ['Character sheet', 'Ability boxes, saving throws, the ability next to each skill; initiative, Armor Class and hit points follow the jobs'],
    ['Homebrew: class', 'Saving throw picks, primary ability, spellcasting ability, multiclass requirements'],
    ['Homebrew: feat, background, species', '"+1 to an ability of your choice" lists and background ability options'],
    ['Homebrew: spell', '"Makes a ___ saving throw"'],
    ['Homebrew: monster and the initiative tool', 'The stat block ability row and monster saves'],
    ['Gives rows (every feature)', 'Ability increase, save proficiency, a bonus to an ability'],
    ['Import homebrew', 'The prompt lists this system’s abilities instead of the fifth edition six'],
  ],
  skills: [
    ['Character creator', 'The skills step, and class and background skill choices'],
    ['Character sheet', 'The skill list, bonuses, expertise and passive scores'],
    ['Homebrew: class', '"Proficient skill options"'],
    ['Homebrew: background, feat, species', 'Skill proficiency picks and "choose any skill" rows'],
    ['Homebrew: monster', 'The stat block skills line'],
    ['Gives rows', 'Skill proficiency, expertise, advantage on a skill'],
    ['Import homebrew', 'The skill list given to the AI'],
  ],
  proficiency: [
    ['Character sheet', 'The proficiency bonus, and so every proficient save, skill, attack and spell save DC'],
    ['Homebrew: class', 'The proficiency chart on the Leveling tab; armor and weapon proficiency pickers'],
    ['Homebrew: item', 'The armor and weapon categories an item can be'],
    ['Homebrew: monster', 'Proficiency by challenge rating'],
  ],
  creation: [
    ['Character creator', 'Which score methods are offered, point-buy costs and budget, the array, where ability increases come from, starting level and gold'],
    ['Homebrew: background, species', 'Whether they give ability increases'],
  ],
  leveling: [
    ['Character creator and sheet', 'The highest level, the XP bar or milestone note, when ability increases and feats are offered'],
    ['Homebrew: class', 'The Leveling tab rows (1 to the highest level), milestones, multiclassing box'],
    ['Campaign: Players', 'The DM’s level-up and XP tools'],
  ],
  health: [
    ['Character sheet', 'Hit points or wound boxes, death saves, temporary hit points'],
    ['Character creator', 'How hit points are worked out at level 1 and after'],
    ['Homebrew: class', 'The hit die picker (hidden with wounds)'],
    ['Initiative tool', 'Monster hit points or wounds, death saves for characters'],
  ],
  rests: [
    ['Character sheet', 'The Short rest and Long rest buttons and what they give back'],
    ['Homebrew: class, feat, resource', 'The "comes back on" choices for uses and resources'],
  ],
  combat: [
    ['Character sheet', 'Armor Class, critical hit range, the conditions list'],
    ['Initiative tool', 'Conditions you can put on a creature, critical hits'],
    ['Homebrew: spell, item, monster', 'Damage type and condition pickers'],
    ['Gives rows', 'Resistance, immunity, condition immunity'],
  ],
  magic: [
    ['Character creator', 'The spells step (gone when magic is off)'],
    ['Character sheet', 'Spell slots or mana, cantrips, concentration and ritual tags'],
    ['Homebrew: class', 'The Spells tab: slot tables or mana, caster types'],
    ['Homebrew: spell', 'Spell levels, schools, components, concentration and ritual fields'],
    ['Homebrew page', 'The Spell card (gone when magic is off)'],
  ],
  equipment: [
    ['Character creator', 'Starting gold and the money it is counted in'],
    ['Character sheet', 'Money, carrying capacity, encumbrance'],
    ['Homebrew: item', 'Prices, weight, weapon properties and masteries'],
    ['Homebrew: class', 'Starting equipment gold, weapon mastery'],
  ],
  details: [
    ['Character creator', 'The details step: alignment, languages'],
    ['Character sheet', 'Alignment, inspiration'],
    ['Homebrew: species, background', 'Language pickers, size'],
    ['Homebrew: monster', 'Size, creature type, alignment, languages'],
  ],
  trackers: [
    ['Character sheet', 'A bar or boxes for each tracker, refilled on the rest you choose'],
    ['Homebrew: everything with Gives rows', '"Fills" or "drains" a tracker'],
    ['Initiative tool', 'Trackers shown next to each character'],
  ],
  names: [
    ['Homebrew page', 'The card names, and which kinds of homebrew exist'],
    ['Character creator', 'Step names (Species or Race or Ancestry)'],
    ['Campaign: Players, What’s available', 'The headings'],
    ['Import homebrew', 'The type dropdown and the prompt'],
  ],
  monsters: [
    ['Homebrew: monster', 'The challenge rating picker, XP, legendary and lair actions'],
    ['Initiative tool', 'XP for an encounter, legendary actions'],
  ],
};
