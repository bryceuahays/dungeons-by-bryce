// The fifth edition rules engine: what SRD and homebrew entries DO to a character.
// Pure functions with no imports, so the sheet (browser), the pages (server) and the
// tests all use the same code.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: [Ability, string][] = [['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']];
export const SKILLS: [string, Ability][] = [['Acrobatics', 'dex'], ['Animal Handling', 'wis'], ['Arcana', 'int'], ['Athletics', 'str'], ['Deception', 'cha'], ['History', 'int'], ['Insight', 'wis'], ['Intimidation', 'cha'], ['Investigation', 'int'], ['Medicine', 'wis'], ['Nature', 'int'], ['Perception', 'wis'], ['Performance', 'cha'], ['Persuasion', 'cha'], ['Religion', 'int'], ['Sleight of Hand', 'dex'], ['Stealth', 'dex'], ['Survival', 'wis']];
export const ENTITY_TYPES = ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'item', 'monster', 'resource'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// The building blocks. `at` is the character level from which the effect applies.
export type Effect = { at?: number } & (
  | { t: 'ability'; ab: Ability | 'any'; n: number; max?: number; among?: string[]; split?: boolean } // any: the player's choice (from the listed ones)
  | { t: 'prof'; kind: 'skill' | 'save' | 'armor' | 'weapon' | 'tool' | 'language'; v: string }
  | { t: 'resist'; v: string; immune?: boolean }
  | { t: 'condition'; v: string } // immunity to a condition, like Charmed
  | { t: 'speed'; mode: 'walk' | 'fly' | 'swim' | 'climb' | 'burrow'; n: number | 'walk' } // 'walk': equal to the walking speed
  | { t: 'sense'; v: string; n: number; what?: string }
  | { t: 'resource'; name: string; max: string; recharge: 'short' | 'short1' | 'long' | 'none' } // short1: one use back on a short rest, all on a long rest
  | { t: 'spell'; name: string; cast?: 'free' | 'perRest'; n?: number | 'prof'; recharge?: 'long' | 'short'; self?: boolean } // no cast: always prepared
  | { t: 'adv'; roll: 'save' | 'check' | 'attack' | 'initiative'; ab?: string; when?: string } // advantage on a roll
  | { t: 'attacks'; n: number; with?: string } // attacks per Attack action
  | { t: 'damage'; amount: string; type?: string; when?: string } // extra damage: dice ("1d8") or an ability modifier ("cha")
  | { t: 'scale'; name: string; steps: [number, string][] }
  | { t: 'hp'; n: number }
  | { t: 'ac'; n: number; when?: string }
  | { t: 'bonus'; roll: 'save' | 'check' | 'attack' | 'initiative' | 'damage'; amount: number | string; when?: string } // amount: a number, 'prof' or an ability
  | { t: 'text'; text: string }
);
export type Feature = { level: number; name: string; text: string; effects?: Effect[] };
export type Entity = { id: string; type: EntityType; name: string; source: string; srd_version?: string | null; status?: string; version?: number; change_note?: string; data: Record<string, any> };

export const mod = (score: number) => Math.floor((Number(score) - 10) / 2);
export const sgn = (n: number) => (n >= 0 ? '+' : '') + n;
export const profBonus = (level: number) => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
// A class may set its own proficiency bonus by level (data.profChart, 20 numbers); otherwise the standard one.
export const classProf = (data: Record<string, any> | undefined, level: number) => {
  const v = data?.profChart?.[Math.max(1, Math.min(20, level)) - 1];
  return v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? profBonus(level) : Number(v);
};

