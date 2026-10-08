'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EFFECTS, STATUS, TYPES, type Field } from '@/config/homebrew';
import { ABILITIES, SRD_FOCUS, balanceHint, classTable, profBonus, slotTop, slotsOnShortRest, spellSlots, type Effect, type EntityType, type Feature } from '@/lib/rules/engine';
import { deleteEntity, saveEntity, setAttached, type BrewState } from '@/app/(hub)/homebrew/actions';
import { ClassTableView, EntityCard } from './EntityCard';
import { ArmorBox, ToolsBox, WeaponsBox, syncSaves } from './ClassProfs';
import { MulticlassBox, StartEquipBox } from './ClassEquip';
import { SpellRulesEditor, spellOut } from './SpellRules';
import { FeatPage, featOut } from './FeatPage';
import { RacePage, raceOut } from './RacePage';
import { BackgroundPage, backgroundOut } from './BackgroundPage';
import { ItemPage, itemOut } from './ItemPage';
import { MonsterPage, monsterOut } from './MonsterPage';
import { ResourcePage, resourceOut } from './ResourcePage';
import { ChosenSpells, ClassSpells } from './ClassSpells';
import { ClassBanner } from './ClassBanner';
import { SubclassPage, SubclassesTab, featureSpells, parentOf, saveSubclass, subclassFeatures, subclassesFor, withSubclass, type ClassOption, type SubclassOption } from './ClassSubclasses';
import { SpellTools } from './ClassGives';
import { isMarker, readResources } from './ClassFeatures';
import { FeatureTable, FeaturesTab, syncGrows, syncResources, syncUses } from './ClassFeatures';
import type { SpellOption } from '@/lib/class-spells';
import type { FeatOption } from './ClassGives';
import { VisPicker, type Member, type Stage, type Vis } from './VisPicker';

const get = (o: any, path: string) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
const set = (o: any, path: string, v: any): any => {
  const [k, ...rest] = path.split('.');
  return { ...o, [k]: rest.length ? set(o?.[k] ?? {}, rest.join('.'), v) : v };
};
const AB = Object.fromEntries(ABILITIES) as Record<string, string>;

// ---------------------------------------------------------------- one field of the type's form

// A class's primary ability as ticked abilities joined by "and" or "or". Stored as primaryAbs and
// primaryJoin; `primary` keeps the readable text ("Strength or Dexterity") that the rest of the site shows.
const primaryText = (abs: string[], join: string) => {
  const names = ABILITIES.filter(([k]) => abs.includes(k)).map(([, l]) => l);
  return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' ' + join + ' ' + names[names.length - 1];
};
function PrimaryAbility({ data, onChange, label, help }: { data: any; onChange: (d: any) => void; label: string; help: React.ReactNode }) {
  // entries saved before the checkboxes only have the text: read the abilities out of it
  const text = String(data.primary ?? '');
  const abs: string[] = data.primaryAbs ?? ABILITIES.filter(([, l]) => text.includes(l)).map(([k]) => k);
  const join: string = data.primaryJoin ?? (/ and /.test(text) ? 'and' : 'or');
  const put = (a: string[], j: string) => onChange({ ...data, primaryAbs: a, primaryJoin: j, primary: primaryText(a, j) });
  return (
    <fieldset className="multi"><legend>{label}</legend>
      {help ? <p style={{ flexBasis: '100%', margin: '0 0 6px' }}>{help}</p> : null}
      {ABILITIES.map(([k, l]) => <label key={k} className="ckrow"><input type="checkbox" checked={abs.includes(k)} onChange={(e) => put(e.target.checked ? [...abs, k] : abs.filter((x) => x !== k), join)} /> {l}</label>)}
      {abs.length > 1 ? (
        <p style={{ flexBasis: '100%', margin: '6px 0 0' }}>
          <label className="ckrow"><input type="radio" checked={join === 'or'} onChange={() => put(abs, 'or')} /> Either one (or)</label>{' '}
          <label className="ckrow"><input type="radio" checked={join === 'and'} onChange={() => put(abs, 'and')} /> All of them (and)</label>
        </p>
      ) : null}
      {abs.length ? <p className="dim" style={{ flexBasis: '100%', margin: '6px 0 0' }}>Players see: {primaryText(abs, join)}</p> : null}
    </fieldset>
  );
}

