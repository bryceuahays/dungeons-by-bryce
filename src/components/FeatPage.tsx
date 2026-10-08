'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ABILITIES } from '@/lib/rules/engine';
import type { FeatOption } from './ClassGives';
import { TraitCards, type Trait } from './TraitCards';

// A feat's own page (Homebrew, a feat entry), built like a class's features: the feat's category,
// prerequisites and whether it repeats, then its benefits as cards with the same parts as a feature.
//   category: 'Origin' | 'General' | 'Fighting style' | 'Epic boon'
//   req:      { level, feature, abilities: [{ ab, min }], join: 'and' | 'or', other }   (prereq: the same as text)
//   repeatable, repeatNote
//   benefits: [{ name, text, use, limit: { n, per }, effects, choice }]
//   effects:  every benefit's effects together, which the character sheet reads (written on save)

export const FEAT_CATEGORIES = ['Origin', 'General', 'Fighting style', 'Epic boon'];
const AB = Object.fromEntries(ABILITIES) as Record<string, string>;
type Benefit = Trait;

// "Level 4+, Fighting Style feature, Strength or Dexterity 13+"
export function reqText(r: any) {
  if (!r) return '';
  const abs = (r.abilities ?? []).filter((a: any) => a.ab).map((a: any) => `${AB[a.ab] ?? a.ab} ${a.min || 13}+`).join(r.join === 'or' ? ' or ' : ', ');
  return [Number(r.level) > 1 ? `Level ${r.level}+` : '', r.feature ? `${r.feature} feature` : '', abs, r.other ?? ''].filter(Boolean).join(', ');
}

// What is saved: the prerequisite as text too, and every benefit's effects where the sheet reads them.
export function featOut(d: any) {
  if (!Array.isArray(d.benefits)) return d;
  return { ...d, prereq: reqText(d.req) || d.prereq || '', effects: d.benefits.flatMap((b: Benefit) => b.effects ?? []) };
}

// A feat saved before benefits existed: its description becomes one benefit, its effects go with it.
const benefitsOf = (d: any, name: string): Benefit[] => (Array.isArray(d.benefits) ? d.benefits : [{ name: name || 'Benefit', text: d.desc ?? '', effects: d.effects ?? [] }]);

export function FeatPage({ data, setData, name, feats, spellNames }: { data: any; setData: (d: any) => void; name: string; feats: FeatOption[]; spellNames: string[] }) {
  const r = data.req ?? (data.prereq ? { other: data.prereq } : {});
  const benefits = benefitsOf(data, name);
  const putReq = (p: any) => setData({ ...data, benefits, req: { ...r, ...p } });
  const abilities: { ab: string; min: number | '' }[] = r.abilities ?? [];

  return (
    <div className="cls-main">
      <div className="cls-row two">
        <label>Description<textarea rows={5} value={data.desc ?? ''} placeholder="A short introduction; what each benefit does goes in the benefits below." onChange={(e) => setData({ ...data, benefits, desc: e.target.value })} /></label>
        <div className="cls-stack">
          <label>Category<select value={data.category ?? ''} onChange={(e) => setData({ ...data, benefits, category: e.target.value })}>
            <option value="">None</option>{FEAT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
          <label className="ckrow"><input type="checkbox" checked={!!data.repeatable} onChange={(e) => setData({ ...data, benefits, repeatable: e.target.checked })} /> Can be taken more than once</label>
          {data.repeatable ? <label>Each time<input value={data.repeatNote ?? ''} maxLength={160} placeholder="For example: choose a different spell list" onChange={(e) => setData({ ...data, benefits, repeatNote: e.target.value })} /></label> : null}
        </div>
      </div>

      <fieldset className="multi col"><legend>Prerequisites</legend>
        <div className="sr-grid">
          <label>Character level at least<input type="number" min={1} max={20} placeholder="any" value={r.level ?? ''} onChange={(e) => putReq({ level: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
          <label>Needs the feature<input value={r.feature ?? ''} maxLength={60} placeholder="For example: Spellcasting" onChange={(e) => putReq({ feature: e.target.value || undefined })} /></label>
        </div>
        {abilities.map((a, i) => (
          <div key={i} className="mc-req">
            <select aria-label="Ability" value={a.ab} onChange={(e) => putReq({ abilities: abilities.map((x, j) => (j === i ? { ...x, ab: e.target.value } : x)) })}>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <span>of at least</span>
            <input type="number" min={1} max={30} aria-label="Minimum score" value={a.min} onChange={(e) => putReq({ abilities: abilities.map((x, j) => (j === i ? { ...x, min: e.target.value === '' ? '' : Number(e.target.value) } : x)) })} />
            <button type="button" className="quiet small-btn" aria-label="Remove this requirement" onClick={() => putReq({ abilities: abilities.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <p className="inline">
          <button type="button" className="quiet small-btn" onClick={() => putReq({ abilities: [...abilities, { ab: 'str', min: 13 }] })}>+ Add an ability score</button>
          {abilities.length > 1 ? <label className="mc-join">Needs<select value={r.join === 'or' ? 'or' : 'and'} onChange={(e) => putReq({ join: e.target.value })}><option value="and">all of these</option><option value="or">any one of these</option></select></label> : null}
        </p>
        <label>Anything else<input value={r.other ?? ''} maxLength={160} placeholder="For example: proficiency with a martial weapon" onChange={(e) => putReq({ other: e.target.value || undefined })} /></label>
        <p className="dim">{reqText(r) ? `Players see: ${reqText(r)}` : 'No prerequisites: anyone can take it.'}</p>
      </fieldset>

      <h3>Benefits</h3>
      <p className="dim">What the feat gives, one card per benefit. Click one to read or change it.</p>
      <TraitCards list={benefits} onChange={(l) => setData({ ...data, benefits: l })} levels={false} noun="benefit" feats={feats} spellNames={spellNames} />
    </div>
  );
}