// Spell slots by class level. Full casters use the table as is; half casters use it at
// half their level (rounded down, none at level 1).
const FULL: number[][] = [[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
const HALF: number[][] = [[], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2]];
const PACT: [number, number][] = [[1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]];
// rules: '2024' for classes on the 2024 rules, where a half caster already has two slots at level 1.
// custom: the DM's own table (casting.slots), one row per class level, slots of 1st to 9th level.
export function spellSlots(kind: string | undefined, level: number, rules?: string, table?: unknown): number[] {
  const l = Math.max(1, Math.min(20, level)) - 1;
  if (kind === 'custom') {
    const row = (Array.isArray(table) && Array.isArray(table[l]) ? table[l] : []).slice(0, 9).map((n: unknown) => Math.max(0, Number(n) || 0));
    while (row.length && !row[row.length - 1]) row.pop();
    return row;
  }
  if (kind === 'full') return FULL[l];
  if (kind === 'half') return rules === '2024' && l === 0 ? [2] : HALF[l];
  if (kind === 'pact') { const [n, at] = PACT[l]; const out = Array(at).fill(0); out[at - 1] = n; return out; }
  return [];
}
// The highest spell level a class's slots reach, at any class level.
export const slotTop = (c: any) => (c?.kind && c.kind !== 'none' ? Math.max(0, ...Array.from({ length: 20 }, (_, l) => spellSlots(c.kind, l + 1, c.rules, c.slots).length)) : 0);
// Slots come back on a short rest: pact magic, or a custom table set to.
export const slotsOnShortRest = (c: any) => c?.kind === 'pact' || (c?.kind === 'custom' && c.refill === 'short');
// The usual spellcasting focus of each 2024 SRD caster.
export const SRD_FOCUS: Record<string, string> = { Bard: 'Musical Instrument', Cleric: 'Holy Symbol', Druid: 'Druidic Focus', Paladin: 'Holy Symbol', Ranger: 'Druidic Focus', Sorcerer: 'Arcane Focus', Warlock: 'Arcane Focus', Wizard: 'Arcane Focus' };

// 99 or more uses, written as a set number (like a Barbarian's rages at level 20), means unlimited.
// A pool that grows with level (Lay on Hands, 5 x level) is just big.
export const unlimited = (expr: string | number, n: number) => n >= 99 && /^(step:[\d=,]+|\d+)$/.test(String(expr ?? '').trim().toLowerCase());

// A resource's maximum: a number, or level, prof, an ability ("cha"), "level*5",
// "cha+1", "half" (half level, rounded up), or steps like "step:1=2,3=3,6=4".
export function evalMax(expr: string | number, ctx: { level: number; mods: Record<Ability, number>; prof?: number }): number {
  const s = String(expr ?? '').trim().toLowerCase();
  if (!s) return 0;
  if (s.startsWith('step:')) {
    let v = 0;
    s.slice(5).split(',').forEach((p) => { const [at, n] = p.split('=').map(Number); if (ctx.level >= at) v = n; });
    return v;
  }
  const term = (t: string): number => {
    t = t.trim();
    if (/^\d+$/.test(t)) return Number(t);
    if (t === 'level') return ctx.level;
    if (t === 'prof') return ctx.prof ?? profBonus(ctx.level);
    if (t === 'half') return Math.ceil(ctx.level / 2);
    if (t in ctx.mods) return Math.max(1, ctx.mods[t as Ability]);
    return 0;
  };
  const m = /^([a-z0-9]+)\s*([*+])\s*([a-z0-9]+)$/.exec(s);
  if (m) return m[2] === '*' ? term(m[1]) * term(m[3]) : term(m[1]) + term(m[3]);
  return term(s);
}
export const scaleAt = (steps: [number, string][], level: number) => { let v = ''; (steps || []).forEach(([at, s]) => { if (level >= Number(at)) v = s; }); return v; };

export type CharacterV2 = {
  v: 2; t?: number; name: string; player?: string; level: number;
  race?: string; cls?: string;                 // display names (the party list reads these)
  raceId?: string | null; clsId?: string | null; subId?: string | null; bgId?: string | null; feats?: string[];
  ab: Record<Ability, number>; anyAb?: Ability[]; skills?: string[]; expert?: string[];
  hp?: number | null; hpMax?: number | null; temp?: number; acBase?: number | null; shield?: boolean;
  used?: Record<string, number>; slotsUsed?: Record<string, number>; spells?: string[]; extra?: string[];
  gear?: string; notes?: string; seen?: Record<string, number>;
  // the character creator: what the player picked for each feature's choice (see pickKey), the languages
  // they chose, the gold left from starting equipment, and who they are
  picks?: Record<string, { from: string; v: string[] }>; langs?: string[]; gp?: number;
  abPicks?: Record<string, Ability[]>;
  armor?: { name: string; base: number; dex: 'full' | 'max2' | 'none' } | null; // the armor worn (from the creator's equipment step)          // an entry's "+1 of your choice" picks, by entry id (a background's three)
  alignment?: string; appearance?: string; backstory?: string; built?: boolean;
};
export const blankV2 = (): CharacterV2 => ({ v: 2, t: 0, name: '', player: '', level: 1, race: '', cls: '', raceId: null, clsId: null, subId: null, bgId: null, feats: [], ab: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, anyAb: [], skills: [], expert: [], hp: null, hpMax: null, temp: 0, acBase: null, shield: false, used: {}, slotsUsed: {}, spells: [], extra: [], gear: '', notes: '', seen: {} });

export type Derived = ReturnType<typeof derive>;

// The parts of an entry a player can make choices in: a class's, subclass's or race's features and a
// feat's benefits. A pick is saved under the entry and the part's name and level.
export const partsOf = (e: Entity): any[] => (e.type === 'feat' ? e.data.benefits ?? [] : e.data.features ?? []);
export const pickKey = (e: { id: string }, ft: { name?: string; level?: number }) => `${e.id}:${ft.name ?? ''}:${Number(ft.level) || 1}`;
// The entries a character has: race, class, subclass, background and feats, plus the background's
// Origin feat and any feats picked in a choice (a Human's Versatile).
export function chosenOf(c: CharacterV2, entities: Entity[]) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const out = [c.raceId, c.clsId, c.subId, c.bgId, ...(c.feats ?? [])].map((id) => (id ? byId.get(id) : undefined)).filter(Boolean) as Entity[];
  const add = (e: Entity | undefined) => { if (e && !out.includes(e)) out.push(e); };
  const bg = c.bgId ? byId.get(c.bgId) : undefined;
  const origin = String(bg?.data.feat?.name ?? '').toLowerCase();
  if (origin) add(entities.find((e) => e.type === 'feat' && e.name.toLowerCase() === origin));
  Object.values(c.picks ?? {}).forEach((p) => { if (String(p.from).startsWith('feat:')) p.v.forEach((id) => add(byId.get(id))); });
  return out;
}

