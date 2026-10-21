// The Players page's sums (hub version 2, item 13). Pure, so tests load this file directly.
//
// A character's sheet is its player's (and the DM's) alone. What the player chooses to share with
// the party is `characters.shared`: about them, what they carry, and their connections. Other players
// read only that (party_shared() in the database), never the sheet.

export type Shared = { about: string; carry: string; connections: string };
export const SHARED_FIELDS: [keyof Shared, string, string][] = [
  ['about', 'About them', 'Who they are, as the party would know them'],
  ['carry', 'What they carry', 'Items the party can see'],
  ['connections', 'Connections', 'NPCs and factions the party knows they are tied to'],
];
export const MAX_SHARED = 2000;
export const MAX_MESSAGE = 2000;
export const MAX_NOTES = 20000;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

export function cleanShared(input: unknown): Shared {
  const s = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  return { about: text(s.about, MAX_SHARED), carry: text(s.carry, MAX_SHARED), connections: text(s.connections, MAX_SHARED) };
}
export const sharesAnything = (s: unknown) => Object.values(cleanShared(s)).some(Boolean);

// The card line under a character's name: "Elf Wizard · Level 3 · Sage".
export const cardLine = (c: { race?: string; cls?: string; level?: number | string; background?: string }) =>
  [[c.race, c.cls].filter(Boolean).join(' '), c.level ? `Level ${c.level}` : '', c.background ?? ''].filter(Boolean).join(' · ');

// A message's "when", in words: "Just now", "2 hours ago", "Yesterday", "3 days ago", or the date.
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 2) return 'Just now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'An hour ago' : `${h} hours ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'Last week';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
