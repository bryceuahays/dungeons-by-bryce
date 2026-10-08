'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { ABILITIES, classTable } from '@/lib/rules/engine';
import { ChoiceEditor, GIVEN, GivesEditor, guessChoice, type FeatOption } from './ClassGives';

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
export type Resource = { id: string; name: string; amount: Amount; recharge: 'long' | 'short' | 'short1' | 'none'; from: number };

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

// A resource keeps the same id when it is renamed, so the features that use it stay linked.
const idFor = (name: string) => 'r:' + name.trim().toLowerCase();
const freshId = (name: string, taken: Resource[]) => {
  let id = idFor(name || 'resource'), n = 2;
  while (taken.some((r) => r.id === id)) id = idFor(name || 'resource') + '-' + n++;
  return id;
};

// Resources saved before this tab are the class's "resource" effects: read them from there.
export function readResources(data: any): Resource[] {
  if (Array.isArray(data.resources)) return data.resources.map((r: any) => ({ ...r, id: r.id ?? idFor(r.name) }));
  return (data.effects ?? []).filter((x: any) => x.t === 'resource').map((x: any) => ({ id: idFor(x.name), name: x.name, amount: amountOf(x.max), recharge: x.recharge ?? 'long', from: Number(x.at) || 1 }));
}

// The character sheet and the class table read resources from the class's effects:
// write the Resources section back into them (replacing the old resource effects).
export function syncResources(data: any) {
  if (!Array.isArray(data.resources)) return data;
  const others = (data.effects ?? []).filter((x: any) => x.t !== 'resource');
  const fx = data.resources.filter((r: Resource) => r.name.trim()).map((r: Resource) => ({ t: 'resource', name: r.name.trim(), max: maxOf(r.amount), recharge: r.recharge, ...(r.from > 1 ? { at: r.from } : {}) }));
  return { ...data, effects: [...others, ...fx] };
}

// ---------------------------------------------------------------- which feature spends which resource

// feature.uses: { res: resource id, cost: number, or '' when it varies (a healing pool) }; null: none.
type Uses = { res: string; cost: number | '' } | null;

// Features saved before links existed: a feature named like a resource is that resource's feature,
// and one whose text says it expends or spends a resource uses one of it.
function guessUses(f: Feature, resources: Resource[]): Uses {
  if (f.uses !== undefined) return f.uses;
  const same = resources.find((r) => r.name.trim().toLowerCase() === (f.name ?? '').trim().toLowerCase());
  if (same) return { res: same.id, cost: '' };
  const text = (f.text ?? '').toLowerCase();
  const spent = resources.find((r) => r.name.trim() && text.includes(r.name.trim().toLowerCase()) && /expend|spend/.test(text));
  // "expend 5 Hit Points from the pool": the number after expend or spend, else one use
  const n = Number(text.match(/(?:expend|spend)s?\s+(\d+)/)?.[1]);
  return spent ? { res: spent.id, cost: n > 0 ? n : 1 } : null;
}
// Saved with the class so the links are kept (and the guesses are only made once).
export function syncUses(data: any) {
  if (!Array.isArray(data.features)) return data;
  const resources = readResources(data);
  return { ...data, resources, features: data.features.map((f: Feature) => ({ ...f, uses: guessUses(f, resources), choice: guessChoice(f) })) };
}

// ---------------------------------------------------------------- numbers that grow with level

// A feature's growing numbers are its "scale" effects ({ t: 'scale', name, steps: [[level, value]] }),
// which the class table shows as columns and the sheet as values. Older classes keep some on the
// class itself (the Fighter's Weapon Mastery): those named like a feature move into it.
export function syncGrows(data: any) {
  if (!Array.isArray(data.features)) return data;
  const top = (data.effects ?? []) as any[];
  const named = (x: any) => data.features.findIndex((f: Feature) => x.t === 'scale' && (f.name ?? '').trim().toLowerCase() === String(x.name ?? '').trim().toLowerCase());
  if (!top.some((x) => named(x) >= 0)) return data;
  const features = data.features.map((f: Feature, i: number) => ({ ...f, effects: [...(f.effects ?? []), ...top.filter((x) => named(x) === i)] }));
  return { ...data, effects: top.filter((x) => named(x) < 0), features };
}

type Step = [number, string];

