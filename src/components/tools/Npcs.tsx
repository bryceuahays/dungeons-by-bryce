'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useMemo, useState } from 'react';
import type { Entry, ToolProps } from '@/lib/entry-types';
import { EntityCard } from '../EntityCard';
import { visLabel } from '../VisPicker';
import { EntryForm, Problem, uploadPicture, useEntries, visOf, type F } from './kit';
import type { SheetSystem } from '@/features/systems/model';
import { HiddenTag } from '@/features/hub/ui/Hidden';
import { useVisMode } from '@/features/hub/visibility/VisMode';
import { REVEAL, npcFull, npcSplit, revealLabel, revealOf, type Reveal } from '@/features/hub/visibility/model';

const STATUSES: [string, string][] = [['alive', 'Alive'], ['dead', 'Dead'], ['missing', 'Missing'], ['hostile', 'Hostile'], ['allied', 'Allied']];

function NpcEditor({ n, p, fields, save, remove, close }: { n: Partial<Entry>; p: ToolProps; fields: F[]; save: ReturnType<typeof useEntries>['save']; remove: ReturnType<typeof useEntries>['remove']; close: () => void }) {
  // The NPC as the DM edits it: the details held back from players (a partial reveal) put back in place.
  const full = npcFull(n);
  const [pic, setPic] = useState<string>(String(full.data.file ?? ''));
  const [err, setErr] = useState('');
  const mode = useVisMode();
  const [level, setLevel] = useState<Reveal>(n.id ? revealOf(n.data) : mode.defaults.npcReveal);
  const v2 = mode.on;
  return (
    <div className="plate">
      <h3>{n.id ? 'Edit ' + n.title : 'New NPC'}</h3>
      <EntryForm fields={fields} entry={{ ...n, status: full.status || 'alive', data: full.data }} stages={p.stages} members={p.members} canName={p.make.player_secrets}
        onCancel={() => close()} onDelete={n.id ? () => { void remove(n.id!); close(); } : undefined}
        onSave={async (patch, secret) => {
          // what players may read goes on the NPC itself; anything held back goes with the DM-only notes
          const kept = npcSplit({ status: patch.status || 'alive', data: { ...patch.data, file: pic || undefined } }, secret, level);
          const r = await save({ ...patch, id: n.id, campaign_id: p.campaignId, kind: 'npc', status: kept.status, data: kept.data }, kept.secret);
          if (!r.error) close();
          return r;
        }}>
        <label className="f" style={{ marginTop: 10 }}>Portrait (optional)
          <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const up = await uploadPicture(p.campaignId, 'npc', f, 640); if (up.error) setErr(up.error); else { setErr(''); setPic(up.path!); } }} />
        </label>
        {pic ? <p className="muted">A portrait is attached. <button type="button" className="act sm" onClick={() => setPic('')}>Remove it</button></p> : null}
        {err ? <p className="err">{err}</p> : null}
        {v2 || level !== 'all' ? (
          <label className="f" style={{ marginTop: 10 }}>What players see of them
            <select value={level} onChange={(e) => setLevel(e.target.value as Reveal)}>{REVEAL.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
            <small className="muted">{REVEAL.find((r) => r[0] === level)![2]} This is for the players who can see this NPC at all. DM notes are never shown to players.</small>
          </label>
        ) : null}
      </EntryForm>
    </div>
  );
}