function FieldInput({ f, data, onChange }: { f: Field; data: any; onChange: (d: any) => void }) {
  const v = get(data, f.key) ?? f.def;
  const put = (nv: any) => onChange(set(data, f.key, nv));
  const help = f.help ? <span className="dim hint">{f.help}</span> : null;
  switch (f.kind) {
    case 'primary': return <PrimaryAbility data={data} onChange={onChange} label={f.label} help={help} />;
    case 'long': return <label>{f.label}<textarea rows={3} value={v ?? ''} onChange={(e) => put(e.target.value)} />{help}</label>;
    case 'number': return <label>{f.label}<input type="number" value={v ?? ''} onChange={(e) => put(e.target.value === '' ? '' : Number(e.target.value))} />{help}</label>;
    case 'select': return <label>{f.label}<select value={String(v ?? '')} onChange={(e) => put(/^\d+$/.test(e.target.value) && f.key === 'hd' ? Number(e.target.value) : e.target.value)}>{(f.options ?? []).map((o) => <option key={o} value={o}>{f.optionLabels?.[o] ?? AB[o] ?? (o || 'None')}</option>)}</select>{help}</label>;
    case 'check': return <label className="ckrow"><input type="checkbox" checked={!!v} onChange={(e) => put(e.target.checked)} /> {f.label}</label>;
    case 'multi': return (
      <fieldset className="multi"><legend>{f.label}</legend>
        {help ? <p style={{ flexBasis: '100%', margin: '0 0 6px' }}>{help}</p> : null}
        {(f.options ?? []).map((o) => <label key={o} className="ckrow"><input type="checkbox" checked={(v ?? []).includes(o)} onChange={(e) => put(e.target.checked ? [...(v ?? []), o] : (v ?? []).filter((x: string) => x !== o))} /> {AB[o] ?? o}</label>)}
      </fieldset>
    );
    case 'abilities': return (
      <fieldset className="multi abs"><legend>{f.label}</legend>
        {ABILITIES.map(([k, label]) => <label key={k}>{label.slice(0, 3)}<input type="number" min={1} max={30} value={(v ?? {})[k] ?? 10} onChange={(e) => put({ ...(v ?? {}), [k]: Number(e.target.value) })} /></label>)}
      </fieldset>
    );
    case 'pairs': return (
      <fieldset className="multi col"><legend>{f.label}</legend>
        {(v ?? []).map((p: any, i: number) => (
          <div key={i} className="pair">
            <input aria-label="Name" placeholder="Name" value={p.name ?? ''} onChange={(e) => put((v as any[]).map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <textarea aria-label="Text" rows={2} placeholder="What it does" value={p.text ?? ''} onChange={(e) => put((v as any[]).map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
            <button type="button" className="quiet small-btn" onClick={() => put((v as any[]).filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="quiet small-btn" onClick={() => put([...(v ?? []), { name: '', text: '' }])}>Add one</button>
      </fieldset>
    );
    default: return <label>{f.label}<input value={v ?? ''} onChange={(e) => put(e.target.value)} />{help}</label>;
  }
}

// ---------------------------------------------------------------- effects

const stepsText = (steps: any) => (Array.isArray(steps) ? steps.map(([l, v]: [number, string]) => `${l}=${v}`).join(', ') : String(steps ?? ''));
const parseSteps = (s: string): [number, string][] => s.split(',').map((p) => p.split('=').map((x) => x.trim())).filter((p) => p.length === 2 && /^\d+$/.test(p[0]) && p[1]).map(([l, v]) => [Number(l), v]);

export function EffectsEditor({ value, onChange, levels }: { value: Effect[]; onChange: (v: Effect[]) => void; levels: boolean }) {
  const [add, setAdd] = useState('ability');
  const upd = (i: number, patch: any) => onChange(value.map((x, j) => (j === i ? ({ ...x, ...patch } as Effect) : x)));
  return (
    <div className="fx">
      {value.map((x, i) => {
        const def = EFFECTS.find((e) => e.t === x.t);
        return (
          <div key={i} className="fxrow">
            <b>{def?.label ?? x.t}</b>
            {(def?.fields ?? []).map((f) => {
              const v = (x as any)[f.k];
              if (f.kind === 'select') return <label key={f.k}>{f.label}<select value={String(v ?? f.def)} onChange={(e) => upd(i, { [f.k]: e.target.value })}>{f.options!.map((o) => <option key={o} value={o}>{AB[o] ?? o}</option>)}</select></label>;
              if (f.kind === 'check') return <label key={f.k} className="ckrow"><input type="checkbox" checked={!!v} onChange={(e) => upd(i, { [f.k]: e.target.checked })} /> {f.label}</label>;
              if (f.kind === 'number') return <label key={f.k}>{f.label}<input type="number" value={v ?? ''} onChange={(e) => upd(i, { [f.k]: Number(e.target.value) })} /></label>;
              if (f.k === 'steps') return <label key={f.k}>{f.label}<input defaultValue={stepsText(v)} onBlur={(e) => upd(i, { steps: parseSteps(e.target.value) })} /></label>;
              return <label key={f.k}>{f.label}<input value={v ?? ''} onChange={(e) => upd(i, { [f.k]: e.target.value })} /></label>;
            })}
            {levels ? <label>From level<input type="number" min={1} max={20} value={x.at ?? 1} onChange={(e) => upd(i, { at: Math.max(1, Number(e.target.value) || 1) })} /></label> : null}
            <button type="button" className="quiet small-btn" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
          </div>
        );
      })}
      <div className="inline">
        <label>Add an effect<select value={add} onChange={(e) => setAdd(e.target.value)}>{EFFECTS.map((e) => <option key={e.t} value={e.t}>{e.label}</option>)}</select></label>
        <button type="button" className="quiet" onClick={() => { const def = EFFECTS.find((e) => e.t === add)!; const fresh: any = { t: add }; def.fields.forEach((f) => { fresh[f.k] = f.k === 'steps' ? parseSteps(String(f.def)) : f.def; }); onChange([...value, fresh]); }}>Add</button>
      </div>
    </div>
  );
}

function FeaturesEditor({ value, onChange, levels, effects }: { value: Feature[]; onChange: (v: Feature[]) => void; levels: boolean; effects: boolean }) {
  const upd = (i: number, patch: Partial<Feature>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="fx">
      {value.map((f, i) => (
        <div key={i} className="fxrow col">
          <div className="inline">
            {levels ? <label>Level<input type="number" min={1} max={20} value={f.level ?? 1} onChange={(e) => upd(i, { level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></label> : null}
            <label style={{ flex: '1 1 200px' }}>Name<input value={f.name ?? ''} onChange={(e) => upd(i, { name: e.target.value })} /></label>
            <button type="button" className="quiet small-btn" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
          </div>
          <label>What it does<textarea rows={2} value={f.text ?? ''} onChange={(e) => upd(i, { text: e.target.value })} /></label>
          {effects ? (
            <details><summary>Effects this applies to the sheet ({(f.effects ?? []).length})</summary>
              <EffectsEditor value={f.effects ?? []} onChange={(e) => upd(i, { effects: e })} levels={false} />
            </details>
          ) : null}
        </div>
      ))}
      <button type="button" className="quiet" onClick={() => onChange([...value, { level: 1, name: '', text: '' }])}>Add a trait or feature</button>
    </div>
  );
}

// ---------------------------------------------------------------- the editor

type Version = { version: number; note: string; name: string; data: any; created_at: string };
type CampaignLink = { id: string; title: string; stages: Stage[]; members: Member[]; attached: Vis | null };

// The class editor's tabs, and which fields from TYPES.class each one shows.
const CLASS_TABS = ['Main', 'Spells', 'Features', 'Subclasses', 'Leveling', 'Player'];
const CLASS_CASTING = ['casting.kind', 'casting.ability'];
const pick = (fields: Field[], keys: string[]) => keys.map((k) => fields.find((f) => f.key === k)).filter((f): f is Field => !!f);

function SkillsBox({ data, onChange, list }: { data: any; onChange: (d: any) => void; list: Field }) {
  const v: string[] = data.skillList ?? [];
  return (
    <fieldset className="multi"><legend>Skills</legend>
      <label className="ckrow" style={{ flexBasis: '100%' }}>Players pick <input type="number" min={0} max={18} style={{ width: 70 }} value={data.skillCount ?? ''} onChange={(e) => onChange({ ...data, skillCount: e.target.value === '' ? '' : Number(e.target.value) })} /> from these:</label>
      <p className="dim hint" style={{ flexBasis: '100%', margin: '0 0 6px' }}>{list.help}</p>
      {(list.options ?? []).map((o) => <label key={o} className="ckrow"><input type="checkbox" checked={v.includes(o)} onChange={(e) => onChange({ ...data, skillList: e.target.checked ? [...v, o] : v.filter((x) => x !== o) })} /> {o}</label>)}
    </fieldset>
  );
}

function LevelNumbers({ label, values, onChange }: { label: string; values: (number | string)[]; onChange: (v: (number | string)[]) => void }) {
  return (
    <>
      {[0, 10].map((from) => (
        <table key={from} className="ctable prof-edit"><thead><tr><th>Level</th>{values.slice(from, from + 10).map((_, i) => <th key={i}>{from + i + 1}</th>)}</tr></thead>
          <tbody><tr><td>{label}</td>{values.slice(from, from + 10).map((v, i) => <td key={i}><input type="number" min={0} max={99} aria-label={label + ' at level ' + (from + i + 1)} value={v} onChange={(e) => { const next = [...values]; next[from + i] = e.target.value === '' ? '' : Number(e.target.value); onChange(next); }} /></td>)}</tr></tbody></table>
      ))}
    </>
  );
}
const twenty = (v: unknown) => (Array.isArray(v) && v.length === 20 ? v : Array(20).fill(0));

// The Spells tab's side panel: spell slots by class level for the chosen kind of caster.
function SlotTable({ casting }: { casting: any }) {
  const kind = casting?.kind;
  if (!kind || kind === 'none') return <p className="dim">No spellcasting. Pick a kind of caster to see its spell slots here.</p>;
  const top = slotTop(casting);
  const counts = ([['Cantrips', casting.cantrips], ['Prepared', casting.prepared]] as [string, unknown][]).filter(([, v]) => Array.isArray(v) && v.some((n) => Number(n) > 0)) as [string, (number | string)[]][];
  return (
    <>
      <p className="dim">{kind === 'pact' ? 'Pact slots are all one level (the highest shown) and refill on a short rest.' : `How many slots of each spell level a character has at each class level. Slots refill on a ${slotsOnShortRest(casting) ? 'short or long' : 'long'} rest.`}</p>
      <div className="scroll"><table className="ctable slots">
        <thead><tr><th>Level</th>{counts.map(([h]) => <th key={h}>{h}</th>)}{Array.from({ length: top }, (_, i) => <th key={i}>{['1st', '2nd', '3rd'][i] ?? i + 1 + 'th'}</th>)}</tr></thead>
        <tbody>{Array.from({ length: 20 }, (_, l) => { const row = spellSlots(kind, l + 1, casting.rules, casting.slots); return <tr key={l}><td>{l + 1}</td>{counts.map(([h, v]) => <td key={h}>{Number(v[l]) || '-'}</td>)}{Array.from({ length: top }, (_, i) => <td key={i}>{row[i] || '-'}</td>)}</tr>; })}</tbody>
      </table></div>
    </>
  );
}

// The class's own slot table (Spellcasting: "My own slot table"): 20 class levels by 9 spell levels.
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const slotGrid = (kind: string, rules?: string) => Array.from({ length: 20 }, (_, l) => { const r = spellSlots(kind, l + 1, rules); return ORD.map((_, s) => r[s] || 0); });
function CustomSlots({ casting, onChange }: { casting: any; onChange: (c: any) => void }) {
  const grid: (number | string)[][] = Array.isArray(casting.slots) && casting.slots.length === 20 ? casting.slots : slotGrid('full', '2024');
  const put = (l: number, s: number, v: string) => onChange({ ...casting, slots: grid.map((row, i) => (i === l ? ORD.map((_, j) => (j === s ? (v === '' ? '' : Number(v)) : row[j] ?? 0)) : row)) });
  return (
    <>
      <p className="inline" style={{ alignItems: 'center' }}>
        <span className="dim">Start from:</span>
        {([['full', 'Full caster'], ['half', 'Half caster'], ['pact', 'Pact magic'], ['', 'Empty']] as const).map(([k, label]) => (
          <button key={label} type="button" className="quiet small-btn" onClick={() => onChange({ ...casting, slots: k ? slotGrid(k, '2024') : slotGrid('none') })}>{label}</button>
        ))}
      </p>
      <div className="scroll"><table className="ctable prof-edit slot-edit">
        <thead><tr><th>Level</th>{ORD.map((o) => <th key={o}>{o}</th>)}</tr></thead>
        <tbody>{grid.map((row, l) => <tr key={l}><td>{l + 1}</td>{ORD.map((o, s) => <td key={o}><input type="number" min={0} max={9} aria-label={`${o}-level slots at class level ${l + 1}`} value={row[s] ?? 0} onChange={(e) => put(l, s, e.target.value)} /></td>)}</tr>)}</tbody>
      </table></div>
      <label className="slot-refill">Slots come back on<select value={casting.refill === 'short' ? 'short' : 'long'} onChange={(e) => onChange({ ...casting, refill: e.target.value })}>
        <option value="long">A long rest</option>
        <option value="short">A short or long rest (like pact magic)</option>
      </select></label>
    </>
  );
}

// The item a caster can use in place of material components that have no cost.
const FOCI = ['Arcane Focus', 'Druidic Focus', 'Holy Symbol', 'Musical Instrument'];
function FocusPick({ casting, base, onChange }: { casting: any; base?: string; onChange: (c: any) => void }) {
  const v: string = casting.focus ?? SRD_FOCUS[base ?? ''] ?? '';
  const other = v !== '' && !FOCI.includes(v);
  return (
    <div className="focus-pick">
      <label>Spellcasting focus<select value={other ? 'other' : v} onChange={(e) => onChange({ ...casting, focus: e.target.value === 'other' ? 'Other' : e.target.value })}>
        <option value="">None (components only)</option>
        {FOCI.map((f) => <option key={f} value={f}>{f}</option>)}
        <option value="other">Something else</option>
      </select></label>
      {other ? <label>What it is<input value={v === 'Other' ? '' : v} maxLength={80} placeholder="For example: a carved bone wand" onChange={(e) => onChange({ ...casting, focus: e.target.value || 'Other' })} /></label> : null}
      <p className="dim">An item the character can hold to cast spells instead of their material components (except ones with a cost).</p>
    </div>
  );
}

// The Leveling tab's milestones: the levels a character gets a subclass feature, an Ability Score
// Improvement or an Epic Boon. They are features on the Features tab; ticking a level adds one there,
// unticking removes it.
const MILESTONE_ROWS: { key: string; label: string; is: (f: any) => boolean; name: (cls: string) => string; text: string; std?: number[] }[] = [
  { key: 'sub', label: 'Subclass feature', is: isMarker, name: (cls) => (cls.trim() ? cls.trim() + ' Subclass' : 'Subclass feature'), text: 'You gain a feature from your subclass.' },
  { key: 'asi', label: 'Ability Score Improvement', is: (f) => /^ability score improvement$/i.test(f.name ?? ''), name: () => 'Ability Score Improvement', text: 'Increase one ability score by 2, or two ability scores by 1 each (to a maximum of 20), or take a feat you qualify for.', std: [4, 8, 12, 16] },
  { key: 'boon', label: 'Epic Boon', is: (f) => /^epic boon$/i.test(f.name ?? ''), name: () => 'Epic Boon', text: 'You gain an Epic Boon feat or another feat of your choice for which you qualify.', std: [19] },
];
function Milestones({ data, className, onChange }: { data: any; className: string; onChange: (d: any) => void }) {
  const feats: any[] = data.features ?? [];
  const at = (row: (typeof MILESTONE_ROWS)[number], level: number) => feats.some((f) => row.is(f) && Number(f.level) === level);
  const toggle = (row: (typeof MILESTONE_ROWS)[number], level: number, on: boolean) => {
    if (!on) { onChange({ ...data, features: feats.filter((f) => !(row.is(f) && Number(f.level) === level)) }); return; }
    // the same name and text as the class's other ones, so a renamed "Oath feature" stays an oath feature
    const like = feats.find(row.is);
    const next = [...feats, { level, name: like?.name ?? row.name(className), text: like?.text ?? row.text, uses: null }];
    onChange({ ...data, features: next.map((f, i) => [f, i] as const).sort((a, b) => Number(a[0].level) - Number(b[0].level) || a[1] - b[1]).map(([f]) => f) });
  };
  const levelsOn = (row: (typeof MILESTONE_ROWS)[number]) => Array.from({ length: 20 }, (_, i) => i + 1).filter((l) => at(row, l));
  return (
    <>
      {[0, 10].map((from) => (
        <table key={from} className="ctable prof-edit milestones"><thead><tr><th>Level</th>{Array.from({ length: 10 }, (_, i) => <th key={i}>{from + i + 1}</th>)}</tr></thead>
          <tbody>{MILESTONE_ROWS.map((row) => (
            <tr key={row.key}><td>{row.label}</td>{Array.from({ length: 10 }, (_, i) => {
              const l = from + i + 1;
              return <td key={i}><input type="checkbox" aria-label={`${row.label} at level ${l}`} checked={at(row, l)} onChange={(e) => toggle(row, l, e.target.checked)} /></td>;
            })}</tr>
          ))}</tbody></table>
      ))}
      <p className="inline" style={{ alignItems: 'center' }}>
        {MILESTONE_ROWS.filter((r) => r.std).map((row) => {
          const same = levelsOn(row).join() === row.std!.join();
          return <button key={row.key} type="button" className="quiet small-btn" disabled={same} onClick={() => {
            const rest = feats.filter((f) => !row.is(f));
            const like = feats.find(row.is);
            onChange({ ...data, features: [...rest, ...row.std!.map((level) => ({ level, name: like?.name ?? row.name(className), text: like?.text ?? row.text, uses: null }))].sort((a, b) => Number(a.level) - Number(b.level)) });
          }}>{row.label}s at the usual levels ({row.std!.join(', ')})</button>;
        })}
      </p>
      <p className="dim">Each tick is a feature on the Features tab, where you can change its wording. Most 2024 classes get their subclass at level 3; some, like the Fighter and Rogue, get extra Ability Score Improvements.</p>
    </>
  );
}

// The proficiency bonus by level. Standard unless the DM changes it; the sheet and the class table follow it.
function ProfChart({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const chart: (number | string)[] = data.profChart ?? Array.from({ length: 20 }, (_, i) => profBonus(i + 1));
  const custom = !!data.profChart && chart.some((v, i) => Number(v) !== profBonus(i + 1));
  const put = (i: number, v: string) => { const next = [...chart]; next[i] = v === '' ? '' : Number(v); onChange({ ...data, profChart: next }); };
  const { profChart: _gone, ...rest } = data;
  return (
    <>
      {[0, 10].map((from) => (
        <table key={from} className="ctable prof-edit"><thead><tr><th>Level</th>{chart.slice(from, from + 10).map((_, i) => <th key={i}>{from + i + 1}</th>)}</tr></thead>
          <tbody><tr><td>Bonus</td>{chart.slice(from, from + 10).map((v, i) => <td key={i}><input type="number" min={0} max={20} aria-label={'Proficiency bonus at level ' + (from + i + 1)} value={v} onChange={(e) => put(from + i, e.target.value)} /></td>)}</tr></tbody></table>
      ))}
      <p className="inline" style={{ alignItems: 'center' }}>
        <button type="button" className="quiet small-btn" disabled={!data.profChart} onClick={() => onChange(rest)}>Reset to standard</button>
        <span className="dim">{custom ? 'This class uses its own chart.' : 'Standard chart (+2 to +6).'}</span>
      </p>
      <p className="dim">Recommended: if you change this chart, give every class in your game the same one. Characters level up at the same pace no matter their class, so mixed charts make some classes stronger than others.</p>
    </>
  );
}

// Copy one class's leveling and paste it into another. The copy is plain text ("1:+2 2:+2 ...")
// so it can sit in the clipboard, a note or a message; pasting reads the 20 levels back.
const LEVELING_TAG = 'Dungeons by Bryce leveling';
const levelingText = (chart: (number | string)[]) => LEVELING_TAG + ' - proficiency bonus by level: ' + chart.map((v, i) => (i + 1) + ':+' + (Number(v) || 0)).join(' ');
function readLeveling(text: string): number[] | null {
  const pairs = [...text.matchAll(/(\d+)\s*:\s*\+?(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  if (pairs.length === 20 && pairs.every(([l], i) => l === i + 1)) return pairs.map(([, n]) => n);
  const nums = (text.match(/\d+/g) ?? []).map(Number);
  return nums.length === 20 ? nums : null;
}

function LevelingCopy({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const chart: (number | string)[] = data.profChart ?? Array.from({ length: 20 }, (_, i) => profBonus(i + 1));
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fallback, setFallback] = useState('');
  const copy = async () => {
    const text = levelingText(chart);
    try { await navigator.clipboard.writeText(text); setFallback(''); setMsg({ ok: true, text: 'Copied. Open another class, go to its Leveling tab, and paste it in the box below.' }); }
    catch { setFallback(text); setMsg({ ok: true, text: 'Your browser blocked copying. Select the text below and copy it with Ctrl+C.' }); }
  };
  const apply = () => {
    const next = readLeveling(paste);
    if (!next) { setMsg({ ok: false, text: 'That does not look like copied leveling. It needs all 20 levels.' }); return; }
    onChange({ ...data, profChart: next });
    setPaste('');
    setMsg({ ok: true, text: 'Pasted into this class. Press Save to keep it.' });
  };
  return (
    <div className="lvl-copy">
      <p className="inline" style={{ alignItems: 'center' }}>
        <button type="button" className="quiet small-btn" onClick={copy}>Copy this leveling</button>
        <span className="dim">Copies the proficiency bonus chart above, to paste into another class.</span>
      </p>
      {fallback ? <textarea className="mono" rows={2} readOnly value={fallback} onFocus={(e) => e.target.select()} /> : null}
      <label>Paste leveling from another class<textarea rows={2} value={paste} placeholder="Paste copied leveling here" onChange={(e) => setPaste(e.target.value)} /></label>
      <p className="inline"><button type="button" className="quiet small-btn" disabled={!paste.trim()} onClick={apply}>Apply to this class</button></p>
      {msg ? <p className={msg.ok ? 'good' : 'bad'} role="status">{msg.text}</p> : null}
    </div>
  );
}

export function EntityEditor({ id, initial, pro, srd, versions, campaigns, version, changeNote, clonedFrom, spells, feats, subclasses: subclassOptions, classes, items }: {
  id: string | null; initial: { type: string; name: string; status: string; depth: string; source: string; data: any }; pro: boolean;
  srd: { type: string; name: string; data: any }[]; versions: Version[]; campaigns: CampaignLink[]; version: number; changeNote: string; clonedFrom?: string | null; spells?: SpellOption[]; feats?: FeatOption[]; subclasses?: SubclassOption[]; classes?: ClassOption[]; items?: string[];
}) {
  const router = useRouter();
  const def = TYPES[initial.type];
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState(initial.status);
  // Classes are being reworked around the Advanced editor alone; Quick and Guided are hidden for them for now.
  const onlyAdvanced = initial.type === 'class';
  // a subclass gets the same editor as on its class's Subclasses tab (Advanced only too)
  const isSub = initial.type === 'subclass';
  // a spell: its rules as fields, the same editor as the class's spell pop-up
  const isSpell = initial.type === 'spell';
  // a feat: its benefits as cards, built like a class's features
  const isFeat = initial.type === 'feat';
  // a race (species): its traits as cards, built like a class's features
  const isRace = initial.type === 'race';
  // a background: the 2024 recipe (abilities, Origin feat, skills, tools, equipment) as fields
  const isBg = initial.type === 'background';
  // an item: weapon, armor, gear or magic item fields
  const isItem = initial.type === 'item';
  // a monster: its stat block as fields
  const isMonster = initial.type === 'monster';
  // a custom resource: a pool every character has, and the ways to spend it
  const isRes = initial.type === 'resource';
  const wide = onlyAdvanced || isSub || isSpell || isFeat || isRace || isBg || isItem || isMonster || isRes;
  const nameLabel = isSub ? 'Subclass name' : isSpell ? 'Spell name' : isFeat ? 'Feat name' : isRace ? 'Race or species name' : isBg ? 'Background name' : isItem ? 'Item name' : isMonster ? 'Monster name' : isRes ? 'Resource name' : 'Class name';
  const [depth, setDepth] = useState(wide ? 'advanced' : initial.depth);
  const [source, setSource] = useState(initial.source);
  const [data, setData] = useState<any>(initial.data ?? {});
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState(CLASS_TABS[0]);
  // spells made or changed in the pop-up during this visit, on top of what the page loaded
  const [madeSpells, setMadeSpells] = useState<SpellOption[]>([]);
  const [goneSpells, setGoneSpells] = useState<string[]>([]);
  const [subclasses, setSubclasses] = useState<SubclassOption[]>(subclassOptions ?? []);
  // which subclass (and feature in it) to open when jumping to the Subclasses tab
  const [subFocus, setSubFocus] = useState<{ subId: string; idx: number } | null>(null);
  const allSpells = useMemo(() => { const made = new Set(madeSpells.map((m) => m.id)); return [...madeSpells, ...(spells ?? []).filter((x) => !made.has(x.id))].filter((x) => !goneSpells.includes(x.id)); }, [madeSpells, spells, goneSpells]);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<BrewState>(null);
  const [links, setLinks] = useState(campaigns);
  const [pending, start] = useTransition();
  const balance = useMemo(() => balanceHint(initial.type as EntityType, data, srd), [initial.type, data, srd]);

  const save = (asVersion: boolean) => start(async () => {
    const r = await saveEntity(id, { type: initial.type, name, status, depth, source, data: onlyAdvanced ? classOut(data) : isSub ? subOut(data) : isSpell ? spellOut(data) : isFeat ? featOut(data) : isRace ? raceOut(data) : isBg ? backgroundOut(data) : isItem ? itemOut(data) : isMonster ? monsterOut(data) : isRes ? resourceOut(data) : data, cloned_from: clonedFrom }, asVersion ? note : undefined);
    // and this class's subclasses that changed (e.g. a feature moved into one from the Features tab)
    if (r?.id && onlyAdvanced) {
      const changed = subclassesFor(subclasses, { id, name, baseClass: data.baseClass }).filter((s) => s.mine && (s.dirty || s.id.startsWith('new:')));
      let next = subclasses, failed = 0;
      for (const s of changed) {
        const sr = await saveSubclass(s, { name, id: r.id }, pro);
        if (sr?.id) next = next.map((x) => (x.id === s.id ? { ...s, id: sr.id!, dirty: false } : x)); else failed++;
      }
      if (changed.length) {
        setSubclasses(next);
        if (failed) r.error = `The class saved, but ${failed} subclass${failed > 1 ? 'es' : ''} did not. Open the Subclasses tab and save ${failed > 1 ? 'them' : 'it'} there.`;
        else r.note = `${r.note ?? 'Saved.'} ${changed.length} subclass${changed.length > 1 ? 'es' : ''} saved too.`;
      }
    }
    setMsg(r);
    if (r?.id && !id) router.replace('/homebrew/' + r.id);
    else if (r?.note) { setNote(''); router.refresh(); }
  });

  const guidedFields = def.fields.filter((f) => f.guided);
  const steps = ['Basics', ...(guidedFields.length ? ['Details'] : []), ...(def.features ? ['Traits'] : []), ...(def.effects ? ['Effects'] : []), 'Review'];
  const basics = (
    <>
      <label>Name<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
      <label>Description<textarea rows={depth === 'quick' ? 8 : 4} value={data.desc ?? ''} onChange={(e) => setData({ ...data, desc: e.target.value })} placeholder={depth === 'quick' ? 'Write it the way you would explain it at the table. Free text is always allowed.' : ''} /></label>
    </>
  );
  // a class saved before the focus existed keeps the SRD focus it shows (from the class it started as)
  const rules24 = (d: any) => (onlyAdvanced && d.casting?.kind && d.casting.kind !== 'none' ? { ...d, casting: { ...d.casting, rules: '2024', ...(d.casting.focus === undefined && SRD_FOCUS[d.baseClass] ? { focus: SRD_FOCUS[d.baseClass] } : {}) } } : d);
  // what is saved, and what the side tables show: the tabs' choices written into the class's effects
  const classOut = (d: any) => rules24(syncResources(syncUses(syncGrows(syncSaves(d)))));
  // a subclass: its parent class, and its features with the same guesses the page shows (resource spent, how it's used)
  const parent = isSub ? parentOf(data, classes ?? []) : undefined;
  const subOut = (d: any) => ({ ...d, features: subclassFeatures(d, parent ? readResources(parent.data) : []) });
  const field = (k: string) => def.fields.find((x) => x.key === k)!;
  const fieldList = (fields: Field[]) => <div className="fgrid">{fields.map((f) => <FieldInput key={f.key} f={f} data={data} onChange={setData} />)}</div>;
  const traits = <FeaturesEditor value={data.features ?? []} onChange={(v) => setData({ ...data, features: v })} levels={def.featureLevels} effects={def.effects} />;
  const fx = <EffectsEditor value={data.effects ?? []} onChange={(v) => setData({ ...data, effects: v })} levels={def.featureLevels} />;
  const fillDefaults = () => { let d = data; guidedFields.forEach((f) => { if (get(d, f.key) === undefined) d = set(d, f.key, f.def); }); setData(d); };

  return (
    <SpellTools.Provider value={{ spells: allSpells, pro, onSpellSaved: (sp) => setMadeSpells((m) => [sp, ...m.filter((x) => x.id !== sp.id)]) }}>
    <div className={'brew' + (wide ? ' brew-wide' : '') + (onlyAdvanced && tab === 'Player' ? ' brew-full' : '')}>
      {wide ? <ClassBanner data={data} name={name} onChange={setData} noun={isSub ? 'subclass' : isSpell ? 'spell' : isFeat ? 'feat' : isRace ? 'race' : isBg ? 'background' : isItem ? 'item' : isMonster ? 'monster' : isRes ? 'resource' : 'class'} /> : null}
      {wide ? (
        <div className="brew-head">
          <div className="depth" role="tablist" aria-label="How much detail">
            <button type="button" role="tab" aria-selected={false} className="quiet" disabled title="Coming later">Quick</button>
            <button type="button" role="tab" aria-selected>Advanced</button>
          </div>
          <input className="cls-name" aria-label={nameLabel} value={name} maxLength={120} placeholder={nameLabel} onChange={(e) => setName(e.target.value)} />
        </div>
      ) : null}
      <div className="brew-form">
        <div className="panel">
          {!wide ? <>
          <div className="depth" role="tablist" aria-label="How much detail">
            {(['quick', 'guided', 'advanced'] as const).map((d) => (
              <button key={d} type="button" role="tab" aria-selected={depth === d} className={depth === d ? '' : 'quiet'} disabled={!pro && d !== 'quick' && initial.depth === 'quick'}
                onClick={() => { setDepth(d); if (d === 'guided') { fillDefaults(); setStep(0); } }}>
                {d === 'quick' ? 'Quick' : d === 'guided' ? 'Guided' : 'Advanced'}{!pro && d !== 'quick' && initial.depth === 'quick' ? ' (Pro)' : ''}
              </button>
            ))}
          </div>
          <p className="dim">{depth === 'quick' ? 'Quick: a name and a description. Enough to play with.' : depth === 'guided' ? 'Guided: one step at a time, with sensible defaults already filled in.' : 'Advanced: every field on one page.'} Switching keeps everything you have entered.</p>
          </> : null}

          {depth === 'quick' ? basics : null}

          {depth === 'guided' ? (
            <>
              <ol className="stepper">{steps.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined}><button type="button" className="quiet small-btn" onClick={() => setStep(i)}>{i + 1}. {s}</button></li>)}</ol>
              {steps[step] === 'Basics' ? basics : null}
              {steps[step] === 'Details' ? fieldList(guidedFields) : null}
              {steps[step] === 'Traits' ? <><p className="dim">The named things it gives a character{def.featureLevels ? ', and the level each arrives' : ''}. Text only is fine.</p>{traits}</> : null}
              {steps[step] === 'Effects' ? <><p className="dim">Effects change the character sheet by themselves: scores, proficiencies, speed, senses, resistances, resources, spells. Leave this empty if a description is enough.</p>{fx}</> : null}
              {steps[step] === 'Review' ? <p className="dim">Check the preview and the balance hint, set a status, then save.</p> : null}
              <div className="inline" style={{ marginTop: 12 }}>
                <button type="button" className="quiet" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
                <button type="button" disabled={step === steps.length - 1} onClick={() => setStep(step + 1)}>Next</button>
              </div>
            </>
          ) : null}

          {onlyAdvanced ? (
            <>
              <div className="depth" role="tablist" aria-label="Parts of the class">
                {CLASS_TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? '' : 'quiet'} onClick={() => { setSubFocus(null); setTab(t); }}>{t}</button>)}
              </div>
              {tab === 'Main' ? (
                <div className="cls-main">
                  <div className="cls-row two">
                    <label>Description<textarea rows={6} value={data.desc ?? ''} onChange={(e) => setData({ ...data, desc: e.target.value })} /></label>
                    <FieldInput f={field('primary')} data={data} onChange={setData} />
                  </div>
                  <div className="cls-row wide-right">
                    <div className="cls-stack">
                      <FieldInput f={field('hd')} data={data} onChange={setData} />
                      <FieldInput f={field('saves')} data={data} onChange={setData} />
                    </div>
                    <SkillsBox data={data} onChange={setData} list={field('skillList')} />
                  </div>
                  <div className="cls-row three">
                    <ArmorBox data={data} onChange={setData} />
                    <WeaponsBox data={data} onChange={setData} />
                    <ToolsBox data={data} onChange={setData} />
                  </div>
                  <div className="cls-row two">
                    <StartEquipBox data={data} onChange={setData} items={items ?? []} />
                    <MulticlassBox data={data} onChange={setData} />
                  </div>
                </div>
              ) : null}
              {tab === 'Spells' ? (
                <>
                  <div className="fgrid">{pick(def.fields, CLASS_CASTING).map((f) => <FieldInput key={f.key} f={f} data={data} onChange={(d: any) => {
                    // switching to your own table starts it from the kind of caster it was (full if none)
                    const was = data.casting?.kind;
                    if (d.casting?.kind === 'custom' && !Array.isArray(d.casting.slots)) d = { ...d, casting: { ...d.casting, slots: slotGrid(was && was !== 'none' && was !== 'custom' ? was : 'full', '2024') } };
                    setData(d);
                  }} />)}</div>
                  {data.casting?.kind && data.casting.kind !== 'none' ? (
                    <>
                      <FocusPick casting={data.casting} base={data.baseClass} onChange={(c) => setData({ ...data, casting: c })} />
                      {data.casting.kind === 'custom' ? (
                        <>
                          <h3>Spell slots</h3>
                          <p className="dim">How many slots of each spell level a character has at each class level. The table on the right shows the result.</p>
                          <CustomSlots casting={data.casting} onChange={(c) => setData({ ...data, casting: c })} />
                        </>
                      ) : null}
                      <h3>Cantrips known</h3>
                      <p className="dim">How many cantrips (spells that cost no slot) a character knows at each class level. All 0 means the class gets none.</p>
                      <LevelNumbers label="Cantrips" values={twenty(data.casting?.cantrips)} onChange={(v) => setData({ ...data, casting: { ...data.casting, cantrips: v } })} />
                      <h3>Prepared spells</h3>
                      <p className="dim">How many spells a character can have ready at each class level, chosen from the class's spell list.</p>
                      <LevelNumbers label="Prepared" values={twenty(data.casting?.prepared)} onChange={(v) => setData({ ...data, casting: { ...data.casting, prepared: v } })} />
                      {[{ id: 'class', name: (name || 'This class') + ' features', data }, ...subclassesFor(subclasses, { id, name, baseClass: data.baseClass })].some((s) => featureSpells(s.data).length) ? (
                        <>
                          <h3>Always prepared</h3>
                          <p className="dim">Spells that features give as always prepared (each feature&apos;s Gives), on top of the class list below. Change them in the feature, on the Features or Subclasses tab.</p>
                          {[{ id: 'class', name: (name || 'This class') + ' features', data }, ...subclassesFor(subclasses, { id, name, baseClass: data.baseClass })].filter((s) => featureSpells(s.data).length).map((s) => (
                            <p key={s.id} className="sub-spells-line"><b>{s.name}:</b> {featureSpells(s.data).map((x) => `${x.name} (${x.level})`).join(', ')}</p>
                          ))}
                        </>
                      ) : null}
                      <h3>Spells available to this class</h3>
                      <ClassSpells spells={allSpells} value={data.spellList ?? []} pro={pro} onChange={(v) => setData((d: any) => ({ ...d, spellList: v }))} onSpellSaved={(sp) => setMadeSpells((m) => [sp, ...m.filter((x) => x.id !== sp.id)])} onSpellDeleted={(sid) => setGoneSpells((g) => [...g, sid])} />
                    </>
                  ) : null}
                </>
              ) : null}
              {tab === 'Features' ? (
                <>
                  <FeaturesTab data={data} onChange={setData}
                    subclassChoices={subclassesFor(subclasses, { id, name, baseClass: data.baseClass }).map((s) => ({ id: s.id, name: s.name, srd: !s.mine }))}
                    onMoveToSubclass={(feature, subId, rest) => {
                      const s = subclasses.find((x) => x.id === subId);
                      if (!s) return;
                      const { uses: _u, ...f } = feature;
                      const features = [...(s.data?.features ?? []), { ...f, uses: feature.uses ?? null }].sort((a: any, b: any) => Number(a.level) - Number(b.level));
                      // the SRD subclass stays as it is: the feature goes into your own copy of it
                      const moved: SubclassOption = s.mine ? { ...s, dirty: true, data: { ...s.data, features } }
                        : { id: 'new:' + Math.random().toString(36).slice(2), name: s.name, mine: true, cloned_from: s.id, data: { ...s.data, features, parent: name, parentClassId: id } };
                      setSubclasses(s.mine ? subclasses.map((x) => (x.id === s.id ? moved : x)) : [moved, ...subclasses]);
                      setData({ ...data, features: rest });
                    }} feats={feats ?? []} spellNames={allSpells.map((s) => s.name)} onOpenSubclasses={(at) => { setSubFocus(at ?? null); setTab('Subclasses'); }}
                    subFeatures={subclassesFor(subclasses, { id, name, baseClass: data.baseClass }).flatMap((s) => (s.data?.features ?? []).map((f: any, idx: number) => ({ sub: s.name, subId: s.id, idx, level: Number(f.level), name: f.name, text: f.text ?? '', srd: !s.mine })))} />
                  <details><summary>The raw data</summary><textarea className="mono" rows={16} spellCheck={false} defaultValue={JSON.stringify(data, null, 2)} key={JSON.stringify(data).length} onBlur={(e) => { try { setData(JSON.parse(e.target.value)); } catch { /* left as typed until it is valid */ } }} /></details>
                </>
              ) : null}
              {tab === 'Subclasses' ? (
                <SubclassesTab classId={id} className={name} baseClass={data.baseClass} classFeatures={data.features ?? []} resources={readResources(data)}
                  subclasses={subclasses} setSubclasses={setSubclasses} feats={feats ?? []} spellNames={allSpells.map((s) => s.name)} pro={pro} focus={subFocus} />
              ) : null}
              {tab === 'Leveling' ? (
                <>
                  <h3>Hit points</h3>
                  <p>At level 1: {data.hd || '?'} + Constitution modifier. Each level after: roll 1d{data.hd || '?'}, or take {data.hd ? Number(data.hd) / 2 + 1 : '?'}, + Constitution modifier.</p>
                  <h3>Proficiency bonus by level</h3>
                  <ProfChart data={data} onChange={setData} />
                  <h3>Copy to another class</h3>
                  <LevelingCopy data={data} onChange={setData} />
                  <h3>Milestones</h3>
                  <p className="dim">The levels a character gets these. Tick or untick a level; the table on the right follows.</p>
                  <Milestones data={data} className={name} onChange={setData} />
                </>
              ) : null}
              {tab === 'Player' ? (
                <>
                  <p className="dim">A mock-up of what a player sees when they choose this class. Once there is a character creator, this will match it.</p>
                  <EntityCard type={initial.type} name={name} status={status} data={data} />
                </>
              ) : null}
            </>
          ) : isSpell ? (
            <SpellRulesEditor data={data} onChange={setData} />
          ) : isRes ? (
            <ResourcePage data={data} setData={setData} feats={feats ?? []} spellNames={allSpells.map((s) => s.name)} />
          ) : isMonster ? (
            <MonsterPage data={data} setData={setData} spellNames={allSpells.map((s) => s.name)} />
          ) : isItem ? (
            <ItemPage data={data} setData={setData} feats={feats ?? []} spellNames={allSpells.map((s) => s.name)} items={items ?? []} />
          ) : isBg ? (
            <BackgroundPage data={data} setData={setData} feats={feats ?? []} spellNames={allSpells.map((s) => s.name)} items={items ?? []} />
          ) : isRace ? (
            <RacePage data={data} setData={setData} feats={feats ?? []} spellNames={allSpells.map((s) => s.name)} />
          ) : isFeat ? (
            <FeatPage data={data} setData={setData} name={name} feats={feats ?? []} spellNames={allSpells.map((s) => s.name)} />
          ) : isSub ? (
            <SubclassPage data={data} setData={setData} classes={classes ?? []} feats={feats ?? []} spellNames={allSpells.map((s) => s.name)} />
          ) : depth === 'advanced' ? (
            <>
              {basics}
              {def.fields.length ? <><h3>Details</h3>{fieldList(def.fields)}</> : null}
              {def.features ? <><h3>Traits and features</h3>{traits}</> : null}
              {def.effects ? <><h3>Effects</h3>{fx}</> : null}
              <details><summary>The raw data</summary><textarea className="mono" rows={12} spellCheck={false} defaultValue={JSON.stringify(data, null, 2)} key={JSON.stringify(data).length} onBlur={(e) => { try { setData(JSON.parse(e.target.value)); } catch { /* left as typed until it is valid */ } }} /></details>
            </>
          ) : null}
        </div>

        <div className="panel">
          <div className="inline">
            <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label className="ckrow" title="Private entries are never included in anything you publish or sell."><input type="checkbox" checked={source === 'private'} onChange={(e) => setSource(e.target.checked ? 'private' : 'homebrew')} /> Private (never published or sold)</label>
          </div>
          <p className="dim">{STATUS.find((s) => s.id === status)?.what}</p>
          <div className="inline">
            <button type="button" disabled={pending} onClick={() => save(false)}>{pending ? 'Saving' : id ? 'Save' : 'Create'}</button>
            {id ? <button type="button" className="quiet danger" disabled={pending} onClick={() => { if (confirm('Delete this entry for good?')) start(() => deleteEntity(id)); }}>Delete</button> : null}
          </div>
          {id && pro ? (
            <div className="inline" style={{ marginTop: 10 }}>
              <label style={{ flex: '1 1 260px' }}>What changed (saves it as version {version + 1})<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="For example: breath weapon is now a bonus action" /></label>
              <button type="button" className="quiet" disabled={pending || !note.trim()} onClick={() => save(true)}>Save as a new version</button>
            </div>
          ) : null}
          {msg?.error ? <p className="bad" role="alert">{msg.error} {msg.upgrade ? <Link href="/upgrade">See plans</Link> : null}</p> : null}
          {msg?.note ? <p className="good" role="status">{msg.note}</p> : null}
        </div>

        {id ? (
          <div className="panel">
            <h3>Use it in a campaign</h3>
            {links.length ? links.map((c) => (
              <div key={c.id} className="attach">
                <label className="ckrow"><input type="checkbox" checked={!!c.attached} disabled={pending}
                  onChange={(e) => { const on = e.target.checked; const v = on ? { vis: 'all', vis_players: [], vis_stage: null } : null; setLinks(links.map((x) => (x.id === c.id ? { ...x, attached: v } : x))); start(async () => setMsg(await setAttached(id, c.id, on, v ?? undefined))); }} /> <b>{c.title}</b></label>
                {c.attached ? <VisPicker value={c.attached} stages={c.stages} members={c.members} canName={pro} disabled={pending}
                  onChange={(v) => { setLinks(links.map((x) => (x.id === c.id ? { ...x, attached: v } : x))); start(async () => setMsg(await setAttached(id, c.id, true, v))); }} /> : null}
              </div>
            )) : <p className="dim">You are not running a campaign yet.</p>}
            <p className="dim">Players see an attached entry once its status is Playtest or Live.</p>
          </div>
        ) : null}

        {id && (versions.length || version > 1) ? (
          <div className="panel">
            <h3>Versions</h3>
            <ul className="list">
              <li><span><b>Version {version}</b> (current) <span className="dim">{changeNote}</span></span></li>
              {versions.map((v) => (
                <li key={v.version}>
                  <span><b>Version {v.version}</b> <span className="dim">{new Date(v.created_at).toLocaleDateString('en-US')}{v.note ? ' · ' + v.note : ''}</span></span>
                  <button type="button" className="quiet small-btn" onClick={() => { setName(v.name || name); setData(v.data); setMsg({ note: `Version ${v.version} is loaded in the form. Save to keep it.` }); }}>Load this version</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <aside className="brew-side" hidden={onlyAdvanced && tab === 'Player'}>
        <div className="panel">
          <h3>{isSub && parent ? 'Features by level' : onlyAdvanced ? (tab === 'Spells' ? 'Spell slots' : tab === 'Features' || tab === 'Subclasses' ? 'Features by level' : 'Class table') : 'What your players see'}</h3>
          {isSub && parent ? <div className="ecard"><FeatureTable data={withSubclass(parent.data, subOut(data).features)} /></div> : onlyAdvanced ? <div className="ecard">{tab === 'Spells' ? <SlotTable casting={classOut(data).casting} /> : tab === 'Features' || tab === 'Subclasses' ? <FeatureTable data={classOut(data)} /> : <ClassTableView table={classTable({ data: classOut(data) })} />}</div> : <EntityCard type={initial.type} name={name} status={status} data={isSpell ? spellOut(data) : isFeat ? featOut(data) : isRace ? raceOut(data) : isBg ? backgroundOut(data) : isItem ? itemOut(data) : isMonster ? monsterOut(data) : isRes ? resourceOut(data) : data} />}
        </div>
        {onlyAdvanced && tab === 'Spells' && data.casting?.kind && data.casting.kind !== 'none' ? (
          <div className="panel">
            <h3>Spells on this list</h3>
            <ChosenSpells spells={allSpells} value={data.spellList ?? []} onChange={(v) => setData((d: any) => ({ ...d, spellList: v }))} />
          </div>
        ) : null}
        <div className={'panel bal bal-' + balance.verdict.replace(' ', '-')}>
          <h3>Balance hint: {balance.verdict === 'no baseline' ? 'nothing to compare' : balance.verdict === 'in line' ? 'in line with the SRD' : balance.verdict + ' the SRD'}</h3>
          {balance.reasons.map((r, i) => <p key={i}>{r}</p>)}
          <p className="dim">A hint only. It is your table.</p>
        </div>
      </aside>
    </div>
    </SpellTools.Provider>
  );
}
