'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { ABILITIES, classTable } from '@/lib/rules/engine';

// The class editor's Features tab: the class's resources (pools like Channel Divinity or
// Lay on Hands) and its features as a level-by-level timeline.

// ---------------------------------------------------------------- resources

// How much of a resource a character has, in plain choices rather than formulas.
type Amount =
  | { mode: 'fixed'; n: number }
  | { mode: 'steps'; steps: [number, number][] }   // [from level, amount]
  | { mode: 'level'; n: number }                    // class level x n
  | { mode: 'ability'; ab: string }                 // an ability modifier (at least 1)
  | { mode: 'other'; raw: string };                 // anything older the choices cannot show
export type Resource = { name: string; amount: Amount; recharge: 'long' | 'short' | 'short1' | 'none'; from: number };

const AB_KEYS = ABILITIES.map(([k]) => k as string);
const RECHARGE: [Resource['recharge'], string][] = [['long', 'All back on a long rest'], ['short', 'All back on a short or long rest'], ['short1', 'One back on a short rest, all on a long rest'], ['none', 'Never comes back']];

const amountOf = (max: string): Amount => {
  const s = String(max ?? '').trim().toLowerCase();
  if (/^\d+$/.test(s)) return { mode: 'fixed', n: Number(s) };
  if (s.startsWith('step:')) return { mode: 'steps', steps: s.slice(5).split(',').map((p) => p.split('=').map(Number) as [number, number]).filter(([a, b]) => a > 0 && !Number.isNaN(b)) };
  if (s === 'level') return { mode: 'level', n: 1 };
  const m = s.match(/^level\*(\d+)$/); if (m) return { mode: 'level', n: Number(m[1]) };
  if (AB_KEYS.includes(s)) return { mode: 'ability', ab: s };
  return { mode: 'other', raw: String(max ?? '') };
};
const maxOf = (a: Amount): string => {
  switch (a.mode) {
    case 'fixed': return String(a.n || 0);
    case 'steps': return 'step:' + [...a.steps].sort((p, q) => p[0] - q[0]).map(([l, n]) => `${l}=${n}`).join(',');
    case 'level': return a.n === 1 ? 'level' : `level*${a.n || 1}`;
    case 'ability': return a.ab;
    default: return a.raw;
  }
};

// Resources saved before this tab are the class's "resource" effects: read them from there.
export function readResources(data: any): Resource[] {
  if (Array.isArray(data.resources)) return data.resources;
  return (data.effects ?? []).filter((x: any) => x.t === 'resource').map((x: any) => ({ name: x.name, amount: amountOf(x.max), recharge: x.recharge ?? 'long', from: Number(x.at) || 1 }));
}

// The character sheet and the class table read resources from the class's effects:
// write the Resources section back into them (replacing the old resource effects).
export function syncResources(data: any) {
  if (!Array.isArray(data.resources)) return data;
  const others = (data.effects ?? []).filter((x: any) => x.t !== 'resource');
  const fx = data.resources.filter((r: Resource) => r.name.trim()).map((r: Resource) => ({ t: 'resource', name: r.name.trim(), max: maxOf(r.amount), recharge: r.recharge, ...(r.from > 1 ? { at: r.from } : {}) }));
  return { ...data, effects: [...others, ...fx] };
}