// What kind of value grows. The value itself is kept as the text players read ("10 ft", "2d6",
// "+2"), so the table and the sheet show it as is; the kind decides which boxes edit it.
type Kind = 'distance' | 'dice' | 'bonus' | 'count' | 'duration' | 'other';
const KINDS: [Kind, string][] = [['distance', 'Distance (ft)'], ['dice', 'Dice'], ['bonus', 'Bonus (+)'], ['count', 'Count'], ['duration', 'Duration'], ['other', 'Other (any text)']];
const DIE = ['4', '6', '8', '10', '12', '20'];
const UNITS = ['round', 'minute', 'hour'];
const kindOf = (v: string): Kind | null => {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (/^\d+\s*(ft|feet)\.?$/.test(t)) return 'distance';
  if (/^\d*d\d+$/.test(t)) return 'dice';
  if (/^\+\d+$/.test(t)) return 'bonus';
  if (/^\d+$/.test(t)) return 'count';
  if (/^\d+\s*(round|minute|hour)s?$/.test(t)) return 'duration';
  return 'other';
};
// values saved before kinds existed: the kind they all share, else "other"
const guessKind = (steps: Step[]): Kind => {
  const kinds = [...new Set(steps.map(([, v]) => kindOf(String(v ?? ''))).filter(Boolean))] as Kind[];
  return kinds.length === 1 ? kinds[0] : kinds.length ? 'other' : 'distance';
};
const num = (v: string) => String(v ?? '').match(/\d+/)?.[0] ?? '';
// a value in another kind: numbers carry over between distance, bonus, count and duration;
// to or from dice there is no sensible number, so it starts blank
const convert = (v: string, k: Kind) => {
  const n = num(v);
  if (k === 'other') return v;
  if (!n || k === 'dice' || kindOf(v) === 'dice') return '';
  return k === 'distance' ? n + ' ft' : k === 'bonus' ? '+' + n : k === 'duration' ? n + (n === '1' ? ' minute' : ' minutes') : n;
};

function ValueInput({ kind, v, onChange }: { kind: Kind; v: string; onChange: (v: string) => void }) {
  const n = num(v);
  switch (kind) {
    case 'distance': return <><input className="grow-num" type="number" min={0} step={5} aria-label="Feet" value={n} onChange={(e) => onChange(e.target.value ? e.target.value + ' ft' : '')} /> ft</>;
    case 'bonus': return <>+ <input className="grow-num" type="number" min={0} aria-label="Bonus" value={n} onChange={(e) => onChange(e.target.value ? '+' + e.target.value : '')} /></>;
    case 'count': return <input className="grow-num" type="number" min={0} aria-label="Count" value={n} onChange={(e) => onChange(e.target.value)} />;
    case 'dice': {
      const [, c = '1', d = '6'] = String(v ?? '').match(/^(\d*)d(\d+)$/i) ?? [];
      return <><input className="grow-num" type="number" min={1} aria-label="How many dice" value={c || '1'} onChange={(e) => onChange((e.target.value || '1') + 'd' + d)} /> ×{' '}
        <select aria-label="Die" value={d} onChange={(e) => onChange((c || '1') + 'd' + e.target.value)}>{DIE.map((x) => <option key={x} value={x}>d{x}</option>)}</select></>;
    }
    case 'duration': {
      const unit = UNITS.find((u) => String(v).includes(u)) ?? 'minute';
      const out = (count: string, u: string) => (count ? count + ' ' + u + (count === '1' ? '' : 's') : '');
      return <><input className="grow-num" type="number" min={1} aria-label="How long" value={n} onChange={(e) => onChange(out(e.target.value, unit))} />{' '}
        <select aria-label="Unit" value={unit} onChange={(e) => onChange(out(n || '1', e.target.value))}>{UNITS.map((u) => <option key={u} value={u}>{u}s</option>)}</select></>;
    }
    default: return <input className="grow-val" aria-label="Value" value={v} placeholder="1/4" onChange={(e) => onChange(e.target.value)} />;
  }
}

