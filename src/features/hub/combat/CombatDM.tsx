'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { SRD_CONDITIONS } from '@/lib/entry-types';
import { mod, type Entity } from '@/lib/rules/engine';
import { EntityCard } from '@/components/EntityCard';
import { ConfirmButton } from '@/components/ConfirmButton';
import { useLive } from '@/components/tools/kit';
import { HiddenTag } from '@/features/hub/ui/Hidden';
import type { SheetSystem } from '@/features/systems/model';
import { BattleMap } from './BattleMap';
import { endFight, getFight, saveFight } from './actions';
import { health, ordered, publicView, sideOf, step, type Combatant, type Side, type State } from './model';

export type CombatFeatures = { initiative: boolean; map: boolean; autoroll: boolean; health: boolean; conditions: boolean; actions: boolean };
const uid = () => Math.random().toString(36).slice(2, 10);
const SIDES: [Side, string][] = [['enemy', 'Enemy'], ['ally', 'Ally'], ['party', 'Player']];

// The DM's Combat page (CombatDM.png). Every change is saved on the server (saveFight), which also
// works out what players see and rolls the creatures' initiative as rolls only DMs see.
export function CombatDM({ slug, campaignId, canWrite, initial, characters, monsters, maps, features, system }: {
  slug: string; campaignId: string; canWrite: boolean; initial: State; characters: { id: string; owner: string; data: any }[];
  monsters: Entity[]; maps: { id: string; title: string }[]; features: CombatFeatures; system?: SheetSystem | null;
}) {
  const [s, setS] = useState<State>(initial);
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(!initial.list.length);
  const [say, setSay] = useState('');
  const [pick, setPick] = useState('');
  const [count, setCount] = useState(1);
  const [side, setSide] = useState<Side>('enemy');
  const [other, setOther] = useState({ name: '', hp: 10, ac: 10 });
  const [amount, setAmount] = useState(5);
  const latest = useRef(s);
  const version = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  // save a little after the last change; the server's answer (with rolled initiative) wins only if nothing changed since
  const persist = async (party = false) => {
    const v = version.current;
    busy.current = true;
    const r = await saveFight(slug, latest.current, { party });
    busy.current = false;
    if (r.error) return setSay(r.error);
    setSay('Saved. Players see it live.');
    if (r.state && v === version.current) { latest.current = r.state; setS(r.state); }
  };
  const up = (next: State, now = false, party = false) => {
    version.current++;
    latest.current = next; setS(next); setSay('Saving…');
    if (!canWrite) return setSay('This campaign is read-only.');
    if (timer.current) clearTimeout(timer.current);
    if (now) { timer.current = null; void persist(party); } else timer.current = setTimeout(() => { timer.current = null; void persist(); }, 400);
  };
  // a player ended their turn or acted: pick up the fight as it is now
  useLive(campaignId, ['encounter'], () => {
    if (busy.current || timer.current) return;
    const v = version.current;
    // a refresh that comes back after the DM changed something is out of date: drop it
    void getFight(slug).then((r) => { if (r.state && !busy.current && !timer.current && v === version.current) { latest.current = r.state; setS(r.state); } });
  });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const order = ordered(s);
  const active = order.find((c) => c.id === s.turn) ?? null;
  const pub = publicView(s, features);
  const onDeck = pub.next;
  const chosen = s.list.find((c) => c.id === sel) ?? active;
  const edit = (id: string, patch: Partial<Combatant>) => up({ ...s, list: s.list.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const add = (list: Combatant[]) => up({ ...s, list: [...s.list, ...list] }, true);
  const pcOf = (ch: { id: string; data: any }): Combatant => {
    const d = ch.data ?? {};
    const dex = mod(Number(d.ab?.dex ?? d.scores?.dex ?? 10));
    return { id: uid(), name: d.name || 'Unnamed', kind: 'pc', side: 'party', init: 0, dex, hp: Number(d.hp ?? d.hpMax ?? 0) || 0, hpMax: Number(d.hpMax ?? d.hp ?? 0) || 0, ac: Number(d.ac ?? d.acBase ?? 10 + dex) || 10, conditions: [], conc: false, hidden: false, showHp: true, ref: 'c:' + ch.id };
  };
  const monsterOf = (m: Entity, n: number, of: number): Combatant => {
    const dex = mod(Number(m.data.ab?.dex ?? 10));
    return { id: uid(), name: m.name + (of > 1 ? ' ' + n : ''), kind: 'monster', side, init: 0, dex, hp: Number(m.data.hpv) || 1, hpMax: Number(m.data.hpv) || 1, ac: Number(m.data.acv) || 10, conditions: [], conc: false, hidden: false, showHp: false, ref: 'e:' + m.id, roll: features.autoroll };
  };
  const stat = chosen?.ref?.startsWith('e:') ? monsters.find((m) => m.id === chosen.ref!.slice(2)) : null;
  const hurt = (c: Combatant, by: number) => edit(c.id, { hp: Math.max(c.kind === 'pc' ? -c.hpMax : 0, Math.min(c.hpMax, c.hp + by)) });
  const tag = (c: Combatant) => SIDES.find(([x]) => x === sideOf(c))![1];
  const mapSrc = s.map ? `/c/${slug}/map/${s.map}` : null;

  return (
    <div className="wrap cb">
      <header className="cb-top">
        <div>
          <h1>Combat</h1>
          <p className="cb-sub">
            <input className="cb-name" aria-label="Encounter name" value={s.name ?? ''} placeholder="Encounter" maxLength={80} onChange={(e) => up({ ...s, name: e.target.value })} />
            <span>· Round {s.round}</span>
          </p>
        </div>
        <p className="cb-acts">
          <button type="button" className="act" onClick={() => setAdding(!adding)} aria-expanded={adding}>+ Add combatant</button>
          <ConfirmButton className="act" disabled={!s.list.length} ask="End the encounter and clear the tracker?" yes="End it" onConfirm={() => { void endFight(slug).then((r) => { if (r.state) { latest.current = r.state; setS(r.state); setSel(null); setSay('The encounter is over.'); } }); }}>End encounter</ConfirmButton>
        </p>
      </header>
      <p className="cb-say muted" role="status">{say}</p>

      {adding ? (
        <section className="cb-card cb-add" aria-label="Add combatants">
          <p className="row">
            <button type="button" className="act" disabled={!characters.some((ch) => !s.list.some((c) => c.ref === 'c:' + ch.id))}
              onClick={() => add(characters.filter((ch) => !s.list.some((c) => c.ref === 'c:' + ch.id)).map(pcOf))}>Add all player characters</button>
          </p>
          <div className="cb-row">
            <label className="f">Creature<select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose…</option>{monsters.map((m) => <option key={m.id} value={m.id}>{m.name}{m.source === 'srd' ? '' : ' (homebrew)'} · CR {m.data.cr ?? '?'}</option>)}</select></label>
            <label className="f cb-n">How many<input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></label>
            <label className="f cb-n">Side<select value={side} onChange={(e) => setSide(e.target.value as Side)}><option value="enemy">Enemy</option><option value="ally">Ally</option></select></label>
            <button type="button" className="act" disabled={!pick} onClick={() => { const m = monsters.find((x) => x.id === pick); if (m) add(Array.from({ length: count }, (_, i) => monsterOf(m, i + 1, count))); }}>Add</button>
          </div>
          <div className="cb-row">
            <label className="f">Someone else<input value={other.name} placeholder="Name" onChange={(e) => setOther({ ...other, name: e.target.value })} /></label>
            <label className="f cb-n">Hit points<input type="number" min={1} value={other.hp} onChange={(e) => setOther({ ...other, hp: Math.max(1, Number(e.target.value) || 1) })} /></label>
            <label className="f cb-n">AC<input type="number" min={0} value={other.ac} onChange={(e) => setOther({ ...other, ac: Math.max(0, Number(e.target.value) || 0) })} /></label>
            <button type="button" className="act" disabled={!other.name.trim()} onClick={() => { add([{ id: uid(), name: other.name.trim(), kind: 'npc', side, init: 0, dex: 0, hp: other.hp, hpMax: other.hp, ac: other.ac, conditions: [], conc: false, hidden: false, showHp: false, roll: features.autoroll }]); setOther({ name: '', hp: 10, ac: 10 }); }}>Add</button>
          </div>
          <p className="muted">{features.autoroll ? 'Creatures roll their initiative as they join, as rolls only DMs see.' : 'Type each creature\'s initiative, or roll it below.'}</p>
        </section>
      ) : null}

      <div className="cb-grid">
        <section className="cb-card cb-init" aria-labelledby="cb-init-h">
          <div className="cb-head"><h2 id="cb-init-h">Initiative</h2><small>{features.autoroll ? 'NPCs rolled automatically' : ''}</small></div>
          <ol className="cb-list">
            {order.map((c) => (
              <li key={c.id} className={(s.turn === c.id ? 'now ' : '') + (sel === c.id ? 'sel ' : '') + (c.hidden ? 'hid' : '')}>
                <input className="cb-i" type="number" aria-label={'Initiative for ' + c.name} value={c.init} onChange={(e) => edit(c.id, { init: Number(e.target.value) || 0 })} />
                <button type="button" className="cb-who" onClick={() => setSel(c.id)} aria-pressed={sel === c.id}>
                  <span className="cb-nm"><b>{c.name}</b><span>{c.hp} / {c.hpMax}</span>{s.turn === c.id ? <em>Now</em> : null}</span>
                  <span className="cb-bar" aria-hidden="true"><span className={sideOf(c)} style={{ width: `${c.hpMax ? Math.max(0, Math.min(100, (c.hp / c.hpMax) * 100)) : 0}%` }} /></span>
                  <span className="cb-tags">
                    <span className={'cb-tag ' + sideOf(c)}>{tag(c)}</span>
                    {c.hidden ? <HiddenTag /> : null}
                    {features.conditions ? c.conditions.map((x) => <span key={x} className="cb-tag cond">{x}</span>) : null}
                    {features.conditions && c.conc ? <span className="cb-tag conc">Concentrating</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {order.length ? null : <p className="muted">Nobody in the fight yet. Add combatants above.</p>}
          <p className="cb-row">
            <button type="button" className="cb-next" disabled={!order.length} onClick={() => { const n = step(s, 1); setSel(null); up(n, true); }}>Next turn →</button>
          </p>
          <p className="cb-row cb-small">
            <button type="button" className="act sm" disabled={!order.length} onClick={() => up(step(s, -1), true)}>Previous turn</button>
            <button type="button" className="act sm" disabled={!s.list.some((c) => c.kind !== 'pc')} onClick={() => up({ ...s, list: s.list.map((c) => (c.kind !== 'pc' ? { ...c, roll: true } : c)) }, true)}>Roll NPC initiative</button>
            <button type="button" className="act sm" disabled={!s.list.some((c) => c.kind === 'pc')} onClick={() => up({ ...s, list: s.list.map((c) => (c.kind === 'pc' ? { ...c, roll: true } : c)) }, true, true)}>Roll for the party too</button>
          </p>
        </section>

        <div className="cb-side">
          {active ? (
            <section className="cb-card cb-up"><span className="cb-eyebrow">Up now</span><h2>{active.name}{active.hidden ? <> <HiddenTag /></> : null}</h2>{onDeck ? <span className="muted">On deck: {onDeck}</span> : null}</section>
          ) : order.length ? <section className="cb-card cb-up"><span className="cb-eyebrow">Ready</span><h2>Press Next turn to start</h2></section> : null}

          {features.map ? (
            <section className="cb-card" aria-label="Battle map">
              <label className="f cb-mappick">Battle map<select value={s.map ?? ''} onChange={(e) => up({ ...s, map: e.target.value || null })}><option value="">No map</option>{maps.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
              {s.map ? <BattleMap src={mapSrc} edit tokens={order.map((c) => ({ id: c.id, name: c.name, side: sideOf(c), pos: c.pos, now: c.id === s.turn, hidden: c.hidden }))} onMove={(id, pos) => edit(id, { pos })} />
                : <p className="muted">{maps.length ? 'Choose a map from the Maps tool to place tokens on.' : 'Add a map in the Maps table tool to use it here.'}</p>}
            </section>
          ) : null}

          {chosen ? (
            <section className="cb-card cb-sel" aria-labelledby="cb-sel-h">
              <div className="cb-head">
                <h2 id="cb-sel-h">{chosen.name}</h2>
                <small>Players see: {chosen.hidden ? 'nothing (hidden)' : chosen.kind === 'pc' || chosen.showHp ? `${chosen.hp} / ${chosen.hpMax} hit points` : features.health ? <b className={'cb-h ' + health(chosen.hp, chosen.hpMax).toLowerCase()}>{health(chosen.hp, chosen.hpMax)}</b> : 'no hit points'}</small>
              </div>
              {stat ? <div className="cb-stat"><EntityCard abilities={system?.rules.abilities} type="monster" name={stat.name} source={stat.source} data={stat.data} /></div> : <p className="muted">AC {chosen.ac} · {chosen.hp} / {chosen.hpMax} hit points</p>}
              <div className="cb-row">
                <label className="f cb-n">Amount<input type="number" min={0} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} /></label>
                <button type="button" className="cb-dmg" onClick={() => hurt(chosen, -amount)}>Damage</button>
                <button type="button" className="act" onClick={() => hurt(chosen, amount)}>Heal</button>
                {features.conditions ? (
                  <label className="f">Add condition<select value="" onChange={(e) => { if (e.target.value && !chosen.conditions.includes(e.target.value)) edit(chosen.id, { conditions: [...chosen.conditions, e.target.value] }); }}><option value="">Choose…</option>{SRD_CONDITIONS.map((x) => <option key={x}>{x}</option>)}</select></label>
                ) : null}
              </div>
              {features.conditions && chosen.conditions.length ? <p className="cb-row">{chosen.conditions.map((x) => <button key={x} type="button" className="fchip" aria-pressed="true" title="Remove" onClick={() => edit(chosen.id, { conditions: chosen.conditions.filter((y) => y !== x) })}>{x} ×</button>)}</p> : null}
              <p className="cb-row cb-small">
                {features.conditions ? <label className="ck"><input type="checkbox" checked={chosen.conc} onChange={(e) => edit(chosen.id, { conc: e.target.checked })} /> Concentrating</label> : null}
                {chosen.kind !== 'pc' ? <label className="ck"><input type="checkbox" checked={chosen.hidden} onChange={(e) => edit(chosen.id, { hidden: e.target.checked })} /> Hidden from players</label> : null}
                {chosen.kind !== 'pc' ? <label className="ck"><input type="checkbox" checked={chosen.showHp} onChange={(e) => edit(chosen.id, { showHp: e.target.checked })} /> Show players its hit points</label> : null}
                {chosen.kind !== 'pc' ? <label className="f cb-n">Side<select value={sideOf(chosen)} onChange={(e) => edit(chosen.id, { side: e.target.value as Side })}><option value="enemy">Enemy</option><option value="ally">Ally</option></select></label> : null}
                <button type="button" className="act sm danger" onClick={() => { up({ ...s, turn: s.turn === chosen.id ? null : s.turn, list: s.list.filter((x) => x.id !== chosen.id) }, true); setSel(null); }}>Remove</button>
              </p>
            </section>
          ) : null}

          {(s.log ?? []).length ? (
            <section className="cb-card" aria-labelledby="cb-log-h"><h2 id="cb-log-h" className="cb-h3">This fight</h2>
              <ul className="cb-log">{[...(s.log ?? [])].reverse().slice(0, 8).map((l, i) => <li key={i}><b>{l.who}</b> {l.text}</li>)}</ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
