// The rules of dice privacy (hub version 2, item 5). Pure: no database, no React, only types
// imported, so tests load this file directly.
//
// Who may READ a roll is decided by the database (rolls_select in the dice migration).
// rollOpen() below is the same rule in code, for the one case the database cannot decide: a
// DM previewing as a player, whose own login reads everything. Keep the two in step.
//
// Who may MAKE which kind of roll is decided here and applied by the server before it rolls
// (src/features/dice/server.ts). A browser cannot store a roll at all.

export type Privacy = 'all' | 'dm' | 'self' | 'players';
export type Roll = { id: string; user_id: string; privacy: string; shown_to: string[]; blind: boolean };

// viewer: `id` is who is looking (null for a preview as "any player"); `dmSide` is the
// campaign's owner, a co-DM with "See private rolls", or the Head DM looking in.
export function rollOpen(r: Pick<Roll, 'user_id' | 'privacy' | 'shown_to' | 'blind'>, v: { id: string | null; dmSide: boolean }): boolean {
  const mine = !!v.id && r.user_id === v.id;
  if (r.privacy === 'self') return mine;
  if (v.dmSide) return true;
  if (mine && !r.blind) return true;
  if (r.privacy === 'all') return true;
  return r.privacy === 'players' && !!v.id && (r.shown_to ?? []).includes(v.id);
}

// ---------------------------------------------------------------- a campaign's dice rules

// Kept in the campaign's settings as settings.dice. A campaign with none has these defaults.
export type DiceRules = {
  dmOnly: boolean;          // players can roll to the DM only
  self: boolean;            // players can roll just for themselves
  dmHidden: boolean;        // DM rolls are hidden by default
  showDice: boolean;        // show the roll and modifier, not just the total
  alwaysPrivate: string[];  // checks that always go to the DM only (the DM cannot be overridden by the player)
};
export const DICE_DEFAULTS: DiceRules = { dmOnly: true, self: true, dmHidden: false, showDice: true, alwaysPrivate: [] };

export function diceRules(settings: { dice?: unknown } | null | undefined): DiceRules {
  const d = (settings?.dice && typeof settings.dice === 'object' && !Array.isArray(settings.dice) ? settings.dice : {}) as Record<string, unknown>;
  const flag = (k: keyof DiceRules) => (typeof d[k] === 'boolean' ? (d[k] as boolean) : (DICE_DEFAULTS[k] as boolean));
  return { dmOnly: flag('dmOnly'), self: flag('self'), dmHidden: flag('dmHidden'), showDice: flag('showDice'),
    alwaysPrivate: Array.isArray(d.alwaysPrivate) ? [...new Set(d.alwaysPrivate.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 60)))].slice(0, 30) : [] };
}
// Makes rules safe to store. `checks` is the names that may be made always private (the campaign's skills).
export function cleanDiceRules(input: unknown, checks: string[]): DiceRules {
  const r = diceRules({ dice: input });
  return { ...r, alwaysPrivate: checks.filter((c) => r.alwaysPrivate.includes(c)) };
}

// What a player may pick for "Who sees my next roll". `privateOn` is the campaign's
// "Private rolls" feature switch (src/config/hub-features.ts).
export function playerChoices(rules: DiceRules, privateOn: boolean): Privacy[] {
  return ['all', ...(privateOn && rules.dmOnly ? ['dm' as const] : []), ...(privateOn && rules.self ? ['self' as const] : [])];
}
export const DM_CHOICES: Privacy[] = ['all', 'dm', 'players'];

// The privacy a roll will really have, or why it cannot be made. The server calls this; the
// browser's wish is only a wish.
export function decidePrivacy(a: {
  dm: boolean; wanted: unknown; players: unknown; label: string; rules: DiceRules; privateOn: boolean; memberIds: string[];
  request?: { privacy: string; blind: boolean } | null;
}): { ok: true; privacy: Privacy; shown_to: string[]; blind: boolean } | { ok: false; error: string } {
  // a roll the DM asked for has the privacy the DM chose
  if (a.request) return { ok: true, privacy: a.request.blind || a.request.privacy === 'dm' ? 'dm' : 'all', shown_to: [], blind: a.request.blind };
  if (a.dm) {
    const privacy = (DM_CHOICES as string[]).includes(String(a.wanted)) ? (a.wanted as Privacy) : a.rules.dmHidden ? 'dm' : 'all';
    if (privacy !== 'players') return { ok: true, privacy, shown_to: [], blind: false };
    const named = [...new Set((Array.isArray(a.players) ? a.players : []).map(String))].filter((id) => a.memberIds.includes(id));
    if (!named.length) return { ok: false, error: 'Choose at least one player to show that roll to.' };
    return { ok: true, privacy, shown_to: named.slice(0, 20), blind: false };
  }
  // a check the campaign keeps private goes to the DM, whatever the player picked
  if (a.rules.alwaysPrivate.some((c) => c.toLowerCase() === a.label.trim().toLowerCase())) return { ok: true, privacy: 'dm', shown_to: [], blind: false };
  const allowed = playerChoices(a.rules, a.privateOn);
  const privacy = (allowed as string[]).includes(String(a.wanted)) ? (a.wanted as Privacy) : null;
  if (!privacy) return a.wanted === undefined || a.wanted === null || a.wanted === '' ? { ok: true, privacy: 'all', shown_to: [], blind: false } : { ok: false, error: 'This campaign does not allow that kind of private roll.' };
  return { ok: true, privacy, shown_to: [], blind: false };
}

// ---------------------------------------------------------------- words

export const PRIVACY_LABEL: Record<Privacy, { player: string; dm: string }> = {
  all: { player: 'Everyone', dm: 'Everyone' },
  dm: { player: 'DM only', dm: 'DMs only' },
  self: { player: 'Just me', dm: 'Just me' },
  players: { player: 'Some players', dm: 'Some players' },
};

// Who can see a roll, said to the person looking at it. Empty for a roll everyone sees.
export function seenBy(r: { user_id: string; by_dm: boolean; privacy: string; shown_to: string[]; blind: boolean }, me: string | null, dmSide: boolean, names: Record<string, string> = {}): string {
  const mine = !!me && r.user_id === me;
  if (r.privacy === 'all') return '';
  if (r.privacy === 'self') return 'only you see this';
  if (r.privacy === 'players') {
    if (dmSide || mine) return 'only ' + (r.shown_to.map((id) => names[id] ?? 'a player').join(', ') || 'named players') + ' and the DM see this';
    return 'only you and the DM see this';
  }
  if (r.blind) return 'a blind roll: the player does not see the result';
  if (r.by_dm) return 'hidden from players';
  return mine ? 'only the DM sees this' : 'rolled to the DM only';
}
