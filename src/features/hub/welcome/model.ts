// The Welcome page's own settings (hub version 2, item 9), kept in the campaign's settings as
// settings.welcome. Pure, so tests load this file directly.
//
// Only what players may read goes here: the campaign's settings are readable by everyone in
// it. A recap's draft is not here; it stays on the DM's session record until it is published.

export type Recap = { session: number; text: string; at: string };
export type Welcome = { next: { when: string; where: string }; recaps: Recap[] };

export const MAX_RECAP = 5000;
export const MAX_RECAPS = 30;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

export function welcomeOf(settings: { welcome?: unknown } | null | undefined): Welcome {
  const w = (settings?.welcome && typeof settings.welcome === 'object' && !Array.isArray(settings.welcome) ? settings.welcome : {}) as Record<string, unknown>;
  const n = (w.next && typeof w.next === 'object' && !Array.isArray(w.next) ? w.next : {}) as Record<string, unknown>;
  const recaps = (Array.isArray(w.recaps) ? w.recaps : [])
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({ session: Math.max(0, Math.min(999, Math.trunc(Number(r.session)) || 0)), text: text(r.text, MAX_RECAP), at: typeof r.at === 'string' ? r.at.slice(0, 40) : '' }))
    .filter((r) => r.text)
    .slice(0, MAX_RECAPS);
  return { next: { when: text(n.when, 120), where: text(n.where, 200) }, recaps };
}

export const cleanNext = (input: unknown) => welcomeOf({ welcome: { next: input } }).next;

// Publish a recap: it replaces any earlier one for the same session and goes to the top.
export function withRecap(w: Welcome, session: unknown, body: unknown, now = new Date().toISOString()): Welcome {
  const s = Math.max(0, Math.min(999, Math.trunc(Number(session)) || 0));
  const t = text(body, MAX_RECAP);
  if (!t) return w;
  return { ...w, recaps: [{ session: s, text: t, at: now }, ...w.recaps.filter((r) => r.session !== s)].slice(0, MAX_RECAPS) };
}

// How the reveal log words a line, by kind (the same words the database uses, entries_log).
export const REVEAL_LINES: Record<string, string> = { beat: 'On the timeline: ', region: 'A new part of a map is open', map: 'A new map: ', pin: 'A new pin on a map: ', npc: 'Someone new to know: ', clock: 'A faction\'s progress is now known: ' };

// Where a line of the reveal log takes a reader.
export const REVEAL_LINKS: Record<string, { label: string; page: string; where: string }> = {
  npc: { label: 'New NPC', page: 'tools/npcs', where: 'NPCs' },
  beat: { label: 'On the timeline', page: 'tools/timeline', where: 'Timeline' },
  map: { label: 'New map', page: 'tools/maps', where: 'Maps' }, region: { label: 'New place', page: 'tools/maps', where: 'Maps' }, pin: { label: 'New place', page: 'tools/maps', where: 'Maps' },
  clock: { label: 'Faction news', page: 'tools/world', where: 'World state' }, consequence: { label: 'Consequence', page: 'tools/world', where: 'World state' },
  lore: { label: 'Lore', page: 'hub/lore', where: 'Lore' },
  quest: { label: 'New quest', page: 'hub/quests', where: 'Quest log' },
};
export const KIND_NAMES: Record<string, string> = { npc: 'NPC', beat: 'Story beat', map: 'Map', region: 'Map area', pin: 'Map pin', clock: 'Faction clock', consequence: 'Consequence', clue: 'Clue', secret: 'Secret', note: 'Note', encounter: 'Encounter', lore: 'Lore', quest: 'Quest', objective: 'Quest objective' };
