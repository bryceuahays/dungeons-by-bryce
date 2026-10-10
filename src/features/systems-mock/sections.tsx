'use client';
// MOCK-UP ONLY: the editor for each section of a game system.
import { useState } from 'react';
import { JOBS, type Sys, type SectionKey, type Ab, type Skill } from './fifth';

type Props<K extends SectionKey> = { v: Sys[K]; set: (patch: Partial<Sys[K]>) => void; sys: Sys };

// ---------------------------------------------------------------- small pieces

export function Tog({ label, on, set, hint }: { label: string; on: boolean; set: (v: boolean) => void; hint?: string }) {
  return <label className="sm-tog"><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /><span>{label}{hint ? <small> {hint}</small> : null}</span></label>;
}
function Num({ label, v, set, min, max, step }: { label: string; v: number; set: (n: number) => void; min?: number; max?: number; step?: number }) {
  return <label>{label}<input type="number" value={v} min={min} max={max} step={step} onChange={(e) => set(Number(e.target.value))} /></label>;
}
function Sel<T extends string>({ label, v, set, opts }: { label: string; v: T; set: (v: T) => void; opts: [T, string][] }) {
  return <label>{label}<select value={v} onChange={(e) => set(e.target.value as T)}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>;
}
function Txt({ label, v, set }: { label: string; v: string; set: (v: string) => void }) {
  return <label>{label}<input value={v} onChange={(e) => set(e.target.value)} /></label>;
}
// a list of names you can add to and remove from
function Chips({ label, list, set, placeholder }: { label: string; list: string[]; set: (l: string[]) => void; placeholder?: string }) {
  const [add, setAdd] = useState('');
  const put = () => { const t = add.trim(); if (t && !list.includes(t)) set([...list, t]); setAdd(''); };
  return (
    <div className="sm-chips"><span className="sm-lab">{label}</span>
      <div className="sm-chiprow">
        {list.map((x) => <span key={x} className="sm-chip">{x}<button type="button" aria-label={'Remove ' + x} onClick={() => set(list.filter((y) => y !== x))}>✕</button></span>)}
        <input className="sm-chipadd" value={add} placeholder={placeholder ?? 'Add…'} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); put(); } }} onBlur={put} />
      </div>
    </div>
  );
}
// one number per level, in a row you can scroll
function LevelRow({ label, values, set, levels, prefix }: { label: string; values: number[]; set: (v: number[]) => void; levels: number; prefix?: string }) {
  return (
    <div className="sm-levels"><span className="sm-lab">{label}</span>
      <div className="sm-levelgrid">
        {values.slice(0, levels).map((n, i) => (
          <label key={i}><small>{prefix ?? 'Lv'} {i + 1}</small><input type="number" value={n} onChange={(e) => set(values.map((x, j) => (j === i ? Number(e.target.value) : x)))} /></label>
        ))}
      </div>
    </div>
  );
}
function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return <fieldset className="sm-card"><legend>{title}</legend>{note ? <p className="dim sm-note">{note}</p> : null}{children}</fieldset>;
}
const abOpts = (sys: Sys): [string, string][] => [['', '(none)'], ...sys.abilities.list.map((a) => [a.id, a.name] as [string, string])];

// ---------------------------------------------------------------- 1 abilities

