'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { SRD_CONDITIONS, type Entry, type ToolProps } from '@/lib/entry-types';
import { mod, type Entity } from '@/lib/rules/engine';
import { EntityCard } from '../EntityCard';
import { Sheet5e } from '../Sheet5e';
import { useLive } from './kit';

type Combatant = { id: string; name: string; kind: 'pc' | 'npc' | 'monster'; init: number; dex: number; hp: number; hpMax: number; ac: number; conditions: string[]; conc: boolean; hidden: boolean; showHp: boolean; ref?: string };
type State = { round: number; turn: string | null; list: Combatant[] };
const empty: State = { round: 1, turn: null, list: [] };
const d20 = () => 1 + Math.floor(Math.random() * 20);
const uid = () => Math.random().toString(36).slice(2, 10);

// What the table is allowed to see of the DM's tracker: no hidden creatures, and no
// enemy hit points unless the DM has shown them. This is the ONLY thing written to the
// row players can read; the full state is stored where only the DM can read it.
export function publicView(s: State) {
  const order = [...s.list].sort((a, b) => b.init - a.init || b.dex - a.dex);
  const active = order.find((c) => c.id === s.turn);
  return {
    round: s.round,
    turn: active ? (active.hidden ? 'hidden' : active.id) : null,
    order: order.filter((c) => !c.hidden).map((c) => ({ id: c.id, name: c.name, kind: c.kind, conditions: c.conditions, conc: c.conc, ...(c.kind === 'pc' || c.showHp ? { hp: c.hp, hpMax: c.hpMax } : {}) })),
  };
}

export function InitiativeTool(p: ToolProps & { initial: Entry | null; characters: { id: string; owner: string; data: any }[]; monsters: Entity[]; entities: Entity[]; names: Record<string, string> }) {
  return p.dm ? <DmTracker {...p} /> : <PlayerTracker {...p} />;
}

// ---------------------------------------------------------------- players: turn order, live

