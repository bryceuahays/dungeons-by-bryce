/* eslint-disable @typescript-eslint/no-explicit-any */
import { ABILITIES } from '@/lib/rules/engine';
import { ARMOR, WEAPON_CATS } from '@/config/proficiencies';

// A class's starting equipment and multiclassing, as text for the class card (server and client).
//   startEquip: [{ items: [{ name, count }], gp }]  packages; the player picks one (2024 rules)
//   multiclass: { req: [{ ab, min }], join: 'and' | 'or', armor, weaponCats, toolItems, skills, tools }

export type Pkg = { items: { name: string; count: number | '' }[]; gp: number | '' };
export const LETTER = 'ABCDEFGH';
const AB = Object.fromEntries(ABILITIES) as Record<string, string>;

// "6 Javelin" reads "6 Javelins"
const plural = (n: string) => (/s$/i.test(n) || n.includes('(') ? n : n + 's');

// "(A) Chain Mail, 6 Javelins and 9 GP; or (B) 150 GP"
export function equipLine(pkgs: Pkg[] | undefined) {
  const one = (p: Pkg) => {
    const parts = [...p.items.filter((i) => i.name.trim()).map((i) => (Number(i.count) > 1 ? `${i.count} ${plural(i.name)}` : i.name)), ...(Number(p.gp) > 0 ? [`${p.gp} GP`] : [])];
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0] ?? 'nothing';
  };
  const list = (pkgs ?? []).filter((p) => p.items.some((i) => i.name.trim()) || Number(p.gp) > 0);
  if (!list.length) return '';
  return list.length === 1 ? one(list[0]) : list.map((p, i) => `(${LETTER[i]}) ${one(p)}`).join('; or ');
}

// "Strength 13 and Charisma 13. Gives: Light armor, Shields, Martial weapons, 1 skill"
export function multiclassLine(m: any) {
  if (!m) return '';
  const req = (m.req ?? []).filter((r: any) => r.ab).map((r: any) => `${AB[r.ab] ?? r.ab} ${r.min}`).join(m.join === 'or' ? ' or ' : ' and ');
  const gives = [
    ...ARMOR.filter(([k]) => (m.armor ?? []).includes(k)).map(([, l]) => l),
    ...WEAPON_CATS.filter(([k]) => (m.weaponCats ?? []).includes(k)).map(([, l]) => l),
    ...(m.toolItems ?? []),
    ...(Number(m.skills) > 0 ? [`${m.skills} skill${Number(m.skills) > 1 ? 's' : ''} from the class's list`] : []),
    ...(Number(m.tools) > 0 ? [`${m.tools} tool${Number(m.tools) > 1 ? 's' : ''} of the class's choice`] : []),
  ];
  return [req ? `Needs ${req}` : 'No ability requirement', gives.length ? `gives ${gives.join(', ')}` : 'gives no proficiencies'].join('; ') + '.';
}
