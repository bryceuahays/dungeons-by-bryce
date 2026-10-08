'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useState } from 'react';
import { DAMAGE_TYPES, SKILL_NAMES } from '@/config/homebrew';
import { spellDetail } from '@/app/(hub)/homebrew/actions';
import type { SpellOption } from '@/lib/class-spells';
import { SpellPopup } from './ClassSpells';
import { EntityCard } from './EntityCard';
import { TOOL_GROUPS, WEAPONS } from '@/config/proficiencies';
import { ABILITIES } from '@/lib/rules/engine';
import { GrowsEditor } from './ClassFeatures';

// Two add-ons for a class feature, in plain language:
//   Gives   - what the feature adds to the character sheet by itself. Stored as the feature's
//             effects (prof, ac, speed, resist, sense, hp, ability, spell, text), which the sheet reads.
//   Chooses - what the player picks when they get the feature (feature.choice).

// ---------------------------------------------------------------- gives

// The class editor's spells (SRD and your own) and a way to add one made in a pop-up, for the
// "a spell always prepared" row: suggest names, read the spell, or create a new one in place.
export const SpellTools = createContext<{ spells: SpellOption[]; onSpellSaved: (s: SpellOption) => void; pro: boolean }>({ spells: [], onSpellSaved: () => {}, pro: false });

const KINDS: [string, string][] = [
  ['prof', 'A proficiency'], ['ac', 'Armor class bonus'], ['speed', 'Speed'], ['resist', 'Resistance or immunity'],
  ['condition', 'Immunity to a condition'], ['sense', 'A sense (like darkvision)'], ['hp', 'Extra hit points per level'], ['ability', 'Ability score increase'],
  ['spell', 'A spell (always prepared, or cast without a slot)'], ['adv', 'Advantage on a roll'], ['bonus', 'A bonus to a roll'], ['attacks', 'Extra attacks'], ['damage', 'Extra damage'],
  ['text', 'A note on the sheet'],
];
export const GIVEN = KINDS.map(([k]) => k);
const blank = (t: string): any => ({
  prof: { t, kind: 'skill', v: 'Perception' }, ac: { t, n: 1 }, speed: { t, mode: 'walk', n: 10 }, resist: { t, v: 'fire', immune: false },
  sense: { t, v: 'Darkvision', n: 60 }, condition: { t, v: 'Charmed' }, hp: { t, n: 1 }, ability: { t, ab: 'str', n: 1 }, spell: { t, name: '' }, text: { t, text: '' },
  adv: { t, roll: 'save', ab: 'con', when: '' }, bonus: { t, roll: 'attack', amount: 2, when: '' }, attacks: { t, n: 2, with: '' }, damage: { t, amount: '1d6', type: '', when: '' },
}[t]);
const SENSES = ['Darkvision', 'Blindsight', 'Tremorsense', 'Truesight'];
const ROLLS: [string, string][] = [['save', 'Saving throws'], ['check', 'Ability checks'], ['attack', 'Attack rolls'], ['initiative', 'Initiative']];
const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];
const PROF_KINDS: [string, string][] = [['skill', 'Skill'], ['save', 'Saving throw'], ['armor', 'Armor'], ['weapon', 'Weapon'], ['tool', 'Tool'], ['language', 'Language']];
const PROF_DEFAULT: Record<string, string> = { skill: 'Perception', save: 'wis', armor: 'Heavy armor', weapon: 'Martial weapons', tool: "Thieves' Tools", language: '' };

export function GivesEditor({ effects, onChange, spellNames }: { effects: any[]; onChange: (fx: any[]) => void; spellNames: string[] }) {
  const gives = effects.map((x, i) => [x, i] as const).filter(([x]) => GIVEN.includes(x.t));
  const put = (i: number, x: any) => onChange(effects.map((y, j) => (j === i ? x : y)));
  return (
    <fieldset className="feat-uses">
      <legend>Gives</legend>
      {gives.length ? gives.map(([g, i]) => (
        <div key={i} className="give-row">
          <label>What<select value={g.t} onChange={(e) => put(i, blank(e.target.value))}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <div className="give-fields"><GiveFields g={g} onChange={(x) => put(i, x)} spellNames={spellNames} /></div>
          <label className="give-at">From level<input type="number" min={1} max={20} placeholder="—" title="Leave blank to give it as soon as the feature arrives" value={g.at ?? ''} onChange={(e) => { const { at: _old, ...rest } = g; put(i, e.target.value ? { ...rest, at: Math.min(20, Math.max(1, Number(e.target.value))) } : rest); }} /></label>
          <button type="button" className="quiet small-btn danger" onClick={() => onChange(effects.filter((_, j) => j !== i))}>Remove</button>
        </div>
      )) : <p className="dim">Nothing yet. For things the feature adds to the character sheet by itself, like a proficiency, +1 armor class, more speed or darkvision.</p>}
      {gives.length ? <p className="dim hint">&quot;From level&quot; is for things that come later than the feature itself, like an oath&apos;s spells at levels 5, 9, 13 and 17. Leave it blank otherwise.</p> : null}
      <p><button type="button" className="quiet small-btn" onClick={() => onChange([...effects, blank('prof')])}>+ Add something it gives</button></p>
    </fieldset>
  );
}

