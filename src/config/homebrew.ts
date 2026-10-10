// What the homebrew builder asks for, per kind of entry.
//
// One list of fields per type drives all three depths:
//   Quick     name and description only (free text)
//   Guided    the fields marked `guided`, one step at a time, with defaults filled in
//   Advanced  every field, plus effects, features and the raw data
// Switching depth never drops anything: all three edit the same data.
//
// No imports here: tests load this file directly.

export type FieldKind = 'text' | 'long' | 'number' | 'select' | 'check' | 'multi' | 'abilities' | 'pairs';
export type Field = { key: string; label: string; kind: FieldKind; options?: string[]; def?: unknown; guided?: boolean; help?: string };
export type TypeDef = { label: string; plural: string; blurb: string; fields: Field[]; effects: boolean; features: boolean; featureLevels: boolean };

const AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const SKILL_NAMES = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'];
export const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

export const TYPES: Record<string, TypeDef> = {
  race: {
    label: 'Race or species', plural: 'Races and species', blurb: 'A people a character can belong to.', effects: true, features: true, featureLevels: true,
    fields: [
      { key: 'size', label: 'Size', kind: 'select', options: ['Small', 'Medium', 'Large'], def: 'Medium', guided: true },
      { key: 'speed', label: 'Walking speed (feet)', kind: 'number', def: 30, guided: true },
      { key: 'languages', label: 'Languages', kind: 'text', def: 'Common and one more of your choice', guided: true },
    ],
  },
  class: {
    label: 'Class', plural: 'Classes', blurb: 'A calling with twenty levels of features.', effects: true, features: true, featureLevels: true,
    fields: [
      { key: 'hd', label: 'Hit die', kind: 'select', options: ['6', '8', '10', '12'], def: '8', guided: true },
      { key: 'primary', label: 'Primary ability', kind: 'text', def: '', guided: true },
      { key: 'saves', label: 'Saving throw proficiencies (pick two)', kind: 'multi', options: AB, def: [], guided: true },
      { key: 'casting.kind', label: 'Spellcasting', kind: 'select', options: ['none', 'full', 'half', 'pact'], def: 'none', guided: true, help: 'Full: spell slots like a wizard. Half: like a paladin. Pact: a few slots that return on a short rest.' },
      { key: 'casting.ability', label: 'Spellcasting ability', kind: 'select', options: ['', 'int', 'wis', 'cha'], def: '', guided: true },
      { key: 'armor', label: 'Armor proficiencies', kind: 'text', def: 'Light armor' },
      { key: 'weapons', label: 'Weapon proficiencies', kind: 'text', def: 'Simple weapons' },
      { key: 'tools', label: 'Tool proficiencies', kind: 'text', def: 'None' },
      { key: 'skillCount', label: 'How many skills the player picks', kind: 'number', def: 2, guided: true },
      { key: 'skillList', label: 'Skills to pick from (none ticked means any)', kind: 'multi', options: SKILL_NAMES, def: [] },
    ],
  },
  subclass: {
    label: 'Subclass', plural: 'Subclasses', blurb: 'A path within a class.', effects: true, features: true, featureLevels: true,
    fields: [{ key: 'parent', label: 'Which class it belongs to', kind: 'text', def: '', guided: true }],
  },
  background: {
    label: 'Background', plural: 'Backgrounds', blurb: 'Where a character came from.', effects: true, features: true, featureLevels: false,
    fields: [
      { key: 'skills', label: 'Skill proficiencies (two)', kind: 'multi', options: SKILL_NAMES, def: [], guided: true },
      { key: 'toolProfs', label: 'Tool proficiencies', kind: 'text', def: 'None', guided: true },
      { key: 'languages', label: 'Languages', kind: 'text', def: 'One of your choice', guided: true },
      { key: 'equipment', label: 'Starting equipment', kind: 'long', def: '' },
    ],
  },
  feat: {
    label: 'Feat', plural: 'Feats', blurb: 'A special talent.', effects: true, features: true, featureLevels: false,
    fields: [{ key: 'prereq', label: 'Prerequisite', kind: 'text', def: '', guided: true }],
  },
  spell: {
    label: 'Spell', plural: 'Spells', blurb: 'A piece of magic.', effects: false, features: false, featureLevels: false,
    fields: [
      { key: 'level', label: 'Spell level (0 is a cantrip)', kind: 'number', def: 1, guided: true },
      { key: 'school', label: 'School', kind: 'select', options: ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'], def: 'Evocation', guided: true },
      { key: 'time', label: 'Casting time', kind: 'text', def: '1 action', guided: true },
      { key: 'range', label: 'Range', kind: 'text', def: '60 feet', guided: true },
      { key: 'comp', label: 'Components', kind: 'text', def: 'V, S', guided: true },
      { key: 'duration', label: 'Duration', kind: 'text', def: 'Instantaneous', guided: true },
      { key: 'conc', label: 'Needs concentration', kind: 'check', def: false, guided: true },
      { key: 'ritual', label: 'Can be cast as a ritual', kind: 'check', def: false },
      { key: 'damage', label: 'Damage or healing dice (for example 3d6 fire)', kind: 'text', def: '', guided: true },
      { key: 'classes', label: 'Which classes can learn it (comma separated)', kind: 'text', def: '', guided: true },
      { key: 'higher', label: 'At higher levels', kind: 'long', def: '' },
    ],
  },
  item: {
    label: 'Item', plural: 'Items', blurb: 'A weapon, armor, piece of gear, or magic item.', effects: true, features: false, featureLevels: false,
    fields: [
      { key: 'kind', label: 'Kind', kind: 'select', options: ['Weapon', 'Armor', 'Gear', 'Magic item'], def: 'Magic item', guided: true },
      { key: 'rarity', label: 'Rarity', kind: 'select', options: ['Standard', 'Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary'], def: 'Uncommon', guided: true },
      { key: 'attune', label: 'Requires attunement', kind: 'check', def: false, guided: true },
      { key: 'damage', label: 'Damage (weapons)', kind: 'text', def: '' },
      { key: 'ac', label: 'Armor class (armor)', kind: 'text', def: '' },
      { key: 'props', label: 'Properties', kind: 'text', def: '' },
      { key: 'cost', label: 'Cost', kind: 'text', def: '' },
      { key: 'weight', label: 'Weight', kind: 'text', def: '' },
    ],
  },
  monster: {
    label: 'Monster', plural: 'Monsters', blurb: 'A creature with a stat block.', effects: false, features: false, featureLevels: false,
    fields: [
      { key: 'size', label: 'Size', kind: 'select', options: SIZES, def: 'Medium', guided: true },
      { key: 'mtype', label: 'Type', kind: 'select', options: ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'], def: 'Humanoid', guided: true },
      { key: 'cr', label: 'Challenge rating', kind: 'text', def: '1', guided: true },
      { key: 'acv', label: 'Armor class', kind: 'number', def: 13, guided: true },
      { key: 'hpv', label: 'Hit points', kind: 'number', def: 22, guided: true },
      { key: 'hdv', label: 'Hit dice', kind: 'text', def: '4d8+4' },
      { key: 'mspeed', label: 'Speed', kind: 'text', def: '30 ft.', guided: true },
      { key: 'ab', label: 'Ability scores', kind: 'abilities', def: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, guided: true },
      { key: 'msaves', label: 'Saving throws', kind: 'text', def: '' },
      { key: 'mskills', label: 'Skills', kind: 'text', def: '' },
      { key: 'resist', label: 'Damage resistances', kind: 'text', def: '' },
      { key: 'immune', label: 'Damage immunities', kind: 'text', def: '' },
      { key: 'vuln', label: 'Damage vulnerabilities', kind: 'text', def: '' },
      { key: 'senses', label: 'Senses', kind: 'text', def: '' },
      { key: 'langs', label: 'Languages', kind: 'text', def: '' },
      { key: 'traits', label: 'Traits', kind: 'pairs', def: [] },
      { key: 'actions', label: 'Actions', kind: 'pairs', def: [{ name: 'Attack', text: 'Melee weapon attack: +4 to hit. Hit: 6 (1d8+2) slashing damage.' }], guided: true },
    ],
  },
  resource: {
    label: 'Custom resource', plural: 'Custom resources', blurb: 'A pool every character in a campaign can spend from, such as a pool of favour. Classes and items can refer to it by name.', effects: false, features: false, featureLevels: false,
    fields: [
      { key: 'max', label: 'How many a character has', kind: 'text', def: 'prof', guided: true, help: 'A number, or: level, prof (proficiency bonus), half (half level), an ability (cha), level*5, cha+1, or steps like step:1=2,5=3,11=4.' },
      { key: 'recharge', label: 'Comes back on', kind: 'select', options: ['long', 'short', 'none'], def: 'long', guided: true },
      { key: 'unit', label: 'What one is called', kind: 'text', def: 'point', guided: true },
    ],
  },
};

// The effect building blocks, as the effect editor shows them.
export type EffectField = { k: string; label: string; kind: 'text' | 'number' | 'select' | 'check'; options?: string[]; def: unknown };
export const EFFECTS: { t: string; label: string; fields: EffectField[] }[] = [
  { t: 'ability', label: 'Ability score change', fields: [{ k: 'ab', label: 'Ability', kind: 'select', options: [...AB, 'any'], def: 'str' }, { k: 'n', label: 'Change', kind: 'number', def: 1 }] },
  { t: 'prof', label: 'Proficiency', fields: [{ k: 'kind', label: 'In', kind: 'select', options: ['skill', 'save', 'armor', 'weapon', 'tool', 'language'], def: 'skill' }, { k: 'v', label: 'What (a skill, str to cha for a save, or a name)', kind: 'text', def: 'Perception' }] },
  { t: 'resist', label: 'Resistance', fields: [{ k: 'v', label: 'Damage type', kind: 'select', options: DAMAGE_TYPES, def: 'fire' }, { k: 'immune', label: 'Immune, not just resistant', kind: 'check', def: false }] },
  { t: 'speed', label: 'Speed', fields: [{ k: 'mode', label: 'Kind', kind: 'select', options: ['walk', 'fly', 'swim', 'climb', 'burrow'], def: 'walk' }, { k: 'n', label: 'Feet (for walking: how much is added)', kind: 'number', def: 10 }] },
  { t: 'sense', label: 'Sense', fields: [{ k: 'v', label: 'Sense', kind: 'select', options: ['Darkvision', 'Blindsight', 'Tremorsense', 'Truesight'], def: 'Darkvision' }, { k: 'n', label: 'Feet', kind: 'number', def: 60 }] },
  { t: 'resource', label: 'Resource with a recharge', fields: [{ k: 'name', label: 'Name', kind: 'text', def: 'Uses' }, { k: 'max', label: 'How many (a number, level, prof, half, cha, level*5, step:1=2,5=3)', kind: 'text', def: '1' }, { k: 'recharge', label: 'Comes back on', kind: 'select', options: ['short', 'long', 'none'], def: 'long' }] },
  { t: 'spell', label: 'Granted spell', fields: [{ k: 'name', label: 'Spell name', kind: 'text', def: '' }] },
  { t: 'scale', label: 'Scaling by level', fields: [{ k: 'name', label: 'What scales', kind: 'text', def: 'Damage' }, { k: 'steps', label: 'Values by level (1=1d6, 5=2d6, 11=3d6)', kind: 'text', def: '1=1d6, 5=2d6' }] },
  { t: 'hp', label: 'Extra hit points per level', fields: [{ k: 'n', label: 'Per level', kind: 'number', def: 1 }] },
  { t: 'ac', label: 'Armor class bonus', fields: [{ k: 'n', label: 'Bonus', kind: 'number', def: 1 }] },
  { t: 'text', label: 'Free-text rider', fields: [{ k: 'text', label: 'Text', kind: 'text', def: '' }] },
];

export const STATUS = [
  { id: 'draft', label: 'Draft', what: 'Only you see it.' },
  { id: 'playtest', label: 'Playtest', what: 'Players in campaigns it is attached to see it, marked as being tested.' },
  { id: 'live', label: 'Live', what: 'Players in campaigns it is attached to see it.' },
] as const;
