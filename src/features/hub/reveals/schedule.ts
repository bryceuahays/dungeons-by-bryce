// The Reveals page's sums (hub version 2, item 14): everything hidden across the hub, grouped by
// when it comes out. Pure, so tests load this file directly. Only types and pure files imported.
//
// "Hidden" means some player who may one day see it cannot see it yet:
//   * table-tool entries and attached homebrew that are DM only, or wait for a session, a
//     chapter or a story beat that has not happened (entryOpen()'s rule, read from the DM's side)
//   * entries kept out of the feed (`live` off)
//   * page blocks for players that are hidden, or wait for a trigger or a chapter
// Already out for the players it names is not hidden, nor is anything for DMs only by nature
// (DM-only page blocks, encounters, the reveal log, players' own notes).

import { parseTrigger } from './triggers.ts';
import { LORE_CATEGORIES } from '../../../config/lore-categories.ts';

export type Named = { id: string; label: string };
export type Ref = { type: 'entry' | 'brew' | 'block'; id: string };
export type Item = { ref: Ref; type: string; title: string; note: string; when: string; key: string };
export type Group = { key: string; title: string; sub: string; session: number | null; items: Item[] };

type Vis = { vis: string; vis_players?: string[] | null; vis_stage?: string | null; vis_entry?: string | null };
export type EntryRow = Vis & { id: string; kind: string; title: string; live: boolean; data?: Record<string, unknown> | null };
export type BrewRow = Vis & { entity_id: string; name: string; type: string };
export type BlockRow = { id: string; section: string; kind: string; title: string; visibility: string; hidden: boolean; phase: string | null; from_stage?: string | null; reveal_when?: string | null; only_players?: string[] | null };
export type World = {
  met: ReadonlySet<string>; stage: string | null; chapters: Named[]; beats: Named[]; hitBeats: ReadonlySet<string>;
  people: Named[]; sessions: { number: number; status: string; title: string }[]; tabs: Named[];
};

// Never on this page: lines of the log, fights, players' notes and session zero, and story beats
// (a planned beat is the timeline's business, and shown there).
const SKIP = new Set(['log', 'encounter', 'note', 'zero', 'beat']);

export const TYPE_NAMES: Record<string, string> = { npc: 'NPC', map: 'Map', region: 'Map area', pin: 'Map pin', clock: 'Faction clock', consequence: 'Consequence', clue: 'Clue', secret: 'Plot secret' };
const BREW_NAMES: Record<string, string> = { race: 'Race', class: 'Class', subclass: 'Subclass', background: 'Background', feat: 'Feat', spell: 'Spell', item: 'Magic item', monster: 'Monster', resource: 'Resource' };
const STATUS: Record<string, string> = { unplanned: 'Not planned yet', planned: 'Planned', ready: 'Ready to run', running: 'Under way', played: 'Played' };
const list = (names: string[]) => (names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names.at(-1));

const reached = (id: string | null | undefined, w: World) => {
  if (!id) return true;
  const i = w.chapters.findIndex((c) => c.id === id);
  return i >= 0 && w.stage !== null && i <= w.chapters.findIndex((c) => c.id === w.stage);
};

// When something comes out, as a group key: 'session:4', 'chapter:<id>', 'beat:<id>', or
// 'later' (whenever the DM reveals it). null: it is out already.
function whenOf(v: Vis, live: boolean, w: World): { group: string; key: string } | null {
  if (!live) return { group: 'later', key: '' };
  switch (v.vis) {
    case 'all': case 'players': return null;
    case 'stage': case 'players_stage':
      if (reached(v.vis_stage, w)) return null;
      return w.chapters.some((c) => c.id === v.vis_stage) ? { group: 'chapter:' + v.vis_stage, key: 'chapter:' + v.vis_stage } : { group: 'later', key: '' };
    case 'entry': case 'players_entry':
      if (v.vis_entry && w.hitBeats.has(v.vis_entry)) return null;
      return v.vis_entry && w.beats.some((b) => b.id === v.vis_entry) ? { group: 'beat:' + v.vis_entry, key: 'beat:' + v.vis_entry } : { group: 'later', key: '' };
    case 'when': case 'players_when': return byKey(v.vis_stage, w);
    default: return { group: 'later', key: '' };
  }
}
function byKey(key: string | null | undefined, w: World): { group: string; key: string } | null {
  if (key && w.met.has(key)) return null;
  const t = parseTrigger(key);
  if (t?.kind === 'session') return { group: 'session:' + t.n, key: key! };
  if (t?.kind === 'chapter' && w.chapters.some((c) => c.id === t.id)) return { group: 'chapter:' + t.id, key: key! };
  if (t?.kind === 'beat' && w.beats.some((b) => b.id === t.id)) return { group: 'beat:' + t.id, key: key! };
  return { group: 'later', key: '' };
}

const named = (v: Vis) => /^players/.test(v.vis) || (v.vis === 'dm' && (v.vis_players ?? []).length > 0);
function whoNote(v: Vis, w: World): string {
  if (!named(v)) return '';
  const names = (v.vis_players ?? []).map((id) => w.people.find((p) => p.id === id)?.label ?? 'a player');
  return `Only ${list(names) || 'the players you name'} will see this`;
}
const timing = (key: string) => { const t = parseTrigger(key); return t?.kind === 'session' ? (t.when === 'started' ? 'When the session starts' : 'Once the session is marked played') : ''; };

