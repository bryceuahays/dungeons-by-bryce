'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';

// A searchable list of your own entries and the SRD's, with filter buttons and a Create new button
// (the item and spell pickers). An SRD entry opens as your own copy; one of yours opens as itself.
export type PickRow = { id: string; name: string; note: string; group: string; mine: boolean };

export function PickerList({ rows, type, noun, plural, filters, placeholder }: {
  rows: PickRow[]; type: string; noun: string; plural: string; filters: [string, string][]; placeholder: string;
}) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => (!group || r.group === group) && (!t || r.name.toLowerCase().includes(t)));
  }, [rows, q, group]);
  const mine = shown.filter((r) => r.mine), srd = shown.filter((r) => !r.mine);
  const href = (r: PickRow) => (r.mine ? '/homebrew/' + r.id : `/homebrew/new?type=${type}&from=` + r.id);
  const row = (r: PickRow) => (
    <li key={r.id}>
      <Link href={href(r)}><b>{r.name}</b></Link>
      <span className="dim">{r.note}</span>
      <Link className="small-btn" href={href(r)}>{r.mine ? 'Edit' : 'Make my own version'}</Link>
    </li>
  );
  return (
    <>
      <div className="panel">
        <p>Pick {noun === 'item' ? 'an' : 'a'} {noun} to change, or start a new one. SRD {plural} open as your own copy; nothing is saved until you press Create.</p>
        <div className="item-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={`Search ${plural}`} autoFocus />
          <Link className="button" href={`/homebrew/new?type=${type}`}>Create new</Link>
        </div>
        <p className="inline">{filters.map(([k, l]) => <button key={k} type="button" className={'small-btn' + (group === k ? '' : ' quiet')} onClick={() => setGroup(k)}>{l}</button>)}</p>
      </div>
      {mine.length ? (
        <div className="panel">
          <h3>Your {plural}</h3>
          <ul className="list srd-list item-list">{mine.map(row)}</ul>
        </div>
      ) : null}
      <div className="panel">
        <h3>SRD {plural}</h3>
        <p className="dim">{srd.length} {srd.length === 1 ? noun : plural}{q || group ? ' match' : ''}.</p>
        <ul className="list srd-list item-list">{srd.slice(0, 300).map(row)}</ul>
        {srd.length > 300 ? <p className="dim">Showing the first 300. Search or pick a filter to narrow it down.</p> : null}
        {!shown.length ? <p className="dim">Nothing by that name. Try another search, or create a new {noun}.</p> : null}
      </div>
    </>
  );
}