// Everything the sheet shows that is worked out rather than typed in.
export function derive(c: CharacterV2, entities: Entity[]) {
  const level = Math.max(1, Math.min(20, Number(c.level) || 1));
  const byId = new Map(entities.map((e) => [e.id, e]));
  const chosen = chosenOf(c, entities);
  const cls = c.clsId ? byId.get(c.clsId) : undefined;
  const picked: { from: string; v: string[]; who: string }[] = [];

  const effects: (Effect & { from: string; eid?: string })[] = [];
  const features: (Feature & { from: string })[] = [];
  for (const e of chosen) {
    (e.data.effects ?? []).forEach((x: Effect) => { if ((x.at ?? 1) <= level) effects.push({ ...x, from: e.name, eid: e.id }); });
    partsOf(e).forEach((ft: Feature & { choice?: any }) => {
      if ((Number(ft.level) || 1) > level) return;
      features.push({ ...ft, from: e.name });
      // what the player picked here: an option's own effects, or skills, spells and weapons
      const p = (c.picks ?? {})[pickKey(e, ft)];
      if (p?.v?.length) {
        picked.push({ ...p, who: e.name + ': ' + ft.name });
        const opts: any[] = ft.choice?.options ?? partsOf(e).find((x: any) => x.name === ft.name && x.choice?.options?.length)?.choice?.options ?? [];
        p.v.forEach((name) => {
          const o = opts.find((x) => x.name === name);
          if (!o) return;
          features.push({ level: ft.level, name: ft.name + ': ' + o.name, text: o.text ?? '', from: e.name });
          (o.effects ?? []).forEach((x: Effect) => { if ((x.at ?? 1) <= level) effects.push({ ...x, from: e.name + ': ' + o.name, eid: e.id }); });
        });
      }
      // a feat's benefits' effects are already on the feat itself (featOut)
      if (e.type !== 'feat') (ft.effects ?? []).forEach((x) => { if ((x.at ?? 1) <= level) effects.push({ ...x, from: e.name + ': ' + ft.name, eid: e.id }); });
    });
  }

  const scores = { ...c.ab } as Record<Ability, number>;
  let anyIndex = 0;
  const perEntry: Record<string, number> = {};
  const of = <T extends Effect['t']>(t: T) => effects.filter((x) => x.t === t) as (Extract<Effect, { t: T }> & { from: string })[];
  for (const x of of('ability')) {
    // "of your choice": the entry's own picks when the creator made them, else the sheet's list
    const own = (x as any).eid && c.abPicks?.[(x as any).eid];
    const target = (x.ab === 'any' ? (own ? own[perEntry[(x as any).eid] = (perEntry[(x as any).eid] ?? -1) + 1] : (c.anyAb ?? [])[anyIndex++]) : x.ab) as Ability | undefined;
    if (target && target in scores) scores[target] = Math.min(x.max ? Number(x.max) : 99, Number(scores[target]) + Number(x.n));
  }
  const mods = Object.fromEntries(ABILITIES.map(([k]) => [k, mod(scores[k])])) as Record<Ability, number>;
  const prof = classProf(cls?.data, level);

  const profs = { skill: new Set<string>(c.skills ?? []), save: new Set<string>(), armor: new Set<string>(), weapon: new Set<string>(), tool: new Set<string>(), language: new Set<string>() };
  of('prof').forEach((x) => profs[x.kind]?.add(x.v));
  const SKILL_NAMES = new Set(SKILLS.map(([n]) => n));
  picked.filter((p) => p.from === 'anyskill').forEach((p) => p.v.forEach((v) => (SKILL_NAMES.has(v) ? profs.skill : profs.tool).add(v)));
  (c.langs ?? []).forEach((l) => profs.language.add(l));
  const expert = new Set([...(c.expert ?? []), ...picked.filter((p) => p.from === 'skills').flatMap((p) => p.v)]);
  const saves = ABILITIES.map(([k, label]) => ({ key: k, label, proficient: profs.save.has(k), bonus: mods[k] + (profs.save.has(k) ? prof : 0) }));
  const skills = SKILLS.map(([name, a]) => ({ name, ability: a, proficient: profs.skill.has(name), expert: expert.has(name), bonus: mods[a] + (profs.skill.has(name) ? prof * (expert.has(name) ? 2 : 1) : 0) }));

  const race = c.raceId ? byId.get(c.raceId) : undefined;
  const speed: Record<string, number> = { walk: Number(race?.data.speed) || 30 };
  // walking bonuses first, so a swim speed "equal to walking speed" counts them
  of('speed').filter((x) => x.mode === 'walk').forEach((x) => { speed.walk += Number(x.n) || 0; });
  of('speed').filter((x) => x.mode !== 'walk').forEach((x) => { speed[x.mode] = Math.max(speed[x.mode] ?? 0, x.n === 'walk' ? speed.walk : Number(x.n) || 0); });
  const senses = of('sense').reduce<Record<string, number>>((m, x) => { m[x.v] = Math.max(m[x.v] ?? 0, Number(x.n)); return m; }, {});
  const resist = [...new Set(of('resist').filter((x) => !x.immune).map((x) => x.v))];
  const immune = [...new Set([...of('resist').filter((x) => x.immune).map((x) => x.v), ...of('condition').map((x) => x.v)])];
  const resources = of('resource').map((x) => { const max = evalMax(x.max, { level, mods, prof }); return { name: x.name, recharge: x.recharge, max, unlimited: unlimited(x.max, max), from: x.from }; }).filter((r) => r.max > 0);
  // a custom resource attached to the campaign (a Divinity pool, say) is a pool every character has
  entities.filter((e) => e.type === 'resource' && e.source !== 'srd' && level >= (Number(e.data.from) || 1)).forEach((e) => {
    const max = evalMax(e.data.max ?? '1', { level, mods, prof });
    if (max > 0 && !resources.some((r) => r.name === e.name)) resources.push({ name: e.name, recharge: e.data.recharge ?? 'long', max, unlimited: max >= 99, from: 'This campaign' });
  });
  const scales = of('scale').map((x) => ({ name: x.name, value: scaleAt(x.steps, level), from: x.from })).filter((s) => s.value);
  const granted = [...of('spell').map((x) => ({ name: x.name, from: x.from })),
    ...picked.filter((p) => p.from === 'spells').flatMap((p) => p.v.map((id) => ({ name: byId.get(id)?.name ?? '', from: p.who }))).filter((g) => g.name)];
  const riders = [...of('text').map((x) => ({ text: x.text, from: x.from })), ...picked.filter((p) => p.from === 'weapons').map((p) => ({ text: p.v.join(', '), from: p.who }))];

  const hd = Number(cls?.data.hd) || 8;
  const hpPerLevel = of('hp').reduce((n, x) => n + Number(x.n), 0);
  const hpAuto = hd + mods.con + (level - 1) * (Math.floor(hd / 2) + 1 + mods.con) + hpPerLevel * level;
  const hpMax = c.hpMax != null && c.hpMax !== ('' as any) ? Number(c.hpMax) : Math.max(1, hpAuto);
  const acBonus = of('ac').reduce((n, x) => n + Number(x.n), 0);
  // armor worn: its base plus Dexterity (all of it, at most 2, or none)
  const worn = c.armor && Number(c.armor.base) ? Number(c.armor.base) + (c.armor.dex === 'none' ? 0 : c.armor.dex === 'max2' ? Math.min(2, mods.dex) : mods.dex) : 10 + mods.dex;
  const ac = (c.acBase != null && c.acBase !== ('' as any) ? Number(c.acBase) : worn) + acBonus + (c.shield ? 2 : 0);

  const cast = cls?.data.casting && cls.data.casting.kind && cls.data.casting.kind !== 'none' ? cls.data.casting : null;
  const castMod = cast ? mods[cast.ability as Ability] ?? 0 : 0;
  const casting = cast ? { ability: cast.ability as Ability, kind: cast.kind as string, dc: 8 + prof + castMod, attack: prof + castMod, slots: spellSlots(cast.kind, level, cast.rules, cast.slots), shortRest: slotsOnShortRest(cast), focus: (cast.focus ?? '') as string } : null;

  // entries that changed since this character last looked at them
  const changed = chosen.filter((e) => e.source !== 'srd' && (e.version ?? 1) > ((c.seen ?? {})[e.id] ?? 1)).map((e) => ({ id: e.id, name: e.name, version: e.version ?? 1, note: e.change_note ?? '' }));

  return { level, scores, mods, prof, saves, skills, profs, speed, senses, resist, immune, resources, scales, granted, riders, features, hd, hpMax, hpAuto, ac, initiative: mods.dex, passive: 10 + (skills.find((s) => s.name === 'Perception')?.bonus ?? 0), casting, changed, cls, race, chosen };
}