// The NPC tracker. What players get is the public part of an NPC they are allowed to
// see: name, portrait, where they are, their faction, their status, and "what the
// players know". What the NPC wants, their relationships and their secrets are stored
// apart and only ever sent to the DM.
export function NpcTool(p: ToolProps & { initial: Entry[]; monsters: { id: string; name: string; source: string; data: any }[]; consequences?: Entry[]; system?: SheetSystem | null }) {
  const { rows, save, remove, msg } = useEntries(p.initial);
  const [open, setOpen] = useState<string | null>(null);   // entry being edited, or 'new'
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState({ location: '', faction: '', status: '' });
  // a partly revealed NPC keeps the rest with the DM's notes; the DM's own view puts it back together
  const npcs = rows.filter((r) => r.kind === 'npc').map((r) => (p.dm && r.secret ? { ...r, ...npcFull(r), shown: revealOf(r.data) } : { ...r, shown: 'all' as Reveal }));
  const uniq = (k: string) => [...new Set(npcs.map((n) => String(n.data[k] ?? '').trim()).filter(Boolean))].sort();
  const shown = useMemo(() => npcs.filter((n) => {
    const hay = `${n.title} ${n.data.location ?? ''} ${n.data.faction ?? ''} ${n.data.known ?? ''} ${n.secret?.wants ?? ''} ${n.secret?.secret ?? ''}`.toLowerCase();
    return (!q || hay.includes(q.toLowerCase())) && (!filter.location || n.data.location === filter.location) && (!filter.faction || n.data.faction === filter.faction) && (!filter.status || n.status === filter.status);
  }).sort((a, b) => a.title.localeCompare(b.title)), [npcs, q, filter]);

  const fields: F[] = [
    { key: 'name', label: 'Name', title: true },
    { key: 'status', label: 'Status', status: true, kind: 'select', options: STATUSES, def: 'alive' },
    { key: 'location', label: 'Location' },
    { key: 'faction', label: 'Faction' },
    { key: 'known', label: 'What the players know', kind: 'long', help: 'Players who can see this NPC read this.' },
    { key: 'wants', label: 'What they want', kind: 'long', secret: true },
    { key: 'relations', label: 'Relationships to the characters and to other NPCs', kind: 'long', secret: true },
    { key: 'secret', label: 'Secrets', kind: 'long', secret: true },
    { key: 'stat', label: 'Stat block', kind: 'select', secret: true, options: [['', 'None'], ...p.monsters.map((m) => [m.id, m.name + (m.source === 'srd' ? '' : ' (homebrew)')] as [string, string])] },
  ];

  return (
    <div className="wrap">
      <h2>NPCs</h2>
      <p className="lede">{p.dm ? 'Everyone the party has met or will meet. An NPC is yours alone until you choose who sees them.' : 'The people you have met.'}</p>
      <div className="tbar">
        <label className="f">Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, place, anything" /></label>
        {(['location', 'faction'] as const).map((k) => (uniq(k).length ? <label key={k} className="f">{k === 'location' ? 'Location' : 'Faction'}<select value={filter[k]} onChange={(e) => setFilter({ ...filter, [k]: e.target.value })}><option value="">All</option>{uniq(k).map((v) => <option key={v}>{v}</option>)}</select></label> : null))}
        <label className="f">Status<select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">All</option>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {p.dm && p.canWrite ? <button type="button" className="act" onClick={() => setOpen('new')}>Add an NPC</button> : null}
      </div>
      <Problem r={msg} />
      {open === 'new' ? <NpcEditor n={{}} p={p} fields={fields} save={save} remove={remove} close={() => setOpen(null)} /> : null}
      <div className="grid g2">
        {shown.map((n) => (open === n.id ? <NpcEditor key={n.id} n={rows.find((r) => r.id === n.id) ?? n} p={p} fields={fields} save={save} remove={remove} close={() => setOpen(null)} /> : (
          <article key={n.id} className="plate npc">
            <div className="npc-head">
              {n.data.file ? <img src={`${p.base ?? '/c/' + p.slug}/file/${n.id}?v=${encodeURIComponent(n.data.file.slice(-12))}`} alt="" loading="lazy" /> : null}
              <div>
                <h3>{n.title}</h3>
                <p className="who">{[STATUSES.find((s) => s[0] === n.status)?.[1], n.data.faction, n.data.location].filter(Boolean).join(' · ')}</p>
                {p.dm ? <p><span className={'pillb ' + (n.vis === 'dm' ? 'dm' : 'pl')}>{visLabel(visOf(n), p.stages, p.members)}</span>{n.shown !== 'all' ? <> <HiddenTag>Players see: {revealLabel(n.shown).toLowerCase()}</HiddenTag></> : null}</p> : null}
              </div>
            </div>
            {n.data.known ? <><h4>{p.dm ? 'What the players know' : 'What you know'}</h4><p style={{ whiteSpace: 'pre-wrap' }}>{n.data.known}</p></> : null}
            {p.dm && n.secret ? (
              <div className="secret"><span className="tag">DM only</span><div className="sb">
                {n.secret.wants ? <p><b>Wants:</b> {n.secret.wants}</p> : null}
                {n.secret.relations ? <p style={{ whiteSpace: 'pre-wrap' }}><b>Relationships:</b> {n.secret.relations}</p> : null}
                {n.secret.secret ? <p style={{ whiteSpace: 'pre-wrap' }}><b>Secrets:</b> {n.secret.secret}</p> : null}
                {n.secret.stat && p.monsters.find((m) => m.id === n.secret!.stat) ? <details><summary>Stat block</summary><EntityCard abilities={p.system?.rules.abilities} type="monster" name={p.monsters.find((m) => m.id === n.secret!.stat)!.name} data={p.monsters.find((m) => m.id === n.secret!.stat)!.data} /></details> : null}
                {!n.secret.wants && !n.secret.relations && !n.secret.secret && !n.secret.stat ? <p className="who">No DM notes yet.</p> : null}
              </div></div>
            ) : null}
            {(p.consequences ?? []).filter((c) => (c.data.tags ?? []).some((t: string) => t.toLowerCase() === n.title.toLowerCase())).length ? (
              <details><summary>How the party has changed things for them</summary>
                <ul>{(p.consequences ?? []).filter((c) => (c.data.tags ?? []).some((t: string) => t.toLowerCase() === n.title.toLowerCase())).map((c) => <li key={c.id}>{c.data.session ? `Session ${c.data.session}: ` : ''}{c.title}</li>)}</ul>
              </details>
            ) : null}
            {p.dm && p.canWrite ? <p className="row"><button type="button" className="act sm" onClick={() => setOpen(n.id)}>Edit</button></p> : null}
          </article>
        )))}
      </div>
      {shown.length ? null : <p className="who">{npcs.length ? 'Nobody matches that.' : p.dm ? 'No NPCs yet.' : 'Nobody yet.'}</p>}
    </div>
  );
}
