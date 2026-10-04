// Rule tables for the edition converter. The converter ships no content from any
// edition: the DM types in something they own, and these tables turn its numbers into
// fifth edition math. Change a table here to change how conversion works.
//
// No imports here: tests load this file directly.

export type EditionId = 'basic' | 'advanced' | 'third' | 'fourth';

export const EDITIONS: Record<EditionId, {
  label: string;
  ac: 'descending' | 'ascending';
  acBase: number;            // descending systems: fifth edition AC = acBase - old AC
  attack: 'thac0' | 'bonus';
  powerLabel: string;        // what the creature's size of threat is called
  crPerPower: number;        // challenge rating per hit die or level
  speed: { unit: string; toFeet: (n: number) => number };
  hpFactor: number;          // applied to the old hit points when there are no hit dice to rebuild from
  spellLevel: (n: number) => number;
  rangeToFeet: (n: number) => number;
  rangeUnit: string;
  saves: 'categories' | 'fort-ref-will' | 'defenses';
  maxItemBonus: number;
}> = {
  basic: {
    label: 'Original and Basic rules (1974 to 1991)', ac: 'descending', acBase: 19, attack: 'thac0', powerLabel: 'Hit dice', crPerPower: 0.5,
    speed: { unit: "feet per turn (the first number, such as 120')", toFeet: (n) => Math.round(n / 4 / 5) * 5 },
    hpFactor: 1.4, spellLevel: (n) => Math.min(9, Math.max(0, n)), rangeToFeet: (n) => n, rangeUnit: 'feet', saves: 'categories', maxItemBonus: 3,
  },
  advanced: {
    label: 'Advanced rules, 1st and 2nd edition', ac: 'descending', acBase: 20, attack: 'thac0', powerLabel: 'Hit dice', crPerPower: 0.55,
    speed: { unit: 'movement rate (such as 12)', toFeet: (n) => Math.round((n * 2.5) / 5) * 5 },
    hpFactor: 1.4, spellLevel: (n) => Math.min(9, Math.max(0, n)), rangeToFeet: (n) => n * 10, rangeUnit: 'inches on the tabletop (1 inch is 10 feet)', saves: 'categories', maxItemBonus: 3,
  },
  third: {
    label: '3rd edition and 3.5', ac: 'ascending', acBase: 0, attack: 'bonus', powerLabel: 'Challenge rating', crPerPower: 0.9,
    speed: { unit: 'feet', toFeet: (n) => n },
    hpFactor: 1, spellLevel: (n) => Math.min(9, Math.max(0, n)), rangeToFeet: (n) => n, rangeUnit: 'feet', saves: 'fort-ref-will', maxItemBonus: 3,
  },
  fourth: {
    label: '4th edition', ac: 'ascending', acBase: 0, attack: 'bonus', powerLabel: 'Level', crPerPower: 0.66,
    speed: { unit: 'squares', toFeet: (n) => n * 5 },
    hpFactor: 0.85, spellLevel: (n) => Math.min(9, Math.max(0, Math.ceil(n / 3))), rangeToFeet: (n) => n * 5, rangeUnit: 'squares', saves: 'defenses', maxItemBonus: 3,
  },
};

// Fifth edition proficiency bonus by challenge rating (SRD 5.1).
export const profByCr = (cr: number) => (cr < 5 ? 2 : cr < 9 ? 3 : cr < 13 ? 4 : cr < 17 ? 5 : cr < 21 ? 6 : cr < 25 ? 7 : cr < 29 ? 8 : 9);
// Hit die by size (SRD 5.1).
export const HIT_DIE: Record<string, number> = { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 20 };
// The challenge ratings fifth edition uses.
export const CR_STEPS = [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
export const crLabel = (n: number) => (n === 0.125 ? '1/8' : n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n));
// When the old stat block gives no ability scores, the attack ability is guessed from the challenge.
export const guessAttackMod = (cr: number) => Math.min(8, 2 + Math.floor(cr / 4));
// Third edition armor class climbs faster than fifth edition's: above this, only part of it carries over.
export const THIRD_AC = { keepUpTo: 16, carry: 0.3, cap: 23 };
// A "turn" in the older editions is ten minutes; a round stays a round.
export const OLD_DURATIONS: [RegExp, string][] = [[/(\d+)\s*turns?/i, '$1 x 10 minutes'], [/1\s*round\s*(per|\/)\s*level/i, 'Concentration, up to 1 minute'], [/1\s*(turn|minute)\s*(per|\/)\s*level/i, 'Concentration, up to 10 minutes'], [/1\s*hour\s*(per|\/)\s*level/i, '8 hours'], [/permanent/i, 'Until dispelled']];
