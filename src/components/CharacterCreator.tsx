'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ABILITIES, SKILLS, blankV2, derive, partsOf, pickKey, scaleAt, sgn, type Ability, type CharacterV2, type Entity } from '@/lib/rules/engine';
import { LANGUAGE_GROUPS } from '@/config/proficiencies';
import { pkgLine, type Pkg } from '@/lib/class-equip';
import { guessChoice } from './ClassGives';
import { isMarker } from './ClassFeatures';
import { EntityCard } from './EntityCard';

// The character creator: one step at a time, like most character builders. Every pick is saved to the
// character as it is made (the same row the sheet reads), and the sheet works the rest out (derive).
//   Class (level, subclass, skills, class choices) · Background (ability increases, Origin feat) ·
//   Species (its choices) · Abilities (standard array, point buy or rolled) · Equipment · Spells ·
//   Details (name, languages, alignment, look, story) · Review

type Weapon = { name: string; mastery: string; cat: string };
const AB = Object.fromEntries(ABILITIES) as Record<Ability, string>;
const ARRAY = [15, 14, 13, 12, 10, 8];
const COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const ALIGNMENTS = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned'];
const SKILL_NAMES = SKILLS.map(([n]) => n);
const first = (s: string, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n).replace(/\s\S*$/, '') + '…' : t; };
const lc = (s: unknown) => String(s ?? '').toLowerCase().trim();