// ---------------------------------------------------------------- class table (levels 1 to 20)

export function classTable(cls: { data: Record<string, any> }, sub?: { data: Record<string, any> } | null) {
  const d = cls.data || {};
  const feats: Feature[] = [...(d.features ?? []), ...(sub?.data?.features ?? [])];
  const eff: Effect[] = [...(d.effects ?? []), ...feats.flatMap((f) => f.effects ?? [])];
  const scaleCols = eff.filter((x) => x.t === 'scale') as Extract<Effect, { t: 'scale' }>[];
  const resCols = (eff.filter((x) => x.t === 'resource') as Extract<Effect, { t: 'resource' }>[]).filter((r) => !/^\d+$/.test(String(r.max)) || r.at);
  const kind = d.casting?.kind;
  const maxSlot = slotTop(d.casting);
  const zero = { str: 3, dex: 3, con: 3, int: 3, wis: 3, cha: 3 } as Record<Ability, number>;
  // cantrips known and prepared spells by level, when the class sets them (2024 casters)
  const counts = kind && kind !== 'none' ? ([['Cantrips', d.casting?.cantrips], ['Prepared spells', d.casting?.prepared]] as [string, unknown][]).filter(([, v]) => Array.isArray(v) && v.some((n) => Number(n) > 0)) as [string, (number | string)[]][] : [];
  const rows = Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const slots = kind && kind !== 'none' ? spellSlots(kind, level, d.casting?.rules, d.casting?.slots) : [];
    return {
      level, prof: classProf(d, level),
      features: feats.filter((f) => Number(f.level) === level).map((f) => f.name),
      cols: [
        ...counts.map(([, v]) => Number(v[i]) || '-'),
        ...scaleCols.map((s) => scaleAt(s.steps, level) || '-'),
        ...resCols.map((r) => { if ((r.at ?? 1) > level) return '-'; const n = evalMax(r.max, { level, mods: zero, prof: classProf(d, level) }); return /[a-z]/.test(String(r.max)) && !/^(step:|level|half|prof)/.test(String(r.max)) ? String(r.max).replace(/^([a-z]{3})/, (m) => m.toUpperCase()) + ' mod' : unlimited(r.max, n) ? 'Unlimited' : String(n); }),
      ],
      slots: Array.from({ length: maxSlot }, (_, s) => slots[s] || 0),
    };
  });
  return { headers: [...counts.map(([h]) => h), ...scaleCols.map((s) => s.name), ...resCols.map((r) => r.name)], maxSlot, rows };
}

