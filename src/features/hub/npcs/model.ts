// The NPCs page's sums (hub version 2, item 10). Pure, so tests load this file directly.
//
// An NPC is a table-tool entry (kind 'npc'). This page adds three things to what an NPC already
// has, all kept in its data, so no database change: `attitude` (ally, neutral, hostile), `role`
// ("Innkeeper") and `met` (the session they were met in). Like every NPC field, they are held
// back from players when an NPC is only partly revealed (npcSplit() in the visibility model).

import { parseTrigger, triggerWords } from '../reveals/triggers.ts';

export type Attitude = 'ally' | 'neutral' | 'hostile';
export const ATTITUDES: [Attitude, string][] = [['ally', 'Ally'], ['neutral', 'Neutral'], ['hostile', 'Hostile']];

type Npc = { status?: string; data?: Record<string, unknown> | null; vis: string; vis_players?: string[] | null; vis_stage?: string | null; vis_entry?: string | null };

// An NPC's attitude. Before this page, "hostile" and "allied" were statuses; those still count.
export function attitudeOf(n: Pick<Npc, 'status' | 'data'>): Attitude | null {
  const a = n.data?.attitude;
  if (a === 'ally' || a === 'neutral' || a === 'hostile') return a;
  if (n.status === 'hostile') return 'hostile';
  if (n.status === 'allied') return 'ally';
  return n.status ? 'neutral' : null;   // no status at all: a player who was only told the name
}
export const attitudeLabel = (a: Attitude | null) => (a ? ATTITUDES.find((x) => x[0] === a)![1] : '');

// "Players see", as the card's one control: everything, name and portrait, name only, nothing, or
// only some players. 'later' is waiting for a session, chapter or story beat.
export type Sees = 'all' | 'portrait' | 'name' | 'hidden' | 'some' | 'later';
export const SEES: [Sees, string][] = [['all', 'Everything'], ['portrait', 'Name and portrait'], ['name', 'Name only'], ['hidden', 'Nothing (hidden)'], ['some', 'Only some players…']];

export function seesOf(n: Npc): Sees {
  if (/^players/.test(n.vis)) return 'some';
  if (n.vis === 'all') return n.data?.reveal === 'name' ? 'name' : n.data?.reveal === 'portrait' ? 'portrait' : 'all';
  if (n.vis === 'stage' || n.vis === 'entry' || n.vis === 'when') return 'later';
  return 'hidden';
}

// Hidden on this page's filter: some player who may one day see them cannot see them now.
export const isHidden = (n: Npc) => n.vis !== 'all';

type Named = { id: string; label: string };
const list = (names: string[]) => (names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names.at(-1));

// The small line under the background: "Met in Session 1", "Seen by one player, Session 3",
// "Reveals when Session 5 starts". `dm` adds the parts only the DM may read.
export function metLine(n: Npc, dm: boolean, names: { people?: Named[]; chapters?: Named[]; beats?: Named[] } = {}): string {
  const met = Number(n.data?.met) > 0 ? `Session ${Number(n.data?.met)}` : '';
  if (!dm) return met ? 'Met in ' + met : '';
  if (/^players/.test(n.vis)) {
    const who = (n.vis_players ?? []).map((id) => names.people?.find((p) => p.id === id)?.label ?? 'a player');
    const seen = who.length === 1 ? 'Seen by one player' : `Seen by ${who.length || 'some'} players`;
    return [seen + (who.length ? ` (${list(who)})` : ''), met].filter(Boolean).join(', ');
  }
  if (n.vis === 'when') return 'Reveals when ' + triggerWords(n.vis_stage, { chapters: names.chapters, beats: names.beats });
  if (n.vis === 'stage') return `Reveals when ${names.chapters?.find((c) => c.id === n.vis_stage)?.label ?? 'a chapter'} starts`;
  if (n.vis === 'entry') return `Reveals once “${names.beats?.find((b) => b.id === n.vis_entry)?.label ?? 'a story beat'}” happens`;
  if (n.vis === 'dm') return met ? 'Hidden · met in ' + met : 'Hidden until you reveal them';
  return met ? 'Met in ' + met : '';
}

// The filter chips and the search box.
export type Chip = 'all' | 'ally' | 'neutral' | 'hostile' | 'hidden';
export function matches(n: Npc & { title: string; secret?: Record<string, unknown> | null }, chip: Chip, q: string): boolean {
  if (chip === 'hidden' && !isHidden(n)) return false;
  if (chip !== 'all' && chip !== 'hidden' && attitudeOf(n) !== chip) return false;
  if (!q.trim()) return true;
  const d = n.data ?? {}, s = n.secret ?? {};
  return [n.title, d.role, d.location, d.faction, d.known, s.wants, s.secret].map((x) => String(x ?? '')).join(' ').toLowerCase().includes(q.trim().toLowerCase());
}

// A session trigger is a "when"; the line says it the way the picker does.
export const waitsForSession = (n: Npc) => n.vis === 'when' && parseTrigger(n.vis_stage)?.kind === 'session';
