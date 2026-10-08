'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { ABILITIES } from '@/lib/rules/engine';
import { DAMAGE_TYPES } from '@/config/homebrew';
import { CANTRIP_GROWS, CONDITIONS, DURATIONS, RANGES, SHAPES, UNITS, UPCASTS, blankRules, parseSpell, spellText } from '@/lib/spell-rules.mjs';

// A spell's rules as fields (data.rules, see src/lib/spell-rules.mjs), so the site can track them:
// casting time, range, area, targets, components, duration, attack or save, damage, healing,
// conditions, and what grows when it is cast with a higher slot or as the character levels up.

const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];

// A spell's rules: the saved ones, else read from its text (spells made before rules existed).
export const rulesOf = (data: any) => ({ ...blankRules(), ...(data?.rules ?? (data?.time || data?.desc ? parseSpell(data) : {})) });

// What is saved: the rules, and the readable text the rest of the site shows, written from them.
export function spellOut(data: any) {
  const rules = rulesOf(data);
  return { ...data, rules, ...spellText(rules, data.level) };
}

export function SpellRulesEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const r = rulesOf(data);
  const level = Number(data.level) || 0;
  const [reread, setReread] = useState(false);
  const put = (p: any) => onChange({ ...data, rules: { ...r, ...p } });
  const n = (v: string) => (v === '' ? '' : Math.max(0, Number(v) || 0));
  const timed = r.time.unit === 'minute' || r.time.unit === 'hour';
  const sized = r.range.kind === 'feet' || r.range.kind === 'miles';
  const durN = !['instant', 'dispelled', 'special'].includes(r.duration.kind);

  return (
    <div className="spell-rules">
      <fieldset className="feat-uses"><legend>Spell</legend>
        <div className="sr-grid">
          <label>Level<select value={level} onChange={(e) => onChange({ ...data, level: Number(e.target.value) })}>
            <option value={0}>Cantrip</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => <option key={l} value={l}>Level {l}</option>)}
          </select></label>
          <label>School<select value={data.school ?? 'Evocation'} onChange={(e) => onChange({ ...data, school: e.target.value })}>{SCHOOLS.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="ckrow"><input type="checkbox" checked={!!data.ritual} onChange={(e) => onChange({ ...data, ritual: e.target.checked })} /> Can be cast as a Ritual</label>
        </div>
      </fieldset>

      <fieldset className="feat-uses"><legend>Casting</legend>
        <div className="sr-grid">
          {timed ? <label>How many<input type="number" min={1} max={99} value={r.time.n} onChange={(e) => put({ time: { ...r.time, n: n(e.target.value) || 1 } })} /></label> : null}
          <label>Casting time<select value={r.time.unit} onChange={(e) => put({ time: { ...r.time, unit: e.target.value } })}>{UNITS.map(([k, l]) => <option key={k} value={k}>{l}{k === 'minute' || k === 'hour' ? 's' : ''}</option>)}</select></label>
          {r.time.unit === 'reaction' || r.time.unit === 'bonus' || r.time.when ? <label className="sr-wide">Which you take<input value={r.time.when ?? ''} maxLength={200} placeholder={r.time.unit === 'reaction' ? 'For example: when you are hit by an attack roll' : 'Only if it has a trigger'} onChange={(e) => put({ time: { ...r.time, when: e.target.value } })} /></label> : null}
        </div>
        <div className="sr-grid">
          <span className="sr-label">Components</span>
          {(['v', 's', 'm'] as const).map((k) => <label key={k} className="ckrow"><input type="checkbox" checked={!!r.comp[k]} onChange={(e) => put({ comp: { ...r.comp, [k]: e.target.checked } })} /> {{ v: 'Verbal', s: 'Somatic', m: 'Material' }[k]}</label>)}
        </div>
        {r.comp.m ? (
          <div className="sr-grid">
            <label className="sr-wide">Material<input value={r.comp.material ?? ''} maxLength={200} placeholder="For example: a pinch of sulfur" onChange={(e) => put({ comp: { ...r.comp, material: e.target.value } })} /></label>
            <label>Costs (GP)<input type="number" min={0} placeholder="nothing" value={r.comp.cost ?? ''} onChange={(e) => put({ comp: { ...r.comp, cost: n(e.target.value) } })} /></label>
            <label className="ckrow"><input type="checkbox" checked={!!r.comp.consumed} onChange={(e) => put({ comp: { ...r.comp, consumed: e.target.checked } })} /> Used up by the spell</label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="feat-uses"><legend>Range, area and targets</legend>
        <div className="sr-grid">
          <label>Range<select value={r.range.kind} onChange={(e) => put({ range: { kind: e.target.value, n: e.target.value === 'feet' ? r.range.n || 60 : e.target.value === 'miles' ? r.range.n || 1 : '' } })}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {sized ? <label>{r.range.kind === 'feet' ? 'Feet' : 'Miles'}<input type="number" min={0} step={r.range.kind === 'feet' ? 5 : 1} value={r.range.n ?? ''} onChange={(e) => put({ range: { ...r.range, n: n(e.target.value) } })} /></label> : null}
          <label>Area<select value={r.area.shape ?? ''} onChange={(e) => put({ area: e.target.value ? { shape: e.target.value, size: r.area.size || 20, ...(e.target.value === 'line' ? { width: 5 } : {}), ...(e.target.value === 'cylinder' ? { height: 40 } : {}) } : { shape: '' } })}>{SHAPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {r.area.shape ? <label>Size (feet)<input type="number" min={0} step={5} value={r.area.size ?? ''} onChange={(e) => put({ area: { ...r.area, size: n(e.target.value) } })} /></label> : null}
          {r.area.shape === 'line' ? <label>Width (feet)<input type="number" min={0} step={5} value={r.area.width ?? ''} onChange={(e) => put({ area: { ...r.area, width: n(e.target.value) } })} /></label> : null}
          {r.area.shape === 'cylinder' ? <label>Height (feet)<input type="number" min={0} step={5} value={r.area.height ?? ''} onChange={(e) => put({ area: { ...r.area, height: n(e.target.value) } })} /></label> : null}
        </div>
        <div className="sr-grid">
          <label>Targets<input type="number" min={0} max={99} placeholder="—" value={r.targets?.n ?? ''} onChange={(e) => put({ targets: { ...r.targets, n: n(e.target.value) } })} /></label>
          <label>Of what<input value={r.targets?.what ?? ''} maxLength={60} placeholder="creature, object, willing creature…" onChange={(e) => put({ targets: { ...r.targets, what: e.target.value } })} /></label>
        </div>
      </fieldset>

      <fieldset className="feat-uses"><legend>Duration</legend>
        <div className="sr-grid">
          {durN ? <label>How many<input type="number" min={1} max={999} value={r.duration.n ?? ''} onChange={(e) => put({ duration: { ...r.duration, n: n(e.target.value) } })} /></label> : null}
          <label>Lasts<select value={r.duration.kind} onChange={(e) => put({ duration: { ...r.duration, kind: e.target.value, n: ['instant', 'dispelled', 'special'].includes(e.target.value) ? '' : r.duration.n || 1 } })}>{DURATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="ckrow"><input type="checkbox" checked={!!r.duration.conc} onChange={(e) => put({ duration: { ...r.duration, conc: e.target.checked } })} /> Needs Concentration</label>
        </div>
      </fieldset>

      <fieldset className="feat-uses"><legend>What it does</legend>
        <div className="sr-grid">
          <label>Attack roll<select value={r.attack ?? ''} onChange={(e) => put({ attack: e.target.value })}><option value="">None</option><option value="melee">Melee spell attack</option><option value="ranged">Ranged spell attack</option></select></label>
          <label>Saving throw<select value={r.save?.ab ?? ''} onChange={(e) => put({ save: { ...r.save, ab: e.target.value } })}><option value="">None</option>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {r.save?.ab ? <label>On a successful save<select value={r.save.success ?? 'half'} onChange={(e) => put({ save: { ...r.save, success: e.target.value } })}><option value="half">Half damage</option><option value="none">No effect</option><option value="other">Something else (see description)</option></select></label> : null}
        </div>
        <span className="sr-label">Damage</span>
        {(r.damage ?? []).map((d: any, i: number) => (
          <div key={i} className="sr-grid">
            <label>Dice<input value={d.dice ?? ''} maxLength={16} placeholder="8d6" onChange={(e) => put({ damage: r.damage.map((x: any, j: number) => (j === i ? { ...x, dice: e.target.value } : x)) })} /></label>
            <label>Type<select value={d.type ?? ''} onChange={(e) => put({ damage: r.damage.map((x: any, j: number) => (j === i ? { ...x, type: e.target.value } : x)) })}><option value="">Choose…</option>{DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <button type="button" className="quiet small-btn danger" onClick={() => put({ damage: r.damage.filter((_: any, j: number) => j !== i) })}>Remove</button>
          </div>
        ))}
        <p><button type="button" className="quiet small-btn" onClick={() => put({ damage: [...(r.damage ?? []), { dice: '1d6', type: '' }] })}>+ Add damage</button></p>
        <div className="sr-grid">
          <label>Healing dice<input value={r.heal?.dice ?? ''} maxLength={16} placeholder="none" onChange={(e) => put({ heal: e.target.value ? { dice: e.target.value, mod: r.heal?.mod ?? true } : null })} /></label>
          {r.heal ? <label className="ckrow"><input type="checkbox" checked={!!r.heal.mod} onChange={(e) => put({ heal: { ...r.heal, mod: e.target.checked } })} /> Plus spellcasting modifier</label> : null}
          <label>Temporary Hit Points<input value={r.temp?.dice ?? ''} maxLength={16} placeholder="none" onChange={(e) => put({ temp: e.target.value ? { dice: e.target.value } : null })} /></label>
        </div>
        <span className="sr-label">Conditions it can cause</span>
        <div className="sr-conds">
          {CONDITIONS.map((c: string) => <label key={c} className="ckrow"><input type="checkbox" checked={(r.conditions ?? []).includes(c)} onChange={(e) => put({ conditions: e.target.checked ? [...(r.conditions ?? []), c] : (r.conditions ?? []).filter((x: string) => x !== c) })} /> {c}</label>)}
        </div>
      </fieldset>

      <fieldset className="feat-uses"><legend>{level ? 'Cast with a higher-level slot' : 'As the character levels up'}</legend>
        {level ? (
          <div className="sr-grid">
            <label>What grows<select value={r.upcast?.what ?? ''} onChange={(e) => put({ upcast: e.target.value ? { what: e.target.value, add: r.upcast?.add ?? '', per: 1 } : null })}><option value="">Nothing</option>{UPCASTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            {r.upcast && r.upcast.what !== 'other' ? <label>By<input value={r.upcast.add ?? ''} maxLength={20} placeholder={r.upcast.what === 'damage' || r.upcast.what === 'healing' ? '1d6' : r.upcast.what === 'duration' ? '1 hour' : '1'} onChange={(e) => put({ upcast: { ...r.upcast, add: e.target.value } })} /></label> : null}
            {r.upcast ? <p className="dim sr-wide">For each spell slot level above {level}.{r.upcast.what === 'other' ? ' The description says how.' : ''}</p> : null}
          </div>
        ) : (
          <>
            <div className="sr-grid">
              <label>What grows<select value={r.cantrip?.what ?? ''} onChange={(e) => put({ cantrip: e.target.value ? { what: e.target.value, steps: r.cantrip?.steps ?? [[5, ''], [11, ''], [17, '']] } : null })}><option value="">Nothing</option>{CANTRIP_GROWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              {r.cantrip ? (r.cantrip.steps ?? []).map(([l, v]: [number, string], i: number) => (
                <label key={l}>At level {l}<input value={v ?? ''} maxLength={20} onChange={(e) => put({ cantrip: { ...r.cantrip, steps: r.cantrip.steps.map((s: any, j: number) => (j === i ? [s[0], e.target.value] : s)) } })} /></label>
              )) : null}
            </div>
            <p className="dim">Cantrips grow with the character&apos;s level (usually at 5, 11 and 17), not with spell slots.</p>
          </>
        )}
      </fieldset>

      <label>Description<textarea rows={7} value={data.desc ?? ''} onChange={(e) => onChange({ ...data, desc: e.target.value })} placeholder="The spell's rules, the way you would read them at the table." /></label>
      <p className="inline">
        {!reread ? <button type="button" className="quiet small-btn" onClick={() => setReread(true)}>Fill the fields in from the description</button> : (
          <span className="inline"><span>Replace the fields above with what the description says?</span>
            <button type="button" className="small-btn" onClick={() => { onChange({ ...data, rules: { ...blankRules(), ...parseSpell({ ...data, ...spellText(r, level), desc: data.desc, level }) } }); setReread(false); }}>Yes</button>
            <button type="button" className="quiet small-btn" onClick={() => setReread(false)}>No</button></span>
        )}
      </p>
    </div>
  );
}