function GrowsEditor({ f, onChange }: { f: Feature; onChange: (effects: any[]) => void }) {
  const fx = f.effects ?? [];
  const grows = fx.map((x, i) => [x, i] as const).filter(([x]) => x.t === 'scale');
  const put = (i: number, x: any) => onChange(fx.map((y, j) => (j === i ? x : y)));
  return (
    <fieldset className="feat-uses">
      <legend>Grows with level</legend>
      {grows.length ? grows.map(([g, i]) => {
        const steps: Step[] = g.steps ?? [];
        const kind: Kind = g.kind ?? guessKind(steps);
        const setSteps = (next: Step[]) => put(i, { ...g, kind, steps: next });
        return (
          <div key={i} className="grow-row">
            <div className="grow-what">
              <label>What grows<input value={g.name ?? ''} maxLength={60} placeholder="For example: Aura radius" onChange={(e) => put(i, { ...g, kind, name: e.target.value })} /></label>
              <label>Kind<select value={kind} onChange={(e) => { const k = e.target.value as Kind; put(i, { ...g, kind: k, steps: steps.map(([l, v]) => [l, convert(String(v ?? ''), k)]) }); }}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            </div>
            <div className="res-steps">
              {steps.map(([l, v], k) => (
                <span key={k} className="res-step">
                  from level <input type="number" min={1} max={20} aria-label="From level" value={l} onChange={(e) => setSteps(steps.map((s, j) => (j === k ? [Number(e.target.value) || 1, s[1]] : s)))} />
                  : <ValueInput kind={kind} v={String(v ?? '')} onChange={(nv) => setSteps(steps.map((s, j) => (j === k ? [s[0], nv] : s)))} />
                  {steps.length > 1 ? <button type="button" className="quiet small-btn" aria-label="Remove this step" onClick={() => setSteps(steps.filter((_, j) => j !== k))}>✕</button> : null}
                </span>
              ))}
              <span className="dim hint" style={{ flexBasis: '100%' }}>From each level listed on, it is that value (until the next step).</span>
              <button type="button" className="quiet small-btn" onClick={() => setSteps([...steps, [Math.min(20, (steps[steps.length - 1]?.[0] ?? 1) + 4), '']])}>+ step</button>
              <button type="button" className="quiet small-btn danger" onClick={() => onChange(fx.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        );
      }) : <p className="dim">Nothing yet. For a number that gets bigger as the character levels up, like an aura's range or extra damage dice. Each one is a column in the table.</p>}
      <p><button type="button" className="quiet small-btn" onClick={() => onChange([...fx, { t: 'scale', kind: 'distance', name: '', steps: [[Number(f.level) || 1, '']] }])}>+ Add a number that grows</button></p>
    </fieldset>
  );
}

// ---------------------------------------------------------------- the Features tab

type Feature = { level: number; name: string; text: string; effects?: any[]; uses?: Uses; choice?: any };

export function FeaturesTab({ data: raw, onChange, feats: featOptions, spellNames }: { data: any; onChange: (d: any) => void; feats: FeatOption[]; spellNames: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const data = syncGrows(raw);
  const resources = readResources(data);
  const feats: Feature[] = (data.features ?? []).map((f: Feature) => ({ ...f, uses: guessUses(f, resources) }));
  const sorted = (list: Feature[]) => list.map((f, i) => [f, i] as const).sort((a, b) => Number(a[0].level) - Number(b[0].level) || a[1] - b[1]).map(([f]) => f);
  const write = (next: { resources?: Resource[]; features?: Feature[] }) =>
    onChange({ ...data, resources: next.resources ?? resources, features: sorted(next.features ?? feats) });

  // a new feature already linked to a resource, opened so it can be filled in
  const addUsing = (r: Resource) => {
    write({ features: [...feats, { level: r.from, name: 'New feature', text: '', uses: { res: r.id, cost: 1 } }] });
    setOpen(feats.filter((f) => Number(f.level) <= r.from).length);
  };
  // class-wide sheet effects other than saves (set on Main), resources and growing numbers
  const top: any[] = data.effects ?? [];
  const isLoose = (x: any) => GIVEN.includes(x.t) && !(x.t === 'prof' && x.kind === 'save');
  const loose = top.filter(isLoose), kept = top.filter((x) => !isLoose(x));
  const removeResource = (id: string) => write({ resources: resources.filter((r) => r.id !== id), features: feats.map((f) => (f.uses?.res === id ? { ...f, uses: null } : f)) });

  return (
    <>
      <h3>Resources</h3>
      <p className="dim">Pools of uses or points the class&apos;s features spend. Each one is tracked on the character sheet and gets a column in the table. One resource can be shared by several features.</p>
      <div className="res-list">
        {resources.map((r) => {
          const users = feats.filter((f) => f.uses?.res === r.id);
          return (
            <div key={r.id} className="res-box">
              <ResourceFields r={r} onChange={(nr) => write({ resources: resources.map((x) => (x.id === r.id ? nr : x)) })} />
              <div className="res-foot">
                <span className="dim">Used by:</span>
                {users.length ? users.map((f) => <button key={f.name + f.level} type="button" className="chip chip-link" onClick={() => setOpen(feats.indexOf(f))}>{f.name} (level {f.level})</button>) : <span className="dim">no feature yet</span>}
                <button type="button" className="quiet small-btn" onClick={() => addUsing(r)}>+ Add a feature that uses this</button>
                <button type="button" className="quiet small-btn danger" onClick={() => removeResource(r.id)}>Remove</button>
              </div>
            </div>
          );
        })}
        {!resources.length ? <p className="dim">No resources yet. A resource is a pool of uses or points that features spend, like Channel Divinity, Lay on Hands or Focus Points.</p> : null}
        <p><button type="button" className="quiet small-btn" onClick={() => write({ resources: [...resources, { id: freshId('New resource', resources), name: 'New resource', amount: { mode: 'fixed', n: 1 }, recharge: 'long', from: 1 }] })}>+ Add a resource</button></p>
      </div>

      <h3>Features by level</h3>
      <p className="dim">What the class gives a character at each level. Click a feature to read or change it.</p>
      <FeatureTimeline feats={feats} resources={resources} open={open} setOpen={setOpen} write={write} featOptions={featOptions} spellNames={spellNames} />
      {loose.length ? (
        <>
          <h3>Also given by the class</h3>
          <p className="dim">Things this class gives that are not tied to one feature (from an older version of the class). They work the same as a feature's Gives.</p>
          <GivesEditor effects={loose} spellNames={spellNames} onChange={(fx) => onChange({ ...data, effects: [...kept, ...fx] })} />
        </>
      ) : null}
    </>
  );
}

function ResourceFields({ r, onChange }: { r: Resource; onChange: (r: Resource) => void }) {
  const edit = (p: Partial<Resource>) => onChange({ ...r, ...p });
  return (
    <div className="res-row">
      <label>Name<input value={r.name} maxLength={60} onChange={(e) => edit({ name: e.target.value })} placeholder="For example: Channel Divinity" /></label>
      <label>How much
        <select value={r.amount.mode} onChange={(e) => edit({ amount: blankAmount(e.target.value as Amount['mode'], r.amount) })}>
          <option value="fixed">A set number</option>
          <option value="steps">A number that changes at certain levels</option>
          <option value="level">Class level × a number</option>
          <option value="ability">An ability modifier (at least 1)</option>
          {r.amount.mode === 'other' ? <option value="other">Formula (older entry)</option> : null}
        </select>
      </label>
      <label>Comes back<select value={r.recharge} onChange={(e) => edit({ recharge: e.target.value as Resource['recharge'] })}>{RECHARGE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>From level<input type="number" min={1} max={20} value={r.from} onChange={(e) => edit({ from: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} /></label>
      <div className="res-amount"><AmountInput a={r.amount} onChange={(a) => edit({ amount: a })} /></div>
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
        <span className="dim hint" style={{ flexBasis: '100%' }}>From each level listed on, the character has that many (until the next step).</span>
        <button type="button" className="quiet small-btn" onClick={() => onChange({ mode: 'steps', steps: [...a.steps, [Math.min(20, (a.steps[a.steps.length - 1]?.[0] ?? 1) + 4), (a.steps[a.steps.length - 1]?.[1] ?? 1) + 1]] })}>+ step</button>
      </div>
    );
    default: return <label>Formula<input value={a.raw} onChange={(e) => onChange({ mode: 'other', raw: e.target.value })} /></label>;
  }
}

// ---------------------------------------------------------------- features by level

function FeatureTimeline({ feats, resources, open, setOpen, write, featOptions, spellNames }: {
  feats: Feature[]; resources: Resource[]; open: number | null; setOpen: (i: number | null) => void; featOptions: FeatOption[]; spellNames: string[];
  write: (next: { resources?: Resource[]; features?: Feature[] }) => void;
}) {
  const [many, setMany] = useState({ name: '', levels: '' });
  const edit = (i: number, f: Partial<Feature>) => write({ features: feats.map((x, j) => (j === i ? { ...x, ...f } : x)) });
  // the list is kept in level order, so the new card's place is after every feature at its level or below
  const add = (level: number) => { write({ features: [...feats, { level, name: 'New feature', text: '', uses: null }] }); setOpen(feats.filter((f) => Number(f.level) <= level).length); };
  // add one feature at several levels at once, skipping levels that already have it
  const addAt = (name: string, levels: number[], text = '') => write({ features: [...feats, ...levels.filter((l) => !feats.some((f) => Number(f.level) === l && f.name.toLowerCase() === name.toLowerCase())).map((level) => ({ level, name, text: feats.find((f) => f.name.toLowerCase() === name.toLowerCase())?.text ?? text, uses: null }))] });
  const levelsIn = (s: string) => [...new Set(s.split(/[ ,]+/).map(Number).filter((n) => n >= 1 && n <= 20))];
  const resName = (id?: string) => resources.find((r) => r.id === id)?.name;

  // the feature's resource: none, an existing one, or a new one made for it (named after it)
  const setUses = (i: number, f: Feature, value: string) => {
    if (value === '__new') {
      const r: Resource = { id: freshId(f.name, resources), name: f.name || 'New resource', amount: { mode: 'fixed', n: 1 }, recharge: 'long', from: Number(f.level) || 1 };
      write({ resources: [...resources, r], features: feats.map((x, j) => (j === i ? { ...x, uses: { res: r.id, cost: '' } } : x)) });
    } else edit(i, { uses: value ? { res: value, cost: f.uses?.cost ?? 1 } : null });
  };

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
            {here.length ? here.map(([f, idx]) => {
              const linked = resources.find((r) => r.id === f.uses?.res);
              const sharedWith = linked ? feats.filter((x) => x !== f && x.uses?.res === linked.id).map((x) => x.name) : [];
              return (
                <div key={idx} className={'feat-card' + (open === idx ? ' open' : '')}>
                  <button type="button" className="feat-head" aria-expanded={open === idx} onClick={() => setOpen(open === idx ? null : idx)}>
                    <span>{f.name || 'Untitled feature'}{linked ? <span className="chip feat-uses-tag">uses {resName(f.uses?.res)}</span> : null}</span><span className="dim">{open === idx ? 'Close' : 'Open'}</span>
                  </button>
                  {open === idx ? (
                    <div className="feat-body">
                      <div className="feat-meta">
                        <label>Name<input value={f.name} maxLength={120} onChange={(e) => edit(idx, { name: e.target.value })} /></label>
                        <label>Level<select value={Number(f.level)} onChange={(e) => { edit(idx, { level: Number(e.target.value) }); setOpen(null); }}>{Array.from({ length: 20 }, (_, l) => <option key={l} value={l + 1}>{l + 1}</option>)}</select></label>
                      </div>
                      <label>What it does<textarea rows={8} value={f.text ?? ''} onChange={(e) => edit(idx, { text: e.target.value })} /></label>
                      <fieldset className="feat-uses">
                        <legend>Uses a resource</legend>
                        <div className="feat-uses-pick">
                          <label>Resource<select value={f.uses?.res ?? ''} onChange={(e) => setUses(idx, f, e.target.value)}>
                            <option value="">None (always on, or no limit)</option>
                            {resources.map((r) => <option key={r.id} value={r.id}>{r.name || 'Unnamed resource'}</option>)}
                            <option value="__new">+ New resource for this feature</option>
                          </select></label>
                          {linked ? <label>Each use spends<input type="number" min={0} placeholder="varies" value={f.uses?.cost ?? ''} onChange={(e) => edit(idx, { uses: { res: linked.id, cost: e.target.value === '' ? '' : Number(e.target.value) } })} /></label> : null}
                        </div>
                        {linked ? (
                          <>
                            <p className="dim">{f.uses?.cost === '' ? 'Leave "each use spends" blank when the amount varies, like a healing pool.' : ''} {sharedWith.length ? `Shared with: ${sharedWith.join(', ')}. Changes here change it for them too.` : 'Only this feature uses it.'}</p>
                            <ResourceFields r={linked} onChange={(nr) => write({ resources: resources.map((x) => (x.id === linked.id ? nr : x)) })} />
                          </>
                        ) : null}
                      </fieldset>
                      <ChoiceEditor f={f} feats={featOptions} onChange={(choice) => edit(idx, { choice })} />
                      <GivesEditor effects={f.effects ?? []} spellNames={spellNames} onChange={(effects) => edit(idx, { effects })} />
                      <GrowsEditor f={f} onChange={(effects) => edit(idx, { effects })} />
                      <p className="inline"><button type="button" className="quiet small-btn danger" onClick={() => { write({ features: feats.filter((_, j) => j !== idx) }); setOpen(null); }}>Remove this feature</button></p>
                    </div>
                  ) : null}
                </div>
              );
            }) : <p className="dim feat-none">–</p>}
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
