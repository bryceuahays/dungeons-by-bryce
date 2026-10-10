'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ABILITIES, evalMax } from '@/lib/rules/engine';
import type { FeatOption } from './ClassGives';
import { AmountInput, RECHARGE, amountOf, blankAmount, maxOf, type Amount } from './ClassFeatures';
import { TraitCards, type Trait } from './TraitCards';

// A custom resource's own page, built like the class page: a pool every character in the campaign has
// (a pool of favour, say), as fields the sheet can count down and refill.
//   amount: how many a character has (the class page's choices; written as max on save)
//   unit, units: what one is called ("point", "points")
//   recharge: long | short | short1 | none
//   from: the character level it starts at
//   spend: the ways to spend it, as trait cards with a cost each
// Written on save: max (the formula the sheet reads).

const AB = Object.fromEntries(ABILITIES) as Record<string, string>;
const ZERO = Object.fromEntries(ABILITIES.map(([k]) => [k, 0])) as any;
export const unitsOf = (d: any) => (d.units || (d.unit || 'point') + 's');

export function resourceOut(d: any) {
  const amount: Amount = d.amount ?? amountOf(d.max ?? 'prof');
  return { ...d, amount, max: maxOf(amount), recharge: d.recharge ?? 'long', unit: d.unit || 'point' };
}

// "2 at level 1, 3 at level 5, ..." for the amounts that do not depend on an ability score.
export function amountByLevel(d: any) {
  const a: Amount = d.amount ?? amountOf(d.max ?? 'prof');
  const from = Number(d.from) || 1;
  if (a.mode === 'ability') return `equal to the character's ${AB[a.ab]} modifier (at least 1)${from > 1 ? `, from level ${from}` : ''}`;
  const out: string[] = [];
  let was = -1;
  for (let l = from; l <= 20; l++) {
    const n = evalMax(maxOf(a), { level: l, mods: ZERO });
    if (n !== was) out.push(`${n} at level ${l}`);
    was = n;
  }
  return out.join(', ');
}

export function ResourcePage({ data, setData, feats, spellNames }: { data: any; setData: (d: any) => void; feats: FeatOption[]; spellNames: string[] }) {
  const amount: Amount = data.amount ?? amountOf(data.max ?? 'prof');
  const put = (p: any) => setData({ ...data, ...p });
  const unit = data.unit || 'point';
  return (
    <div className="cls-main">
      <div className="cls-row two">
        <label>Description<textarea rows={6} value={data.desc ?? ''} placeholder="What the pool is, and where it comes from in your world." onChange={(e) => put({ desc: e.target.value })} /></label>
        <div className="cls-stack">
          <div className="sr-grid">
            <label>One is called<input value={data.unit ?? ''} maxLength={40} placeholder="point" onChange={(e) => put({ unit: e.target.value })} /></label>
            <label>More than one<input value={data.units ?? ''} maxLength={40} placeholder={unit + 's'} onChange={(e) => put({ units: e.target.value })} /></label>
          </div>
          <label>How many a character has
            <select value={amount.mode} onChange={(e) => put({ amount: blankAmount(e.target.value as Amount['mode'], amount) })}>
              <option value="fixed">A set number</option>
              <option value="steps">A number that changes at certain levels</option>
              <option value="level">Character level × a number</option>
              <option value="half">Half character level (rounded up)</option>
              <option value="prof">Proficiency Bonus</option>
              <option value="ability">An ability modifier (at least 1)</option>
              {amount.mode === 'other' ? <option value="other">Formula (older entry)</option> : null}
            </select>
          </label>
          <div className="res-amount"><AmountInput a={amount} onChange={(a) => put({ amount: a })} /></div>
          <label>Comes back<select value={data.recharge ?? 'long'} onChange={(e) => put({ recharge: e.target.value })}>{RECHARGE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <div className="sr-grid">
            <label>From character level<input type="number" min={1} max={20} value={Number(data.from) || 1} onChange={(e) => put({ from: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} /></label>
          </div>
          <p className="dim">Every character in a campaign this is added to has these {unitsOf(data)}: {amountByLevel({ ...data, amount })}. The sheet counts them down and refills them on rests.</p>
        </div>
      </div>
      <h3>Ways to spend it</h3>
      <p className="dim">Each one costs some {unitsOf(data)} (leave the cost blank when the player picks how many, like a healing pool). Give it limits, a way it&apos;s used, choices and what it gives, the same as a class feature.</p>
      <TraitCards list={(data.spend ?? []) as Trait[]} onChange={(spend) => put({ spend })} levels noun="way to spend it" unit={unit} feats={feats} spellNames={spellNames} />
    </div>
  );
}
