'use client';
import { useState, useTransition } from 'react';
import { ConfirmButton } from '@/components/ConfirmButton';
import { ALL_PERMS, NEEDS_HIDDEN, NOT_YET, PERMS, PRESETS, presetOf, type Perm, type PermSet } from '@/config/co-dm';
import { setCoDm, type PeopleState } from './actions';
import './people.css';

type Person = { id: string; name: string; joined: string; coDm: boolean; preset: string | null; perms: PermSet | null };

// One person in the campaign. A player can be made a co-DM from a preset. A co-DM's
// permissions can be changed one by one, or they can be made a player again.
function Row({ slug, person }: { slug: string; person: Person }) {
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState<PermSet>(person.perms ?? ALL_PERMS);
  const [start, setStart] = useState<'full' | 'combat' | 'lore'>('full');
  const [msg, setMsg] = useState<PeopleState>(null);
  const [pending, go] = useTransition();
  const preset = presetOf(perms);
  const every = PERMS.every((p) => perms[p.id]);
  const tick = (id: Perm, on: boolean) => {
    setMsg(null);
    const next = { ...perms, [id]: on };
    // edit, reveal and settings work on hidden things: they come with "See hidden content", and go with it
    if (on && NEEDS_HIDDEN.includes(id)) next.see_hidden = true;
    if (!on && id === 'see_hidden') for (const k of NEEDS_HIDDEN) next[k] = false;
    setPerms(next);
  };
  const applyPreset = (id: string) => { const p = PRESETS.find((x) => x.id === id); if (p) { setMsg(null); setPerms(p.perms ?? ALL_PERMS); } };
  const save = (make: boolean, p: PermSet | null) => go(async () => setMsg(await setCoDm(slug, person.id, make, p)));

  return (
    <li className={'ppl-row' + (person.coDm ? ' co' : '')}>
      <div className="ppl-head">
        <span className="ppl-who"><b>{person.name}</b> <small>Joined {person.joined}</small></span>
        <span className={'ppl-role' + (person.coDm ? ' co' : '')}>{person.coDm ? 'Co-DM' : 'Player'}</span>
        {person.coDm ? (
          <button type="button" className="ppl-btn" aria-expanded={open} aria-controls={'ppl-' + person.id} onClick={() => setOpen(!open)}>{open ? 'Done' : 'Permissions'}<span className="ppl-sr"> for {person.name}</span></button>
        ) : (
          <span className="ppl-make">
            <label className="ppl-sr" htmlFor={'ppl-start-' + person.id}>Start {person.name} from</label>
            <select id={'ppl-start-' + person.id} value={start} onChange={(e) => setStart(e.target.value as typeof start)}>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button type="button" className="ppl-btn" disabled={pending} onClick={() => save(true, PRESETS.find((p) => p.id === start)!.perms)}>{pending ? 'Saving' : 'Make co-DM'}</button>
          </span>
        )}
      </div>
      {person.coDm ? <p className="ppl-sum">{PRESETS.find((p) => p.id === (person.preset ?? ''))?.what ?? 'A custom set of permissions.'}</p> : null}
      {person.coDm && open ? (
        <div className="ppl-perms" id={'ppl-' + person.id}>
          <label className="ppl-preset">Start from
            <select value={preset} onChange={(e) => applyPreset(e.target.value)}>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="custom" disabled={preset !== 'custom'}>Custom</option>
            </select>
          </label>
          <ul>
            {PERMS.map((p) => (
              <li key={p.id}>
                <input id={`ppl-${person.id}-${p.id}`} type="checkbox" checked={perms[p.id]} onChange={(e) => tick(p.id, e.target.checked)} />
                <label htmlFor={`ppl-${person.id}-${p.id}`}>{p.name}
                  <span>{[p.what ? p.what + '.' : '', NEEDS_HIDDEN.includes(p.id) ? 'Needs "See hidden content".' : '', NOT_YET.includes(p.id) ? 'Not built yet; kept for when it is.' : ''].filter(Boolean).join(' ')}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="ppl-acts">
            {/* "Full co-DM" stores nothing, so it also covers permissions added later */}
            <button type="button" className="ppl-go" disabled={pending} onClick={() => save(true, every ? null : perms)}>{pending ? 'Saving' : 'Save permissions'}</button>
            <ConfirmButton className="ppl-btn danger" disabled={pending} ask={`Make ${person.name} a player again?`} yes="Yes, remove co-DM" onConfirm={() => save(false, null)}>Remove co-DM</ConfirmButton>
          </p>
        </div>
      ) : null}
      {msg?.error ? <p className="err" role="alert">{msg.error}</p> : null}
      {msg?.note ? <p className="okmsg" role="status">{msg.note}</p> : null}
    </li>
  );
}

export function PeopleForm({ slug, people }: { slug: string; people: Person[] }) {
  if (!people.length) return <p className="who">Nobody has joined this campaign yet.</p>;
  return <ul className="ppl">{people.map((p) => <Row key={p.id + (p.coDm ? ':dm' : ':pl') + JSON.stringify(p.perms)} slug={slug} person={p} />)}</ul>;
}
