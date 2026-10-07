'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { spellDetail } from '@/app/(hub)/homebrew/actions';
import type { SpellOption } from '@/lib/class-spells';
import { EntityCard } from './EntityCard';

// The class's spell list (data.spellList: spell ids). Browse every SRD 5.2 spell and your own,
// read any of them, tick what the class can learn, and make your own versions or new spells
// in a new tab (so nothing typed here is lost); "Refresh spells" brings them in.

const LEVELS = ['Cantrips', '1st level', '2nd level', '3rd level', '4th level', '5th level', '6th level', '7th level', '8th level', '9th level'];

export function ClassSpells({ spells, value, onChange }: { spells: SpellOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('all');
  const [show, setShow] = useState('all');
  const [open, setOpen] = useState<Record<string, { name: string; source: string; data: any } | 'loading'>>({});
  const [refreshing, refresh] = useTransition();
  const on = useMemo(() => new Set(value), [value]);

  const shown = spells.filter((s) =>
    (level === 'all' || String(s.level) === level) &&
    (show === 'all' || (show === 'on') === on.has(s.id)) &&
    (!q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())));
  const counts = LEVELS.map((_, l) => spells.filter((s) => s.level === l && on.has(s.id)).length);

  const read = async (id: string) => {
    if (open[id]) { const next = { ...open }; delete next[id]; setOpen(next); return; }
    setOpen({ ...open, [id]: 'loading' });
    const d = await spellDetail(id);
    setOpen((o) => ({ ...o, [id]: d ?? { name: 'Not found', source: '', data: { desc: 'This spell could not be loaded.' } } }));
  };
  const toggle = (id: string, yes: boolean) => onChange(yes ? [...value, id] : value.filter((x) => x !== id));

  return (
    <div className="spell-list">
      <p>{value.length ? `${value.length} spells on this class's list: ` + counts.map((n, l) => (n ? `${n} ${l === 0 ? 'cantrips' : LEVELS[l].replace(' level', '')}` : '')).filter(Boolean).join(', ') + '.' : 'No spells on this class\'s list yet.'}</p>
      <div className="spell-tools">
        <label>Search<input type="search" value={q} placeholder="Spell name" onChange={(e) => setQ(e.target.value)} /></label>
        <label>Level<select value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">All levels</option>{LEVELS.map((l, i) => <option key={l} value={String(i)}>{l}</option>)}</select></label>
        <label>Show<select value={show} onChange={(e) => setShow(e.target.value)}><option value="all">All spells</option><option value="on">On this class&apos;s list</option><option value="off">Not on the list</option></select></label>
      </div>
      <p className="inline">
        <a className="button quiet small-btn" href="/homebrew/new?type=spell" target="_blank" rel="noopener">Create a new spell</a>
        <button type="button" className="quiet small-btn" disabled={refreshing} onClick={() => refresh(() => router.refresh())}>{refreshing ? 'Refreshing' : 'Refresh spells'}</button>
        <span className="dim">New spells and your own versions open in a new tab. Save them there, then refresh here and tick them.</span>
      </p>
      {LEVELS.map((label, l) => {
        const rows = shown.filter((s) => s.level === l);
        if (!rows.length) return null;
        return (
          <section key={label}>
            <h4>{label} <span className="dim">({counts[l]} on the list)</span></h4>
            <ul className="spell-rows">
              {rows.map((s) => {
                const d = open[s.id];
                return (
                  <li key={s.id}>
                    <div className="spell-row">
                      <input type="checkbox" aria-label={'On the list: ' + s.name} checked={on.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                      <button type="button" className="spell-name" aria-expanded={!!d} onClick={() => read(s.id)}>{s.name}</button>
                      <span className="dim">{s.school}</span>
                      {s.mine ? <span className="chip">Your homebrew</span> : null}
                      <a className="spell-act" href={'/homebrew/' + s.id} target="_blank" rel="noopener">{s.mine ? 'Edit' : 'Make my own version'}</a>
                    </div>
                    {d ? <div className="spell-read">{d === 'loading' ? <p className="dim">Loading…</p> : <EntityCard type="spell" name={d.name} source={d.source} data={d.data} />}</div> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!shown.length ? <p className="dim">No spells match.</p> : null}
    </div>
  );
}
