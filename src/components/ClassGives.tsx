'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DAMAGE_TYPES, SKILL_NAMES } from '@/config/homebrew';
import { TOOL_GROUPS, WEAPONS } from '@/config/proficiencies';
import { ABILITIES } from '@/lib/rules/engine';

// Two add-ons for a class feature, in plain language:
//   Gives   - what the feature adds to the character sheet by itself. Stored as the feature's
//             effects (prof, ac, speed, resist, sense, hp, ability, spell, text), which the sheet reads.
//   Chooses - what the player picks when they get the feature (feature.choice).

// ---------------------------------------------------------------- gives

const KINDS: [string, string][] = [
  ['prof', 'A proficiency'], ['ac', 'Armor class bonus'], ['speed', 'Speed'], ['resist', 'Resistance or immunity'],
  ['condition', 'Immunity to a condition'], ['sense', 'A sense (like darkvision)'], ['hp', 'Extra hit points per level'], ['ability', 'Ability score increase'],
  ['spell', 'A spell always prepared'], ['text', 'A note on the sheet'],
];
export const GIVEN = KINDS.map(([k]) => k);
const blank = (t: string): any => ({
  prof: { t, kind: 'skill', v: 'Perception' }, ac: { t, n: 1 }, speed: { t, mode: 'walk', n: 10 }, resist: { t, v: 'fire', immune: false },
  sense: { t, v: 'Darkvision', n: 60 }, condition: { t, v: 'Charmed' }, hp: { t, n: 1 }, ability: { t, ab: 'str', n: 1 }, spell: { t, name: '' }, text: { t, text: '' },
}[t]);
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
          <GiveFields g={g} onChange={(x) => put(i, x)} spellNames={spellNames} />
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
    case 'ac': return num('Bonus (+)', 'n', { min: 0 });
    case 'speed': return <><label>Kind<select value={g.mode} onChange={(e) => set({ mode: e.target.value })}>{[['walk', 'Walking (added)'], ['fly', 'Flying'], ['swim', 'Swimming'], ['climb', 'Climbing'], ['burrow', 'Burrowing']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>{num('Feet', 'n', { min: 0, step: 5 })}</>;
    case 'resist': return <><label>Damage type<select value={g.v} onChange={(e) => set({ v: e.target.value })}>{DAMAGE_TYPES.map((s) => <option key={s}>{s}</option>)}</select></label><label className="ckrow"><input type="checkbox" checked={!!g.immune} onChange={(e) => set({ immune: e.target.checked })} /> Immune, not just resistant</label></>;
    case 'condition': return <label>Condition<select value={g.v} onChange={(e) => set({ v: e.target.value })}>{CONDITIONS.map((s) => <option key={s}>{s}</option>)}</select></label>;
    case 'sense': return <><label>Sense<select value={g.v} onChange={(e) => set({ v: e.target.value })}>{['Darkvision', 'Blindsight', 'Tremorsense', 'Truesight'].map((s) => <option key={s}>{s}</option>)}</select></label>{num('Feet', 'n', { min: 0, step: 5 })}</>;
    case 'hp': return num('Hit points per level', 'n', { min: 0 });
    case 'ability': return <><label>Ability<select value={g.ab} onChange={(e) => set({ ab: e.target.value })}>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="any">Player&apos;s choice</option></select></label>{num('Increase', 'n', { min: 1 })}</>;
    case 'spell': return <label className="give-wide">Spell<input list="give-spells" value={g.name ?? ''} placeholder="Start typing a spell name" onChange={(e) => set({ name: e.target.value })} /><datalist id="give-spells">{spellNames.map((s) => <option key={s} value={s} />)}</datalist></label>;
    default: return <label className="give-wide">Note<input value={g.text ?? ''} placeholder="For example: advantage on saves against being frightened" onChange={(e) => set({ text: e.target.value })} /></label>;
  }
}

// ---------------------------------------------------------------- player chooses

export type FeatOption = { name: string; category: string; desc: string };
// feature.choice: { count, from, options? } - from is a list the site knows, or "custom" with the DM's own options
type Choice = { count: number; from: string; options?: { name: string; text: string }[] } | null;
const FROM: [string, string][] = [
  ['feat:Fighting style', 'Fighting Styles'], ['feat:Epic boon', 'Epic Boons'], ['feat:Origin', 'Origin feats'], ['feat:General', 'General feats'],
  ['weapons', 'Weapons (for Weapon Mastery)'], ['skills', 'Skills they are proficient in (for Expertise)'], ['custom', 'My own list of options'],
];
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
  return null;
}

export function ChoiceEditor({ f, onChange, feats }: { f: any; onChange: (choice: Choice) => void; feats: FeatOption[] }) {
  const c = guessChoice(f);
  const growing = (f.effects ?? []).find((x: any) => x.t === 'scale');
  const fromFeats = c?.from.startsWith('feat:') ? feats.filter((x) => x.category.toLowerCase() === c.from.slice(5).toLowerCase()) : [];
  const preview = !c ? [] : c.from === 'weapons' ? ['any Simple or Martial weapon with a mastery property'] : c.from === 'skills' ? ['any skill the character is proficient in'] : c.from === 'custom' ? (c.options ?? []).map((o) => o.name || 'Unnamed option') : fromFeats.map((x) => x.name);
  const opts = c?.options ?? [];
  const setOpts = (next: { name: string; text: string }[]) => onChange({ ...c!, options: next });
  return (
    <fieldset className="feat-uses">
      <legend>Player chooses</legend>
      <div className="feat-uses-pick">
        <label>Choose from<select value={c?.from ?? ''} onChange={(e) => onChange(e.target.value ? { count: c?.count ?? 1, from: e.target.value, ...(e.target.value === 'custom' ? { options: opts.length ? opts : [{ name: '', text: '' }] } : {}) } : null)}>
          <option value="">Nothing to choose</option>
          {FROM.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
        {c ? <label>How many<input type="number" min={1} max={20} value={c.count} onChange={(e) => onChange({ ...c, count: Math.max(1, Number(e.target.value) || 1) })} /></label> : null}
      </div>
      {c && c.from === 'weapons' && growing ? <p className="dim">This feature also has a growing number ({growing.name}); the player can choose more as it grows.</p> : null}
      {c && c.from !== 'custom' ? <p className="dim">Players pick {c.count} from: {preview.length ? preview.join(', ') : 'nothing yet - there are no options of that kind'}.</p> : null}
      {c && c.from === 'custom' ? (
        <div className="choice-opts">
          {opts.map((o, i) => (
            <div key={i} className="choice-opt">
              <label>Option<input value={o.name} maxLength={80} placeholder="For example: Way of the Sun" onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></label>
              <label>What it does<textarea rows={2} value={o.text} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /></label>
              <button type="button" className="quiet small-btn danger" onClick={() => setOpts(opts.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <p><button type="button" className="quiet small-btn" onClick={() => setOpts([...opts, { name: '', text: '' }])}>+ Add an option</button></p>
        </div>
      ) : null}
      {!c ? <p className="dim">For features where the player picks something, like a Fighting Style or weapons to master.</p> : null}
    </fieldset>
  );
}