function PlayerTracker(p: ToolProps & { initial: Entry | null }) {
  const [pub, setPub] = useState<any>(p.initial?.data ?? null);
  useLive(p.campaignId, ['encounter'], (kind, row) => { if (kind === 'put') setPub(row.data); else setPub(null); });
  if (!pub || !(pub.order ?? []).length) return <div className="wrap"><h2>Initiative</h2><p className="lede">No fight is running. When your DM starts one, the turn order appears here by itself.</p></div>;
  return (
    <div className="wrap">
      <h2>Initiative <small className="who">Round {pub.round}</small></h2>
      {pub.turn === 'hidden' ? <p className="okmsg" role="status">Something you cannot see is acting.</p> : null}
      <ol className="init">
        {pub.order.map((c: any) => (
          <li key={c.id} className={pub.turn === c.id ? 'on' : ''} aria-current={pub.turn === c.id ? 'true' : undefined}>
            <b>{c.name}</b>
            <span className="who">{c.hpMax ? `${c.hp} / ${c.hpMax} hit points` : c.kind === 'pc' ? '' : 'Hit points unknown'}{c.conc ? ' · concentrating' : ''}{(c.conditions ?? []).length ? ' · ' + c.conditions.join(', ') : ''}</span>
            {pub.turn === c.id ? <span className="pillb pl">Their turn</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- the DM's tracker

function DmTracker(p: ToolProps & { initial: Entry | null; characters: { id: string; owner: string; data: any }[]; monsters: Entity[]; entities: Entity[]; names: Record<string, string> }) {
  // whatever was saved is filled out, so an older or partial save can never break the page
  const [s, setS] = useState<State>(() => {
    const saved = (p.initial?.secret ?? {}) as Partial<State>;
    return { round: Number(saved.round) || 1, turn: saved.turn ?? null, list: (saved.list ?? []).map((c: any) => ({ id: uid(), name: 'Unnamed', kind: 'npc', init: 0, dex: 0, hp: 0, hpMax: 0, ac: 10, conc: false, hidden: false, showHp: false, ...c, conditions: Array.isArray(c?.conditions) ? c.conditions : [] })) };
  });
  const [rowId, setRowId] = useState<string | null>(p.initial?.id ?? null);
  const [pick, setPick] = useState('');
  const [count, setCount] = useState(1);
  const [custom, setCustom] = useState('');
  const [state, setState] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(s);
  const idRef = useRef(rowId);

  const persist = async () => {
    const st = latest.current;
    const supabase = supabaseBrowser();
    let id = idRef.current;
    const row = { campaign_id: p.campaignId, kind: 'encounter', title: 'Encounter', vis: 'all', live: true, data: publicView(st) };
    if (id) { const r = await supabase.from('entries').update(row).eq('id', id); if (r.error) return setState('Not saved.'); }
    else { const r = await supabase.from('entries').insert(row).select('id').single(); if (r.error || !r.data) return setState('Not saved.'); id = r.data.id; idRef.current = id; setRowId(id); }
    const sec = await supabase.from('entry_secrets').upsert({ entry_id: id, campaign_id: p.campaignId, data: st });
    setState(sec.error ? 'Not saved.' : 'Saved. Your players see the turn order live.');
  };
  const up = (next: State) => {
    latest.current = next; setS(next); setState('Saving…');
    if (!p.canWrite) return setState('This campaign is read-only.');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(persist, 350);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void persist(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const order = [...s.list].sort((a, b) => b.init - a.init || b.dex - a.dex);
  const active = order.find((c) => c.id === s.turn) ?? null;
  const edit = (id: string, patch: Partial<Combatant>) => up({ ...s, list: s.list.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const add = (list: Combatant[]) => up({ ...s, list: [...s.list, ...list] });
  const step = (dir: 1 | -1) => {
    if (!order.length) return;
    const i = order.findIndex((c) => c.id === s.turn);
    const j = i < 0 ? 0 : (i + dir + order.length) % order.length;
    up({ ...s, turn: order[j].id, round: Math.max(1, s.round + (dir === 1 && i === order.length - 1 ? 1 : dir === -1 && i === 0 ? -1 : 0)) });
  };

  const pcOf = (ch: { id: string; owner: string; data: any }): Combatant => {
    const d = ch.data ?? {};
    const dex = mod(Number(d.ab?.dex ?? 10));
    return { id: uid(), name: d.name || 'Unnamed', kind: 'pc', init: 0, dex, hp: Number(d.hp ?? d.hpMax ?? 0) || 0, hpMax: Number(d.hpMax ?? d.hp ?? 0) || 0, ac: Number(d.ac ?? d.acBase ?? 10 + dex) || 10, conditions: [], conc: false, hidden: false, showHp: true, ref: 'c:' + ch.id };
  };
  const monsterOf = (m: Entity, n: number, of: number): Combatant => {
    const dex = mod(Number(m.data.ab?.dex ?? 10));
    return { id: uid(), name: m.name + (of > 1 ? ' ' + n : ''), kind: 'monster', init: 0, dex, hp: Number(m.data.hpv) || 1, hpMax: Number(m.data.hpv) || 1, ac: Number(m.data.acv) || 10, conditions: [], conc: false, hidden: false, showHp: false, ref: 'e:' + m.id };
  };
  const activeCh = active?.ref?.startsWith('c:') ? p.characters.find((c) => c.id === active.ref!.slice(2)) : null;
  const activeMon = active?.ref?.startsWith('e:') ? p.monsters.find((m) => m.id === active.ref!.slice(2)) : null;

  return (
    <div className="wrap">
      <h2>Initiative <small className="who">Round {s.round}</small></h2>
      <p className="lede">Add who is fighting, roll, and step through the turns. Players see the order and whose turn it is, live. Hidden creatures and enemy hit points stay with you unless you show them.</p>
      <div className="plate">
        <div className="tbar">
          <button type="button" className="act" onClick={() => add(p.characters.filter((ch) => !s.list.some((c) => c.ref === 'c:' + ch.id)).map(pcOf))} disabled={!p.characters.length}>Add all player characters</button>
          <label className="f">Creature<select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose…</option>{p.monsters.map((m) => <option key={m.id} value={m.id}>{m.name}{m.source === 'srd' ? '' : ' (homebrew)'} · CR {m.data.cr ?? '?'}</option>)}</select></label>
          <label className="f" style={{ maxWidth: 90 }}>How many<input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></label>
          <button type="button" className="act sm" disabled={!pick} onClick={() => { const m = p.monsters.find((x) => x.id === pick); if (m) add(Array.from({ length: count }, (_, i) => monsterOf(m, i + 1, count))); }}>Add</button>
          <label className="f">Someone else<input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Name" /></label>
          <button type="button" className="act sm" disabled={!custom.trim()} onClick={() => { add([{ id: uid(), name: custom.trim(), kind: 'npc', init: 0, dex: 0, hp: 10, hpMax: 10, ac: 10, conditions: [], conc: false, hidden: false, showHp: false }]); setCustom(''); }}>Add</button>
        </div>
        <p className="row" style={{ marginTop: 10 }}>
          <button type="button" className="act" disabled={!s.list.length} onClick={() => { const list = s.list.map((c) => ({ ...c, init: d20() + c.dex })); const first = [...list].sort((a, b) => b.init - a.init || b.dex - a.dex)[0]; up({ round: 1, turn: first?.id ?? null, list }); }}>Roll initiative for everyone</button>
          <button type="button" className="act sm" disabled={!order.length} onClick={() => step(-1)}>Previous turn</button>
          <button type="button" className="act" disabled={!order.length} onClick={() => step(1)}>Next turn</button>
          <button type="button" className="act sm danger" disabled={!s.list.length} onClick={() => { if (confirm('End the fight and clear the tracker?')) up({ ...empty }); }}>End the fight</button>
          <span className="who" role="status">{state}</span>
        </p>
      </div>

      <ol className="init dm">
        {order.map((c) => (
          <li key={c.id} className={(s.turn === c.id ? 'on ' : '') + (c.hidden ? 'hid' : '')} aria-current={s.turn === c.id ? 'true' : undefined}>
            <div className="init-top">
              <label className="vh" htmlFor={'i' + c.id}>Initiative for {c.name}</label>
              <input id={'i' + c.id} className="init-n" type="number" value={c.init} onChange={(e) => edit(c.id, { init: Number(e.target.value) })} />
              <input className="init-name" aria-label="Name" value={c.name} onChange={(e) => edit(c.id, { name: e.target.value })} />
              <span className="who">AC {c.ac}</span>
              <span className="s5-hp">
                <button type="button" onClick={() => edit(c.id, { hp: Math.max(0, c.hp - 1) })} aria-label={'Damage ' + c.name + ' by 1'}>−</button>
                <input type="number" aria-label={'Hit points of ' + c.name} value={c.hp} onChange={(e) => edit(c.id, { hp: Number(e.target.value) })} /><span className="who">/ {c.hpMax}</span>
                <button type="button" onClick={() => edit(c.id, { hp: Math.min(c.hpMax, c.hp + 1) })} aria-label={'Heal ' + c.name + ' by 1'}>+</button>
              </span>
              <button type="button" className="act sm" onClick={() => up({ ...s, turn: c.id })}>Make it their turn</button>
            </div>
            <div className="init-opts">
              <label className="ck"><input type="checkbox" checked={c.conc} onChange={(e) => edit(c.id, { conc: e.target.checked })} /> Concentrating</label>
              {c.kind !== 'pc' ? <label className="ck"><input type="checkbox" checked={c.hidden} onChange={(e) => edit(c.id, { hidden: e.target.checked })} /> Hidden from players</label> : null}
              {c.kind !== 'pc' ? <label className="ck"><input type="checkbox" checked={c.showHp} onChange={(e) => edit(c.id, { showHp: e.target.checked })} /> Show players its hit points</label> : null}
              <label className="f inl">Add a condition<select value="" onChange={(e) => { if (e.target.value && !c.conditions.includes(e.target.value)) edit(c.id, { conditions: [...c.conditions, e.target.value] }); }}><option value="">Choose…</option>{SRD_CONDITIONS.map((x) => <option key={x}>{x}</option>)}</select></label>
              {c.conditions.map((x) => <button key={x} type="button" className="fchip" aria-pressed="true" title="Remove" onClick={() => edit(c.id, { conditions: c.conditions.filter((y) => y !== x) })}>{x} ×</button>)}
              <button type="button" className="act sm danger" onClick={() => up({ ...s, turn: s.turn === c.id ? null : s.turn, list: s.list.filter((x) => x.id !== c.id) })}>Remove</button>
            </div>
          </li>
        ))}
      </ol>
      {order.length ? null : <p className="who">Nobody in the fight yet.</p>}

      {active ? (
        <>
          <h2>Acting now: {active.name}</h2>
          {activeMon ? <div className="plate"><EntityCard type="monster" name={activeMon.name} source={activeMon.source} data={activeMon.data} /></div> : null}
          {activeCh ? (activeCh.data?.v === 2
            ? <Sheet5e key={activeCh.id} character={activeCh} entities={p.entities} readOnly play />
            : <div className="plate"><h3>{activeCh.data?.name}</h3><p className="who">Level {activeCh.data?.level} {activeCh.data?.cls}. Played by {p.names[activeCh.owner] ?? activeCh.data?.player ?? 'a player'}.</p><p className="kv"><b>AC</b> {activeCh.data?.ac} · <b>Hit points</b> {activeCh.data?.hp} / {activeCh.data?.hpMax} · <b>Speed</b> {activeCh.data?.speed}</p><p><a className="act sm" href={`/c/${p.slug}/players?c=${activeCh.id}`}>Open the full sheet</a></p></div>) : null}
          {!activeMon && !activeCh ? <p className="who">No sheet or stat block is attached to {active.name}.</p> : null}
        </>
      ) : null}
    </div>
  );
}