export function CharacterCreator({ slug, character, entities, weapons }: { slug: string; character: { id: string; data: any }; entities: Entity[]; weapons: Weapon[] }) {
  const router = useRouter();
  const [c, setC] = useState<CharacterV2>(() => ({ ...blankV2(), ...(character.data ?? {}), v: 2 }));
  const [state, setState] = useState('');
  const latest = useRef(c);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const of = (t: string) => entities.filter((e) => e.type === t).sort((a, b) => a.name.localeCompare(b.name));
  const d = useMemo(() => derive(c, entities), [c, entities]);

  const flush = async () => {
    timer.current = null;
    const { error } = await supabaseBrowser().from('characters').update({ data: { ...latest.current, t: Date.now() } }).eq('id', character.id);
    setState(error ? 'Not saved. Check your connection.' : 'Saved.');
    return !error;
  };
  const up = (patch: Partial<CharacterV2>) => {
    const next = { ...latest.current, ...patch };
    next.race = next.raceId ? byId.get(next.raceId)?.name ?? '' : '';
    next.cls = next.clsId ? byId.get(next.clsId)?.name ?? '' : '';
    latest.current = next;
    setC(next);
    setState('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void flush(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cls = c.clsId ? byId.get(c.clsId) : undefined;
  const bg = c.bgId ? byId.get(c.bgId) : undefined;
  const race = c.raceId ? byId.get(c.raceId) : undefined;
  const casting = cls?.data.casting?.kind && cls.data.casting.kind !== 'none' ? cls.data.casting : null;
  const steps = ['Class', 'Background', 'Species', 'Abilities', 'Equipment', ...(casting ? ['Spells'] : []), 'Details', 'Review'];
  const [step, setStep] = useState(0);
  const at = steps[Math.min(step, steps.length - 1)];
  const go = (i: number) => { setStep(Math.max(0, Math.min(steps.length - 1, i))); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // ------------------------------------------------------------ choices inside features
  const picks = c.picks ?? {};
  const setPick = (key: string, from: string, v: string[]) => up({ picks: { ...picks, [key]: { from, v } } });
  const choiceOf = (e: Entity, ft: any) => {
    const ch = e.type === 'class' || e.type === 'subclass' ? guessChoice(ft) : ft.choice ?? null;
    // a background's Origin feat for one spell list (Magic Initiate (Cleric)) offers that list's spells
    const note = String(byId.get(c.bgId ?? '')?.data.feat?.name ?? '').toLowerCase() === lc(e.name) ? String(byId.get(c.bgId ?? '')?.data.feat?.note ?? '') : '';
    return ch && ch.from === 'spells' && note && (ch.spell?.lists ?? []).map(lc).includes(lc(note)) ? { ...ch, spell: { ...ch.spell, lists: [note] } } : ch;
  };
  // what a feat does in a line: its description, or its benefits' names when it only says "the following benefits"
  const featLine = (f: Entity) => (/following benefits/i.test(f.data.desc ?? '') || !f.data.desc ? (f.data.benefits ?? []).map((b: any) => b.name).join(', ') : first(f.data.desc, 140));
  const countOf = (ft: any, ch: any) => {
    if (!ch?.byGrows) return Number(ch?.count) || 1;
    const g = (ft.effects ?? []).find((x: any) => x.t === 'scale');
    return Number(g ? scaleAt(g.steps, c.level) : ch.count) || 1;
  };
  const spellsFor = (ch: any) => {
    const sp = ch.spell ?? {};
    const lists: string[] = sp.lists?.length ? sp.lists : sp.any || !cls ? [] : [cls.name];
    return of('spell').filter((s) => (sp.level === '' || sp.level === undefined ? true : Number(s.data.level) === Number(sp.level))
      && (!sp.ritual || s.data.ritual) && (!lists.length || (s.data.classes ?? []).some((x: string) => lists.map(lc).includes(lc(x)))));
  };
  // the options a choice offers: [value saved, label, note]
  const optionsFor = (e: Entity, ft: any, ch: any): [string, string, string][] => {
    const from = String(ch.from ?? '');
    if (from === 'custom' || from === 'same') {
      const opts: any[] = ch.options?.length ? ch.options : partsOf(e).find((x: any) => x.name === ft.name && x.choice?.options?.length)?.choice?.options ?? [];
      return opts.filter((o) => !Number(o.minLevel) || Number(o.minLevel) <= c.level).map((o) => [o.name, o.name, first(o.text, 140)]);
    }
    if (from.startsWith('feat:')) return of('feat').filter((f) => lc(f.data.category) === lc(from.slice(5))).map((f) => [f.id, f.name, featLine(f)]);
    if (from === 'skills') return d.skills.filter((s) => s.proficient).map((s) => [s.name, s.name, '']);
    if (from === 'anyskill') return SKILL_NAMES.filter((n) => !d.skills.find((s) => s.name === n)?.proficient || (picks[pickKey(e, ft)]?.v ?? []).includes(n)).map((n) => [n, n, '']);
    if (from === 'weapons') return weapons.map((w) => [w.name, w.name, `${w.mastery}${w.cat ? ' · ' + w.cat : ''}`]);
    if (from === 'spells') return spellsFor(ch).map((s) => [s.id, s.name, Number(s.data.level) ? `Level ${s.data.level} ${s.data.school ?? ''}` : `Cantrip ${s.data.school ?? ''}`]);
    return [];
  };
  const choiceParts = (e: Entity | undefined) => (e ? partsOf(e).filter((ft: any) => (Number(ft.level) || 1) <= c.level).map((ft: any) => ({ ft, ch: choiceOf(e, ft) })).filter((x: any) => x.ch && !isMarker(x.ft)) : []);
  const choices = (e: Entity | undefined): ReactNode => {
    const list = choiceParts(e);
    if (!e || !list.length) return null;
    return (
      <>
        {list.map(({ ft, ch }: any) => {
          const key = pickKey(e, ft), n = countOf(ft, ch), have = picks[key]?.v ?? [];
          const opts = optionsFor(e, ft, ch);
          const toggle = (v: string, on: boolean) => setPick(key, ch.from, on ? (n === 1 ? [v] : [...have, v].slice(-n)) : have.filter((x) => x !== v));
          const many = opts.length > 14;
          return (
            <fieldset key={key} className="cc-choice">
              <legend>{ft.name} <span className={'chip' + (have.length >= n ? ' done' : '')}>{have.length}/{n}</span></legend>
              {ft.text ? <p className="dim">{first(ft.text, 260)}</p> : null}
              {!opts.length ? <p className="dim">There is nothing to choose from here yet. Ask your DM.</p> : many ? (
                <ManyPicker opts={opts} have={have} n={n} onToggle={toggle} />
              ) : (
                <div className="cc-opts">
                  {opts.map(([v, label, note]) => (
                    <label key={v} className={'cc-opt' + (have.includes(v) ? ' on' : '')}>
                      <input type={n === 1 ? 'radio' : 'checkbox'} name={key} checked={have.includes(v)} onChange={(ev) => toggle(v, ev.target.checked)} />
                      <span><b>{label}</b>{note ? <small>{note}</small> : null}</span>
                    </label>
                  ))}
                </div>
              )}
              {String(ch.from).startsWith('feat:') ? have.map((id) => <div key={id}>{choices(byId.get(id))}</div>) : null}
            </fieldset>
          );
        })}
      </>
    );
  };

  // ------------------------------------------------------------ the steps
  const cards = ({ type, value, onPick, line }: { type: string; value: string | null | undefined; onPick: (id: string) => void; line: (e: Entity) => string }) => (
    <div className="cc-cards">
      {of(type).map((e) => (
        <button key={e.id} type="button" className={'cc-card' + (value === e.id ? ' on' : '')} aria-pressed={value === e.id} onClick={() => onPick(e.id)}>
          <b>{e.name}</b>{e.source !== 'srd' ? <span className="chip">homebrew</span> : null}
          <small>{line(e)}</small>
        </button>
      ))}
      {!of(type).length ? <p className="dim">Your DM has not made any available.</p> : null}
    </div>
  );

  const subLevel = cls ? Number((cls.data.features ?? []).find((f: any) => isMarker(f))?.level) || 3 : 3;
  const subs = of('subclass').filter((s) => cls && (lc(s.data.parent) === lc(cls.name) || lc(s.data.parent) === lc(cls.data.baseClass)));
  const bgSkills = new Set<string>(bg?.data.skills ?? []);

  const classStep = (
    <>
      <div className="cc-row">
        <label className="f">Starting level<select value={c.level} onChange={(e) => up({ level: Number(e.target.value) })}>{Array.from({ length: 20 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
        <p className="dim">Most campaigns start at level 1. Your DM will tell you if yours starts higher.</p>
      </div>
      {cards({ type: "class", value: c.clsId, line: (e) => [e.data.hd ? `d${e.data.hd} hit die` : '', e.data.primary ? `Main ability: ${e.data.primary}` : ''].filter(Boolean).join(' · '), onPick: (id) => up({ clsId: id, subId: null, skills: [], spells: [] }) })}
      {cls ? (
        <div className="cc-detail">
          <h3>{cls.name}</h3>
          {cls.data.desc ? <p>{first(cls.data.desc, 400)}</p> : null}
          <p className="kv"><b>Hit points:</b> {cls.data.hd} + Constitution modifier at level 1 · <b>Saving throws:</b> {(cls.data.saves ?? []).map((s: Ability) => AB[s]).join(', ')}</p>
          <p className="kv"><b>Armor:</b> {cls.data.armor || 'None'} · <b>Weapons:</b> {cls.data.weapons || 'None'}</p>
          {Number(cls.data.skillCount) ? (
            <fieldset className="cc-choice">
              <legend>Skills <span className={'chip' + ((c.skills ?? []).length >= Number(cls.data.skillCount) ? ' done' : '')}>{(c.skills ?? []).length}/{cls.data.skillCount}</span></legend>
              <div className="cc-opts">
                {((cls.data.skillList ?? []).length ? cls.data.skillList : SKILL_NAMES).map((s: string) => {
                  const on = (c.skills ?? []).includes(s), fromBg = bgSkills.has(s);
                  return (
                    <label key={s} className={'cc-opt' + (on ? ' on' : '')}>
                      <input type="checkbox" checked={on} disabled={fromBg || (!on && (c.skills ?? []).length >= Number(cls.data.skillCount))} onChange={(e) => up({ skills: e.target.checked ? [...(c.skills ?? []), s] : (c.skills ?? []).filter((x) => x !== s) })} />
                      <span><b>{s}</b>{fromBg ? <small>from your background</small> : null}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          {choices(cls)}
          {c.level >= subLevel ? (
            <>
              <h3>Subclass</h3>
              {subs.length ? cards({ type: "subclass", value: c.subId, line: (e) => first(e.data.desc, 120), onPick: (id) => up({ subId: id }) }) : <p className="dim">No {cls.name} subclasses are available.</p>}
              {choices(c.subId ? byId.get(c.subId) : undefined)}
            </>
          ) : <p className="dim">You choose your subclass at level {subLevel}.</p>}
          <details><summary>Everything {cls.name}s get</summary><EntityCard type="class" name={cls.name} source={cls.source} data={cls.data} compact /></details>
        </div>
      ) : null}
    </>
  );

  // a background's three abilities: +2 and +1, or +1 to each
  const bgAbs: Ability[] = bg?.data.abilities ?? [];
  const mine = (bg && c.abPicks?.[bg.id]) || [];
  const plus = (a: Ability) => mine.filter((x) => x === a).length;
  const mode = mine.length === 3 && new Set(mine).size === 3 ? 'three' : 'two';
  const setBgAb = (picks3: Ability[]) => bg && up({ abPicks: { ...(c.abPicks ?? {}), [bg.id]: picks3 } });
  const backgroundStep = (
    <>
      {cards({ type: "background", value: c.bgId, line: (e) => [(e.data.abilities ?? []).map((a: Ability) => AB[a]?.slice(0, 3)).join(', '), e.data.feat?.name, (e.data.skills ?? []).join(', ')].filter(Boolean).join(' · '), onPick: (id) => up({ bgId: id, skills: (c.skills ?? []).filter((s) => !(byId.get(id)?.data.skills ?? []).includes(s)) }) })}
      {bg ? (
        <div className="cc-detail">
          <h3>{bg.name}</h3>
          {bg.data.desc ? <p>{first(bg.data.desc, 400)}</p> : null}
          <p className="kv"><b>Skills:</b> {(bg.data.skills ?? []).join(', ') || 'None'} · <b>Tools:</b> {bg.data.toolProfs || 'None'}</p>
          {bgAbs.length ? (
            <fieldset className="cc-choice">
              <legend>Ability score increases <span className={'chip' + (mine.length === 3 ? ' done' : '')}>{mine.length === 3 ? 'done' : 'choose'}</span></legend>
              <p className="inline">
                <button type="button" className={'small-btn' + (mode === 'two' ? '' : ' quiet')} onClick={() => setBgAb([])}>+2 to one, +1 to another</button>
                <button type="button" className={'small-btn' + (mode === 'three' ? '' : ' quiet')} onClick={() => setBgAb([...bgAbs])}>+1 to all three</button>
              </p>
              {mode === 'two' ? (
                <div className="cc-row">
                  <label className="f">+2 to<select value={mine.find((a) => plus(a) === 2) ?? ''} onChange={(e) => { const two = e.target.value as Ability; const one = mine.find((a) => plus(a) === 1 && a !== two); setBgAb(two ? [two, two, ...(one ? [one] : [])] : one ? [one] : []); }}><option value="">Choose…</option>{bgAbs.map((a) => <option key={a} value={a}>{AB[a]}</option>)}</select></label>
                  <label className="f">+1 to<select value={mine.find((a) => plus(a) === 1) ?? ''} onChange={(e) => { const one = e.target.value as Ability; const two = mine.find((a) => plus(a) === 2); setBgAb([...(two ? [two, two] : []), ...(one && one !== two ? [one] : [])]); }}><option value="">Choose…</option>{bgAbs.map((a) => <option key={a} value={a}>{AB[a]}</option>)}</select></label>
                </div>
              ) : <p className="dim">{bgAbs.map((a) => AB[a]).join(', ')} each go up by 1.</p>}
              <p className="dim">No score can go above 20 this way.</p>
            </fieldset>
          ) : null}
          {bg.data.feat?.name ? (
            <>
              <h3>Origin feat: {bg.data.feat.name}{bg.data.feat.note ? <small className="dim"> ({bg.data.feat.note})</small> : null}</h3>
              {(() => { const f = entities.find((x) => x.type === 'feat' && lc(x.name) === lc(bg.data.feat.name)); return f ? <><p className="dim">{featLine(f)}</p>{choices(f)}</> : <p className="dim">Ask your DM about this feat: it is not available in this campaign.</p>; })()}
            </>
          ) : null}
          {choices(bg)}
        </div>
      ) : null}
    </>
  );

  const speciesStep = (
    <>
      {cards({ type: "race", value: c.raceId, line: (e) => [e.data.size, e.data.speed ? `${e.data.speed} ft speed` : '', (e.data.features ?? []).slice(0, 3).map((f: any) => f.name).join(', ')].filter(Boolean).join(' · '), onPick: (id) => up({ raceId: id }) })}
      {race ? (
        <div className="cc-detail">
          <h3>{race.name}</h3>
          {race.data.desc ? <p>{first(race.data.desc, 400)}</p> : null}
          <p className="kv"><b>Size:</b> {race.data.size || 'Medium'} · <b>Speed:</b> {race.data.speed || 30} feet · <b>Creature type:</b> {race.data.type || 'Humanoid'}</p>
          {(race.data.features ?? []).filter((f: any) => (Number(f.level) || 1) <= c.level && !f.choice).map((f: any, i: number) => <details key={i} className="s5-item"><summary><b>{f.name}</b></summary><p>{f.text}</p></details>)}
          {choices(race)}
        </div>
      ) : null}
    </>
  );

  // ability scores: standard array, point buy or rolled (typed in)
  const [method, setMethod] = useState<'array' | 'buy' | 'manual'>(() => (Object.values(c.ab).every((v) => v === 10) ? 'array' : Object.values(c.ab).every((v) => v >= 8 && v <= 15) && Object.values(c.ab).reduce((n, v) => n + (COST[v] ?? 0), 0) <= 27 && !ARRAY.every((v) => Object.values(c.ab).includes(v)) ? 'buy' : Object.values(c.ab).slice().sort((a, b) => b - a).join() === ARRAY.join() ? 'array' : 'manual'));
  const spent = ABILITIES.reduce((n, [k]) => n + (COST[c.ab[k]] ?? 99), 0);
  const used = (k: Ability) => ABILITIES.filter(([x]) => x !== k).map(([x]) => c.ab[x]);
  const abilityStep = (
    <>
      <p className="inline">
        {([['array', 'Standard array'], ['buy', 'Point buy'], ['manual', 'Rolled or typed in']] as const).map(([k, l]) => (
          <button key={k} type="button" className={'small-btn' + (method === k ? '' : ' quiet')} onClick={() => { setMethod(k); if (k === 'buy') up({ ab: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } }); if (k === 'array') up({ ab: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }); }}>{l}</button>
        ))}
      </p>
      <p className="dim">{method === 'array' ? 'Give each of 15, 14, 13, 12, 10 and 8 to one ability.' : method === 'buy' ? `Every score starts at 8; raising one costs points (up to 15). ${27 - spent} of 27 points left.` : 'Roll 4d6 and drop the lowest die, six times, or type in the scores your DM gave you.'}</p>
      {cls?.data.primary ? <p className="dim">Tip: {cls.name}s rely most on {cls.data.primary}.</p> : null}
      <div className="cc-abs">
        {ABILITIES.map(([k, label]) => {
          const bonus = d.scores[k] - c.ab[k];
          return (
            <div key={k} className="cc-ab">
              <b>{label}</b>
              {method === 'array' ? (
                <select value={ARRAY.includes(c.ab[k]) && !used(k).includes(c.ab[k]) ? c.ab[k] : ''} onChange={(e) => up({ ab: { ...c.ab, [k]: Number(e.target.value) || 10 } })}>
                  <option value="">—</option>
                  {ARRAY.filter((v) => !used(k).includes(v) || v === c.ab[k]).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : method === 'buy' ? (
                <span className="s5-hp"><button type="button" disabled={c.ab[k] <= 8} onClick={() => up({ ab: { ...c.ab, [k]: c.ab[k] - 1 } })}>−</button><b>{c.ab[k]}</b><button type="button" disabled={c.ab[k] >= 15 || spent - (COST[c.ab[k]] ?? 0) + (COST[c.ab[k] + 1] ?? 99) > 27} onClick={() => up({ ab: { ...c.ab, [k]: c.ab[k] + 1 } })}>+</button></span>
              ) : (
                <input type="number" min={3} max={20} value={c.ab[k]} onChange={(e) => up({ ab: { ...c.ab, [k]: Math.max(1, Math.min(30, Number(e.target.value) || 10)) } })} />
              )}
              <small>{bonus ? `${sgn(bonus)} from your choices = ` : ''}<b>{d.scores[k]}</b> ({sgn(d.mods[k])})</small>
            </div>
          );
        })}
      </div>
    </>
  );

  // equipment: a package from the class and one from the background
  const equip = (picks['equip:class']?.v ?? [])[0], equipBg = (picks['equip:bg']?.v ?? [])[0];
  const pkgs = (e: Entity | undefined): Pkg[] => (e?.data.startEquip ?? []).filter((p: Pkg) => p.items?.some((i) => i.name) || Number(p.gp) > 0);
  const gearOf = (p?: Pkg) => (p ? p.items.filter((i) => i.name).map((i) => (Number(i.count) > 1 ? `${i.count} × ${i.name}` : i.name)) : []);
  const setEquip = (which: 'class' | 'bg', idx: string) => {
    const next = { ...picks, ['equip:' + which]: { from: 'equip', v: [idx] } };
    const cp = pkgs(cls)[Number((next['equip:class']?.v ?? [])[0])], bp = pkgs(bg)[Number((next['equip:bg']?.v ?? [])[0])];
    up({ picks: next, gear: [...gearOf(cp), ...gearOf(bp)].join('\n'), gp: (Number(cp?.gp) || 0) + (Number(bp?.gp) || 0) });
  };
  const pkgPick = (e: Entity | undefined, which: 'class' | 'bg', value?: string) => (e && pkgs(e).length ? (
    <fieldset className="cc-choice">
      <legend>From your {which === 'class' ? 'class' : 'background'} ({e.name}) <span className={'chip' + (value !== undefined ? ' done' : '')}>{value !== undefined ? 'done' : 'choose'}</span></legend>
      <div className="cc-opts one">
        {pkgs(e).map((p, i) => <label key={i} className={'cc-opt' + (value === String(i) ? ' on' : '')}><input type="radio" name={'eq' + which} checked={value === String(i)} onChange={() => setEquip(which, String(i))} /><span><b>Option {'ABCDEFGH'[i]}</b><small>{pkgLine(p)}</small></span></label>)}
      </div>
    </fieldset>
  ) : null);
  const equipmentStep = (
    <>
      {!cls && !bg ? <p className="dim">Pick a class and a background first.</p> : null}
      {pkgPick(cls, 'class', equip)}
      {pkgPick(bg, 'bg', equipBg)}
      {c.gear || c.gp ? <div className="cc-detail"><h3>You start with</h3><p style={{ whiteSpace: 'pre-line' }}>{c.gear}</p>{c.gp ? <p><b>{c.gp} GP</b></p> : null}<p className="dim">You can change your gear on your sheet later.</p></div> : null}
    </>
  );

  // spells: cantrips and prepared spells from the class's list
  const lvl = Math.max(1, Math.min(20, c.level)) - 1;
  const maxSpell = d.casting ? d.casting.slots.length : 0;
  const classSpells = of('spell').filter((s) => cls && (Array.isArray(cls.data.spellList) && cls.data.spellList.length ? cls.data.spellList.includes(s.id) : (s.data.classes ?? []).map(lc).includes(lc(cls.data.baseClass || cls.name))));
  const nCantrips = Number(casting?.cantrips?.[lvl]) || 0, nPrepared = Number(casting?.prepared?.[lvl]) || 0;
  const mySpells = (c.spells ?? []).map((id) => byId.get(id)).filter(Boolean) as Entity[];
  const haveC = mySpells.filter((s) => !Number(s.data.level)).length, haveP = mySpells.filter((s) => Number(s.data.level) > 0).length;
  const spellsStep = (
    <>
      {d.casting ? <p className="kv"><b>Spellcasting ability:</b> {AB[d.casting.ability]} · <b>Save DC:</b> {d.casting.dc} · <b>Spell attack:</b> {sgn(d.casting.attack)} · <b>Slots:</b> {d.casting.slots.map((n, i) => `${n} level ${i + 1}`).join(', ') || 'none yet'}</p> : null}
      {[['Cantrips', 0, nCantrips, haveC], ['Prepared spells', 1, nPrepared, haveP]].map(([label, lv, n, have]) => {
        const list = classSpells.filter((s) => (lv === 0 ? !Number(s.data.level) : Number(s.data.level) >= 1 && Number(s.data.level) <= maxSpell)).sort((a, b) => Number(a.data.level) - Number(b.data.level) || a.name.localeCompare(b.name));
        if (!list.length) return null;
        return (
          <fieldset key={String(label)} className="cc-choice">
            <legend>{label} {Number(n) ? <span className={'chip' + (Number(have) >= Number(n) ? ' done' : '')}>{have}/{n}</span> : null}</legend>
            <ManyPicker opts={list.map((s) => [s.id, s.name, `${Number(s.data.level) ? 'Level ' + s.data.level : 'Cantrip'} ${s.data.school ?? ''}`])} have={(c.spells ?? []).filter((id) => list.some((s) => s.id === id))} n={Number(n) || 99}
              onToggle={(v, on) => up({ spells: on ? [...(c.spells ?? []), v] : (c.spells ?? []).filter((x) => x !== v) })} />
          </fieldset>
        );
      })}
      {d.granted.length ? <p className="dim">You also always have: {d.granted.map((g) => g.name).join(', ')}.</p> : null}
    </>
  );

  // languages: Common and two more (2024 rules), plus any the species or background gives
  const langs = c.langs ?? [];
  const detailsStep = (
    <>
      <div className="cc-row">
        <label className="f">Character name<input value={c.name} maxLength={80} onChange={(e) => up({ name: e.target.value })} placeholder="What everyone calls them" /></label>
        <label className="f">Alignment<select value={c.alignment ?? ''} onChange={(e) => up({ alignment: e.target.value })}><option value="">Choose…</option>{ALIGNMENTS.map((a) => <option key={a}>{a}</option>)}</select></label>
      </div>
      <fieldset className="cc-choice">
        <legend>Languages <span className={'chip' + (langs.length >= 3 ? ' done' : '')}>{langs.length}/3</span></legend>
        <p className="dim">You know Common and two more languages of your choice.{race?.data.languages ? ` Your species also gives: ${race.data.languages}.` : ''}{bg?.data.languages ? ` Your background gives: ${bg.data.languages}.` : ''}</p>
        {Object.entries(LANGUAGE_GROUPS).filter(([g]) => g !== 'Secret').map(([g, list]) => (
          <div key={g}><span className="sr-label">{g}</span>
            <div className="cc-opts">{list.map((l) => <label key={l} className={'cc-opt' + (langs.includes(l) ? ' on' : '')}><input type="checkbox" checked={langs.includes(l)} disabled={l === 'Common' || (!langs.includes(l) && langs.length >= 3)} onChange={(e) => up({ langs: e.target.checked ? [...langs, l] : langs.filter((x) => x !== l) })} /><span><b>{l}</b></span></label>)}</div>
          </div>
        ))}
      </fieldset>
      <label className="f">What they look like<textarea rows={3} value={c.appearance ?? ''} onChange={(e) => up({ appearance: e.target.value })} /></label>
      <label className="f">Their story<textarea rows={5} value={c.backstory ?? ''} onChange={(e) => up({ backstory: e.target.value })} placeholder="Where they come from, what they want, and why they are on this adventure." /></label>
    </>
  );
  useEffect(() => { if (!(c.langs ?? []).includes('Common')) up({ langs: ['Common', ...(c.langs ?? [])] }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // what is still missing, for the review step and the step tabs
  const todo: [string, string][] = [];
  if (!cls) todo.push(['Class', 'Choose a class.']);
  if (cls && (c.skills ?? []).length < Number(cls.data.skillCount || 0)) todo.push(['Class', `Choose ${Number(cls.data.skillCount) - (c.skills ?? []).length} more skill${Number(cls.data.skillCount) - (c.skills ?? []).length > 1 ? 's' : ''}.`]);
  if (cls && c.level >= subLevel && subs.length && !c.subId) todo.push(['Class', 'Choose a subclass.']);
  if (!bg) todo.push(['Background', 'Choose a background.']);
  if (bg && bgAbs.length && mine.length < 3) todo.push(['Background', 'Choose your ability score increases.']);
  if (!race) todo.push(['Species', 'Choose a species.']);
  const stepOf = (e: Entity) => (e.type === 'race' ? 'Species' : e.type === 'background' ? 'Background' : e.type === 'feat' ? (e.name.toLowerCase() === lc(bg?.data.feat?.name) ? 'Background' : 'Species') : 'Class');
  d.chosen.forEach((e) => choiceParts(e).forEach(({ ft, ch }: any) => { if ((picks[pickKey(e, ft)]?.v ?? []).length < countOf(ft, ch) && optionsFor(e, ft, ch).length) todo.push([stepOf(e), `${e.name}: choose ${ft.name}.`]); }));
  if (method === 'array' && Object.values(c.ab).slice().sort((a, b) => b - a).join() !== ARRAY.join()) todo.push(['Abilities', 'Give every ability a score.']);
  if (method === 'buy' && spent > 27) todo.push(['Abilities', 'You spent more than 27 points.']);
  if (pkgs(cls).length && equip === undefined) todo.push(['Equipment', 'Choose your class equipment.']);
  if (pkgs(bg).length && equipBg === undefined) todo.push(['Equipment', 'Choose your background equipment.']);
  if (casting && nCantrips && haveC < nCantrips) todo.push(['Spells', `Choose ${nCantrips - haveC} more cantrip${nCantrips - haveC > 1 ? 's' : ''}.`]);
  if (casting && nPrepared && haveP < nPrepared) todo.push(['Spells', `Choose ${nPrepared - haveP} more spell${nPrepared - haveP > 1 ? 's' : ''}.`]);
  if (!c.name.trim()) todo.push(['Details', 'Give your character a name.']);
  if (langs.length < 3) todo.push(['Details', 'Choose your languages.']);

  const [finishing, setFinishing] = useState(false);
  const finish = async () => {
    setFinishing(true);
    latest.current = { ...latest.current, built: true, hp: null };
    setC(latest.current);
    if (timer.current) clearTimeout(timer.current);
    if (await flush()) router.push(`/c/${slug}/sheet?c=${character.id}`);
    else setFinishing(false);
  };
  const reviewStep = (
    <>
      {todo.length ? (
        <div className="cc-detail"><h3>Still to do</h3><ul>{todo.map(([s, t], i) => <li key={i}><button type="button" className="linkish" onClick={() => go(steps.indexOf(s))}>{s}</button>: {t}</li>)}</ul><p className="dim">You can finish anyway and fill these in on your sheet.</p></div>
      ) : <p className="dim">Everything is chosen.</p>}
      <div className="cc-detail">
        <h3>{c.name || 'Unnamed character'} <small className="dim">Level {d.level} {race?.name} {cls?.name}{c.subId ? ` (${byId.get(c.subId)?.name})` : ''}</small></h3>
        <p className="kv"><b>Background:</b> {bg?.name ?? '—'}{c.alignment ? ` · ${c.alignment}` : ''}</p>
        <p className="kv"><b>Hit points:</b> {d.hpMax} · <b>Armor class:</b> {d.ac} (before armor) · <b>Speed:</b> {d.speed.walk} ft · <b>Proficiency:</b> +{d.prof}</p>
        <p className="kv"><b>Abilities:</b> {ABILITIES.map(([k, l]) => `${l.slice(0, 3)} ${d.scores[k]} (${sgn(d.mods[k])})`).join(' · ')}</p>
        <p className="kv"><b>Saving throws:</b> {d.saves.filter((s) => s.proficient).map((s) => s.label).join(', ') || '—'}</p>
        <p className="kv"><b>Skills:</b> {d.skills.filter((s) => s.proficient).map((s) => `${s.name} ${sgn(s.bonus)}${s.expert ? ' (expertise)' : ''}`).join(', ') || '—'}</p>
        <p className="kv"><b>Languages:</b> {[...d.profs.language].join(', ') || '—'}</p>
        {d.casting || d.granted.length ? <p className="kv"><b>Spells:</b> {[...mySpells.map((s) => s.name), ...d.granted.map((g) => g.name)].join(', ') || '—'}</p> : null}
        <p className="kv"><b>Features:</b> {d.features.filter((f) => !isMarker(f as any)).map((f) => f.name).join(', ')}</p>
      </div>
      <p><button type="button" disabled={finishing} onClick={finish}>{finishing ? 'Opening your sheet…' : 'Finish and open my character sheet'}</button></p>
    </>
  );

  const body: Record<string, ReactNode> = { Class: classStep, Background: backgroundStep, Species: speciesStep, Abilities: abilityStep, Equipment: equipmentStep, Spells: spellsStep, Details: detailsStep, Review: reviewStep };
  const left = (s: string) => todo.filter(([x]) => x === s).length;
  return (
    <div className="cc">
      <h2>Create your character <small className="dim" role="status">{state}</small></h2>
      <nav className="cc-steps" aria-label="Steps">
        {steps.map((s, i) => <button key={s} type="button" aria-current={at === s ? 'step' : undefined} className={'cc-step' + (at === s ? ' on' : '') + (s !== 'Review' && !left(s) ? ' ok' : '')} onClick={() => go(i)}><span>{i + 1}</span>{s}</button>)}
      </nav>
      <div className="cc-main">
        <div className="cc-body">
          <h3 className="cc-title">{at === 'Class' ? 'Choose a class' : at === 'Background' ? 'Choose a background' : at === 'Species' ? 'Choose a species' : at === 'Abilities' ? 'Set your ability scores' : at === 'Equipment' ? 'Choose your starting equipment' : at === 'Spells' ? 'Choose your spells' : at === 'Details' ? 'Who are they?' : 'Review'}</h3>
          {body[at]}
          <p className="cc-nav">
            {step > 0 ? <button type="button" className="quiet" onClick={() => go(step - 1)}>← {steps[step - 1]}</button> : <span />}
            {at !== 'Review' ? <button type="button" onClick={() => go(step + 1)}>{steps[step + 1]} →</button> : null}
          </p>
        </div>
        <aside className="cc-side">
          <b className="cc-name">{c.name || 'Unnamed'}</b>
          <small>Level {d.level} {race?.name ?? ''} {cls?.name ?? ''}</small>
          {bg ? <small>{bg.name}</small> : null}
          <div className="cc-mini">{ABILITIES.map(([k]) => <span key={k}><small>{k.toUpperCase()}</small><b>{d.scores[k]}</b><small>{sgn(d.mods[k])}</small></span>)}</div>
          <p className="kv"><b>HP</b> {d.hpMax} · <b>AC</b> {d.ac} · <b>Speed</b> {d.speed.walk}</p>
          {todo.length ? <p className="dim">{todo.length} thing{todo.length > 1 ? 's' : ''} left to choose.</p> : <p className="dim">All chosen.</p>}
        </aside>
      </div>
    </div>
  );
}

// A long list (spells, weapons, many options): search and tick, with the picked ones on top.
function ManyPicker({ opts, have, n, onToggle }: { opts: [string, string, string][]; have: string[]; n: number; onToggle: (v: string, on: boolean) => void }) {
  const [q, setQ] = useState('');
  const shown = opts.filter(([v, l]) => have.includes(v) || !q.trim() || l.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search" className="cc-search" />
      <ul className="avail-list">
        {shown.sort((a, b) => Number(have.includes(b[0])) - Number(have.includes(a[0]))).map(([v, l, note]) => (
          <li key={v}>
            <label className="ckrow"><input type="checkbox" checked={have.includes(v)} disabled={!have.includes(v) && have.length >= n} onChange={(e) => onToggle(v, e.target.checked)} /> <b>{l}</b></label>
            <span className="dim">{note}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