export function schedule(a: { entries: EntryRow[]; brew: BrewRow[]; blocks: BlockRow[] }, w: World): Group[] {
  const items: (Item & { group: string })[] = [];
  for (const e of a.entries) {
    if (SKIP.has(e.kind)) continue;
    const at = whenOf(e, e.live, w);
    if (!at) continue;
    const reveal = e.kind === 'npc' ? String(e.data?.reveal ?? '') : '';
    const sees = reveal === 'name' ? 'Players will see: name only' : reveal === 'portrait' ? 'Players will see: name and portrait' : e.kind === 'npc' ? 'Players will see: everything' : '';
    items.push({ ref: { type: 'entry', id: e.id }, type: (named(e) ? 'Per-player · ' : '') + (e.kind === 'lore' ? 'Lore · ' + (LORE_CATEGORIES.find((c) => c.id === e.data?.cat)?.short ?? 'Your own') : TYPE_NAMES[e.kind] ?? e.kind), title: e.title || 'Untitled', note: [whoNote(e, w), sees, !e.live ? 'Kept out of the feed' : ''].filter(Boolean).join(' · '), when: timing(at.key), key: at.key, group: at.group });
  }
  for (const b of a.brew) {
    const at = whenOf(b, true, w);
    if (!at) continue;
    items.push({ ref: { type: 'brew', id: b.entity_id }, type: 'Homebrew · ' + (BREW_NAMES[b.type] ?? b.type), title: b.name || 'Untitled', note: whoNote(b, w), when: timing(at.key), key: at.key, group: at.group });
  }
  for (const b of a.blocks) {
    if (b.visibility !== 'player' || b.phase) continue;
    const at = b.hidden ? (b.reveal_when ? byKey(b.reveal_when, w) : { group: 'later', key: '' })
      : reached(b.from_stage, w) ? null : w.chapters.some((c) => c.id === b.from_stage) ? { group: 'chapter:' + b.from_stage, key: 'chapter:' + b.from_stage } : null;
    if (!at) continue;
    const tab = w.tabs.find((t) => t.id === b.section)?.label ?? b.section;
    const only = b.only_players?.length ? `Only ${list(b.only_players.map((id) => w.people.find((p) => p.id === id)?.label ?? 'a player'))} will see this` : '';
    items.push({ ref: { type: 'block', id: b.id }, type: 'Page block', title: b.title || 'A block', note: [`On the ${tab} page`, only].filter(Boolean).join(' · '), when: timing(at.key), key: at.key, group: at.group });
  }

  const groups = new Map<string, Group>();
  const sessionOf = (n: number) => w.sessions.find((s) => s.number === n);
  for (const it of items) {
    let g = groups.get(it.group);
    if (!g) {
      const [kind, id] = it.group.split(':');
      if (kind === 'session') {
        const s = sessionOf(Number(id));
        g = { key: it.group, title: 'Session ' + id, sub: s ? (STATUS[s.status] ?? s.status) + (s.title ? ' · ' + s.title : '') : 'Not on your sessions list yet', session: Number(id), items: [] };
      } else if (kind === 'chapter') g = { key: it.group, title: w.chapters.find((c) => c.id === id)?.label ?? 'A chapter', sub: 'Goes live when the chapter starts', session: null, items: [] };
      else if (kind === 'beat') g = { key: it.group, title: `Once “${w.beats.find((b) => b.id === id)?.label ?? 'a story beat'}” happens`, sub: 'A story beat', session: null, items: [] };
      else g = { key: 'later', title: 'Unscheduled', sub: 'Reveal whenever it fits', session: null, items: [] };
      groups.set(it.group, g);
    }
    const { group: _g, ...item } = it;
    void _g;
    g.items.push(item);
  }
  // a session's items say when within it only if they differ
  for (const g of groups.values()) if (g.session !== null && new Set(g.items.map((i) => i.when)).size === 1) {
    g.sub = (g.items[0].when === 'When the session starts' ? 'Goes live when the session starts' : 'Goes live when the session is marked played') + ' · ' + g.sub;
    for (const i of g.items) i.when = '';
  }
  const rank = (g: Group) => {
    const [kind, id] = g.key.split(':');
    if (kind === 'session') return [0, Number(id)];
    if (kind === 'chapter') return [1, w.chapters.findIndex((c) => c.id === id)];
    if (kind === 'beat') return [2, w.beats.findIndex((b) => b.id === id)];
    return [3, 0];
  };
  return [...groups.values()].sort((x, y) => { const a1 = rank(x), b1 = rank(y); return a1[0] - b1[0] || a1[1] - b1[1]; });
}

// "Reveal now" for an entry or attached homebrew: everyone, or the players it names, from now on.
export function revealedVis(v: Vis): { vis: string; vis_players: string[]; vis_stage: null; vis_entry: null } {
  const players = v.vis_players ?? [];
  return { vis: named(v) && players.length ? 'players' : 'all', vis_players: named(v) ? players : [], vis_stage: null, vis_entry: null };
}
