'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SpellRulesEditor, spellOut } from './SpellRules';
import { deleteSpell, saveEntity, spellDetail } from '@/app/(hub)/homebrew/actions';
import { STATUS } from '@/config/homebrew';
import type { SpellOption } from '@/lib/class-spells';
import { EntityCard } from './EntityCard';

// The class's spell list (data.spellList: spell ids). Browse every SRD 5.2 spell and your own,
// read any of them, tick what the class can learn, and make your own versions or new spells in
// a pop-up, without leaving the class.

export const SPELL_LEVELS = ['Cantrips', '1st level', '2nd level', '3rd level', '4th level', '5th level', '6th level', '7th level', '8th level', '9th level'];

export function ClassSpells({ spells, value, onChange, onSpellSaved, onSpellDeleted, pro }: {
  spells: SpellOption[]; value: string[]; onChange: (v: string[]) => void; onSpellSaved: (s: SpellOption) => void; onSpellDeleted: (id: string) => void; pro: boolean;
}) {
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('all');
  const [show, setShow] = useState('all');
  const [open, setOpen] = useState<Record<string, { name: string; source: string; data: any } | 'loading'>>({});
  const [editing, setEditing] = useState<null | { id: string | null; from?: string }>(null);
  const on = useMemo(() => new Set(value), [value]);

  const shown = spells.filter((s) =>
    (level === 'all' || String(s.level) === level) &&
    (show === 'all' || (show === 'on') === on.has(s.id)) &&
    (!q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())));
  const counts = SPELL_LEVELS.map((_, l) => spells.filter((s) => s.level === l && on.has(s.id)).length);

  const read = async (id: string) => {
    if (open[id]) { const next = { ...open }; delete next[id]; setOpen(next); return; }
    setOpen({ ...open, [id]: 'loading' });
    const d = await spellDetail(id);
    setOpen((o) => ({ ...o, [id]: d ?? { name: 'Not found', source: '', data: { desc: 'This spell could not be loaded.' } } }));
  };
  const toggle = (id: string, yes: boolean) => onChange(yes ? [...value, id] : value.filter((x) => x !== id));

  // after the pop-up saves: the spell is on the list (a version of an SRD spell takes its place there)
  const saved = (s: SpellOption, replaces?: string) => {
    onSpellSaved(s);
    const next = value.filter((x) => x !== replaces && x !== s.id);
    onChange([...next, s.id]);
    setOpen((o) => { const n = { ...o }; delete n[s.id]; return n; });
    setEditing(null);
  };
  // after the pop-up deletes one of your spells: gone from the list too
  const deleted = (id: string) => {
    onSpellDeleted(id);
    onChange(value.filter((x) => x !== id));
    setEditing(null);
  };

  return (
    <div className="spell-list">
      <p>{value.length ? `${value.length} spells on this class's list: ` + counts.map((n, l) => (n ? `${n} ${l === 0 ? 'cantrips' : SPELL_LEVELS[l].replace(' level', '')}` : '')).filter(Boolean).join(', ') + '.' : 'No spells on this class\'s list yet.'}</p>
      <div className="spell-tools">
        <label>Search<input type="search" value={q} placeholder="Spell name" onChange={(e) => setQ(e.target.value)} /></label>
        <label>Level<select value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">All levels</option>{SPELL_LEVELS.map((l, i) => <option key={l} value={String(i)}>{l}</option>)}</select></label>
        <label>Show<select value={show} onChange={(e) => setShow(e.target.value)}><option value="all">All spells</option><option value="on">On this class&apos;s list</option><option value="off">Not on the list</option></select></label>
      </div>
      <p className="inline"><button type="button" className="quiet small-btn" onClick={() => setEditing({ id: null })}>Create a new spell</button></p>
      {SPELL_LEVELS.map((label, l) => {
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
                      <button type="button" className="spell-act" onClick={() => setEditing(s.mine ? { id: s.id } : { id: null, from: s.id })}>{s.mine ? 'Edit' : 'Make my own version'}</button>
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
      {editing ? <SpellPopup key={(editing.id ?? '') + (editing.from ?? '')} id={editing.id} from={editing.from} pro={pro} onClose={() => setEditing(null)} onSaved={saved} onDeleted={deleted} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- the pop-up spell editor


export function SpellPopup({ id, from, startName, pro, onClose, onSaved, onDeleted }: { id: string | null; from?: string; startName?: string; pro: boolean; onClose: () => void; onSaved: (s: SpellOption, replaces?: string) => void; onDeleted: (id: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(startName ?? '');
  const [status, setStatus] = useState('draft');
  const [data, setData] = useState<any>({ level: 1, school: 'Evocation' });
  const [loading, setLoading] = useState(!!(id || from));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sure, setSure] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    const src = id || from;
    if (!src) return;
    spellDetail(src).then((d) => {
      if (d) { setName(from ? d.name + ' (my version)' : d.name); setData(d.data ?? {}); if (id) setStatus(d.status || 'draft'); }
      setLoading(false);
    });
  }, [id, from]);

  const save = async () => {
    setBusy(true); setError('');
    const clean = spellOut({ ...data }); delete clean.classes;
    const r = await saveEntity(id, { type: 'spell', name, status, depth: pro ? 'advanced' : 'quick', source: 'homebrew', data: clean, cloned_from: from ?? null });
    setBusy(false);
    if (!r?.id) { setError(r?.error || 'That did not save.'); return; }
    onSaved({ id: r.id, name: name.trim(), level: Number(clean.level) || 0, school: clean.school ?? '', mine: true, classes: [] }, from);
  };

  const remove = async () => {
    if (!id) return;
    setBusy(true); setError('');
    const r = await deleteSpell(id);
    setBusy(false);
    if (r?.error) { setError(r.error); setSure(false); return; }
    onDeleted(id);
  };

  return (
    <dialog ref={ref} className="popup" onClose={onClose} aria-label={id ? 'Edit spell' : from ? 'Make your own version' : 'New spell'}>
      <div className="popup-head">
        <h3>{id ? 'Edit spell' : from ? 'Your own version' : 'New spell'}</h3>
        <button type="button" className="quiet small-btn" onClick={() => ref.current?.close()} aria-label="Close">✕</button>
      </div>
      {from ? <p className="dim">A copy of the SRD spell for you to change. Saving puts your version on this class&apos;s list in place of the original.</p> : null}
      {loading ? <p className="dim">Loading…</p> : (
        <div className="popup-body">
          <label>Name<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Spell name" /></label>
          <SpellRulesEditor data={data} onChange={setData} />
          <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <p className="dim">{STATUS.find((s) => s.id === status)?.what}</p>
          {error ? <p className="bad" role="alert">{error}</p> : null}
          <p className="inline">
            <button type="button" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Saving' : id ? 'Save spell' : 'Create spell'}</button>
            <button type="button" className="quiet" onClick={() => ref.current?.close()}>Cancel</button>
            {id && !sure ? <button type="button" className="quiet danger" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => setSure(true)}>Delete spell</button> : null}
          </p>
          {id && sure ? (
            <div className="popup-confirm" role="alert">
              <p>Delete <b>{name || 'this spell'}</b> for good? It comes off this class&apos;s list, and any other class or character using it loses it too.</p>
              <p className="inline"><button type="button" className="danger" disabled={busy} onClick={remove}>{busy ? 'Deleting' : 'Yes, delete it'}</button><button type="button" className="quiet" disabled={busy} onClick={() => setSure(false)}>Keep it</button></p>
            </div>
          ) : null}
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------- the side panel's list

export function ChosenSpells({ spells, value, onChange }: { spells: SpellOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const byId = new Map(spells.map((s) => [s.id, s]));
  const chosen = value.map((id) => byId.get(id)).filter(Boolean) as SpellOption[];
  if (!chosen.length) return <p className="dim">No spells on the list yet. Tick them on the left.</p>;
  return (
    <div className="chosen-spells">
      {SPELL_LEVELS.map((label, l) => {
        const rows = chosen.filter((s) => s.level === l).sort((a, b) => a.name.localeCompare(b.name));
        if (!rows.length) return null;
        return (
          <div key={label}>
            <h4>{label} <span className="dim">({rows.length})</span></h4>
            <p className="chips">{rows.map((s) => <span key={s.id} className="chip">{s.name}{s.mine ? ' ★' : ''}<button type="button" aria-label={'Remove ' + s.name} onClick={() => onChange(value.filter((x) => x !== s.id))}>✕</button></span>)}</p>
          </div>
        );
      })}
      <p className="dim">★ your homebrew</p>
    </div>
  );
}
