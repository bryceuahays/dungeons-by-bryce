'use client';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { saveAvailable } from '@/app/c/[slug]/actions';

// The Players tab's "What's available": everything a player could pick when making a character
// (the campaign's SRD rules plus its homebrew), each with a tick. Everything starts ticked; the DM
// unticks what players can't choose. Saved as the campaign's settings.hidden (a list of entry ids),
// so homebrew added later is available until the DM says otherwise.
export type AvailRow = { id: string; name: string; type: string; group: string; note: string; homebrew: boolean };

export function AvailableList({ slug, rows, types, hidden: initial }: { slug: string; rows: AvailRow[]; types: [string, string][]; hidden: string[] }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initial));
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initial));
  const [open, setOpen] = useState<string>(types[0]?.[0] ?? '');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, start] = useTransition();
  const dirty = hidden.size !== saved.size || [...hidden].some((id) => !saved.has(id));

  const ofType = useMemo(() => rows.filter((r) => r.type === open), [rows, open]);
  const groups = useMemo(() => [...new Set(ofType.map((r) => r.group).filter(Boolean))], [ofType]);
  const shown = ofType.filter((r) => (!group || r.group === group) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())));
  const set = (ids: string[], on: boolean) => setHidden((h) => { const n = new Set(h); ids.forEach((id) => (on ? n.delete(id) : n.add(id))); return n; });
  const save = () => start(async () => { const r = await saveAvailable(slug, [...hidden]); setMsg(r?.error ?? r?.note ?? ''); if (!r?.error) setSaved(new Set(hidden)); });
  const pick = (t: string) => { setOpen(t); setGroup(''); setQ(''); };

  return (
    <div className="avail">
      <div className="tabrow avail-types" role="tablist">
        {types.map(([t, label]) => {
          const all = rows.filter((r) => r.type === t);
          const on = all.filter((r) => !hidden.has(r.id)).length;
          return <button key={t} type="button" role="tab" aria-selected={open === t} className={'small-btn' + (open === t ? '' : ' quiet')} onClick={() => pick(t)}>{label} <span className="dim">{on}/{all.length}</span></button>;
        })}
      </div>
      <div className="item-search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search" />
        <button type="button" className="quiet small-btn" onClick={() => set(shown.map((r) => r.id), true)}>Tick all shown</button>
        <button type="button" className="quiet small-btn" onClick={() => set(shown.map((r) => r.id), false)}>Untick all shown</button>
      </div>
      {groups.length > 1 ? <p className="inline">{[['', 'All'], ...groups.map((g) => [g, g])].map(([k, l]) => <button key={k} type="button" className={'small-btn' + (group === k ? '' : ' quiet')} onClick={() => setGroup(k)}>{l}</button>)}</p> : null}
      <ul className="avail-list">
        {shown.map((r) => (
          <li key={r.id} className={hidden.has(r.id) ? 'off' : ''}>
            <label className="ckrow"><input type="checkbox" checked={!hidden.has(r.id)} onChange={(e) => set([r.id], e.target.checked)} /> <b>{r.name}</b></label>
            {r.homebrew ? <span className="chip">homebrew</span> : null}
            <span className="dim">{r.note}</span>
            {r.homebrew ? <Link className="small-btn quiet" href={'/homebrew/' + r.id}>Open</Link> : null}
          </li>
        ))}
      </ul>
      {!shown.length ? <p className="dim">Nothing matches.</p> : null}
      <p className="inline avail-save">
        <button type="button" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save what players can choose'}</button>
        {dirty ? <span className="dim">Unsaved changes.</span> : msg ? <span className="dim">{msg}</span> : null}
      </p>
    </div>
  );
}
