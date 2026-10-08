'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';

// The item picker's list: search as you type, filter by kind, your own items first.
export type ItemRow = { id: string; name: string; kind: string; rarity: string; damage: string; ac: string; mtype: string; mine: boolean };
const KINDS = [['', 'All'], ['Weapon', 'Weapons'], ['Armor', 'Armor'], ['Gear', 'Gear'], ['Magic item', 'Magic items']];

export function ItemList({ items }: { items: ItemRow[] }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => (!kind || i.kind === kind) && (!t || i.name.toLowerCase().includes(t)));
  }, [items, q, kind]);
  const mine = shown.filter((i) => i.mine), srd = shown.filter((i) => !i.mine);
  const note = (i: ItemRow) => (i.kind === 'Magic item' ? [i.mtype || 'Magic item', i.rarity && i.rarity !== 'Standard' ? i.rarity.toLowerCase() : ''].filter(Boolean).join(', ') : i.kind === 'Weapon' ? `Weapon${i.damage ? ', ' + i.damage : ''}` : i.kind === 'Armor' ? `Armor${i.ac ? ', AC ' + i.ac : ''}` : i.kind);
  const row = (i: ItemRow) => (
    <li key={i.id}>
      <Link href={i.mine ? '/homebrew/' + i.id : '/homebrew/new?type=item&from=' + i.id}><b>{i.name}</b></Link>
      <span className="dim">{note(i)}</span>
      <Link className="small-btn" href={i.mine ? '/homebrew/' + i.id : '/homebrew/new?type=item&from=' + i.id}>{i.mine ? 'Edit' : 'Make my own version'}</Link>
    </li>
  );
  return (
    <>
      <div className="panel">
        <p>Pick an item to change, or start a new one. SRD items open as your own copy; nothing is saved until you press Create.</p>
        <div className="item-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, for example: longsword, bag of holding" aria-label="Search items" autoFocus />
          <Link className="button" href="/homebrew/new?type=item">Create new</Link>
        </div>
        <p className="inline">{KINDS.map(([k, l]) => <button key={k} type="button" className={'small-btn' + (kind === k ? '' : ' quiet')} onClick={() => setKind(k)}>{l}</button>)}</p>
      </div>
      {mine.length ? (
        <div className="panel">
          <h3>Your items</h3>
          <ul className="list srd-list item-list">{mine.map(row)}</ul>
        </div>
      ) : null}
      <div className="panel">
        <h3>SRD items</h3>
        <p className="dim">{srd.length} {srd.length === 1 ? 'item' : 'items'}{q || kind ? ' match' : ''}.</p>
        <ul className="list srd-list item-list">{srd.slice(0, 300).map(row)}</ul>
        {srd.length > 300 ? <p className="dim">Showing the first 300. Search or pick a kind to narrow it down.</p> : null}
        {!shown.length ? <p className="dim">Nothing by that name. Try another search, or create a new item.</p> : null}
      </div>
    </>
  );
}
