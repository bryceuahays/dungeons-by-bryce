'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { ABILITIES } from '@/lib/rules/engine';
import { DAMAGE_TYPES, SKILL_NAMES } from '@/config/homebrew';
import { CONDITIONS } from '@/lib/spell-rules.mjs';
import { CRS, SENSES, SPEEDS, actionText, limitLabel, modOf, pbFor, sgn, xpFor } from '@/lib/monster-rules';
import { CREATURE_TYPES } from './RacePage';

// A monster's own page: its stat block as fields.
//   size, ctype, tags, align, cr; acv, acNote; hpv, hdv; speeds { walk, fly, swim, climb, burrow }, hover
//   ab { str ... cha }; saveB { dex: 4 } and skillB { Stealth: 6 } (the bonuses printed in the stat block)
//   vulnL, resistL, immuneL (damage types), condImm (conditions); sensesN { darkvision: 60, ... }, langsText, telepathy
//   traits, actions, bonus, reactions, legendary: action cards (see src/lib/monster-rules.ts); legendaryN
// Written on save: the text fields the stat block card and the initiative tracker read.

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
const SKILL_AB: Record<string, string> = { Acrobatics: 'dex', 'Animal Handling': 'wis', Arcana: 'int', Athletics: 'str', Deception: 'cha', History: 'int', Insight: 'wis', Intimidation: 'cha', Investigation: 'int', Medicine: 'wis', Nature: 'int', Perception: 'wis', Performance: 'cha', Persuasion: 'cha', Religion: 'int', 'Sleight of Hand': 'dex', Stealth: 'dex', Survival: 'wis' };
const AB3: Record<string, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };
const LISTS: [string, string, string][] = [['traits', 'Traits', 'trait'], ['actions', 'Actions', 'action'], ['bonus', 'Bonus Actions', 'bonus action'], ['reactions', 'Reactions', 'reaction'], ['legendary', 'Legendary Actions', 'legendary action']];

const passive = (d: any) => 10 + (d.skillB?.Perception !== undefined ? Number(d.skillB.Perception) : modOf(d.ab?.wis ?? 10));

