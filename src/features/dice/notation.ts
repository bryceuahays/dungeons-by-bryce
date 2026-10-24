// Dice notation: reading it, checking it, and rolling it. Pure: no database, no request, and
// the random numbers are handed in, so the tests can roll loaded dice. The server passes a
// secure generator (src/features/dice/server.ts). Nothing here ever runs in a browser to
// decide a result.
//
//   2d6+3          several dice and a modifier
//   1d8+1d6+2      several terms
//   2d20kh1+5      advantage: roll two, keep the highest
//   2d20kl1+5      disadvantage: keep the lowest
//   4d6kh3         keep the highest three
//   d20, d%        one die; d% is d100

export const MAX_DICE = 100;      // dice in one roll
export const MAX_SIDES = 1000;    // sides on one die
export const MAX_TERMS = 20;
export const MAX_FLAT = 100000;
export const MAX_LENGTH = 120;

export type DiceTerm = { kind: 'dice'; sign: 1 | -1; n: number; sides: number; keep: { highest: boolean; count: number } | null };
export type FlatTerm = { kind: 'flat'; sign: 1 | -1; value: number };
export type Term = DiceTerm | FlatTerm;
export type Parsed = { ok: true; terms: Term[]; text: string } | { ok: false; error: string };

// One group of dice as it fell: every die, and which of them counted.
export type Rolled = { sides: number; sign: 1 | -1; rolls: number[]; kept: boolean[] };
export type Result = { dice: Rolled[]; modifier: number; total: number };

const say = (t: Term) => (t.kind === 'flat' ? String(t.value) : `${t.n}d${t.sides}${t.keep ? (t.keep.highest ? 'kh' : 'kl') + t.keep.count : ''}`);
export const formatTerms = (terms: Term[]) => terms.map((t, i) => (i === 0 ? (t.sign < 0 ? '-' : '') : t.sign < 0 ? '-' : '+') + say(t)).join('');

export function parseNotation(input: unknown): Parsed {
  if (typeof input !== 'string') return { ok: false, error: 'Write what to roll, for example 2d6+3.' };
  const s = input.toLowerCase().replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'Write what to roll, for example 2d6+3.' };
  if (s.length > MAX_LENGTH) return { ok: false, error: 'That is too long to roll.' };
  if (!/^[+-]?[0-9dkhl%]+([+-][0-9dkhl%]+)*$/.test(s)) return { ok: false, error: 'That is not dice notation. Try 2d6+3, 1d8+1d6+2 or 2d20kh1.' };
  const parts = s.match(/[+-]?[^+-]+/g) ?? [];
  if (parts.length > MAX_TERMS) return { ok: false, error: `At most ${MAX_TERMS} parts in one roll.` };
  const terms: Term[] = [];
  let dice = 0;
  for (const part of parts) {
    const sign = part[0] === '-' ? -1 : 1;
    const body = part.replace(/^[+-]/, '');
    const m = /^(\d{0,4})d(\d{1,5}|%)(?:k([hl])(\d{1,3}))?$/.exec(body);
    if (m) {
      const n = m[1] === '' ? 1 : Number(m[1]), sides = m[2] === '%' ? 100 : Number(m[2]);
      if (n < 1) return { ok: false, error: 'Roll at least one die.' };
      if (sides < 2 || sides > MAX_SIDES) return { ok: false, error: `A die has between 2 and ${MAX_SIDES} sides.` };
      dice += n;
      if (dice > MAX_DICE) return { ok: false, error: `At most ${MAX_DICE} dice in one roll.` };
      let keep: DiceTerm['keep'] = null;
      if (m[3]) {
        const count = Number(m[4]);
        if (count < 1 || count > n) return { ok: false, error: 'Keep at least one die, and no more than you roll.' };
        keep = { highest: m[3] === 'h', count };
      }
      terms.push({ kind: 'dice', sign, n, sides, keep });
    } else if (/^\d{1,6}$/.test(body)) {
      const value = Number(body);
      if (value > MAX_FLAT) return { ok: false, error: 'That modifier is too large.' };
      terms.push({ kind: 'flat', sign, value });
    } else {
      return { ok: false, error: 'That is not dice notation. Try 2d6+3, 1d8+1d6+2 or 2d20kh1.' };
    }
  }
  if (!terms.some((t) => t.kind === 'dice')) return { ok: false, error: 'There are no dice in that.' };
  return { ok: true, terms, text: formatTerms(terms) };
}

// Roll it. `die(sides)` must answer a whole number from 1 to sides.
export function rollTerms(terms: Term[], die: (sides: number) => number): Result {
  const dice: Rolled[] = [];
  let modifier = 0, total = 0;
  for (const t of terms) {
    if (t.kind === 'flat') { modifier += t.sign * t.value; continue; }
    const rolls = Array.from({ length: t.n }, () => {
      const v = die(t.sides);
      if (!Number.isInteger(v) || v < 1 || v > t.sides) throw new Error('a die answered out of range');
      return v;
    });
    let kept = rolls.map(() => true);
    if (t.keep) {
      // the positions of the dice that count: the highest (or lowest) `count`, the earlier die winning a tie
      const order = rolls.map((v, i) => [v, i] as const).sort((a, b) => (t.keep!.highest ? b[0] - a[0] : a[0] - b[0]) || a[1] - b[1]);
      const counted = new Set(order.slice(0, t.keep.count).map(([, i]) => i));
      kept = rolls.map((_, i) => counted.has(i));
    }
    dice.push({ sides: t.sides, sign: t.sign, rolls, kept });
    total += t.sign * rolls.reduce((sum, v, i) => sum + (kept[i] ? v : 0), 0);
  }
  return { dice, modifier, total: total + modifier };
}

// "15 + 2", "4, 6 (dropped 1) + 3": how a result is written out next to its total. Saved rolls
// are read back from the database, so anything not in the shape rollTerms() gives is left out
// (an empty string if nothing is readable) rather than breaking the page that shows it.
const isRolled = (g: unknown): g is Rolled => !!g && typeof g === 'object' && Array.isArray((g as Rolled).rolls) && Array.isArray((g as Rolled).kept);
export function formatResult(r: { dice: unknown; modifier: unknown }): string {
  const groups = (Array.isArray(r.dice) ? r.dice : []).filter(isRolled).map((g, i) => {
    const kept = g.rolls.filter((_, k) => g.kept[k]), dropped = g.rolls.filter((_, k) => !g.kept[k]);
    const text = kept.join(', ') + (dropped.length ? ` (dropped ${dropped.join(', ')})` : '');
    return (i === 0 ? (g.sign < 0 ? '- ' : '') : g.sign < 0 ? ' - ' : ' + ') + text;
  }).join('');
  const mod = Number(r.modifier) || 0;
  if (!groups) return '';
  return groups + (mod ? (mod < 0 ? ' - ' : ' + ') + Math.abs(mod) : '');
}
// " (15 + 2)" after a roll's label, or nothing if its dice cannot be read.
export const resultNote = (r: { dice?: unknown; modifier?: unknown }) => { const t = r.dice ? formatResult({ dice: r.dice, modifier: r.modifier }) : ''; return t ? ` (${t})` : ''; };

// The notation for a d20 check with a modifier: "1d20+5", or with advantage or disadvantage.
export function checkNotation(bonus: number, mode: 'normal' | 'adv' | 'dis' = 'normal'): string {
  const d = mode === 'adv' ? '2d20kh1' : mode === 'dis' ? '2d20kl1' : '1d20';
  const b = Math.trunc(Number(bonus) || 0);
  return d + (b ? (b < 0 ? '-' : '+') + Math.abs(b) : '');
}
