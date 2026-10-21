// Lore categories (hub version 2, item 11; Lore.png and Setup2Lore.png). Each category has its own
// fields, and its own look on the Lore page (`layout`). Five start on in every campaign; ten more
// can be added, plus the DM's own (which use the general fields).
//
// A lore entry is a table-tool entry of kind 'lore': `data.cat` is its category's id and its fields
// are in `data`. The DM's notes are kept with the DM-only secrets, never on the entry itself.
// Never rename or reuse a category or field id: campaigns have stored them.
//
// No imports: pages, server code, scripts and tests all load this file directly.

export type LoreFieldKind = 'text' | 'long' | 'select' | 'number' | 'check' | 'list' | 'image' | 'region' | 'npcs' | 'factions';
export type LoreField = { key: string; label: string; kind: LoreFieldKind; options?: [string, string][]; help?: string; placeholder?: string };
export type LoreLayout = 'overview' | 'timeline' | 'places' | 'factions' | 'religions' | 'bestiary' | 'items' | 'cards';
export type LoreCategory = { id: string; name: string; short: string; layout: LoreLayout; starting?: true; what: string; fields: LoreField[] };

// the general fields: what every category has, and all a DM's own category has
const SUMMARY: LoreField = { key: 'summary', label: 'One-line summary (shown on the card)', kind: 'text', placeholder: 'What players picture when they hear the name' };
const DESCRIPTION: LoreField = { key: 'description', label: 'Full description', kind: 'long', help: 'Shown when someone opens the entry.' };

export const PLACE_TYPES: [string, string][] = [['region', 'Region'], ['city', 'City'], ['town', 'Town'], ['village', 'Village'], ['dungeon', 'Dungeon'], ['landmark', 'Landmark'], ['wilderness', 'Wilderness'], ['building', 'Building'], ['other', 'Other']];
export const FOUND: [string, string][] = [['', 'Not yet'], ['visited', 'Visited'], ['discovered', 'Discovered'], ['heard', 'Heard of']];
export const STANDING: [string, string][] = [['', 'Not known'], ['friendly', 'Friendly'], ['wary', 'Wary'], ['hostile', 'Hostile']];
export const RARITY: [string, string][] = [['', 'Not known'], ['common', 'Common'], ['uncommon', 'Uncommon'], ['rare', 'Rare'], ['very rare', 'Very rare'], ['legendary', 'Legendary'], ['artifact', 'Artifact']];