export function Abilities({ v, set, sys }: Props<'abilities'>) {
  const put = (i: number, p: Partial<Ab>) => set({ list: v.list.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const move = (i: number, d: number) => { const l = [...v.list]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); set({ list: l }); };
  return (
    <>
      <Card title="The abilities" note="Every character has these. Add, remove, rename or reorder them. Removing one is allowed; you will see what it affects before saving.">
        <div className="sm-ablist">
          {v.list.map((a, i) => (
            <div key={a.id} className="sm-abrow">
              <input className="sm-abbr" aria-label="Short name" value={a.abbr} maxLength={4} onChange={(e) => put(i, { abbr: e.target.value.toUpperCase() })} />
              <input aria-label="Full name" value={a.name} onChange={(e) => put(i, { name: e.target.value })} />
              <input className="sm-desc" aria-label="Description" value={a.desc} onChange={(e) => put(i, { desc: e.target.value })} />
              <Tog label="Save" on={a.save} set={(s) => put(i, { save: s })} />
              <span className="sm-rowbtns">
                <button type="button" className="quiet small-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className="quiet small-btn" disabled={i === v.list.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button type="button" className="quiet small-btn" onClick={() => set({ list: v.list.filter((_, j) => j !== i) })} aria-label={'Remove ' + a.name}>✕</button>
              </span>
            </div>
          ))}
        </div>
        <button type="button" className="quiet small-btn" onClick={() => set({ list: [...v.list, { id: 'ab' + Date.now(), abbr: 'NEW', name: 'New ability', desc: '', save: true }] })}>+ Add an ability</button>
      </Card>
      <Card title="Scores">
        <div className="sm-grid3">
          <Num label="Lowest at creation" v={v.min} set={(n) => set({ min: n })} />
          <Num label="Highest at creation" v={v.max} set={(n) => set({ max: n })} />
          <Num label="Highest ever (the cap)" v={v.cap} set={(n) => set({ cap: n })} />
        </div>
        <Sel label="Modifier" v={v.mod} set={(m) => set({ mod: m })} opts={[['half', '(score − 10) ÷ 2, rounded down (fifth edition)'], ['score', 'The score is the modifier'], ['none', 'No modifier: roll under the score']]} />
      </Card>
      <Card title="Jobs" note="Some rules need an ability to lean on. Choose which ability does each job; if you remove one, pick a new one here.">
        {JOBS.map((j) => (
          <div key={j.key} className={'sm-job' + (v.jobs[j.key] && sys.abilities.list.some((a) => a.id === v.jobs[j.key]) ? '' : ' missing')}>
            <Sel label={j.label} v={sys.abilities.list.some((a) => a.id === v.jobs[j.key]) ? v.jobs[j.key] : ''} set={(id) => set({ jobs: { ...v.jobs, [j.key]: id } })} opts={abOpts(sys)} />
            <small className="dim">{j.does}</small>
          </div>
        ))}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- 2 skills

export function Skills({ v, set, sys }: Props<'skills'>) {
  const put = (i: number, p: Partial<Skill>) => set({ list: v.list.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  return (
    <>
      <Card title="The skills" note="Each skill uses one ability. Passive skills show a passive score on the sheet (10 + the bonus).">
        <div className="sm-skilllist">
          {v.list.map((s, i) => {
            const lost = !sys.abilities.list.some((a) => a.id === s.ab);
            return (
              <div key={s.id} className={'sm-skillrow' + (lost ? ' missing' : '')}>
                <input aria-label="Skill name" value={s.name} onChange={(e) => put(i, { name: e.target.value })} />
                <select aria-label="Ability" value={lost ? '' : s.ab} onChange={(e) => put(i, { ab: e.target.value })}>
                  {lost ? <option value="">(ability removed)</option> : null}
                  {sys.abilities.list.map((a) => <option key={a.id} value={a.id}>{a.abbr}</option>)}
                </select>
                <input className="sm-desc" aria-label="Description" value={s.desc} onChange={(e) => put(i, { desc: e.target.value })} />
                <Tog label="Passive" on={s.passive} set={(p) => put(i, { passive: p })} />
                <button type="button" className="quiet small-btn" onClick={() => set({ list: v.list.filter((_, j) => j !== i) })} aria-label={'Remove ' + s.name}>✕</button>
              </div>
            );
          })}
        </div>
        <button type="button" className="quiet small-btn" onClick={() => set({ list: [...v.list, { id: 'sk' + Date.now(), name: 'New skill', ab: sys.abilities.list[0]?.id ?? '', desc: '', passive: false }] })}>+ Add a skill</button>
      </Card>
      <Card title="Expertise and tools">
        <Tog label="Expertise" hint="(a bigger bonus in a few skills)" on={v.expertise} set={(e) => set({ expertise: e })} />
        {v.expertise ? <Sel label="Expertise adds" v={v.expertiseKind} set={(k) => set({ expertiseKind: k })} opts={[['double', 'Double the proficiency bonus'], ['plus2', '+2 on top of proficiency']]} /> : null}
        <Tog label="Tools work like skills" hint="(a tool check adds an ability and proficiency)" on={v.toolsAsSkills} set={(t) => set({ toolsAsSkills: t })} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- 3 proficiency

export function Proficiency({ v, set, sys }: Props<'proficiency'>) {
  return (
    <>
      <Card title="Proficiency bonus" note="Added to anything a character is proficient in.">
        <Tog label="This game has a proficiency bonus" on={v.on} set={(on) => set({ on })} />
        {v.on ? <LevelRow label="Bonus by character level" values={v.table} levels={sys.leveling.kind === 'none' ? 1 : sys.leveling.maxLevel} set={(t) => set({ table: t })} /> : null}
      </Card>
      <Card title="Categories">
        <Chips label="Armor categories" list={v.armor} set={(armor) => set({ armor })} />
        <Chips label="Weapon categories" list={v.weapons} set={(weapons) => set({ weapons })} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- 4 making a character

export function Creation({ v, set, sys }: Props<'creation'>) {
  const n = sys.abilities.list.length;
  const spentArray = v.arrayValues.length;
  return (
    <>
      <Card title="Ways to get ability scores" note="Players choose from the ones you leave on.">
        <Tog label="Roll" on={v.roll} set={(roll) => set({ roll })} />
        {v.roll ? <Sel label="Dice" v={v.rollDice} set={(rollDice) => set({ rollDice })} opts={[['4d6, drop the lowest', '4d6, drop the lowest'], ['3d6', '3d6'], ['3d6 in order', '3d6 in order (no swapping)'], ['2d6 + 6', '2d6 + 6']]} /> : null}
        <Tog label="Point buy" on={v.pointBuy} set={(pointBuy) => set({ pointBuy })} />
        {v.pointBuy ? (
          <div className="sm-indent">
            <Num label="Points to spend" v={v.budget} set={(budget) => set({ budget })} />
            <div className="sm-levelgrid">{Object.entries(v.costs).map(([s, c]) => <label key={s}><small>Score {s}</small><input type="number" value={c} onChange={(e) => set({ costs: { ...v.costs, [s]: Number(e.target.value) } })} /></label>)}</div>
          </div>
        ) : null}
        <Tog label="Standard array" on={v.array} set={(array) => set({ array })} />
        {v.array ? (
          <div className="sm-indent">
            <div className="sm-levelgrid">{v.arrayValues.map((x, i) => <label key={i}><small>#{i + 1}</small><input type="number" value={x} onChange={(e) => set({ arrayValues: v.arrayValues.map((y, j) => (j === i ? Number(e.target.value) : y)) })} /></label>)}</div>
            {spentArray !== n ? <p className="sm-warn">The array has {spentArray} numbers but there are {n} abilities. <button type="button" className="quiet small-btn" onClick={() => set({ arrayValues: Array.from({ length: n }, (_, i) => v.arrayValues[i] ?? 10) })}>Make it {n}</button></p> : null}
          </div>
        ) : null}
        <Tog label="Type them in (DM approves)" on={v.manual} set={(manual) => set({ manual })} />
      </Card>
      <Card title="Starting out">
        <Sel label="Ability increases come from" v={v.increasesFrom} set={(increasesFrom) => set({ increasesFrom })} opts={[['background', 'The background (2024 rules)'], ['species', `The ${sys.names.species.toLowerCase()} (2014 rules)`], ['none', 'Nowhere']]} />
        <div className="sm-grid3">
          <Num label="Starting level" v={v.startLevel} min={1} set={(startLevel) => set({ startLevel })} />
          <Sel label="Starting money" v={v.startGold} set={(startGold) => set({ startGold })} opts={[['equipment', 'From class and background equipment'], ['roll', 'Rolled by class'], ['fixed', 'A set amount']]} />
          {v.startGold === 'fixed' ? <Num label={`Amount (${sys.equipment.currencies.find((c) => c.rate === 100)?.abbr ?? 'gp'})`} v={v.gold} set={(gold) => set({ gold })} /> : null}
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- 5 leveling

export function Leveling({ v, set }: Props<'leveling'>) {
  const has = (l: number) => v.asiLevels.includes(l);
  return (
    <>
      <Card title="Getting stronger">
        <Sel label="How characters level up" v={v.kind} set={(kind) => set({ kind })} opts={[['xp', 'Experience points'], ['milestone', 'Story milestones (the DM says when)'], ['none', 'No levels']]} />
        {v.kind !== 'none' ? <Num label="Highest level" v={v.maxLevel} min={1} max={30} set={(maxLevel) => set({ maxLevel, xp: Array.from({ length: maxLevel }, (_, i) => v.xp[i] ?? (v.xp[v.xp.length - 1] ?? 0) + 50000 * (i - v.xp.length + 1)) })} /> : null}
        {v.kind === 'xp' ? <LevelRow label="Experience needed for each level" values={v.xp} levels={v.maxLevel} set={(xp) => set({ xp })} /> : null}
      </Card>
      {v.kind !== 'none' ? (
        <Card title="Rewards for leveling" note="Click a level to give an ability score increase (or feat) there.">
          <div className="sm-ticks">{Array.from({ length: v.maxLevel }, (_, i) => i + 1).map((l) => <button key={l} type="button" className={'sm-tick' + (has(l) ? ' on' : '')} onClick={() => set({ asiLevels: has(l) ? v.asiLevels.filter((x) => x !== l) : [...v.asiLevels, l].sort((a, b) => a - b) })}>{l}</button>)}</div>
          <Tog label="Feats can be taken instead of an increase" on={v.feats} set={(feats) => set({ feats })} />
          <Tog label="Multiclassing" on={v.multiclass} set={(multiclass) => set({ multiclass })} />
        </Card>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- 6 health and dying

export function Health({ v, set, sys }: Props<'health'>) {
  const tough = sys.abilities.list.find((a) => a.id === sys.abilities.jobs.toughness);
  return (
    <>
      <Card title="Health">
        <Sel label="Characters track" v={v.kind} set={(kind) => set({ kind })} opts={[['hp', 'Hit points'], ['wounds', 'Wounds: a few boxes to tick']]} />
        {v.kind === 'hp' ? (
          <>
            <div className="sm-grid3">
              <Sel label="At level 1" v={v.level1} set={(level1) => set({ level1 })} opts={[['max', 'Highest roll of the hit die'], ['roll', 'Roll the hit die']]} />
              <Sel label="Each level after" v={v.later} set={(later) => set({ later })} opts={[['choice', 'Player chooses: roll or take the average'], ['average', 'Always the average'], ['roll', 'Always roll']]} />
            </div>
            <p className="dim sm-note">Plus the {tough ? tough.name : '(no ability: set Toughness under Abilities)'} modifier each level.</p>
            <Tog label="Temporary hit points" on={v.temp} set={(temp) => set({ temp })} />
            <Tog label="Massive damage kills outright" on={v.massive} set={(massive) => set({ massive })} />
          </>
        ) : <Num label="Wound boxes" v={v.wounds} min={1} max={20} set={(wounds) => set({ wounds })} />}
      </Card>
      <Card title="Dying">
        <Tog label="Death saving throws" on={v.deathSaves} set={(deathSaves) => set({ deathSaves })} />
        {v.deathSaves ? <div className="sm-grid3"><Num label="Successes or failures needed" v={v.deathCount} min={1} set={(deathCount) => set({ deathCount })} /><Num label="Roll needed" v={v.deathDC} set={(deathDC) => set({ deathDC })} /></div> : null}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- 7 rests

export function Rests({ v, set, sys }: Props<'rests'>) {
  return (
    <Card title="Rests">
      <div className="sm-grid2">
        <div><Tog label="Short rest" on={v.short} set={(short) => set({ short })} />{v.short ? <Txt label="Takes" v={v.shortLength} set={(shortLength) => set({ shortLength })} /> : null}</div>
        <div><Tog label="Long rest" on={v.long} set={(long) => set({ long })} />{v.long ? <Txt label="Takes" v={v.longLength} set={(longLength) => set({ longLength })} /> : null}</div>
      </div>
      {sys.health.kind === 'hp' ? <Tog label="Spend hit dice to heal on a short rest" on={v.hitDice} set={(hitDice) => set({ hitDice })} /> : null}
      <Sel label="A long rest heals" v={v.longHeals} set={(longHeals) => set({ longHeals })} opts={[['all', 'Everything'], ['half', 'Half'], ['none', 'Nothing (healing comes from elsewhere)']]} />
      {sys.magic.on ? <Sel label="Spell slots or mana come back on" v={v.slotsBack} set={(slotsBack) => set({ slotsBack })} opts={[['long', 'A long rest'], ['short', 'A short rest']]} /> : null}
    </Card>
  );
}

// ---------------------------------------------------------------- 8 combat

export function Combat({ v, set }: Props<'combat'>) {
  const [add, setAdd] = useState('');
  return (
    <>
      <Card title="Attacks and defense">
        <div className="sm-grid3">
          <Num label="Armor Class with no armor" v={v.acBase} set={(acBase) => set({ acBase })} />
          <Num label="Critical hit on a roll of" v={v.critOn} min={2} max={20} set={(critOn) => set({ critOn })} />
          <Sel label="A critical hit" v={v.crit} set={(crit) => set({ crit })} opts={[['dice', 'Rolls the damage dice twice'], ['max', 'Max damage plus a roll'], ['none', 'Is just a hit']]} />
        </div>
        <Tog label="Flanking gives advantage" on={v.flanking} set={(flanking) => set({ flanking })} />
      </Card>
      <Card title="Conditions" note="What can happen to a creature. Each has a short rule shown when someone hovers over it.">
        <div className="sm-condlist">
          {v.conditions.map((c, i) => (
            <div key={c.name + i} className="sm-condrow">
              <input aria-label="Condition" value={c.name} onChange={(e) => set({ conditions: v.conditions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input className="sm-desc" aria-label="What it does" value={c.text} onChange={(e) => set({ conditions: v.conditions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              <button type="button" className="quiet small-btn" onClick={() => set({ conditions: v.conditions.filter((_, j) => j !== i) })} aria-label={'Remove ' + c.name}>✕</button>
            </div>
          ))}
        </div>
        <span className="inline"><input value={add} placeholder="New condition" onChange={(e) => setAdd(e.target.value)} /><button type="button" className="quiet small-btn" onClick={() => { if (add.trim()) set({ conditions: [...v.conditions, { name: add.trim(), text: '' }] }); setAdd(''); }}>+ Add</button></span>
      </Card>
      <Card title="Damage types"><Chips label="" list={v.damage} set={(damage) => set({ damage })} placeholder="Add a type…" /></Card>
    </>
  );
}

// ---------------------------------------------------------------- 9 magic

export function Magic({ v, set, sys }: Props<'magic'>) {
  const levels = sys.leveling.kind === 'none' ? 1 : sys.leveling.maxLevel;
  return (
    <>
      <Card title="Magic">
        <Tog label="This game has magic" on={v.on} set={(on) => set({ on })} />
        {v.on ? (
          <div className="sm-grid3">
            <Sel label="Spells cost" v={v.kind} set={(kind) => set({ kind })} opts={[['slots', 'Spell slots'], ['mana', 'Mana points']]} />
            <Num label="Spell levels" v={v.levels} min={1} max={12} set={(n) => set({ levels: n })} />
            <Tog label="Cantrips (free spells)" on={v.cantrips} set={(cantrips) => set({ cantrips })} />
          </div>
        ) : null}
      </Card>
      {v.on && v.kind === 'slots' ? (
        <Card title="Spell slots for a full caster" note="Half and third casters use this at half or a third of their level. Each class can still set its own table.">
          <div className="sm-slotwrap">
            <table className="sm-slots"><thead><tr><th>Level</th>{Array.from({ length: v.levels }, (_, i) => <th key={i}>{i + 1}</th>)}</tr></thead>
              <tbody>{v.slots.slice(0, levels).map((row, l) => (
                <tr key={l}><td>{l + 1}</td>{Array.from({ length: v.levels }, (_, i) => <td key={i}><input type="number" min={0} value={row[i] ?? 0} onChange={(e) => set({ slots: v.slots.map((r, j) => (j === l ? Array.from({ length: Math.max(v.levels, r.length) }, (_, k) => (k === i ? Number(e.target.value) : r[k] ?? 0)) : r)) })} /></td>)}</tr>
              ))}</tbody></table>
          </div>
        </Card>
      ) : null}
      {v.on && v.kind === 'mana' ? (
        <Card title="Mana cost by spell level">
          <LevelRow label="" prefix="Spell lv" values={Array.from({ length: v.levels }, (_, i) => v.mana[i] ?? (v.mana[v.mana.length - 1] ?? 1) + i)} levels={v.levels} set={(mana) => set({ mana })} />
        </Card>
      ) : null}
      {v.on ? (
        <Card title="Spell rules">
          <Tog label="Concentration" on={v.concentration} set={(concentration) => set({ concentration })} />
          <Tog label="Rituals" on={v.rituals} set={(rituals) => set({ rituals })} />
          <Tog label="Components (verbal, somatic, material)" on={v.components} set={(components) => set({ components })} />
          <Chips label="Schools of magic" list={v.schools} set={(schools) => set({ schools })} />
        </Card>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- 10 equipment and money

export function Equipment({ v, set, sys }: Props<'equipment'>) {
  const might = sys.abilities.list.find((a) => a.id === sys.abilities.jobs.might);
  return (
    <>
      <Card title="Money" note="Each coin is worth so many of the smallest one.">
        {v.currencies.map((c, i) => (
          <div key={i} className="sm-currow">
            <input aria-label="Coin name" value={c.name} onChange={(e) => set({ currencies: v.currencies.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <input className="sm-abbr" aria-label="Short name" value={c.abbr} onChange={(e) => set({ currencies: v.currencies.map((x, j) => (j === i ? { ...x, abbr: e.target.value } : x)) })} />
            <label className="sm-inline">worth<input type="number" min={1} value={c.rate} onChange={(e) => set({ currencies: v.currencies.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)) })} />{v.currencies[0]?.abbr}</label>
            <button type="button" className="quiet small-btn" onClick={() => set({ currencies: v.currencies.filter((_, j) => j !== i) })} aria-label={'Remove ' + c.name}>✕</button>
          </div>
        ))}
        <button type="button" className="quiet small-btn" onClick={() => set({ currencies: [...v.currencies, { name: 'New coin', abbr: 'nc', rate: 1 }] })}>+ Add a coin</button>
      </Card>
      <Card title="Carrying">
        <Sel label="How much a character can carry" v={v.carry} set={(carry) => set({ carry })} opts={[['strength', `${might ? might.name : 'Might ability'} score × a number (pounds)`], ['slots', 'Item slots'], ['none', 'Not tracked']]} />
        {v.carry === 'strength' ? <Num label="Multiplier" v={v.carryMult} set={(carryMult) => set({ carryMult })} /> : null}
        {v.carry !== 'none' ? <Tog label="Slowed when carrying too much (encumbrance)" on={v.encumbrance} set={(encumbrance) => set({ encumbrance })} /> : null}
      </Card>
      <Card title="Weapons">
        <Chips label="Weapon properties" list={v.props} set={(props) => set({ props })} />
        <Tog label="Weapon masteries" on={v.masteries} set={(masteries) => set({ masteries })} />
        {v.masteries ? <Chips label="Masteries" list={v.masteryList} set={(masteryList) => set({ masteryList })} /> : null}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- 11 character details

export function Details({ v, set }: Props<'details'>) {
  return (
    <>
      <Card title="Who a character is">
        <Tog label="Alignment" on={v.alignment} set={(alignment) => set({ alignment })} />
        {v.alignment ? <Chips label="Alignments" list={v.alignments} set={(alignments) => set({ alignments })} /> : null}
        <Sel label="Inspiration" v={v.inspiration} set={(inspiration) => set({ inspiration })} opts={[['heroic', 'Heroic Inspiration: reroll any die (2024)'], ['classic', 'Inspiration: advantage on one roll (2014)'], ['off', 'None']]} />
      </Card>
      <Card title="Lists">
        <Chips label="Languages" list={v.languages} set={(languages) => set({ languages })} />
        <Chips label="Sizes" list={v.sizes} set={(sizes) => set({ sizes })} />
        <Chips label="Creature types" list={v.creatureTypes} set={(creatureTypes) => set({ creatureTypes })} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- 12 trackers

export function Trackers({ v, set }: Props<'trackers'>) {
  const put = (i: number, p: Partial<Sys['trackers']['list'][number]>) => set({ list: v.list.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  return (
    <Card title="Trackers" note="New things this game keeps count of, shown on every character's sheet: Sanity, Stress, Honor, Corruption...">
      {v.list.length ? null : <p className="dim">None yet.</p>}
      {v.list.map((t, i) => (
        <div key={t.id} className="sm-tracker">
          <div className="sm-grid3">
            <Txt label="Name" v={t.name} set={(name) => put(i, { name })} />
            <Num label="Maximum" v={t.max} min={1} set={(max) => put(i, { max })} />
            <Sel label="Looks like" v={t.look} set={(look) => put(i, { look })} opts={[['bar', 'A number (like hit points)'], ['boxes', 'Boxes to tick']]} />
            <Sel label="Refills on" v={t.refill} set={(refill) => put(i, { refill })} opts={[['long', 'A long rest'], ['short', 'A short rest'], ['never', 'Never (the DM changes it)']]} />
          </div>
          <Txt label="What it means" v={t.desc} set={(desc) => put(i, { desc })} />
          <button type="button" className="quiet small-btn" onClick={() => set({ list: v.list.filter((_, j) => j !== i) })}>Remove {t.name || 'tracker'}</button>
        </div>
      ))}
      <p className="inline">
        <button type="button" className="quiet small-btn" onClick={() => set({ list: [...v.list, { id: 't' + Date.now(), name: 'Sanity', max: 50, look: 'bar', refill: 'never', desc: 'Drops when facing horrors. At 0, the character breaks.' }] })}>+ Sanity</button>
        <button type="button" className="quiet small-btn" onClick={() => set({ list: [...v.list, { id: 't' + Date.now(), name: 'Stress', max: 6, look: 'boxes', refill: 'short', desc: 'Fills under pressure. Full means a breakdown.' }] })}>+ Stress</button>
        <button type="button" className="quiet small-btn" onClick={() => set({ list: [...v.list, { id: 't' + Date.now(), name: 'New tracker', max: 10, look: 'bar', refill: 'long', desc: '' }] })}>+ Blank tracker</button>
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------- 13 names of things

const KINDS: [string, string][] = [['species', 'Species'], ['class', 'Class'], ['subclass', 'Subclass'], ['background', 'Background'], ['feat', 'Feat'], ['spell', 'Spell'], ['item', 'Item'], ['monster', 'Monster'], ['resource', 'Custom resource']];
export function Names({ v, set, sys }: Props<'names'>) {
  const renamable = ['species', 'class', 'subclass', 'background', 'feat', 'spell'] as const;
  return (
    <Card title="Kinds of homebrew" note="Rename them for your game, or switch off the ones it does not have. Switched-off kinds disappear from the Homebrew page and the character creator.">
      {KINDS.map(([k, label]) => (
        <div key={k} className="sm-kindrow">
          <Tog label={label} on={v.kinds[k] && !(k === 'spell' && !sys.magic.on)} set={(on) => set({ kinds: { ...v.kinds, [k]: on } })} hint={k === 'spell' && !sys.magic.on ? '(off: magic is off)' : undefined} />
          {(renamable as readonly string[]).includes(k) ? <input aria-label={'Name for ' + label} value={v[k as (typeof renamable)[number]]} onChange={(e) => set({ [k]: e.target.value } as Partial<Sys['names']>)} /> : <span />}
        </div>
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------- 14 monsters

export function Monsters({ v, set }: Props<'monsters'>) {
  return (
    <>
      <Card title="Challenge">
        <Tog label="Challenge rating" hint="(how tough a monster is)" on={v.cr} set={(cr) => set({ cr })} />
        {v.cr ? (
          <div className="sm-crgrid">{v.crXp.map(([cr, xp], i) => <label key={cr}><small>CR {cr}</small><input type="number" value={xp} onChange={(e) => set({ crXp: v.crXp.map((x, j) => (j === i ? [x[0], Number(e.target.value)] : x)) })} /></label>)}</div>
        ) : null}
        {v.cr ? <p className="dim sm-note">Experience points a monster of each rating is worth.</p> : null}
      </Card>
      <Card title="Stat blocks">
        <Tog label="Legendary actions" on={v.legendary} set={(legendary) => set({ legendary })} />
        <Tog label="Lair actions" on={v.lair} set={(lair) => set({ lair })} />
      </Card>
    </>
  );
}
