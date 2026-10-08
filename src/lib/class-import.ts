/* eslint-disable @typescript-eslint/no-explicit-any */
// Import a class from notes, with the DM's own AI doing the reading: the DM gives their AI our
// prompt and their notes, the AI answers in the format below, and this file turns that answer
// into the class editor's data. Anything the answer leaves out stays blank.

import { SKILL_NAMES } from '@/config/homebrew';
import { TOOL_CHOICES, TOOL_GROUPS, WEAPONS } from '@/config/proficiencies';
import { readProfs, writeProfs } from '@/components/ClassProfs';
import type { SpellOption } from './class-spells';

export const IMPORT_FORMAT = 'dungeons-by-bryce-class-1';

export const IMPORT_PROMPT = `I am going to give you my notes for a homebrew Dungeons & Dragons 5th edition class. Turn them into one JSON object in exactly the format below, so a website can fill in its class editor.

Rules:
- Use ONLY what my notes say. Do not invent, balance or "complete" anything.
- If my notes do not mention something, leave that key out (or use an empty list). Never guess.
- Copy feature descriptions in my own words; do not rewrite them.
- Answer with the JSON only: no explanation before or after it.

Format (every key is optional except "format"):
{
  "format": "${IMPORT_FORMAT}",
  "name": "class name",
  "description": "what the class is like",
  "hitDie": 6 | 8 | 10 | 12,
  "primaryAbilities": ["str" | "dex" | "con" | "int" | "wis" | "cha"],
  "primaryJoin": "or" | "and",            // "Strength or Dexterity" is "or"; needing both is "and"
  "savingThrows": ["str", "con"],          // ability keys as above
  "armor": ["light", "medium", "heavy", "shields"],
  "weaponCategories": ["simple", "martial"],
  "weapons": ["Rapier", "Longbow"],        // individual weapons, by their D&D name
  "tools": ["Thieves' Tools"],             // individual tools, by their D&D name
  "toolChoice": { "count": 1, "from": "Artisan's tools" | "Musical instruments" | "Gaming sets" | "Artisan's tools or musical instruments" | "Any tool" },
  "skillChoices": { "count": 2, "from": ["Athletics", "Perception"] },   // D&D skill names; empty "from" means any skill
  "spellcasting": {
    "type": "none" | "full" | "half" | "pact",   // full = up to 9th-level slots like a wizard, half = up to 5th like a paladin, pact = warlock-style
    "ability": "int" | "wis" | "cha",
    "cantripsKnown": [20 numbers, one per class level 1 to 20],
    "preparedSpells": [20 numbers, one per class level 1 to 20],
    "spells": ["Bless", "Cure Wounds"]          // spells on the class's list, by name
  },
  "resources": [                               // pools of uses or points that features spend
    {
      "name": "Channel Divinity",
      "amount": { "type": "fixed", "value": 2 }
             | { "type": "byLevel", "steps": [[3, 2], [11, 3]] }      // [from class level, amount]
             | { "type": "levelTimes", "value": 5 }                    // class level x value
             | { "type": "ability", "ability": "cha" },                // that ability's modifier
      "recharge": "long" | "short" | "oneOnShort" | "never",            // oneOnShort = one back on a short rest, all on a long rest
      "fromLevel": 1
    }
  ],
  "features": [
    {
      "level": 1,
      "name": "feature name",
      "description": "what it does, in my words",
      "usesResource": "Channel Divinity",       // the name of a resource above, if the feature spends one
      "cost": 1,                                // how much one use spends; leave out if it varies
      "grows": [                                // numbers that get bigger with level
        { "name": "Aura range", "kind": "distance" | "dice" | "bonus" | "count" | "duration" | "other",
          "values": [[6, "10 ft"], [18, "30 ft"]] }   // [from class level, value as players read it]
      ]
    }
  ],
  "proficiencyBonus": [20 numbers, only if my notes change the usual +2 to +6]
}

My notes:
`;

const AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_WORDS: Record<string, string> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const ab = (v: unknown) => { const t = String(v ?? '').trim().toLowerCase(); return AB.includes(t) ? t : ABILITY_WORDS[t] ?? (AB.includes(t.slice(0, 3)) ? t.slice(0, 3) : ''); };
const abs = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(ab).filter(Boolean))];
const str = (v: unknown, max = 5000) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const int = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const twenty = (v: unknown) => (Array.isArray(v) && v.length === 20 && v.every((n) => Number.isFinite(Number(n))) ? v.map((n) => Math.max(0, Math.round(Number(n)))) : null);
// a name matched to our own list, ignoring case and a plural "s" ("Longswords" is "Longsword")
const pickName = (v: unknown, from: string[]) => { const t = str(v).toLowerCase().replace(/s$/, ''); return from.find((x) => x.toLowerCase() === t || x.toLowerCase() === t + 's') ?? null; };
const PRIMARY_NAMES: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

export type ImportResult = { ok: true; name: string; data: any; notes: string[] } | { ok: false; error: string };

export function parseClassImport(text: string, spells: SpellOption[]): ImportResult {
  // AIs like to wrap the answer in a code block or add a sentence: take the outermost { ... }
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'There is no class in that text. Paste the whole answer your AI gave, starting with { and ending with }.' };
  let j: any;
  try { j = JSON.parse(text.slice(start, end + 1).replace(/\/\/[^\n"]*$/gm, '')); }
  catch { return { ok: false, error: 'That answer is not complete or has a typo in it. Ask your AI to "send the JSON again, with nothing else", then paste it here.' }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, error: 'That answer is not in the expected format. Copy the prompt again and give it to your AI with your notes.' };

  const notes: string[] = [];
  const data: any = {};
  const name = str(j.name, 120);
  if (j.description) data.desc = str(j.description);

  const hd = int(j.hitDie, 4, 12);
  if (hd && [6, 8, 10, 12].includes(hd)) data.hd = hd;
  else if (j.hitDie !== undefined) notes.push(`Hit die "${str(j.hitDie)}" is not d6, d8, d10 or d12, so it was left blank.`);

  const prim = abs(j.primaryAbilities);
  if (prim.length) {
    const join = j.primaryJoin === 'and' ? 'and' : 'or';
    const words = prim.map((k) => PRIMARY_NAMES[k]);
    Object.assign(data, { primaryAbs: prim, primaryJoin: join, primary: words.length < 2 ? words[0] : words.slice(0, -1).join(', ') + ' ' + join + ' ' + words[words.length - 1] });
  }
  const saves = abs(j.savingThrows);
  if (saves.length) data.saves = saves;

  // armor, weapons and tools: matched to the lists the editor offers; anything else is reported
  const armor = (Array.isArray(j.armor) ? j.armor : []).map((x: unknown) => str(x).toLowerCase().replace(/ armou?r$/, '').replace(/^shield$/, 'shields')).filter((x: string) => ['light', 'medium', 'heavy', 'shields'].includes(x));
  const cats = (Array.isArray(j.weaponCategories) ? j.weaponCategories : []).map((x: unknown) => str(x).toLowerCase().replace(/ weapons?$/, '')).filter((x: string) => x === 'simple' || x === 'martial');
  const allWeapons = [...WEAPONS.simple, ...WEAPONS.martial];
  const weapons: string[] = [];
  for (const w of Array.isArray(j.weapons) ? j.weapons : []) { const m = pickName(w, allWeapons); if (m) weapons.push(m); else notes.push(`"${str(w)}" is not an SRD weapon, so it was left out. Add it by hand if it is homebrew.`); }
  const allTools = Object.values(TOOL_GROUPS).flat();
  const tools: string[] = [];
  for (const t of Array.isArray(j.tools) ? j.tools : []) { const m = pickName(t, allTools); if (m) tools.push(m); else notes.push(`"${str(t)}" is not an SRD tool, so it was left out.`); }
  const tc = j.toolChoice && int(j.toolChoice.count, 0, 9) ? { n: int(j.toolChoice.count, 0, 9)!, from: TOOL_CHOICES.find((c) => c.toLowerCase() === str(j.toolChoice.from).toLowerCase()) ?? 'Any tool' } : { n: 0, from: TOOL_CHOICES[0] };
  if (armor.length || cats.length || weapons.length || tools.length || tc.n) {
    const base = { armorTraining: [...new Set(armor)] as string[], weaponCats: [...new Set(cats)] as string[], weaponItems: [...new Set(weapons)], toolItems: [...new Set(tools)], toolChoice: tc };
    Object.assign(data, writeProfs({}, { ...readProfs({ armor: '', weapons: '', tools: '' }), ...base }));
  }

  if (j.skillChoices) {
    const count = int(j.skillChoices.count, 0, 18);
    if (count !== null) data.skillCount = count;
    const from: string[] = [];
    for (const s of Array.isArray(j.skillChoices.from) ? j.skillChoices.from : []) { const m = pickName(s, SKILL_NAMES); if (m) from.push(m); else notes.push(`"${str(s)}" is not a D&D skill, so it was left off the skill list.`); }
    data.skillList = [...new Set(from)];
  }

  // spellcasting: slots come from the type; spells are matched by name to the SRD and your own
  const sc = j.spellcasting;
  if (sc && typeof sc === 'object') {
    const kind = ['none', 'full', 'half', 'pact'].includes(sc.type) ? sc.type : 'none';
    data.casting = { kind };
    if (kind !== 'none') {
      data.casting.rules = '2024';
      if (ab(sc.ability)) data.casting.ability = ab(sc.ability);
      const c = twenty(sc.cantripsKnown), p = twenty(sc.preparedSpells);
      if (c) data.casting.cantrips = c;
      if (p) data.casting.prepared = p;
      const list: string[] = [];
      for (const n of Array.isArray(sc.spells) ? sc.spells : []) {
        const t = str(n).toLowerCase();
        const m = spells.find((s) => s.mine && s.name.toLowerCase() === t) ?? spells.find((s) => s.name.toLowerCase() === t);
        if (m) list.push(m.id); else notes.push(`The spell "${str(n)}" is not in the SRD or your homebrew, so it was left off. Create it on the Spells tab.`);
      }
      if (list.length) data.spellList = [...new Set(list)];
    }
  }

  // resources, with the same ids the Features tab gives them, so features can point at them
  const resources: any[] = [];
  for (const r of Array.isArray(j.resources) ? j.resources : []) {
    const rname = str(r?.name, 60);
    if (!rname) continue;
    const a = r.amount ?? {};
    const amount = a.type === 'byLevel' && Array.isArray(a.steps) ? { mode: 'steps', steps: a.steps.map((s: any) => [int(s?.[0], 1, 20) ?? 1, int(s?.[1], 0, 999) ?? 0]) }
      : a.type === 'levelTimes' ? { mode: 'level', n: int(a.value, 1, 99) ?? 1 }
      : a.type === 'ability' && ab(a.ability) ? { mode: 'ability', ab: ab(a.ability) }
      : { mode: 'fixed', n: int(a.value, 0, 999) ?? 1 };
    const recharge = { long: 'long', short: 'short', oneOnShort: 'short1', never: 'none' }[String(r.recharge)] ?? 'long';
    resources.push({ id: 'r:' + rname.toLowerCase(), name: rname, amount, recharge, from: int(r.fromLevel, 1, 20) ?? 1 });
  }
  if (resources.length) data.resources = resources;

  const KINDS = ['distance', 'dice', 'bonus', 'count', 'duration', 'other'];
  const features: any[] = [];
  for (const f of Array.isArray(j.features) ? j.features : []) {
    const fname = str(f?.name, 120);
    if (!fname) continue;
    const res = f.usesResource ? resources.find((r) => r.name.toLowerCase() === str(f.usesResource).toLowerCase()) : null;
    if (f.usesResource && !res) notes.push(`"${fname}" spends "${str(f.usesResource)}", which is not one of the resources, so it is not linked.`);
    const grows = (Array.isArray(f.grows) ? f.grows : []).filter((g: any) => str(g?.name) && Array.isArray(g.values)).map((g: any) => ({
      t: 'scale', name: str(g.name, 60), kind: KINDS.includes(g.kind) ? g.kind : 'other',
      steps: g.values.map((v: any) => [int(v?.[0], 1, 20) ?? 1, str(v?.[1], 40)]).filter((v: any) => v[1]),
    }));
    features.push({ level: int(f.level, 1, 20) ?? 1, name: fname, text: str(f.description), uses: res ? { res: res.id, cost: f.cost === undefined || f.cost === null || f.cost === '' ? '' : int(f.cost, 0, 999) ?? '' } : null, ...(grows.length ? { effects: grows } : {}) });
  }
  if (features.length) data.features = features.sort((a, b) => a.level - b.level);

  const pb = twenty(j.proficiencyBonus);
  if (pb) data.profChart = pb;

  if (!name && !Object.keys(data).length) return { ok: false, error: 'The answer did not contain anything about the class. Check that your AI received your notes after the prompt.' };
  return { ok: true, name, data, notes };
}
