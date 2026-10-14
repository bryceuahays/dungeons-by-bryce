// What a co-DM may do in a campaign (hub version 2, item 6). The campaign's owner chooses.
//
// The database decides (co_dm_can() and the rules in the co-DM permissions migration); this
// file is the same list for the app: the names shown on the screen, the presets, and the
// same yes-or-no so pages can leave out what the database would refuse anyway.
//
// A co-DM's permissions are kept on their membership (memberships.perms). Nothing kept
// there means everything, which is what a co-DM had before permissions existed, and is the
// "Full co-DM" preset.
//
// No imports: scripts and tests load this file directly.

export const PERMS = [
  { id: 'see_hidden', name: 'See hidden content', what: 'Secrets, hidden NPCs, lore and pins' },
  { id: 'edit', name: 'Edit pages and content', what: 'Add and change NPCs, lore, quests, loot' },
  { id: 'reveal', name: 'Reveal and schedule reveals', what: 'Including reveals to one player' },
  { id: 'combat', name: 'Run combat', what: 'Initiative, damage, conditions' },
  { id: 'handouts', name: 'Push handouts', what: "Show handouts on players' screens" },
  { id: 'private_rolls', name: 'See private rolls', what: 'Rolls players send to the DM only' },
  { id: 'messages', name: 'Read player messages', what: 'Private notes sent to the DM' },
  { id: 'recaps', name: 'Write session recaps', what: 'Draft and publish recaps' },
  { id: 'players', name: 'Manage players and invites', what: '' },
  { id: 'settings', name: 'Change campaign settings', what: 'Pages, features, defaults' },
] as const;
export type Perm = (typeof PERMS)[number]['id'];
export type PermSet = Record<Perm, boolean>;
export const PERM_IDS = PERMS.map((p) => p.id) as Perm[];

// These work on hidden things, so they need "See hidden content" too. (A DM's "change" rules
// in the database also let that DM read what they cover.)
export const NEEDS_HIDDEN: Perm[] = ['edit', 'reveal', 'settings'];
// Kept and shown, but the feature each governs is not built yet.
export const NOT_YET: Perm[] = ['handouts', 'messages', 'recaps'];

const set = (...on: Perm[]): PermSet => Object.fromEntries(PERM_IDS.map((id) => [id, on.includes(id)])) as PermSet;
export const ALL_PERMS: PermSet = set(...PERM_IDS);
export const NO_PERMS: PermSet = set();

// Presets. "Full co-DM" stores nothing, which means everything, now and for permissions added later.
export const PRESETS: { id: 'full' | 'combat' | 'lore'; name: string; what: string; perms: PermSet | null }[] = [
  { id: 'full', name: 'Full co-DM', what: 'Everything you can do, except choosing co-DMs and deleting the campaign.', perms: null },
  { id: 'combat', name: 'Combat helper', what: 'Runs the fight and sees private rolls. Reads the rest of the campaign as a player does.', perms: set('combat', 'private_rolls') },
  { id: 'lore', name: 'Lore editor', what: 'Sees everything hidden and edits pages and content. Does not reveal things or change settings.', perms: set('see_hidden', 'edit', 'recaps') },
];

// Does a co-DM with these stored permissions have this one? (The owner always does; ask that first.)
export function coDmCan(perms: unknown, perm: Perm): boolean {
  if (perms === null || perms === undefined) return true;
  return typeof perms === 'object' && !Array.isArray(perms) && (perms as Record<string, unknown>)[perm] === true;
}
// Every permission as plain yes or no.
export const permSet = (perms: unknown): PermSet => Object.fromEntries(PERM_IDS.map((id) => [id, coDmCan(perms, id)])) as PermSet;

// Makes a choice safe to store: only the known permissions, each a plain yes or no, and the
// ones that need "See hidden content" switched off without it. null (everything) stays null.
export function cleanPerms(input: unknown): PermSet | null {
  if (input === null || input === undefined) return null;
  const given = (typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const out = Object.fromEntries(PERM_IDS.map((id) => [id, given[id] === true])) as PermSet;
  if (!out.see_hidden) for (const id of NEEDS_HIDDEN) out[id] = false;
  return out;
}

// Which preset these permissions are, or 'custom'.
export function presetOf(perms: unknown): 'full' | 'combat' | 'lore' | 'custom' {
  if (perms === null || perms === undefined) return 'full';
  const mine = permSet(perms);
  return PRESETS.find((p) => p.perms && PERM_IDS.every((id) => p.perms![id] === mine[id]))?.id ?? 'custom';
}
