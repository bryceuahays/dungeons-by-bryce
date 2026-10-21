'use client';
import { useState, useTransition } from 'react';
import { useLive } from '@/components/tools/kit';
import { BattleMap } from './BattleMap';
import { playerAct, type Act } from './actions';
import type { PublicFight } from './model';

export type MyCharacter = { id: string; name: string; speed: number; weapons: string[]; caster: boolean };

// The players' Combat page (CombatPlayer.png). Everything here is the fight as players may see it
// (worked out on the server): the turn order, the party's hit points, enemies only as Healthy,
// Wounded, Bloodied or Down, and the map. On their own character's turn, a player chooses a target
// and an action; the server rolls it and posts it to the party's roll log.
export function CombatPlayer({ slug, campaignId, initial, mine, actions, mapOn, canAct }: {
  slug: string; campaignId: string; initial: PublicFight | null; mine: MyCharacter[]; actions: boolean; mapOn: boolean; canAct: boolean;
}) {
  const [pub, setPub] = useState<PublicFight | null>(initial);
  const [target, setTarget] = useState<string | null>(null);
  const [last, setLast] = useState<{ label: string; total: number; bonus: number } | null>(null);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  useLive(campaignId, ['encounter'], (kind, row) => setPub(kind === 'put' ? (row.data as PublicFight) : null));

  if (!pub || !(pub.order ?? []).length) return (
    <div className="wrap cb"><h1>Combat</h1><p className="cb-sub">No fight is running. When your DM starts one, it appears here by itself.</p></div>
  );
  const active = pub.order.find((c) => c.id === pub.turn) ?? null;
  const me = active ? mine.find((m) => active.ref === 'c:' + m.id) : undefined;
  const targets = pub.order.filter((c) => c.side !== 'party' && c.id !== active?.id);
  const aim = targets.find((t) => t.id === target) ?? targets[0] ?? null;
  const act = (a: Act) => start(async () => { setErr(''); const r = await playerAct(slug, a); if (r.error) setErr(r.error); else if (r.roll) setLast(r.roll); });
  const status = (c: PublicFight['order'][number]) => (c.hpMax !== undefined ? `${c.hp} / ${c.hpMax} HP` : c.health ?? '');

  return (
    <div className="wrap cb">
      <header className="cb-top"><div><h1>Combat</h1><p className="cb-sub">{pub.name ? pub.name + ' · ' : ''}Round {pub.round}</p></div></header>
      {me ? (
        <section className="cb-card cb-up mine"><span className="cb-eyebrow">It&apos;s your turn</span><h2>{me.name}</h2><span className="muted">Action · Bonus action · Movement {me.speed} ft</span></section>
      ) : pub.turn === 'hidden' ? (
        <section className="cb-card cb-up"><span className="cb-eyebrow">Up now</span><h2>Something you cannot see is acting</h2></section>
      ) : active ? (
        <section className="cb-card cb-up"><span className="cb-eyebrow">Up now</span><h2>{active.name}</h2>{pub.next ? <span className="muted">Next: {pub.next}</span> : null}</section>
      ) : <section className="cb-card cb-up"><span className="cb-eyebrow">Ready</span><h2>The fight is about to start</h2></section>}

      <div className="cb-grid">
        <section className="cb-card cb-init" aria-labelledby="cb-order-h">
          <div className="cb-head"><h2 id="cb-order-h">Turn order</h2></div>
          <ol className="cb-list">
            {pub.order.map((c) => (
              <li key={c.id} className={pub.turn === c.id ? 'now' : ''} aria-current={pub.turn === c.id ? 'true' : undefined}>
                <span className="cb-i ro">{c.init}</span>
                <span className="cb-who ro">
                  <span className="cb-nm"><b>{c.name}</b></span>
                  <span className="cb-tags">
                    <span className={'cb-st ' + (c.health ? c.health.toLowerCase() : c.side)}>{status(c)}</span>
                    {(c.conditions ?? []).map((x) => <span key={x} className="cb-tag cond">{x}</span>)}
                    {c.conc ? <span className="cb-tag conc">Concentrating</span> : null}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="muted cb-small">Enemy health shows as a status. The DM sees exact numbers.</p>
        </section>

        <div className="cb-side">
          {mapOn && pub.map ? (
            <section className="cb-card" aria-label="Battle map">
              <BattleMap src={`/c/${slug}/map/${pub.map}`} edit={false} tokens={pub.order.map((c) => ({ id: c.id, name: c.name, side: c.side, pos: c.pos, now: c.id === pub.turn }))} />
            </section>
          ) : null}

          {me && actions && canAct ? (
            <section className="cb-card" aria-labelledby="cb-act-h">
              <h2 id="cb-act-h" className="cb-h3">Choose a target</h2>
              {targets.length ? (
                <p className="cb-row" role="group" aria-label="Targets">
                  {targets.map((t) => <button key={t.id} type="button" className="cb-target" aria-pressed={aim?.id === t.id} onClick={() => setTarget(t.id)}>{t.name}{t.health ? ` · ${t.health}` : ''}</button>)}
                </p>
              ) : <p className="muted">There is nobody to target.</p>}
              <p className="cb-row">
                {(me.weapons.length ? me.weapons : ['']).map((w) => (
                  <button key={w || 'weapon'} type="button" className="cb-attack" disabled={pending || !aim} onClick={() => act({ act: 'attack', target: aim?.id, weapon: w || undefined })}>
                    Attack {aim ? aim.name : ''}{w ? ` (${w})` : ''}
                  </button>
                ))}
                <button type="button" className="act" disabled={pending} onClick={() => act({ act: 'spell', target: aim?.id })}>Cast a spell</button>
                <button type="button" className="act" disabled={pending} onClick={() => act({ act: 'dash' })}>Dash</button>
                <button type="button" className="act" disabled={pending} onClick={() => act({ act: 'dodge' })}>Dodge</button>
                <button type="button" className="act" disabled={pending} onClick={() => act({ act: 'help' })}>Help</button>
                <button type="button" className="act" disabled={pending} onClick={() => act({ act: 'end' })}>End turn</button>
              </p>
              {err ? <p className="err" role="alert">{err}</p> : null}
              {last ? <div className="cb-last" role="status"><span><small>Last roll · posted to party rolls</small>{last.label} ({last.total - last.bonus} {last.bonus >= 0 ? '+' : '−'} {Math.abs(last.bonus)})</span><b>{last.total}</b></div> : null}
            </section>
          ) : null}

          {(pub.log ?? []).length ? (
            <section className="cb-card" aria-labelledby="cb-plog-h"><h2 id="cb-plog-h" className="cb-h3">This fight</h2>
              <ul className="cb-log">{[...pub.log].reverse().slice(0, 8).map((l, i) => <li key={i}><b>{l.who}</b> {l.text}</li>)}</ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
