'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { ChoiceEditor, GivesEditor, UseEditor, guessUse, useLine, type FeatOption } from './ClassGives';
import { GrowsEditor } from './ClassFeatures';
import { LIMIT_PER, limitText } from '@/lib/feat-text';

// Named parts of a feat (benefits) or a race (traits), as cards with the same parts as a class feature:
// limited uses, how it's used, what the player picks, what it gives, and what grows with level.
//   { name, text, level?, limit: { n: number | 'prof', per }, use, choice, effects }
export type Trait = { name: string; text: string; level?: number; use?: any; limit?: { n: number | 'prof' | ''; per: string } | null; effects?: any[]; choice?: any };

export function TraitCards({ list, onChange, levels, noun, feats, spellNames }: {
  list: Trait[]; onChange: (l: Trait[]) => void; levels: boolean; noun: string; feats: FeatOption[]; spellNames: string[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const put = (i: number, p: Partial<Trait>) => onChange(list.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const sorted = (l: Trait[]) => (levels ? l.map((t, i) => [t, i] as const).sort((a, b) => (Number(a[0].level) || 1) - (Number(b[0].level) || 1) || a[1] - b[1]).map(([t]) => t) : l);
  return (
    <>
      {list.map((b, i) => (
        <div key={i} className={'feat-card' + (open === i ? ' open' : '')}>
          <button type="button" className="feat-head" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            <span>{levels && Number(b.level) > 1 ? `Level ${b.level}: ` : ''}{b.name || `Untitled ${noun}`}{useLine(guessUse(b)) ? <span className="feat-use-line">{useLine(guessUse(b))}</span> : null}{limitText(b.limit) ? <span className="chip feat-uses-tag">{limitText(b.limit)}</span> : null}{b.choice ? <span className="chip feat-uses-tag">player chooses</span> : null}</span>
            <span className="dim">{open === i ? 'Close' : 'Open'}</span>
          </button>
          {open === i ? (
            <div className="feat-body">
              <div className="feat-meta">
                <label>Name<input value={b.name} maxLength={120} onChange={(e) => put(i, { name: e.target.value })} /></label>
                {levels ? <label>From character level<select value={Number(b.level) || 1} onChange={(e) => { onChange(sorted(list.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) } : x)))); setOpen(null); }}>{Array.from({ length: 20 }, (_, l) => <option key={l} value={l + 1}>{l + 1}</option>)}</select></label> : null}
              </div>
              <label>What it does<textarea rows={5} value={b.text ?? ''} onChange={(e) => put(i, { text: e.target.value })} /></label>
              <fieldset className="feat-uses">
                <legend>Limited uses</legend>
                <div className="feat-uses-pick">
                  <label>Times<select value={!b.limit ? '' : b.limit.n === 'prof' ? 'prof' : 'n'} onChange={(e) => put(i, { limit: e.target.value === '' ? null : { n: e.target.value === 'prof' ? 'prof' : (b.limit && b.limit.n !== 'prof' ? b.limit.n : 1) || 1, per: b.limit?.per ?? 'long' } })}>
                    <option value="">No limit</option><option value="n">A set number</option><option value="prof">Proficiency Bonus</option>
                  </select></label>
                  {b.limit && b.limit.n !== 'prof' ? <label>How many<input type="number" min={1} max={20} value={b.limit.n} onChange={(e) => put(i, { limit: { ...b.limit!, n: Math.max(1, Number(e.target.value) || 1) } })} /></label> : null}
                  {b.limit ? <label>Per<select value={b.limit.per} onChange={(e) => put(i, { limit: { ...b.limit!, per: e.target.value } })}>{LIMIT_PER.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label> : null}
                </div>
                <p className="dim">For &quot;once per turn&quot;, &quot;a number of times equal to your Proficiency Bonus&quot; or &quot;you can&apos;t use it again until you finish a Long Rest&quot;. The sheet tracks them.</p>
              </fieldset>
              <UseEditor f={b} onChange={(use) => put(i, { use })} />
              <ChoiceEditor nested f={b} feats={feats} spellNames={spellNames} onChange={(choice) => put(i, { choice })} />
              <GivesEditor effects={b.effects ?? []} spellNames={spellNames} onChange={(effects) => put(i, { effects })} />
              <GrowsEditor f={b as any} onChange={(effects) => put(i, { effects })} />
              <p className="inline"><button type="button" className="quiet small-btn danger" onClick={() => { onChange(list.filter((_, j) => j !== i)); setOpen(null); }}>Remove this {noun}</button></p>
            </div>
          ) : null}
        </div>
      ))}
      <p><button type="button" className="quiet small-btn" onClick={() => { onChange(sorted([...list, { name: `New ${noun}`, text: '', ...(levels ? { level: 1 } : {}) }])); setOpen(levels ? list.filter((t) => (Number(t.level) || 1) <= 1).length : list.length); }}>+ Add a {noun}</button></p>
    </>
  );
}