// ---------------------------------------------------------------- balance hint (advisory)

const dice = (text: string) => { let total = 0; String(text || '').replace(/(\d+)d(\d+)(?:\s*\+\s*(\d+))?/g, (_, n, s, b) => { total = Math.max(total, Number(n) * (Number(s) + 1) / 2 + Number(b || 0)); return ''; }); return total; };
export const crNumber = (cr: unknown) => { const s = String(cr ?? '').trim(); if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return b ? a / b : 0; } return Number(s) || 0; };

// A rough weight for one effect, so entries can be compared with the SRD's.
export function effectPoints(x: Effect): number {
  switch (x.t) {
    case 'ability': return Number(x.n) * (x.ab === 'any' ? 1.2 : 1);
    case 'prof': return x.kind === 'save' ? 2 : x.kind === 'skill' ? 0.75 : 0.25;
    case 'resist': return x.immune ? 3 : 1.5;
    case 'condition': return 1;
    case 'speed': return x.mode === 'fly' ? 3 : x.mode === 'walk' ? Number(x.n) / 10 : 1;
    case 'sense': return Number(x.n) >= 120 ? 1 : 0.5;
    case 'resource': return 1.25;
    case 'spell': return 1;
    case 'scale': return 1;
    case 'hp': return Number(x.n) * 1.5;
    case 'ac': return Number(x.n) * 2;
    default: return 0.5;
  }
}
export function entityPoints(data: Record<string, any>): number {
  const feats: Feature[] = data.features ?? [];
  const direct = (data.effects ?? []).reduce((n: number, x: Effect) => n + effectPoints(x), 0);
  return direct + feats.reduce((n, f) => n + ((f.effects?.length ? f.effects.reduce((m, x) => m + effectPoints(x), 0) : 0.75)), 0);
}
const range = (xs: number[]) => (xs.length ? { min: Math.min(...xs), max: Math.max(...xs), mid: [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] } : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

export type Balance = { verdict: 'below' | 'in line' | 'above' | 'no baseline'; reasons: string[] };

// Compares an entry with the SRD entries of the same kind. A hint for the DM, never a rule.
export function balanceHint(type: EntityType, data: Record<string, any>, srd: { type: string; name: string; data: Record<string, any> }[]): Balance {
  const peers = srd.filter((e) => e.type === type);
  const reasons: string[] = [];
  const verdictBy = (v: number, lo: number, hi: number): Balance['verdict'] => (v < lo ? 'below' : v > hi ? 'above' : 'in line');
  if (type === 'race' || type === 'feat' || type === 'background' || type === 'subclass') {
    const pts = entityPoints(data);
    const base = range(peers.map((p) => entityPoints(p.data)));
    if (!base || peers.length < 2) {
      // one SRD example (the feat, the background): compare with a general yardstick
      const [lo, hi] = type === 'feat' ? [1.5, 4] : type === 'background' ? [1.5, 3.5] : [2, 8];
      reasons.push(`Its traits add up to about ${r1(pts)} points. A typical ${type} lands between ${lo} and ${hi}.`);
      return { verdict: verdictBy(pts, lo, hi), reasons };
    }
    reasons.push(`Its traits add up to about ${r1(pts)} points. The SRD ${({ race: 'races', feat: 'feats', background: 'backgrounds', subclass: 'subclasses' } as Record<string, string>)[type] ?? type + 's'} run from ${r1(base.min)} to ${r1(base.max)}.`);
    const abil = (data.effects ?? []).filter((x: Effect) => x.t === 'ability').reduce((n: number, x: any) => n + Number(x.n), 0);
    if (type === 'race' && abil > 3) reasons.push(`It gives +${abil} in ability scores in total. Most SRD races give +3.`);
    if ((data.effects ?? []).some((x: Effect) => x.t === 'speed' && x.mode === 'fly')) reasons.push('A flying speed from level 1 is stronger than anything an SRD race has.');
    return { verdict: verdictBy(pts, base.min - 0.75, base.max + 0.75), reasons };
  }
  if (type === 'class') {
    const feats = (data.features ?? []).length;
    const base = range(peers.map((p) => (p.data.features ?? []).length));
    const hd = Number(data.hd) || 8;
    const caster = data.casting?.kind && data.casting.kind !== 'none';
    reasons.push(`It has ${feats} features over 20 levels${base ? ` (SRD classes have ${base.min} to ${base.max})` : ''}, a d${hd} hit die, and ${caster ? data.casting.kind + ' spellcasting' : 'no spellcasting'}.`);
    let score = 0;
    if (base) score += feats > base.max + 3 ? 1 : feats < base.min - 3 ? -1 : 0;
    if (caster && data.casting.kind === 'full' && hd >= 10) { score += 1; reasons.push('Full spellcasting with a d10 or d12 hit die is more than any SRD class gets.'); }
    if ((data.saves ?? []).length > 2) { score += 1; reasons.push('SRD classes are proficient in two saving throws.'); }
    if (!caster && hd <= 6) { score -= 1; reasons.push('A d6 hit die with no spellcasting is weaker than any SRD class.'); }
    return { verdict: score > 0 ? 'above' : score < 0 ? 'below' : 'in line', reasons };
  }
  if (type === 'spell') {
    const lvl = Number(data.level) || 0;
    const dmg = dice(`${data.damage ?? ''} ${data.desc ?? ''}`);
    const same = peers.filter((p) => Number(p.data.level) === lvl).map((p) => dice(p.data.desc)).filter((n) => n > 0);
    if (!dmg) return { verdict: 'no baseline', reasons: ['It has no damage dice to compare. Judge it against SRD spells of the same level that do a similar job.'] };
    const base = range(same);
    if (!base) return { verdict: 'no baseline', reasons: [`There is no SRD damage spell of level ${lvl} in the set to compare with.`] };
    reasons.push(`It deals about ${r1(dmg)} damage on average. SRD spells of level ${lvl} deal ${r1(base.min)} to ${r1(base.max)}.`);
    return { verdict: verdictBy(dmg, base.min * 0.7, base.max * 1.15), reasons };
  }
  if (type === 'monster') {
    const cr = crNumber(data.cr);
    const near = peers.map((p) => ({ d: Math.abs(crNumber(p.data.cr) - cr), p })).sort((a, b) => a.d - b.d).slice(0, 4).filter((x) => x.d <= Math.max(1, cr * 0.4)).map((x) => x.p);
    if (!near.length) return { verdict: 'no baseline', reasons: [`There is no SRD creature near challenge ${data.cr ?? '?'} in the set to compare with.`] };
    const avg = (f: (p: any) => number) => near.reduce((n, p) => n + f(p), 0) / near.length;
    const hp = avg((p) => Number(p.data.hpv) || 0), ac = avg((p) => Number(p.data.acv) || 0);
    const hit = (d: any) => Math.max(0, ...((d.actions ?? []).map((a: any) => Number((/([+-]\d+) to hit/.exec(a.text) ?? [])[1] ?? 0))));
    const th = avg((p) => hit(p.data));
    let score = 0;
    const cmp = (label: string, v: number, b: number, tol: number, unit = '') => {
      if (!v) return;
      const off = b ? (v - b) / (unit ? 1 : b) : 0;
      if (unit ? Math.abs(v - b) > tol : Math.abs(off) > tol) { score += v > b ? 1 : -1; reasons.push(`${label} ${v}${unit} is ${v > b ? 'higher' : 'lower'} than SRD creatures near this challenge (about ${Math.round(b)}${unit}).`); }
    };
    cmp('Hit points', Number(data.hpv) || 0, hp, 0.4);
    cmp('Armor class', Number(data.acv) || 0, ac, 2.5, ' ');
    cmp('Best attack bonus +', hit(data), th, 2.5, ' ');
    if (!reasons.length) reasons.push(`Hit points, armor class and attack bonus are close to SRD creatures of challenge ${data.cr} (${near.map((p) => p.name).join(', ')}).`);
    return { verdict: score > 0 ? 'above' : score < 0 ? 'below' : 'in line', reasons };
  }
  if (type === 'item') {
    const text = `${data.desc ?? ''} ${data.props ?? ''}`;
    const plus = Math.max(0, ...[...text.matchAll(/\+(\d)\b/g)].map((m) => Number(m[1])));
    const rarity = String(data.rarity ?? '').toLowerCase();
    const expect = ['', 'uncommon', 'rare', 'very rare'][Math.min(3, plus)] ?? '';
    if (!plus) return { verdict: 'no baseline', reasons: ['It has no numeric bonus to compare. As a guide, SRD items give +1 at uncommon, +2 at rare, and +3 at very rare.'] };
    const order = ['common', 'uncommon', 'rare', 'very rare', 'legendary'];
    const d = order.indexOf(rarity) - order.indexOf(expect);
    reasons.push(`It gives a +${plus} bonus. In the SRD that is usually ${expect}${data.attune ? ', and this one needs attunement' : ''}.`);
    return { verdict: order.indexOf(rarity) < 0 ? 'no baseline' : d < 0 ? 'above' : d > 0 ? 'below' : 'in line', reasons };
  }
  return { verdict: 'no baseline', reasons: ['There is nothing in the SRD to compare this kind of entry with.'] };
}
