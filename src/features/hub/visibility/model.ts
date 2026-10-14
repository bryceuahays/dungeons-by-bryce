// The words and sums behind "Who sees this?" (hub version 2, item 4). Pure: no database, no
// React, and only types imported, so tests load this file directly.
//
// What is stored is one value, `vis`, with its players, stage and beat beside it (the rule is
// entryOpen() in src/lib/entry-types.ts and entry_open() in the database). The picker asks two
// questions instead, who and when, and this file turns one into the other.
//
// It also holds NPC partial reveals: how much of an NPC players are given.

export type VisValue = { vis: string; vis_players: string[]; vis_stage: string | null; vis_entry?: string | null };

export type Who = 'all' | 'dm' | 'players';
export type When = 'now' | 'hold' | 'stage' | 'entry';
export type Choice = { who: Who; when: When; players: string[]; stage: string | null; entry: string | null };

export const WHO: [Who, string][] = [['all', 'Every player'], ['dm', 'Only DMs (hidden)'], ['players', 'Only some players']];
export const WHEN: [When, string][] = [['now', 'Right away'], ['hold', 'When I reveal it'], ['stage', 'From a stage onward'], ['entry', 'Once a story beat happens']];

// The stored value as the two questions.
export function toChoice(v: VisValue): Choice {
  const players = v.vis_players ?? [], stage = v.vis_stage ?? null, entry = v.vis_entry ?? null;
  switch (v.vis) {
    case 'all': return { who: 'all', when: 'now', players, stage, entry };
    case 'stage': return { who: 'all', when: 'stage', players, stage, entry };
    case 'entry': return { who: 'all', when: 'entry', players, stage, entry };
    case 'players': return { who: 'players', when: 'now', players, stage, entry };
    case 'players_stage': return { who: 'players', when: 'stage', players, stage, entry };
    case 'players_entry': return { who: 'players', when: 'entry', players, stage, entry };
    // DM only. If players are named, it is "those players, when I reveal it": the names are
    // kept so revealing it later is one step.
    default: return players.length ? { who: 'players', when: 'hold', players, stage, entry } : { who: 'dm', when: 'now', players, stage, entry };
  }
}

// The two questions as the stored value. Anything held ("only DMs", or "when I reveal it") is
// 'dm': nobody but the DM gets it until the DM changes the answer.
export function fromChoice(c: Choice): VisValue {
  const keep = { vis_stage: c.stage, vis_entry: c.entry };
  if (c.who === 'dm') return { vis: 'dm', vis_players: [], ...keep };
  const players = c.who === 'players' ? c.players : [];
  if (c.when === 'hold') return { vis: 'dm', vis_players: players, ...keep };
  const base = c.when === 'now' ? '' : c.when;   // '', 'stage' or 'entry'
  const vis = c.who === 'players' ? (base ? 'players_' + base : 'players') : base || 'all';
  return { vis, vis_players: players, ...keep };
}

// Does the stored value name players, wait for a stage, wait for a beat?
export const namesPlayers = (vis: string) => vis === 'players' || vis === 'players_stage' || vis === 'players_entry';
export const waitsForStage = (vis: string) => vis === 'stage' || vis === 'players_stage';
export const waitsForBeat = (vis: string) => vis === 'entry' || vis === 'players_entry';

type Named = { id: string; label: string };
const list = (names: string[]) => (names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names.at(-1));

// One sentence saying who gets it and when, for the picker and for labels.
export function describe(v: VisValue, people: Named[] = [], stages: Named[] = [], beats: Named[] = []): string {
  const c = toChoice(v);
  const who = c.who === 'players' ? `Only ${list(c.players.map((id) => people.find((p) => p.id === id)?.label ?? 'a player')) || 'the players you name'}` : 'Every player';
  const sees = c.who === 'players' && c.players.length === 1 ? 'sees' : 'see';
  if (c.who === 'dm') return 'Hidden from players. Only DMs see this.';
  if (c.when === 'hold') return `Hidden from players for now. ${who} will see this when you reveal it.`;
  if (c.when === 'stage') return `${who} will see this from ${stages.find((s) => s.id === c.stage)?.label ?? 'the stage you choose'} onward.`;
  if (c.when === 'entry') return `${who} will see this once "${beats.find((b) => b.id === c.entry)?.label ?? 'the beat you choose'}" has happened.`;
  return c.who === 'all' ? 'Every player sees this.' : `${who} ${sees} this.`;
}

