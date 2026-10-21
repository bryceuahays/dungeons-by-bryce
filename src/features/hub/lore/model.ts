// The Lore page's sums (hub version 2, item 11). Pure, so tests load this file directly.

import { FOUND, PLACE_TYPES, type LoreCategory, type LoreField } from '../../../config/lore-categories.ts';

type Lore = { id: string; title: string; sort?: number; data: Record<string, unknown>; secret?: Record<string, unknown> | null };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// One field's value, tidied for saving. Everything is shown as plain text, never as HTML.
export function cleanField(f: LoreField, v: unknown, campaignId: string): unknown {
  switch (f.kind) {
    case 'text': return str(v, 200);
    case 'long': return str(v, 5000);
    case 'number': { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : undefined; }
    case 'check': return v === true || undefined;
    case 'select': return f.options?.some(([id]) => id === v) && v ? v : undefined;
    case 'list': return (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => str(x, 40)).filter(Boolean).slice(0, 12);
    case 'region': return typeof v === 'string' && UUID.test(v) ? v : undefined;
    case 'npcs': case 'factions': return (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && UUID.test(x)).slice(0, 20);
    case 'image': return typeof v === 'string' && v.startsWith(campaignId + '/') ? v.slice(0, 300) : undefined;
  }
}

// The data a lore entry is saved with: its category and its fields, nothing else.
export function cleanData(cat: LoreCategory, input: Record<string, unknown>, campaignId: string): Record<string, unknown> {
  const out: Record<string, unknown> = { cat: cat.id };
  for (const f of cat.fields) {
    const v = cleanField(f, input[f.key], campaignId);
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[f.key] = v;
  }
  return out;
}

// A creature's facts. What the party has learned goes on the entry (players who can see the
// creature read it); the rest stays with the DM-only secrets until it is learned. Players are
// told only how many are left (the mockup's "2 more").
export type Fact = { text: string; session?: number; learned: boolean };
export function splitFacts(facts: Fact[]): { learned: { text: string; session?: number }[]; unlearned: { text: string }[]; more: number } {
  const ok = facts.map((f) => ({ ...f, text: str(f.text, 300) })).filter((f) => f.text).slice(0, 30);
  const learned = ok.filter((f) => f.learned).map((f) => ({ text: f.text, ...(Number(f.session) > 0 ? { session: Math.min(999, Math.trunc(Number(f.session))) } : {}) }));
  const unlearned = ok.filter((f) => !f.learned).map((f) => ({ text: f.text }));
  return { learned, unlearned, more: unlearned.length };
}
export function factsOf(e: Lore): Fact[] {
  const learned = (Array.isArray(e.data.learned) ? e.data.learned : []) as { text?: string; session?: number }[];
  const unlearned = (Array.isArray(e.secret?.unlearned) ? e.secret!.unlearned : []) as { text?: string }[];
  return [...learned.map((f) => ({ text: String(f.text ?? ''), session: f.session, learned: true })), ...unlearned.map((f) => ({ text: String(f.text ?? ''), learned: false }))];
}

// Places nested in their regions: each region with the places in it, then the places in none.
export function groupPlaces<T extends Lore>(places: T[]): { region: T | null; places: T[] }[] {
  const regions = places.filter((p) => p.data.type === 'region');
  const ids = new Set(regions.map((r) => r.id));
  const out: { region: T | null; places: T[] }[] = regions.map((r) => ({ region: r, places: places.filter((p) => p.data.region === r.id && p.id !== r.id && p.data.type !== 'region') }));
  const loose = places.filter((p) => p.data.type !== 'region' && !(typeof p.data.region === 'string' && ids.has(p.data.region)));
  if (loose.length) out.push({ region: null, places: loose });
  return out;
}

export const placeType = (e: Lore) => PLACE_TYPES.find(([id]) => id === e.data.type)?.[1] ?? '';

// "Visited in Session 1", "Heard of", or nothing.
export function foundLine(d: Record<string, unknown>): string {
  const how = FOUND.find(([id]) => id && id === d.found)?.[1];
  if (!how) return '';
  return Number(d.session) > 0 ? `${how} in Session ${Number(d.session)}` : how;
}

// Search: the name and every field a reader of this entry may read (the DM's notes for the DM).
export function loreMatches(e: Lore, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const words = [e.title, ...Object.values(e.data).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : String((x as { text?: string })?.text ?? ''))) : [])), String(e.secret?.notes ?? '')];
  return words.join(' ').toLowerCase().includes(s);
}

// History in order: by its position, then oldest first as entered.
export const byPosition = <T extends Lore & { created_at?: string }>(a: T, b: T) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