export function ResourcesEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const list = readResources(data);
  const put = (next: Resource[]) => onChange({ ...data, resources: next });
  const edit = (i: number, r: Partial<Resource>) => put(list.map((x, j) => (j === i ? { ...x, ...r } : x)));
  return (
    <div className="res-list">
      {list.map((r, i) => (
        <div key={i} className="res-row">
          <label>Name<input value={r.name} maxLength={60} onChange={(e) => edit(i, { name: e.target.value })} placeholder="For example: Channel Divinity" /></label>
          <label>How much
            <select value={r.amount.mode} onChange={(e) => edit(i, { amount: blankAmount(e.target.value as Amount['mode'], r.amount) })}>
              <option value="fixed">A set number</option>
              <option value="steps">A number that changes at certain levels</option>
              <option value="level">Class level × a number</option>
              <option value="ability">An ability modifier (at least 1)</option>
              {r.amount.mode === 'other' ? <option value="other">Formula (older entry)</option> : null}
            </select>
          </label>
          <AmountInput a={r.amount} onChange={(a) => edit(i, { amount: a })} />
          <label>Comes back<select value={r.recharge} onChange={(e) => edit(i, { recharge: e.target.value as Resource['recharge'] })}>{RECHARGE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>From level<input type="number" min={1} max={20} value={r.from} onChange={(e) => edit(i, { from: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} /></label>
          <button type="button" className="quiet small-btn danger" onClick={() => put(list.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {!list.length ? <p className="dim">No resources yet. A resource is a pool of uses or points that features spend, like Channel Divinity, Lay on Hands or Focus Points.</p> : null}
      <p><button type="button" className="quiet small-btn" onClick={() => put([...list, { name: '', amount: { mode: 'fixed', n: 1 }, recharge: 'long', from: 1 }])}>+ Add a resource</button></p>
    </div>
  );
}

function blankAmount(mode: Amount['mode'], was: Amount): Amount {
  if (mode === was.mode) return was;
  if (mode === 'fixed') return { mode, n: 1 };
  if (mode === 'steps') return { mode, steps: [[1, 2]] };
  if (mode === 'level') return { mode, n: 1 };
  if (mode === 'ability') return { mode, ab: 'cha' };
  return was;
}

function AmountInput({ a, onChange }: { a: Amount; onChange: (a: Amount) => void }) {
  switch (a.mode) {
    case 'fixed': return <label>Number<input type="number" min={0} value={a.n} onChange={(e) => onChange({ mode: 'fixed', n: Number(e.target.value) || 0 })} /></label>;
    case 'level': return <label>× level<input type="number" min={1} value={a.n} onChange={(e) => onChange({ mode: 'level', n: Number(e.target.value) || 1 })} /></label>;
    case 'ability': return <label>Ability<select value={a.ab} onChange={(e) => onChange({ mode: 'ability', ab: e.target.value })}>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>;
    case 'steps': return (
      <div className="res-steps">
        {a.steps.map(([l, n], i) => (
          <span key={i} className="res-step">
            from level <input type="number" min={1} max={20} aria-label="From level" value={l} onChange={(e) => onChange({ mode: 'steps', steps: a.steps.map((s, j) => (j === i ? [Number(e.target.value) || 1, s[1]] : s)) })} />
            : <input type="number" min={0} aria-label="Amount" value={n} onChange={(e) => onChange({ mode: 'steps', steps: a.steps.map((s, j) => (j === i ? [s[0], Number(e.target.value) || 0] : s)) })} />
            {a.steps.length > 1 ? <button type="button" className="quiet small-btn" aria-label="Remove this step" onClick={() => onChange({ mode: 'steps', steps: a.steps.filter((_, j) => j !== i) })}>✕</button> : null}
          </span>
        ))}
        <button type="button" className="quiet small-btn" onClick={() => onChange({ mode: 'steps', steps: [...a.steps, [Math.min(20, (a.steps[a.steps.length - 1]?.[0] ?? 1) + 4), (a.steps[a.steps.length - 1]?.[1] ?? 1) + 1]] })}>+ step</button>
      </div>
    );
    default: return <label>Formula<input value={a.raw} onChange={(e) => onChange({ mode: 'other', raw: e.target.value })} /></label>;
  }
}

// ---------------------------------------------------------------- features by level

type Feature = { level: number; name: string; text: string; effects?: any[] };

export function FeatureTimeline({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const feats: Feature[] = data.features ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const [many, setMany] = useState({ name: '', levels: '' });
  const put = (next: Feature[]) => onChange({ ...data, features: next.map((f, i) => [f, i] as const).sort((a, b) => Number(a[0].level) - Number(b[0].level) || a[1] - b[1]).map(([f]) => f) });
  const edit = (i: number, f: Partial<Feature>) => put(feats.map((x, j) => (j === i ? { ...x, ...f } : x)));
  // the list is kept in level order, so the new card's place is after every feature at its level or below
  const add = (level: number) => { put([...feats, { level, name: 'New feature', text: '' }]); setOpen(feats.filter((f) => Number(f.level) <= level).length); };
  // add one feature at several levels at once, skipping levels that already have it
  const addAt = (name: string, levels: number[], text = '') => put([...feats, ...levels.filter((l) => !feats.some((f) => Number(f.level) === l && f.name.toLowerCase() === name.toLowerCase())).map((level) => ({ level, name, text: feats.find((f) => f.name.toLowerCase() === name.toLowerCase())?.text ?? text }))]);
  const levelsIn = (s: string) => [...new Set(s.split(/[ ,]+/).map(Number).filter((n) => n >= 1 && n <= 20))];

  return (
    <div className="feat-timeline">
      <div className="feat-quick">
        <span className="dim">Add the usual milestones:</span>
        <button type="button" className="quiet small-btn" onClick={() => addAt('Ability Score Improvement', [4, 8, 12, 16], 'Increase one ability score by 2, or two ability scores by 1 each (to a maximum of 20), or take a feat you qualify for.')}>Ability Score Improvements (4, 8, 12, 16)</button>
        <button type="button" className="quiet small-btn" onClick={() => addAt('Epic Boon', [19], 'You gain an Epic Boon feat or another feat of your choice for which you qualify.')}>Epic Boon (19)</button>
      </div>
      <div className="feat-quick">
        <label>Same feature at several levels<input value={many.name} placeholder="For example: Subclass feature" onChange={(e) => setMany({ ...many, name: e.target.value })} /></label>
        <label>Levels<input value={many.levels} placeholder="3, 7, 11, 15" onChange={(e) => setMany({ ...many, levels: e.target.value })} /></label>
        <button type="button" className="quiet small-btn" disabled={!many.name.trim() || !levelsIn(many.levels).length} onClick={() => { addAt(many.name.trim(), levelsIn(many.levels)); setMany({ name: '', levels: '' }); }}>Add</button>
      </div>
      {Array.from({ length: 20 }, (_, i) => i + 1).map((level) => {
        const here = feats.map((f, idx) => [f, idx] as const).filter(([f]) => Number(f.level) === level);
        return (
          <section key={level} className="feat-level">
            <h4>Level {level}</h4>
            {here.length ? here.map(([f, idx]) => (
              <div key={idx} className={'feat-card' + (open === idx ? ' open' : '')}>
                <button type="button" className="feat-head" aria-expanded={open === idx} onClick={() => setOpen(open === idx ? null : idx)}>
                  <span>{f.name || 'Untitled feature'}</span><span className="dim">{open === idx ? 'Close' : 'Open'}</span>
                </button>
                {open === idx ? (
                  <div className="feat-body">
                    <div className="feat-meta">
                      <label>Name<input value={f.name} maxLength={120} onChange={(e) => edit(idx, { name: e.target.value })} /></label>
                      <label>Level<select value={Number(f.level)} onChange={(e) => { edit(idx, { level: Number(e.target.value) }); setOpen(null); }}>{Array.from({ length: 20 }, (_, l) => <option key={l} value={l + 1}>{l + 1}</option>)}</select></label>
                    </div>
                    <label>What it does<textarea rows={8} value={f.text ?? ''} onChange={(e) => edit(idx, { text: e.target.value })} /></label>
                    <p className="inline"><button type="button" className="quiet small-btn danger" onClick={() => { put(feats.filter((_, j) => j !== idx)); setOpen(null); }}>Remove this feature</button></p>
                  </div>
                ) : null}
              </div>
            )) : <p className="dim feat-none">–</p>}
            <button type="button" className="quiet small-btn feat-add" onClick={() => add(level)}>+ Add a feature at level {level}</button>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- the Features tab's side table

// Level, features and the class's own counters (resources and numbers that grow): nothing about
// proficiency or spells, which have their own tabs.
export function FeatureTable({ data }: { data: any }) {
  const t = classTable({ data });
  const keep = t.headers.map((h, i) => [h, i] as const).filter(([h]) => h !== 'Cantrips' && h !== 'Prepared spells');
  return (
    <div className="scroll">
      <table className="ctable feats">
        <thead><tr><th>Level</th><th>Features</th>{keep.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{t.rows.map((r) => <tr key={r.level}><td>{r.level}</td><td>{r.features.join(', ') || '-'}</td>{keep.map(([h, i]) => <td key={h}>{r.cols[i]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
