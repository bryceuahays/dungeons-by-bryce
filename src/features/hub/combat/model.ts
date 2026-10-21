// The fight (hub version 2, item 12: the Combat page; also the Initiative table tool). Pure, so
// the server, the browser and the tests share it.
//
// A fight is one table-tool entry of kind 'encounter'. Its full state (every combatant, hit
// points, hidden creatures, the DM's notes) is kept in entry_secrets, which only DMs can read.
// What players may see is worked out from it by publicView(), on the server, and is the only thing
// written to the entry itself: no hidden creature, and no enemy's hit points unless the DM shows
// them. Enemies are described instead as Healthy, Wounded, Bloodied or Down.

export type Side = 'party' | 'enemy' | 'ally';
export type Combatant = {
  id: string; name: string; kind: 'pc' | 'npc' | 'monster'; side?: Side;
  init: number; dex: number; hp: number; hpMax: number; ac: number; conditions: string[]; conc: boolean;
  hidden: boolean; showHp: boolean; ref?: string;                 // ref: 'c:<character id>' or 'e:<entity id>'
  pos?: { x: number; y: number } | null;                          // on the battle map, in percent
  roll?: boolean;                                                 // initiative still to be rolled, on the server
};
export type LogLine = { at: string; who: string; text: string };
export type State = { round: number; turn: string | null; list: Combatant[]; name?: string; map?: string | null; log?: LogLine[] };
export const EMPTY: State = { round: 1, turn: null, list: [], log: [] };

export type Health = 'Healthy' | 'Wounded' | 'Bloodied' | 'Down';
export function health(hp: number, max: number): Health {
  if (hp <= 0) return 'Down';
  if (max > 0 && hp >= max) return 'Healthy';
  return max > 0 && hp > max / 2 ? 'Wounded' : 'Bloodied';
}
export const sideOf = (c: Pick<Combatant, 'kind' | 'side'>): Side => c.side ?? (c.kind === 'pc' ? 'party' : 'enemy');

const num = (v: unknown, lo: number, hi: number, d = 0) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const str = (v: unknown, max: number, d = '') => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : d) || d;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Whatever was sent or saved, made safe and whole: an older or partial save can never break a page,
// and a browser cannot store anything strange.
export function cleanState(input: unknown): State {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const list = (Array.isArray(s.list) ? s.list : []).slice(0, 60).map((raw): Combatant => {
    const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const kind = c.kind === 'pc' || c.kind === 'monster' ? c.kind : 'npc';
    const hpMax = num(c.hpMax, 0, 9999);
    const pos = c.pos && typeof c.pos === 'object' ? c.pos as Record<string, unknown> : null;
    return {
      id: /^[a-z0-9]{4,16}$/.test(String(c.id)) ? String(c.id) : Math.random().toString(36).slice(2, 10),
      name: str(c.name, 60, 'Unnamed'), kind, side: c.side === 'party' || c.side === 'enemy' || c.side === 'ally' ? c.side : kind === 'pc' ? 'party' : 'enemy',
      init: num(c.init, -20, 99), dex: num(c.dex, -10, 20), hp: num(c.hp, -999, 9999), hpMax, ac: num(c.ac, 0, 99, 10),
      conditions: (Array.isArray(c.conditions) ? c.conditions : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 12),
      conc: c.conc === true, hidden: kind !== 'pc' && c.hidden === true, showHp: kind === 'pc' || c.showHp === true,
      ref: typeof c.ref === 'string' && /^[ce]:/.test(c.ref) && UUID.test(c.ref.slice(2)) ? c.ref : undefined,
      pos: pos ? { x: num(pos.x, 0, 100), y: num(pos.y, 0, 100) } : null,
      roll: c.roll === true,
    };
  });
  const turn = typeof s.turn === 'string' && list.some((c) => c.id === s.turn) ? s.turn : null;
  const log = (Array.isArray(s.log) ? s.log : []).slice(-20).map((l) => { const x = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>; return { at: str(x.at, 40), who: str(x.who, 60), text: str(x.text, 160) }; }).filter((l) => l.text);
  return { round: num(s.round, 1, 999, 1), turn, list, name: str(s.name, 80), map: typeof s.map === 'string' && UUID.test(s.map) ? s.map : null, log };
}

export const ordered = (s: State) => [...s.list].sort((a, b) => b.init - a.init || b.dex - a.dex || a.name.localeCompare(b.name));

// The next (or previous) turn, with the round going up as the order wraps.
export function step(s: State, dir: 1 | -1 = 1): State {
  const order = ordered(s);
  if (!order.length) return s;
  const i = order.findIndex((c) => c.id === s.turn);
  const j = i < 0 ? 0 : (i + dir + order.length) % order.length;
  const round = Math.max(1, s.round + (dir === 1 && i === order.length - 1 ? 1 : dir === -1 && i === 0 ? -1 : 0));
  return { ...s, turn: order[j].id, round };
}

export type PublicCombatant = { id: string; name: string; kind: Combatant['kind']; side: Side; init: number; ref?: string; hp?: number; hpMax?: number; health?: Health; conditions?: string[]; conc?: boolean; pos?: { x: number; y: number } | null };
export type PublicFight = { round: number; turn: string | null; name: string; map: string | null; order: PublicCombatant[]; log: LogLine[]; next: string | null };

// What players see. `features` follows the campaign's switches for the Combat page.
export function publicView(input: State, features: { health?: boolean; conditions?: boolean; map?: boolean } = {}): PublicFight {
  const s = cleanState(input);
  const order = ordered(s);
  const active = order.find((c) => c.id === s.turn);
  const seen = order.filter((c) => !c.hidden);
  const after = active ? [...order.slice(order.indexOf(active) + 1), ...order.slice(0, order.indexOf(active))].find((c) => !c.hidden) : undefined;
  return {
    round: s.round, name: s.name ?? '', map: features.map === false ? null : s.map ?? null,
    turn: active ? (active.hidden ? 'hidden' : active.id) : null,
    next: after?.name ?? null,
    order: seen.map((c) => ({
      id: c.id, name: c.name, kind: c.kind, side: sideOf(c), init: c.init,
      ...(c.kind === 'pc' && c.ref ? { ref: c.ref } : {}),
      ...(c.kind === 'pc' || c.showHp ? { hp: c.hp, hpMax: c.hpMax } : features.health === false ? {} : { health: health(c.hp, c.hpMax) }),
      ...(features.conditions === false ? {} : { conditions: c.conditions, conc: c.conc }),
      ...(features.map === false ? {} : { pos: c.pos ?? null }),
    })),
    log: s.log ?? [],
  };
}

// A line in the fight's own log (actions that are not rolls: Dash, Dodge, Help, the end of a turn).
export const withLine = (s: State, who: string, text: string, at = new Date().toISOString()): State => ({ ...s, log: [...(s.log ?? []), { at, who: who.slice(0, 60), text: text.slice(0, 160) }].slice(-20) });

// What a player can do on their turn.
export const MOVES = [['dash', 'Dash'], ['dodge', 'Dodge'], ['help', 'Help'], ['disengage', 'Disengage'], ['hide', 'Hide']] as const;
export type Move = (typeof MOVES)[number][0];
