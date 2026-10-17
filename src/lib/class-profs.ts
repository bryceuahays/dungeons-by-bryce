/* eslint-disable @typescript-eslint/no-explicit-any */
// A class's armor, weapon and tool training as choices, and the readable text written from them.
// Plain functions (no browser code), so the server can use them too: Import homebrew and the
// AI connector read and write them. The editor for them is src/components/ClassProfs.tsx.
import { ARMOR, TOOL_CHOICES, TOOL_GROUPS, WEAPONS, WEAPON_CATS } from '@/config/proficiencies';

export type Profs = { armorTraining: string[]; weaponCats: string[]; weaponItems: string[]; toolItems: string[]; toolChoice: { n: number; from: string } };

export const ALL_WEAPONS = [...WEAPONS.simple, ...WEAPONS.martial];
export const ALL_TOOLS = Object.values(TOOL_GROUPS).flat();
export const has = (text: string, name: string) => text.toLowerCase().includes(name.toLowerCase());

// Entries saved before these boxes only have the text: read the choices out of it.
export function readProfs(data: any): Profs {
  const armor = String(data.armor ?? ''), weapons = String(data.weapons ?? ''), tools = String(data.tools ?? '');
  return {
    armorTraining: data.armorTraining ?? ARMOR.map(([k]) => k).filter((k) => /all armor/i.test(armor) ? k !== 'shields' || /shield/i.test(armor) : has(armor, k === 'shields' ? 'shield' : k)),
    weaponCats: data.weaponCats ?? WEAPON_CATS.map(([k]) => k).filter((k) => has(weapons, k)),
    // the SRD import put one of the Rogue's weapons (Whips) in its tools text, so both are read
    weaponItems: data.weaponItems ?? ALL_WEAPONS.filter((w) => has(weapons + ' ' + tools, w)),
    toolItems: data.toolItems ?? ALL_TOOLS.filter((t) => has(tools, t)),
    toolChoice: data.toolChoice ?? { n: 0, from: TOOL_CHOICES[0] },
  };
}

const list = (items: string[]) => (items.length ? items.join(', ') : 'None');
export function writeProfs(data: any, p: Profs) {
  const body = ['light', 'medium', 'heavy'].every((k) => p.armorTraining.includes(k)) ? ['All armor'] : ARMOR.filter(([k]) => k !== 'shields' && p.armorTraining.includes(k)).map(([, l]) => l);
  const armor = [...body, ...(p.armorTraining.includes('shields') ? ['Shields'] : [])];
  const weapons = [...WEAPON_CATS.filter(([k]) => p.weaponCats.includes(k)).map(([, l]) => l), ...p.weaponItems];
  const tools = [...p.toolItems, ...(p.toolChoice.n > 0 ? [`Choose ${p.toolChoice.n}: ${p.toolChoice.from.toLowerCase()}`] : [])];
  return { ...data, ...p, armor: list(armor), weapons: list(weapons), tools: list(tools) };
}