function GiveFields({ g, onChange, spellNames }: { g: any; onChange: (x: any) => void; spellNames: string[] }) {
  const set = (p: any) => onChange({ ...g, ...p });
  const num = (label: string, k: string, extra?: any) => <label>{label}<input type="number" value={g[k] ?? ''} {...extra} onChange={(e) => set({ [k]: e.target.value === '' ? '' : Number(e.target.value) })} /></label>;
  switch (g.t) {
    case 'prof': return (
      <>
        <label>In<select value={g.kind} onChange={(e) => set({ kind: e.target.value, v: PROF_DEFAULT[e.target.value] })}>{PROF_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {g.kind === 'skill' ? <label>Skill<select value={g.v} onChange={(e) => set({ v: e.target.value })}>{SKILL_NAMES.map((s) => <option key={s}>{s}</option>)}</select></label>
          : g.kind === 'save' ? <label>Ability<select value={g.v} onChange={(e) => set({ v: e.target.value })}>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          : g.kind === 'armor' ? <label>Armor<select value={g.v} onChange={(e) => set({ v: e.target.value })}>{['Light armor', 'Medium armor', 'Heavy armor', 'Shields'].map((s) => <option key={s}>{s}</option>)}</select></label>
          : g.kind === 'weapon' ? <label>Weapon<select value={g.v} onChange={(e) => set({ v: e.target.value })}><option>Simple weapons</option><option>Martial weapons</option>{[...WEAPONS.simple, ...WEAPONS.martial].map((s) => <option key={s}>{s}</option>)}</select></label>
          : g.kind === 'tool' ? <label>Tool<select value={g.v} onChange={(e) => set({ v: e.target.value })}>{Object.entries(TOOL_GROUPS).map(([grp, list]) => <optgroup key={grp} label={grp}>{list.map((s) => <option key={s}>{s}</option>)}</optgroup>)}</select></label>
          : <label>Language<input value={g.v ?? ''} placeholder="For example: Celestial" onChange={(e) => set({ v: e.target.value })} /></label>}
      </>
    );
    case 'ac': return <>{num('Bonus (+)', 'n', { min: 0 })}<label className="give-wide">Only while<input value={g.when ?? ''} maxLength={120} placeholder="For example: wearing Light, Medium or Heavy armor (blank: always)" onChange={(e) => set({ when: e.target.value || undefined })} /></label></>;
    case 'bonus': {
      const fixed = !ABILITIES.some(([k]) => k === g.amount) && g.amount !== 'prof';
      return <>
        <label>Roll<select value={g.roll} onChange={(e) => set({ roll: e.target.value })}>{[...ROLLS, ['damage', 'Damage rolls']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Adds<select value={fixed ? 'n' : g.amount} onChange={(e) => set({ amount: e.target.value === 'n' ? 1 : e.target.value })}><option value="n">A number</option><option value="prof">Proficiency Bonus</option>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l} modifier</option>)}</select></label>
        {fixed ? num('Bonus (+)', 'amount', { min: 1, max: 20 }) : null}
        <label className="give-wide">Only when<input value={g.when ?? ''} maxLength={160} placeholder="For example: with Ranged weapons (blank: always)" onChange={(e) => set({ when: e.target.value || undefined })} /></label></>;
    }
    case 'speed': return <><label>Kind<select value={g.mode} onChange={(e) => set({ mode: e.target.value, ...(e.target.value === 'walk' && g.n === 'walk' ? { n: 10 } : {}) })}>{[['walk', 'Walking (added)'], ['fly', 'Flying'], ['swim', 'Swimming'], ['climb', 'Climbing'], ['burrow', 'Burrowing']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {g.n === 'walk' ? null : num('Feet', 'n', { min: 0, step: 5 })}
      {g.mode !== 'walk' ? <label className="ckrow"><input type="checkbox" checked={g.n === 'walk'} onChange={(e) => set({ n: e.target.checked ? 'walk' : 30 })} /> Equal to walking speed</label> : null}</>;
    case 'resist': return <><label>Damage type<select value={g.v} onChange={(e) => set({ v: e.target.value })}>{DAMAGE_TYPES.map((s) => <option key={s}>{s}</option>)}</select></label><label className="ckrow"><input type="checkbox" checked={!!g.immune} onChange={(e) => set({ immune: e.target.checked })} /> Immune, not just resistant</label></>;
    case 'condition': return <label>Condition<select value={g.v} onChange={(e) => set({ v: e.target.value })}>{CONDITIONS.map((s) => <option key={s}>{s}</option>)}</select></label>;
    case 'sense': {
      const usual = SENSES.includes(g.v);
      return <><label>Sense<select value={usual ? g.v : 'other'} onChange={(e) => set({ v: e.target.value === 'other' ? '' : e.target.value })}>{SENSES.map((s) => <option key={s}>{s}</option>)}<option value="other">Something else</option></select></label>
        {usual ? null : <label>Called<input value={g.v ?? ''} maxLength={60} placeholder="For example: Devil's Sight" onChange={(e) => set({ v: e.target.value })} /></label>}
        {num('Feet', 'n', { min: 0, step: 5 })}
        {usual ? null : <label className="give-wide">What it lets them sense<input value={g.what ?? ''} maxLength={160} placeholder="For example: see normally in magical darkness" onChange={(e) => set({ what: e.target.value })} /></label>}</>;
    }
    case 'adv': return <>
      <label>Roll<select value={g.roll} onChange={(e) => set({ roll: e.target.value })}>{ROLLS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {g.roll === 'initiative' ? null : <label>Ability<select value={g.ab ?? ''} onChange={(e) => set({ ab: e.target.value })}><option value="">Any</option>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
      <label className="give-wide">Only when<input value={g.when ?? ''} maxLength={160} placeholder="For example: to keep Concentration (blank: always)" onChange={(e) => set({ when: e.target.value })} /></label></>;
    case 'attacks': return <>
      {num('Attacks per Attack action', 'n', { min: 2, max: 8 })}
      <label className="give-wide">With<input value={g.with ?? ''} maxLength={80} placeholder="Any weapon (blank), or for example: your pact weapon" onChange={(e) => set({ with: e.target.value })} /></label></>;
    case 'damage': {
      const dice = !ABILITIES.some(([k]) => k === g.amount);
      return <>
        <label>Amount<select value={dice ? 'dice' : g.amount} onChange={(e) => set({ amount: e.target.value === 'dice' ? '1d6' : e.target.value })}><option value="dice">Dice</option>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l} modifier</option>)}</select></label>
        {dice ? <label>Dice<input value={g.amount ?? ''} maxLength={12} placeholder="1d8" onChange={(e) => set({ amount: e.target.value })} /></label> : null}
        <label>Type<select value={g.type ?? ''} onChange={(e) => set({ type: e.target.value })}><option value="">Same as the attack</option>{DAMAGE_TYPES.map((s) => <option key={s}>{s}</option>)}<option value="choice">Player&apos;s choice</option></select></label>
        <label className="give-wide">When<input value={g.when ?? ''} maxLength={160} placeholder="For example: once per turn when you hit with your pact weapon" onChange={(e) => set({ when: e.target.value })} /></label></>;
    }
    case 'hp': return num('Hit points per level', 'n', { min: 0 });
    case 'ability': return <>
      <label>Ability<select value={g.ab} onChange={(e) => set({ ab: e.target.value, ...(e.target.value === 'any' ? {} : { among: undefined, split: undefined }) })}>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="any">Player&apos;s choice</option></select></label>
      {num('Increase', 'n', { min: 1 })}
      <label>Up to<input type="number" min={1} max={30} placeholder="20" value={g.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
      {g.ab === 'any' ? <>
        <span className="give-wide give-abs">Choose from: {ABILITIES.map(([k, l]) => <label key={k} className="ckrow"><input type="checkbox" checked={!g.among?.length || g.among.includes(k)} onChange={(e) => { const all = ABILITIES.map(([x]) => x); const cur: string[] = g.among?.length ? g.among : all; const next = e.target.checked ? [...cur, k] : cur.filter((x) => x !== k); set({ among: next.length === all.length ? undefined : next }); }} /> {l}</label>)}</span>
        {Number(g.n) >= 2 ? <label className="ckrow"><input type="checkbox" checked={!!g.split} onChange={(e) => set({ split: e.target.checked || undefined })} /> Or split it as +1 to two scores</label> : null}
      </> : null}</>;
    case 'spell': return <>
      <GiveSpell name={g.name ?? ''} onChange={(name) => set({ name })} spellNames={spellNames} />
      <label>How<select value={g.cast ?? 'prepared'} onChange={(e) => set({ cast: e.target.value === 'prepared' ? undefined : e.target.value, ...(e.target.value === 'perRest' ? { n: g.n || 1, recharge: g.recharge ?? 'long' } : {}) })}>
        <option value="prepared">Always prepared</option><option value="free">Cast without a spell slot, any time</option><option value="perRest">Cast without a spell slot, a few times per rest</option>
      </select></label>
      {g.cast === 'perRest' ? <>{num('Times', 'n', { min: 1, max: 20 })}<label>Back on<select value={g.recharge ?? 'long'} onChange={(e) => set({ recharge: e.target.value })}><option value="long">A long rest</option><option value="short">A short or long rest</option></select></label></> : null}
      {g.cast ? <label className="ckrow"><input type="checkbox" checked={!!g.self} onChange={(e) => set({ self: e.target.checked || undefined })} /> On themselves only</label> : null}</>;
    default: return <label className="give-wide">Note<input value={g.text ?? ''} placeholder="For example: advantage on saves against being frightened" onChange={(e) => set({ text: e.target.value })} /></label>;
  }
}

// ---------------------------------------------------------------- player chooses

export type FeatOption = { name: string; category: string; desc: string };
// One of the DM's own options (Metamagic, Eldritch Invocations, or homebrew): what it does, what each
// use spends, and what a character needs before taking it.
export type ChoiceOption = {
  name: string; text: string;
  cost?: number | ''; res?: string | null;      // each use spends this many of a class resource
  minLevel?: number | '';                       // class level the character needs
  requires?: string;                            // another option from this list they need first
  other?: string;                               // any other requirement, in words
  repeatable?: boolean;                         // can be taken more than once
  // the same structured parts as a feature: how it's used, what it gives and grows, and what the player picks
  use?: Use | null; effects?: any[]; choices?: Choice[];
};
// feature.choice: { count, from, options?, byGrows? }
//   from: a list the site knows, "custom" with the DM's own options, or "same" for more picks from the
//   list of an earlier feature with the same name (the Sorcerer's Metamagic at levels 10 and 17)
//   byGrows: how many follows the feature's growing number (Eldritch Invocations: 1, then 3, 5, ...)
//   spell: for "spells" - which spells: { level: 0 cantrips, 1-9, or '' any; ritual: only rituals; any: any class's list, not just this class's }
export type Choice = { count: number; from: string; options?: ChoiceOption[]; byGrows?: boolean; spell?: { level?: number | ''; ritual?: boolean; any?: boolean; lists?: string[] } } | null;
const FROM: [string, string][] = [
  ['feat:Fighting style', 'Fighting Styles'], ['feat:Epic boon', 'Epic Boons'], ['feat:Origin', 'Origin feats'], ['feat:General', 'General feats'],
  ['weapons', 'Weapons (for Weapon Mastery)'], ['skills', 'Skills they are proficient in (for Expertise)'], ['anyskill', 'Any skills or tools (new proficiencies)'], ['spells', 'Spells'], ['custom', 'My own list of options'],
  ['same', 'More from an earlier feature\'s list (same name)'],
];
const CASTER_LISTS = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'];
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

// Features saved before choices existed: the SRD's choice features are recognised by name.
export function guessChoice(f: { name?: string; text?: string; choice?: Choice; effects?: any[] }): Choice {
  if (f.choice !== undefined) return f.choice;
  const name = (f.name ?? '').toLowerCase(), text = (f.text ?? '').toLowerCase();
  const n = (re: RegExp, fallback: number) => { const m = text.match(re)?.[1]; return m ? WORDS[m] ?? (Number(m) || fallback) : fallback; };
  if (name === 'fighting style' || name === 'additional fighting style') return { count: 1, from: 'feat:Fighting style' };
  if (name === 'epic boon') return { count: 1, from: 'feat:Epic boon' };
  if (name === 'weapon mastery') {
    const grows = (f.effects ?? []).find((x) => x.t === 'scale');
    return { count: grows ? Number(grows.steps?.[0]?.[1]) || 2 : n(/(\w+) kinds? of/, 2), from: 'weapons' };
  }
  if (name === 'expertise' || name.endsWith(' expertise')) return { count: n(/(\w+) of your skill proficiencies/, 2), from: 'skills' };
  // "Choose one of your skill proficiencies ... You gain Expertise" (the Ranger's Deft Explorer)
  if (/choose (\w+) of your skill proficiencies[^.]*expertise|gain expertise in (\w+) of your skill/.test(text)) return { count: n(/choose (\w+) of your skill proficiencies/, 1), from: 'skills' };
  // the SRD import fills these in from the SRD document; a class saved before then lists them itself
  if (name === 'metamagic') return { count: n(/you gain (\w+) metamagic options/, 2), from: 'custom', options: [] };
  if (name === 'eldritch invocations') {
    const grows = (f.effects ?? []).find((x) => x.t === 'scale');
    return { count: grows ? Number(grows.steps?.[0]?.[1]) || 1 : 1, from: 'custom', options: [], ...(grows ? { byGrows: true } : {}) };
  }
  return null;
}

// "Cost: 2 Sorcery Points · Level 5+ · Needs Pact of the Blade · Can be taken more than once"
export function optionLine(o: ChoiceOption, resources: { id: string; name: string }[] = []) {
  const res = o.res ? resources.find((r) => r.id === o.res)?.name ?? o.res.replace(/^r:/, '') : '';
  return [
    Number(o.cost) > 0 ? `Cost: ${o.cost}${res ? ' ' + (Number(o.cost) === 1 ? res.replace(/s$/, '') : res) : ''}` : '',
    Number(o.minLevel) > 1 ? `Level ${o.minLevel}+` : '',
    o.requires ? `Needs ${o.requires}` : '',
    o.other ? `Needs ${o.other}` : '',
    o.repeatable ? 'Can be taken more than once' : '',
  ].filter(Boolean).join(' · ');
}

// "3 cantrips from any class's list", "2 level 1 Ritual spells from this class's list"
export function spellChoiceLine(c: NonNullable<Choice>) {
  const s = c.spell ?? {};
  const lv = s.level === 0 ? (c.count === 1 ? 'cantrip' : 'cantrips') : `${s.level ? 'level ' + s.level + ' ' : ''}${s.ritual ? 'Ritual ' : ''}spell${c.count === 1 ? '' : 's'}`;
  const from = s.lists?.length ? `the ${s.lists.length > 1 ? s.lists.slice(0, -1).join(', ') + ' or ' + s.lists[s.lists.length - 1] : s.lists[0]}` : s.any ? "any class's" : "this class's";
  return `${c.count} ${s.level === 0 && s.ritual ? 'Ritual ' : ''}${lv} from ${from} spell list`;
}

export function ChoiceEditor({ f, onChange, feats, resources = [], spellNames = [], nested = false }: { f: any; onChange: (choice: Choice) => void; feats: FeatOption[]; resources?: { id: string; name: string }[]; spellNames?: string[]; nested?: boolean }) {
  const c: Choice = nested ? (f.choice ?? null) : guessChoice(f);
  const [open, setOpen] = useState<number | null>(null);
  const growing = (f.effects ?? []).find((x: any) => x.t === 'scale');
  const fromFeats = c?.from.startsWith('feat:') ? feats.filter((x) => x.category.toLowerCase() === c.from.slice(5).toLowerCase()) : [];
  const preview = !c ? [] : c.from === 'weapons' ? ['any Simple or Martial weapon with a mastery property'] : c.from === 'skills' ? ['any skill the character is proficient in'] : c.from === 'anyskill' ? ['any skill or tool'] : fromFeats.map((x) => x.name);
  const opts = c?.options ?? [];
  const setOpts = (next: ChoiceOption[]) => onChange({ ...c!, options: next });
  const setOpt = (i: number, p: Partial<ChoiceOption>) => setOpts(opts.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const num = (v: string) => (v === '' ? '' : Math.max(0, Number(v) || 0));
  return (
    <fieldset className="feat-uses">
      <legend>Player chooses</legend>
      <div className="feat-uses-pick">
        <label>Choose from<select value={c?.from ?? ''} onChange={(e) => onChange(e.target.value ? { count: c?.count ?? 1, from: e.target.value, ...(e.target.value === 'custom' ? { options: opts.length ? opts : [{ name: '', text: '' }] } : {}), ...(c?.byGrows ? { byGrows: true } : {}) } : null)}>
          <option value="">Nothing to choose</option>
          {FROM.filter(([k]) => !nested || k !== 'same').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
        {c ? <label>How many<input type="number" min={1} max={20} value={c.count} disabled={!!c.byGrows && !!growing} onChange={(e) => onChange({ ...c, count: Math.max(1, Number(e.target.value) || 1) })} /></label> : null}
      </div>
      {c && growing ? (
        <label className="ckrow"><input type="checkbox" checked={!!c.byGrows} onChange={(e) => onChange({ ...c, byGrows: e.target.checked || undefined })} /> How many follows this feature&apos;s growing number ({growing.name}: {(growing.steps ?? []).map(([l, v]: [number, string]) => `${v} at level ${l}`).join(', ')})</label>
      ) : null}
      {c && c.from === 'same' ? <p className="dim">Players pick {c.count} more from the list in the earlier &quot;{f.name}&quot; feature. Edit the options there.</p> : null}
      {c && c.from === 'spells' ? (
        <div className="choice-rules">
          <label>Spell level<select value={c.spell?.level ?? ''} onChange={(e) => onChange({ ...c, spell: { ...c.spell, level: e.target.value === '' ? '' : Number(e.target.value) } })}>
            <option value="">Any level</option><option value="0">Cantrips</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => <option key={l} value={l}>Level {l}</option>)}
          </select></label>
          <label>From<select value={c.spell?.lists?.length ? 'lists' : c.spell?.any ? 'any' : 'class'} onChange={(e) => onChange({ ...c, spell: { ...c.spell, any: e.target.value === 'any' || undefined, lists: e.target.value === 'lists' ? ['Wizard'] : undefined } })}>
            <option value="class">This class&apos;s spell list</option><option value="any">Any class&apos;s spell list</option><option value="lists">Certain classes&apos; lists</option>
          </select></label>
          {c.spell?.lists?.length ? <span className="choice-other give-abs">Lists: {CASTER_LISTS.map((k) => <label key={k} className="ckrow"><input type="checkbox" checked={c.spell!.lists!.includes(k)} onChange={(e) => { const next = e.target.checked ? [...c.spell!.lists!, k] : c.spell!.lists!.filter((x) => x !== k); onChange({ ...c, spell: { ...c.spell, lists: next.length ? next : [k] } }); }} /> {k}</label>)}</span> : null}
          <label className="ckrow"><input type="checkbox" checked={!!c.spell?.ritual} onChange={(e) => onChange({ ...c, spell: { ...c.spell, ritual: e.target.checked || undefined } })} /> Rituals only</label>
          <p className="dim choice-other">Players pick {spellChoiceLine(c)}.</p>
        </div>
      ) : null}
      {c && !['custom', 'same', 'spells'].includes(c.from) ? <p className="dim">Players pick {c.count} from: {preview.length ? preview.join(', ') : 'nothing yet - there are no options of that kind'}.</p> : null}
      {c && c.from === 'custom' ? (
        <div className="choice-opts">
          <p className="dim">{opts.length} option{opts.length === 1 ? '' : 's'}. Open one to change it.</p>
          {opts.map((o, i) => (
            <div key={i} className={'feat-card choice-card' + (open === i ? ' open' : '')}>
              <button type="button" className="feat-head" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                <span>{o.name || 'Unnamed option'}{optionLine(o, resources) ? <span className="feat-use-line">{optionLine(o, resources)}</span> : null}</span>
                <span className="dim">{open === i ? 'Close' : 'Open'}</span>
              </button>
              {open === i ? (
                <div className="feat-body choice-body">
                  <label>Option<input value={o.name} maxLength={80} placeholder="For example: Quickened Spell" onChange={(e) => setOpt(i, { name: e.target.value })} /></label>
                  <label>What it does<textarea rows={4} value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} /></label>
                  <div className="choice-rules">
                    <label>Each use spends<input type="number" min={0} max={99} placeholder="nothing" value={o.cost ?? ''} onChange={(e) => setOpt(i, { cost: num(e.target.value) })} /></label>
                    <label>Of<select value={o.res ?? ''} onChange={(e) => setOpt(i, { res: e.target.value || null })}>
                      <option value="">(no resource)</option>
                      {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      {o.res && !resources.some((r) => r.id === o.res) ? <option value={o.res}>{o.res.replace(/^r:/, '')} (not on this class)</option> : null}
                    </select></label>
                    <label>From class level<input type="number" min={1} max={20} placeholder="any" value={o.minLevel ?? ''} onChange={(e) => setOpt(i, { minLevel: num(e.target.value) })} /></label>
                    <label>Needs this option first<select value={o.requires ?? ''} onChange={(e) => setOpt(i, { requires: e.target.value || undefined })}>
                      <option value="">Nothing</option>
                      {opts.filter((x, j) => j !== i && x.name.trim()).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                    </select></label>
                    <label className="choice-other">Other requirement<input value={o.other ?? ''} maxLength={120} placeholder="For example: a Warlock cantrip that deals damage" onChange={(e) => setOpt(i, { other: e.target.value || undefined })} /></label>
                    <label className="ckrow"><input type="checkbox" checked={!!o.repeatable} onChange={(e) => setOpt(i, { repeatable: e.target.checked || undefined })} /> Can be taken more than once</label>
                  </div>
                  <UseEditor f={o} onChange={(use) => setOpt(i, { use })} />
                  <GivesEditor effects={o.effects ?? []} spellNames={spellNames} onChange={(effects) => setOpt(i, { effects })} />
                  <GrowsEditor f={o as any} onChange={(effects) => setOpt(i, { effects })} />
                  {(o.choices ?? []).map((ch, k) => (
                    <div key={k} className="choice-nested">
                      <ChoiceEditor nested f={{ name: o.name, choice: ch, effects: o.effects }} feats={feats} resources={resources} spellNames={spellNames}
                        onChange={(next) => setOpt(i, { choices: next ? (o.choices ?? []).map((x, j) => (j === k ? next : x)) : (o.choices ?? []).filter((_, j) => j !== k) })} />
                    </div>
                  ))}
                  <p><button type="button" className="quiet small-btn" onClick={() => setOpt(i, { choices: [...(o.choices ?? []), { count: 1, from: 'feat:Origin' }] })}>+ The player also picks something with this option</button></p>
                  <p className="inline"><button type="button" className="quiet small-btn danger" onClick={() => { setOpts(opts.filter((_, j) => j !== i)); setOpen(null); }}>Remove this option</button></p>
                </div>
              ) : null}
            </div>
          ))}
          <p><button type="button" className="quiet small-btn" onClick={() => { setOpts([...opts, { name: '', text: '' }]); setOpen(opts.length); }}>+ Add an option</button></p>
        </div>
      ) : null}
      {!c ? <p className="dim">For features where the player picks something, like a Fighting Style or weapons to master.</p> : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------- how it's used

// feature.use: { activation, duration, range } - how the feature is used at the table, so it reads
// at a glance like a spell. What it does while active stays in the description.
export type Use = { activation: string; duration: string; range: string };
export const ACTIVATIONS: [string, string][] = [
  ['always', 'Always on (passive)'], ['action', 'Action'], ['bonus', 'Bonus Action'], ['reaction', 'Reaction'],
  ['attack', 'As part of the Attack action'], ['free', 'No action needed'], ['other', 'Other (see description)'],
];
const DURATIONS = ['Instantaneous', 'Until the end of your turn', 'Until the start of your next turn', '1 round', '1 minute', '10 minutes', '1 hour', '8 hours', 'Until you finish a Long Rest', 'Until you end it'];
const RANGES = ['Self', 'Touch', '5 feet', '10 feet', '30 feet', '60 feet', '120 feet', '10-foot Emanation', '30-foot Emanation', '15-foot Cone', '30-foot Line'];

// Features saved before this: read what the rules text says ("As a Bonus Action", "for 10 minutes").
export function guessUse(f: { text?: string; use?: Use | null }): Use | null {
  if (f.use !== undefined) return f.use;
  const t = (f.text ?? '').toLowerCase();
  const first = ([['bonus', /bonus action/], ['reaction', /\b(as a|take a|use your|your) reaction\b/], ['attack', /when you take the attack action|as part of the attack action/], ['action', /\b(as an?|take the) (magic |utilize )?action\b/]] as [string, RegExp][])
    .map(([k, re]) => [k, t.search(re)] as const).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0];
  const activation = first ? first[0] : '';
  const dm = t.match(/\bfor (1|10|one|ten) (minute|minutes|hour|hours|round|rounds)\b/);
  const duration = dm ? `${{ one: '1', ten: '10' }[dm[1]] ?? dm[1]} ${dm[2].replace(/s$/, '')}${['1', 'one'].includes(dm[1]) ? '' : 's'}` : /until the start of your next turn/.test(t) ? 'Until the start of your next turn' : '';
  const rm = t.match(/(\d+)-foot emanation/) ?? t.match(/within (\d+) feet/);
  const range = rm ? (rm[0].includes('emanation') ? `${rm[1]}-foot Emanation` : `${rm[1]} feet`) : '';
  // an aura with no action to start it is always on
  const fallback = /aura|emanation/.test(t) ? 'always' : 'other';
  return activation || duration || range ? { activation: activation || fallback, duration, range } : null;
}

export function UseEditor({ f, onChange }: { f: any; onChange: (use: Use | null) => void }) {
  const u = guessUse(f) ?? { activation: 'always', duration: '', range: '' };
  const put = (p: Partial<Use>) => onChange({ ...u, ...p });
  return (
    <fieldset className="feat-uses">
      <legend>How it&apos;s used</legend>
      <div className="use-row">
        <label>Activation<select value={u.activation} onChange={(e) => put({ activation: e.target.value })}>{ACTIVATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Lasts<input list="use-durations" value={u.duration} placeholder={u.activation === 'always' ? 'Always' : 'For example: 10 minutes'} onChange={(e) => put({ duration: e.target.value })} /></label>
        <label>Range or area<input list="use-ranges" value={u.range} placeholder="For example: Self" onChange={(e) => put({ range: e.target.value })} /></label>
      </div>
      <datalist id="use-durations">{DURATIONS.map((d) => <option key={d} value={d} />)}</datalist>
      <datalist id="use-ranges">{RANGES.map((d) => <option key={d} value={d} />)}</datalist>
    </fieldset>
  );
}

// "Bonus Action · 10 minutes · Self", for the closed card
export function useLine(u: Use | null) {
  if (!u) return '';
  return [ACTIVATIONS.find(([k]) => k === u.activation)?.[1].replace(' (passive)', '').replace(' (see description)', ''), u.duration, u.range].filter(Boolean).join(' · ');
}

function GiveSpell({ name, onChange, spellNames }: { name: string; onChange: (name: string) => void; spellNames: string[] }) {
  const tools = useContext(SpellTools);
  const [read, setRead] = useState<any>(null);
  const [making, setMaking] = useState(false);
  const known = tools.spells.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  const names = tools.spells.length ? tools.spells.map((s) => s.name) : spellNames;
  const toggleRead = async () => {
    if (read) { setRead(null); return; }
    setRead(known ? (await spellDetail(known.id)) ?? 'missing' : 'missing');
  };
  return (
    <div className="give-wide give-spell">
      <label>Spell<input list="give-spells" value={name} placeholder="Start typing a spell name" onChange={(e) => { onChange(e.target.value); setRead(null); }} /></label>
      <datalist id="give-spells">{names.map((s) => <option key={s} value={s} />)}</datalist>
      <span className="give-spell-tools">
        {name.trim() ? <button type="button" className="quiet small-btn" onClick={toggleRead}>{read ? 'Hide' : 'Read'}</button> : null}
        {!known ? <button type="button" className="quiet small-btn" onClick={() => setMaking(true)}>{name.trim() ? 'Create this spell' : 'Create a new spell'}</button> : null}
        {name.trim() && !known ? <span className="bad hint">Not in the SRD or your homebrew yet.</span> : null}
      </span>
      {read ? <div className="spell-read">{read === 'missing' ? <p className="dim">This spell does not exist yet. Use &quot;Create a new spell&quot; to make it.</p> : <EntityCard type="spell" name={read.name} source={read.source} data={read.data} />}</div> : null}
      {making ? <SpellPopup id={null} startName={name.trim()} pro={tools.pro} onClose={() => setMaking(false)} onDeleted={() => setMaking(false)} onSaved={(s) => { tools.onSpellSaved(s); onChange(s.name); setMaking(false); }} /> : null}
    </div>
  );
}