export function monsterOut(d: any) {
  if (!d.speeds && !d.saveB && !d.ctype) return d; // a monster saved before these fields: leave its text as it was
  const ab = d.ab ?? {};
  const list = (l: string[] | undefined) => (l ?? []).join(', ');
  const s = d.speeds ?? {};
  const senses = [...SENSES.filter(([k]) => Number(d.sensesN?.[k])).map(([k, l]) => `${l} ${d.sensesN[k]} ft.`), `Passive Perception ${passive(d)}`].join(', ');
  return {
    ...d,
    mtype: [d.ctype ?? 'Humanoid', d.tags ? `(${d.tags})` : ''].filter(Boolean).join(' '),
    mspeed: SPEEDS.filter(([k]) => Number(s[k])).map(([k]) => (k === 'walk' ? `${s[k]} ft.` : `${k} ${s[k]} ft.${k === 'fly' && d.hover ? ' (hover)' : ''}`)).join(', ') || '0 ft.',
    msaves: ABILITIES.filter(([k]) => d.saveB?.[k] !== undefined && d.saveB[k] !== '').map(([k]) => `${AB3[k]} ${sgn(Number(d.saveB[k]))}`).join(', '),
    mskills: Object.entries(d.skillB ?? {}).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k} ${sgn(Number(v))}`).join(', '),
    vuln: list(d.vulnL), resist: list(d.resistL), immune: [list(d.immuneL), list(d.condImm)].filter(Boolean).join('; '),
    senses, langs: [d.langsText || 'None', Number(d.telepathy) ? `telepathy ${d.telepathy} ft.` : ''].filter(Boolean).join('; '),
    acv: Number(d.acv) || 10, hpv: Number(d.hpv) || 1, ab,
  };
}

function ActionCards({ list, onChange, noun }: { list: any[]; onChange: (l: any[]) => void; noun: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const put = (i: number, p: any) => onChange(list.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const num = (v: string) => (v === '' ? '' : Number(v));
  return (
    <>
      {list.map((a, i) => (
        <div key={i} className={'feat-card' + (open === i ? ' open' : '')}>
          <button type="button" className="feat-head" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            <span>{a.name || `Untitled ${noun}`}{limitLabel(a.limit) ? <span className="chip feat-uses-tag">{limitLabel(a.limit)}</span> : null}{a.kind === 'attack' && a.atk ? <span className="feat-use-line">{sgn(Number(a.atk.bonus) || 0)} to hit</span> : a.kind === 'save' && a.save?.ab ? <span className="feat-use-line">DC {a.save.dc} {AB3[a.save.ab]}</span> : null}</span>
            <span className="dim">{open === i ? 'Close' : 'Open'}</span>
          </button>
          {open === i ? (
            <div className="feat-body">
              <div className="feat-meta">
                <label>Name<input value={a.name ?? ''} maxLength={120} onChange={(e) => put(i, { name: e.target.value })} /></label>
                <label>Kind<select value={a.kind ?? 'other'} onChange={(e) => put(i, { kind: e.target.value, ...(e.target.value === 'attack' && !a.atk ? { atk: { type: 'melee', bonus: 4, reach: 5 }, damage: a.damage?.length ? a.damage : [{ dice: '1d6+2', type: 'slashing' }] } : {}), ...(e.target.value === 'save' && !a.save ? { save: { ab: 'dex', dc: 12, success: 'half' } } : {}) })}>
                  <option value="other">Description only</option><option value="attack">Attack roll</option><option value="save">Saving throw</option><option value="multi">Multiattack</option>
                </select></label>
              </div>
              {a.kind === 'attack' ? (
                <div className="sr-grid">
                  <label>Type<select value={a.atk?.type ?? 'melee'} onChange={(e) => put(i, { atk: { ...a.atk, type: e.target.value } })}><option value="melee">Melee</option><option value="ranged">Ranged</option><option value="both">Melee or ranged</option></select></label>
                  <label>To hit (+)<input type="number" value={a.atk?.bonus ?? ''} onChange={(e) => put(i, { atk: { ...a.atk, bonus: num(e.target.value) } })} /></label>
                  {a.atk?.type !== 'ranged' ? <label>Reach (feet)<input type="number" min={0} step={5} value={a.atk?.reach ?? 5} onChange={(e) => put(i, { atk: { ...a.atk, reach: num(e.target.value) } })} /></label> : null}
                  {a.atk?.type !== 'melee' ? <>
                    <label>Range (feet)<input type="number" min={0} step={5} value={a.atk?.range?.normal ?? ''} onChange={(e) => put(i, { atk: { ...a.atk, range: { ...a.atk?.range, normal: num(e.target.value) } } })} /></label>
                    <label>Long range<input type="number" min={0} step={5} value={a.atk?.range?.long ?? ''} onChange={(e) => put(i, { atk: { ...a.atk, range: { ...a.atk?.range, long: num(e.target.value) } } })} /></label>
                  </> : null}
                </div>
              ) : null}
              {a.kind === 'save' ? (
                <div className="sr-grid">
                  <label>Saving throw<select value={a.save?.ab ?? 'dex'} onChange={(e) => put(i, { save: { ...a.save, ab: e.target.value } })}>{ABILITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                  <label>DC<input type="number" min={1} max={40} value={a.save?.dc ?? ''} onChange={(e) => put(i, { save: { ...a.save, dc: num(e.target.value) } })} /></label>
                  <label>On a success<select value={a.save?.success ?? 'half'} onChange={(e) => put(i, { save: { ...a.save, success: e.target.value } })}><option value="half">Half damage</option><option value="none">No effect</option><option value="other">See description</option></select></label>
                </div>
              ) : null}
              {a.kind === 'attack' || a.kind === 'save' ? (
                <>
                  <span className="sr-label">Damage</span>
                  {(a.damage ?? []).map((d: any, k: number) => (
                    <div key={k} className="sr-grid">
                      <label>Dice<input value={d.dice ?? ''} maxLength={16} placeholder="1d8+3" onChange={(e) => put(i, { damage: a.damage.map((x: any, j: number) => (j === k ? { ...x, dice: e.target.value } : x)) })} /></label>
                      <label>Type<select value={d.type ?? ''} onChange={(e) => put(i, { damage: a.damage.map((x: any, j: number) => (j === k ? { ...x, type: e.target.value } : x)) })}><option value="">Choose…</option>{DAMAGE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
                      <button type="button" className="quiet small-btn danger" onClick={() => put(i, { damage: a.damage.filter((_: any, j: number) => j !== k) })}>Remove</button>
                    </div>
                  ))}
                  <p><button type="button" className="quiet small-btn" onClick={() => put(i, { damage: [...(a.damage ?? []), { dice: '1d6', type: '' }] })}>+ Add damage</button></p>
                </>
              ) : null}
              <div className="sr-grid">
                <label>Limit<select value={a.limit?.type ?? ''} onChange={(e) => put(i, { limit: e.target.value ? { type: e.target.value, ...(e.target.value === 'recharge' ? { min: 5 } : { n: 1 }) } : null })}><option value="">None</option><option value="recharge">Recharge (roll a d6 each turn)</option><option value="day">Times per day</option></select></label>
                {a.limit?.type === 'recharge' ? <label>Recharges on<select value={a.limit.min ?? 5} onChange={(e) => put(i, { limit: { ...a.limit, min: Number(e.target.value) } })}><option value={6}>6</option><option value={5}>5–6</option><option value={4}>4–6</option></select></label> : null}
                {a.limit?.type === 'day' ? <label>Times per day<input type="number" min={1} max={9} value={a.limit.n ?? 1} onChange={(e) => put(i, { limit: { ...a.limit, n: Number(e.target.value) || 1 } })} /></label> : null}
              </div>
              <label>What it does<textarea rows={4} value={a.text ?? ''} placeholder={actionText(a) || 'The rules, the way the stat block reads them.'} onChange={(e) => put(i, { text: e.target.value })} /></label>
              {actionText(a) && !a.text ? <p className="dim">Left empty, the stat block reads: {actionText(a)}</p> : null}
              <p className="inline"><button type="button" className="quiet small-btn danger" onClick={() => { onChange(list.filter((_, j) => j !== i)); setOpen(null); }}>Remove this {noun}</button></p>
            </div>
          ) : null}
        </div>
      ))}
      <p><button type="button" className="quiet small-btn" onClick={() => { onChange([...list, { name: `New ${noun}`, text: '', kind: 'other' }]); setOpen(list.length); }}>+ Add a {noun}</button></p>
    </>
  );
}

export function MonsterPage({ data, setData }: { data: any; setData: (d: any) => void }) {
  const ab = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...(data.ab ?? {}) };
  const cr = String(data.cr ?? '1');
  const pb = pbFor(cr);
  const speeds = data.speeds ?? { walk: 30 };
  const put = (p: any) => setData({ ...data, ...p });
  const num = (v: string) => (v === '' ? '' : Number(v));
  const ticks = (key: string, options: string[]) => (
    <div className="sr-conds">{options.map((o) => <label key={o} className="ckrow"><input type="checkbox" checked={(data[key] ?? []).includes(o)} onChange={(e) => put({ [key]: e.target.checked ? [...(data[key] ?? []), o] : (data[key] ?? []).filter((x: string) => x !== o) })} /> {o}</label>)}</div>
  );
  return (
    <div className="cls-main">
      <div className="cls-row two">
        <label>Description<textarea rows={6} value={data.desc ?? ''} onChange={(e) => put({ desc: e.target.value })} /></label>
        <div className="cls-stack">
          <div className="sr-grid">
            <label>Size<select value={data.size ?? 'Medium'} onChange={(e) => put({ size: e.target.value })}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label>Creature type<select value={data.ctype ?? 'Humanoid'} onChange={(e) => put({ ctype: e.target.value })}>{CREATURE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          </div>
          <div className="sr-grid">
            <label>Tags<input value={data.tags ?? ''} maxLength={60} placeholder="For example: Goblinoid" onChange={(e) => put({ tags: e.target.value })} /></label>
            <label>Alignment<input value={data.align ?? ''} maxLength={40} placeholder="neutral evil" onChange={(e) => put({ align: e.target.value })} /></label>
          </div>
          <div className="sr-grid">
            <label>Challenge rating<select value={cr} onChange={(e) => put({ cr: e.target.value })}>{CRS.map((c) => <option key={c}>{c}</option>)}</select></label>
            <p className="dim sr-wide">{xpFor(cr).toLocaleString('en-US')} XP · Proficiency Bonus +{pb}</p>
          </div>
        </div>
      </div>

      <fieldset className="feat-uses"><legend>Combat</legend>
        <div className="sr-grid">
          <label>Armor class<input type="number" min={0} max={40} value={data.acv ?? ''} onChange={(e) => put({ acv: num(e.target.value) })} /></label>
          <label>From<input value={data.acNote ?? ''} maxLength={60} placeholder="natural armor, or Leather Armor, Shield" onChange={(e) => put({ acNote: e.target.value })} /></label>
          <label>Hit points<input type="number" min={1} value={data.hpv ?? ''} onChange={(e) => put({ hpv: num(e.target.value) })} /></label>
          <label>Hit dice<input value={data.hdv ?? ''} maxLength={20} placeholder="4d8 + 4" onChange={(e) => put({ hdv: e.target.value })} /></label>
        </div>
        <div className="sr-grid">
          {SPEEDS.map(([k, l]) => <label key={k}>{l} (ft)<input type="number" min={0} step={5} placeholder="—" value={speeds[k] ?? ''} onChange={(e) => put({ speeds: { ...speeds, [k]: num(e.target.value) } })} /></label>)}
          {Number(speeds.fly) ? <label className="ckrow"><input type="checkbox" checked={!!data.hover} onChange={(e) => put({ hover: e.target.checked })} /> Hover</label> : null}
        </div>
      </fieldset>

      <fieldset className="feat-uses"><legend>Ability scores, saves and skills</legend>
        <table className="ctable mon-abs"><thead><tr><th></th>{ABILITIES.map(([k]) => <th key={k}>{AB3[k]}</th>)}</tr></thead>
          <tbody>
            <tr><td>Score</td>{ABILITIES.map(([k]) => <td key={k}><input type="number" min={1} max={30} aria-label={k + ' score'} value={ab[k as keyof typeof ab]} onChange={(e) => put({ ab: { ...ab, [k]: Number(e.target.value) || 1 } })} /><span className="dim"> {sgn(modOf(ab[k as keyof typeof ab]))}</span></td>)}</tr>
            <tr><td>Save</td>{ABILITIES.map(([k]) => { const v = data.saveB?.[k]; return <td key={k}><label className="ckrow mon-prof"><input type="checkbox" aria-label={k + ' save proficiency'} checked={v !== undefined && v !== ''} onChange={(e) => put({ saveB: { ...(data.saveB ?? {}), [k]: e.target.checked ? modOf(ab[k as keyof typeof ab]) + pb : '' } })} />{v !== undefined && v !== '' ? <input type="number" aria-label={k + ' save bonus'} value={v} onChange={(e) => put({ saveB: { ...data.saveB, [k]: num(e.target.value) } })} /> : null}</label></td>; })}</tr>
          </tbody>
        </table>
        <span className="sr-label">Skills (tick for proficiency; the bonus can be changed, for example for Expertise)</span>
        <div className="mon-skills">
          {SKILL_NAMES.map((s) => { const v = data.skillB?.[s]; const on = v !== undefined && v !== ''; return (
            <label key={s} className="ckrow"><input type="checkbox" checked={on} onChange={(e) => { const next = { ...(data.skillB ?? {}) }; if (e.target.checked) next[s] = modOf(ab[(SKILL_AB[s] ?? 'wis') as keyof typeof ab]) + pb; else delete next[s]; put({ skillB: next }); }} /> {s}{on ? <input type="number" aria-label={s + ' bonus'} value={v} onChange={(e) => put({ skillB: { ...data.skillB, [s]: num(e.target.value) } })} /> : null}</label>
          ); })}
        </div>
      </fieldset>

      <fieldset className="feat-uses"><legend>Defenses</legend>
        <span className="sr-label">Damage resistances</span>{ticks('resistL', DAMAGE_TYPES)}
        <span className="sr-label">Damage immunities</span>{ticks('immuneL', DAMAGE_TYPES)}
        <span className="sr-label">Damage vulnerabilities</span>{ticks('vulnL', DAMAGE_TYPES)}
        <span className="sr-label">Condition immunities</span>{ticks('condImm', CONDITIONS as string[])}
      </fieldset>

      <fieldset className="feat-uses"><legend>Senses and languages</legend>
        <div className="sr-grid">
          {SENSES.map(([k, l]) => <label key={k}>{l} (ft)<input type="number" min={0} step={5} placeholder="—" value={data.sensesN?.[k] ?? ''} onChange={(e) => put({ sensesN: { ...(data.sensesN ?? {}), [k]: num(e.target.value) } })} /></label>)}
          <p className="dim sr-wide">Passive Perception {passive({ ...data, ab })} (10 + its Perception).</p>
        </div>
        <div className="sr-grid">
          <label className="sr-wide">Languages<input value={data.langsText ?? ''} maxLength={160} placeholder="Common, Goblin (blank: none)" onChange={(e) => put({ langsText: e.target.value })} /></label>
          <label>Telepathy (ft)<input type="number" min={0} step={5} placeholder="—" value={data.telepathy ?? ''} onChange={(e) => put({ telepathy: num(e.target.value) })} /></label>
        </div>
      </fieldset>

      {LISTS.map(([key, title, noun]) => (
        <div key={key}>
          <h3>{title}</h3>
          {key === 'legendary' && (data.legendary ?? []).length ? <label className="lang-choose">Legendary actions per round<input type="number" min={1} max={5} value={data.legendaryN ?? 3} onChange={(e) => put({ legendaryN: Number(e.target.value) || 3 })} /></label> : null}
          <ActionCards list={data[key] ?? []} onChange={(l) => put({ [key]: l })} noun={noun} />
        </div>
      ))}

      <label>Gear<input value={data.gear ?? ''} maxLength={200} placeholder="Leather Armor, Scimitar, Shield" onChange={(e) => put({ gear: e.target.value })} /></label>
    </div>
  );
}