export const LORE_CATEGORIES: LoreCategory[] = [
  { id: 'overview', name: 'World overview', short: 'Overview', layout: 'overview', starting: true, what: 'The world in a few paragraphs.',
    fields: [{ key: 'summary', label: 'Overview', kind: 'long', placeholder: 'What every character would know about the world' }] },
  { id: 'history', name: 'History and eras', short: 'History', layout: 'timeline', starting: true, what: 'Era, date or year, key events, figures involved. Shown as a timeline.',
    fields: [{ key: 'when', label: 'Date or years', kind: 'text', placeholder: 'Years 0 to 400' }, { key: 'now', label: 'This is the current era', kind: 'check' },
      { key: 'summary', label: 'What the party knows about this time', kind: 'long' }, { key: 'events', label: 'Key events', kind: 'long' }, { key: 'figures', label: 'Figures involved', kind: 'text' }] },
  { id: 'places', name: 'Places and regions', short: 'Places', layout: 'places', starting: true, what: 'Type, the region it is part of, NPCs and factions found there. Nested inside its region.',
    fields: [{ key: 'type', label: 'Type of place', kind: 'select', options: PLACE_TYPES }, { key: 'region', label: 'Part of', kind: 'region' }, SUMMARY, DESCRIPTION,
      { key: 'file', label: 'Picture', kind: 'image' }, { key: 'npcs', label: 'Notable NPCs here', kind: 'npcs' }, { key: 'factions', label: 'Factions present', kind: 'factions' },
      { key: 'found', label: 'The party has', kind: 'select', options: FOUND }, { key: 'session', label: 'In session (number)', kind: 'number' }] },
  { id: 'factions', name: 'Factions and organizations', short: 'Factions', layout: 'factions', starting: true, what: 'Leader, goals, symbol, base of operations, allies and rivals, party standing.',
    fields: [{ key: 'leader', label: 'Leader', kind: 'text' }, { key: 'base', label: 'Based in', kind: 'text' }, { key: 'goals', label: 'Goal', kind: 'long', placeholder: 'What they want' },
      { key: 'file', label: 'Symbol', kind: 'image' }, { key: 'allies', label: 'Allies', kind: 'text' }, { key: 'rivals', label: 'Rivals', kind: 'text' },
      { key: 'standing', label: 'Standing with the party', kind: 'select', options: STANDING }, DESCRIPTION] },
  { id: 'religions', name: 'Religions and deities', short: 'Religions', layout: 'religions', starting: true, what: 'Domains, symbol, holy days, followers, temples.',
    fields: [{ key: 'symbol', label: 'Symbol', kind: 'text' }, { key: 'domains', label: 'Domains', kind: 'list', help: 'Separate them with commas.' }, { key: 'holy', label: 'Holy days', kind: 'text' },
      { key: 'followers', label: 'Worshipped by', kind: 'text' }, { key: 'temples', label: 'Temples', kind: 'text' }, DESCRIPTION] },
  { id: 'peoples', name: 'Peoples and cultures', short: 'Peoples', layout: 'cards', what: 'Homeland, customs, language, appearance, typical names.',
    fields: [SUMMARY, { key: 'homeland', label: 'Homeland', kind: 'text' }, { key: 'customs', label: 'Customs', kind: 'long' }, { key: 'language', label: 'Language', kind: 'text' },
      { key: 'appearance', label: 'Appearance', kind: 'long' }, { key: 'names', label: 'Typical names', kind: 'text' }] },
  { id: 'creatures', name: 'Creatures and bestiary', short: 'Bestiary', layout: 'bestiary', what: 'Type, habitat, behavior, and what the party has learned (each fact shown once it is learned).',
    fields: [{ key: 'type', label: 'Type', kind: 'text', placeholder: 'Undead, beast, fiend…' }, { key: 'habitat', label: 'Habitat', kind: 'text' }, { key: 'behavior', label: 'Behavior', kind: 'long' }] },
  { id: 'magic', name: 'Magic and the arcane', short: 'Magic', layout: 'cards', what: 'How magic works here, schools, traditions, forbidden arts.', fields: [SUMMARY, DESCRIPTION] },
  { id: 'items', name: 'Items and artifacts', short: 'Items', layout: 'items', what: 'Rarity, attunement, history, current holder.',
    fields: [{ key: 'rarity', label: 'Rarity', kind: 'select', options: RARITY }, { key: 'attune', label: 'Requires attunement', kind: 'check' },
      { key: 'legend', label: 'History or legend, as far as the party knows', kind: 'long' }, { key: 'holder', label: 'Last seen with', kind: 'text' }, { key: 'file', label: 'Picture', kind: 'image' }] },
  { id: 'languages', name: 'Languages and scripts', short: 'Languages', layout: 'cards', what: 'Who speaks it, its script.',
    fields: [SUMMARY, { key: 'speakers', label: 'Spoken by', kind: 'text' }, { key: 'script', label: 'Script', kind: 'text' }, DESCRIPTION] },
  { id: 'calendar', name: 'Calendar and holidays', short: 'Calendar', layout: 'cards', what: 'Months, weekdays, holidays.',
    fields: [{ key: 'months', label: 'Months', kind: 'long' }, { key: 'weekdays', label: 'Days of the week', kind: 'text' }, { key: 'holidays', label: 'Holidays', kind: 'long' }] },
  { id: 'myths', name: 'Myths and legends', short: 'Myths', layout: 'cards', what: 'Stories people tell, true or not.', fields: [SUMMARY, DESCRIPTION] },
  { id: 'rulers', name: 'Rulers and politics', short: 'Rulers', layout: 'cards', what: 'Who rules where, and how.',
    fields: [{ key: 'realm', label: 'Realm', kind: 'text' }, { key: 'title', label: 'Title', kind: 'text', placeholder: 'Queen, high priest, council…' }, SUMMARY, DESCRIPTION] },
  { id: 'trade', name: 'Trade and economy', short: 'Trade', layout: 'cards', what: 'Currency, goods, trade routes.',
    fields: [{ key: 'currency', label: 'Currency', kind: 'text' }, { key: 'goods', label: 'Goods', kind: 'text' }, SUMMARY, DESCRIPTION] },
  { id: 'planes', name: 'Planes and cosmology', short: 'Planes', layout: 'cards', what: 'The planes and how they touch the world.', fields: [SUMMARY, DESCRIPTION] },
];

export const STARTING = LORE_CATEGORIES.filter((c) => c.starting).map((c) => c.id);
export const GENERAL_FIELDS: LoreField[] = [SUMMARY, DESCRIPTION];

// What a campaign uses, kept in its settings as settings.lore = { cats: [ids], custom: [{ id, name }] }.
// A campaign with nothing stored has the five starting categories.
export type LoreSettings = { cats: string[]; custom: { id: string; name: string }[] };
export function loreSettingsOf(settings: { lore?: unknown } | null | undefined): LoreSettings {
  const l = (settings?.lore && typeof settings.lore === 'object' && !Array.isArray(settings.lore) ? settings.lore : {}) as Record<string, unknown>;
  const custom = (Array.isArray(l.custom) ? l.custom : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({ id: String(c.id ?? ''), name: String(c.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) }))
    .filter((c) => /^c-[a-z0-9]{4,12}$/.test(c.id) && c.name)
    .slice(0, 20);
  const known = new Set([...LORE_CATEGORIES.map((c) => c.id), ...custom.map((c) => c.id)]);
  const cats = Array.isArray(l.cats) ? [...new Set(l.cats.map(String))].filter((id) => known.has(id)) : [...STARTING, ...custom.map((c) => c.id)];
  return { cats, custom };
}

// A category by id, a DM's own one included (with the general fields and cards).
export function categoryOf(id: string, s: LoreSettings): LoreCategory | null {
  const c = LORE_CATEGORIES.find((x) => x.id === id);
  if (c) return c;
  const own = s.custom.find((x) => x.id === id);
  return own ? { id: own.id, name: own.name, short: own.name, layout: 'cards', what: 'Your own category.', fields: GENERAL_FIELDS } : null;
}
