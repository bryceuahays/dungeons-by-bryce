/* eslint-disable @typescript-eslint/no-explicit-any */
// A monster's stat block as fields (see src/components/MonsterPage.tsx): the challenge rating table,
// and an action's rules as the line a stat block prints. For the card (server and client) and the editor.

export const CRS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
const XP: Record<string, number> = { '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
export const crNumber = (cr: string) => (String(cr).includes('/') ? Number(String(cr).split('/')[0]) / Number(String(cr).split('/')[1]) : Number(cr) || 0);
export const xpFor = (cr: string) => XP[String(cr)] ?? 0;
export const pbFor = (cr: string) => Math.max(2, Math.ceil(crNumber(cr) / 4) + 1);
export const modOf = (score: number) => Math.floor((Number(score) - 10) / 2);
export const sgn = (n: number) => (n >= 0 ? '+' : '') + n;

export const SPEEDS: [string, string][] = [['walk', 'Walk'], ['fly', 'Fly'], ['swim', 'Swim'], ['climb', 'Climb'], ['burrow', 'Burrow']];
export const SENSES: [string, string][] = [['darkvision', 'Darkvision'], ['blindsight', 'Blindsight'], ['tremorsense', 'Tremorsense'], ['truesight', 'Truesight']];

// an action: { name, text, kind: attack | save | multi | other, atk: { type: melee | ranged | both, bonus, reach, range: { normal, long } },
//   damage: [{ dice, type }], save: { ab, dc, success: half | none | other }, limit: { type: recharge | day, min, n } }
const AB_NAME: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const avg = (dice: string) => {
  const m = String(dice).replace(/\s/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/);
  return m ? Math.floor(Number(m[1]) * (Number(m[2]) + 1) / 2) + Number(m[3] ?? 0) : null;
};
const dmgText = (d: any[]) => (d ?? []).filter((x) => x.dice).map((x) => { const a = avg(x.dice); return `${a ?? ''}${a !== null ? ` (${x.dice.replace(/\+/, ' + ')})` : x.dice} ${x.type ? x.type[0].toUpperCase() + x.type.slice(1) : ''} damage`.trim(); }).join(' plus ');
export const limitLabel = (l: any) => (!l?.type ? '' : l.type === 'recharge' ? `Recharge ${Number(l.min) >= 6 ? 6 : `${l.min || 5}–6`}` : `${l.n || 1}/Day`);

// The line a stat block prints for an action written as fields (used when its text is empty).
export function actionText(a: any) {
  if (a.kind === 'attack' && a.atk) {
    const where = a.atk.type === 'ranged' ? `range ${a.atk.range?.normal ?? 30}${a.atk.range?.long ? '/' + a.atk.range.long : ''} ft.` : `reach ${a.atk.reach ?? 5} ft.${a.atk.type === 'both' && a.atk.range?.normal ? ` or range ${a.atk.range.normal}${a.atk.range.long ? '/' + a.atk.range.long : ''} ft.` : ''}`;
    return `${a.atk.type === 'ranged' ? 'Ranged' : a.atk.type === 'both' ? 'Melee or Ranged' : 'Melee'} Attack Roll: ${sgn(Number(a.atk.bonus) || 0)}, ${where} Hit: ${dmgText(a.damage) || 'no damage'}.`;
  }
  if (a.kind === 'save' && a.save?.ab) return `${AB_NAME[a.save.ab]} Saving Throw: DC ${a.save.dc || 10}. Failure: ${dmgText(a.damage) || 'see below'}.${a.save.success === 'half' ? ' Success: Half damage.' : ''}`;
  return '';
}