// The short label for a card or a row.
export function shortLabel(v: VisValue, people: Named[] = [], stages: Named[] = [], beats: Named[] = []): string {
  const c = toChoice(v);
  if (c.who === 'dm') return 'Hidden from players';
  const who = c.who === 'players' ? `Only ${list(c.players.map((id) => people.find((p) => p.id === id)?.label ?? 'a player')) || 'named players'}` : '';
  const when = c.when === 'hold' ? 'when you reveal it' : c.when === 'stage' ? `from ${stages.find((s) => s.id === c.stage)?.label ?? 'a stage'}` : c.when === 'entry' ? `after "${beats.find((b) => b.id === c.entry)?.label ?? 'a beat'}"` : '';
  if (!who && !when) return 'Everyone';
  if (!who) return c.when === 'hold' ? 'Hidden from players' : 'Reveals ' + when;
  return who + (when ? ', ' + when : '');
}

// What is still missing before a choice can be saved (the picker says so instead of saving it).
export function problem(c: Choice): string | null {
  if (c.who === 'players' && !c.players.length) return 'Choose at least one player.';
  if (c.who !== 'dm' && c.when === 'stage' && !c.stage) return 'Choose a stage.';
  if (c.who !== 'dm' && c.when === 'entry' && !c.entry) return 'Choose a story beat.';
  return null;
}

// ---------------------------------------------------------------- NPC partial reveals
//
// How much of an NPC the players who can see them are given. Who can see them at all is `vis`.
// At 'portrait' and 'name' the rest is not on the NPC's own row: it is kept with the DM-only
// secrets, under `held`. The database refuses a partly shown NPC that still carries it
// (entries_reveal_guard), so this is not the only thing standing between it and a player.

export type Reveal = 'all' | 'portrait' | 'name';
export const REVEAL: [Reveal, string, string][] = [
  ['all', 'Everything', 'Name, portrait, status, where they are, their faction and what the players know.'],
  ['portrait', 'Name and portrait', 'They know the face and the name. Nothing else.'],
  ['name', 'Name only', 'They have heard the name. No face, nothing else.'],
];
export const revealOf = (data: Record<string, unknown> | null | undefined): Reveal => (data?.reveal === 'name' || data?.reveal === 'portrait' ? data.reveal : 'all');
export const revealLabel = (r: Reveal) => REVEAL.find((x) => x[0] === r)![1];

type Bag = Record<string, unknown>;
type NpcRow = { status?: string; data?: Bag | null; secret?: Bag | null };

// The NPC as the DM sees and edits it: the held-back details put back where they belong.
export function npcFull(n: NpcRow): { status: string; data: Bag } {
  const held = (n.secret?.held && typeof n.secret.held === 'object' ? n.secret.held : {}) as Bag;
  const { status: heldStatus, ...heldData } = held;
  const { reveal: _r, ...own } = (n.data ?? {}) as Bag;
  void _r;
  return { status: n.status || (typeof heldStatus === 'string' ? heldStatus : '') || '', data: { ...heldData, ...own } };
}

// The NPC as it must be stored for a level: what goes on its own row (players who can see
// the NPC read all of that), and what goes with the secrets.
export function npcSplit(full: { status: string; data: Bag }, secret: Bag, level: Reveal): { status: string; data: Bag; secret: Bag } {
  const { held: _h, ...restSecret } = secret;
  void _h;
  const { reveal: _r, ...data } = full.data;
  void _r;
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  if (level === 'all') return { status: full.status, data, secret: restSecret };
  const { file, ...others } = data;
  const shown: Bag = { reveal: level, ...(level === 'portrait' && file ? { file } : {}) };
  const held: Bag = { status: full.status, ...others, ...(level === 'name' && file ? { file } : {}) };
  return { status: '', data: shown, secret: { ...restSecret, held } };
}
