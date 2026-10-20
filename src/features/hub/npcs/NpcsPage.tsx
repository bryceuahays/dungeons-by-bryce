'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useMemo, useState } from 'react';
import type { Entry, ToolProps } from '@/lib/entry-types';
import { NpcEditor, STATUSES, npcFields } from '@/components/tools/Npcs';
import { Problem, useEntries } from '@/components/tools/kit';
import { HiddenTag } from '@/features/hub/ui/Hidden';
import { WhoSees } from '@/features/hub/visibility/WhoSees';
import { useVisMode } from '@/features/hub/visibility/VisMode';
import { npcFull, npcSplit, type Reveal } from '@/features/hub/visibility/model';
import { SEES, attitudeLabel, attitudeOf, isHidden, matches, metLine, seesOf, type Chip, type Sees } from './model';

type Named = { id: string; label: string };
export type NpcFeatures = { portraits: boolean; attitude: boolean; partial: boolean; filters: boolean };

const CHIPS: [Chip, string][] = [['all', 'All'], ['ally', 'Allies'], ['neutral', 'Neutral'], ['hostile', 'Hostile'], ['hidden', 'Hidden']];

// The NPCs page (NPCs.png): a card for each NPC, with portrait, attitude, role, what the players
// know and when they were met. The DM also chooses on each card how much players see. What a
// player's browser is given was already decided on the server (row-level security, and the
// partial reveal kept apart from the NPC's own row); this only lays it out.
export function NpcsPage(p: ToolProps & { initial: Entry[]; monsters: { id: string; name: string; source: string; data: any }[]; features: NpcFeatures; chapters: Named[]; beats: Named[] }) {
  const { rows, save, remove, msg } = useEntries(p.initial);
  const mode = useVisMode();
  const [open, setOpen] = useState<string | null>(null);   // the NPC being edited, or 'new'
  const [chip, setChip] = useState<Chip>('all');
  const [q, setQ] = useState('');
  const [signal, setSignal] = useState<{ id: string; n: number }>({ id: '', n: 0 });
  const base = p.base ?? '/c/' + p.slug;
  const people = p.members.map((m) => ({ id: m.user_id, label: m.display_name || 'Unnamed' }));
  const fields = npcFields(p.monsters, true);
  const f = p.features;

  // the DM's view puts a partly revealed NPC back together (the rest is with the DM's notes); how
  // much players see is read from the NPC as stored, before that
  const npcs = useMemo(() => rows.filter((r) => r.kind === 'npc').map((r) => ({ ...(p.dm && r.secret ? { ...r, ...npcFull(r) } : r), sees: seesOf(r) })), [rows, p.dm]);
  const shown = npcs.filter((n) => !f.filters || matches(n, chip, q)).sort((a, b) => a.title.localeCompare(b.title));
  const edit = p.dm && p.canWrite;

  // "Players see": one choice for how much, and for whom
  const setSees = async (id: string, to: Sees) => {
    const raw = rows.find((r) => r.id === id);
    if (!raw) return;
    if (to === 'some') { setSignal({ id, n: Date.now() }); return; }
    const base = { id, campaign_id: p.campaignId, kind: 'npc' };
    if (to === 'hidden') { await save({ ...base, vis: 'dm', vis_stage: null, vis_entry: null }); return; }
    const kept = npcSplit(npcFull(raw), (raw.secret ?? {}) as Record<string, unknown>, to as Reveal);
    await save({ ...base, vis: 'all', vis_players: [], vis_stage: null, vis_entry: null, status: kept.status, data: kept.data }, kept.secret);
  };

  return (
    <div className="wrap np">
      <header className="np-top">
        <div>
          <h1>NPCs</h1>
          <p className="np-lede">{p.dm ? 'Everyone the party has met. Choose how much players see of each.' : 'The people you have met.'}</p>
        </div>
        {edit ? <button type="button" className="np-add" onClick={() => setOpen('new')}>+ Add NPC</button> : null}
      </header>

      {f.filters ? (
        <div className="np-bar">
          <label className="np-search"><span className="np-sr">Search NPCs</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NPCs" /></label>
          <div className="np-chips" role="group" aria-label="Show">
            {CHIPS.filter(([c]) => (c !== 'hidden' || p.dm) && (f.attitude || c === 'all' || c === 'hidden')).map(([c, label]) => (
              <button key={c} type="button" aria-pressed={chip === c} onClick={() => setChip(c)}>{label}</button>
            ))}
          </div>
        </div>
      ) : null}

      <Problem r={msg} />
      {open === 'new' ? <div className="np-edit"><NpcEditor n={{}} p={p} fields={fields} save={save} remove={remove} close={() => setOpen(null)} /></div> : null}

      <div className="np-grid">
        {shown.map((n) => {
          if (open === n.id) return <div key={n.id} className="np-edit"><NpcEditor n={rows.find((r) => r.id === n.id) ?? n} p={p} fields={fields} save={save} remove={remove} close={() => setOpen(null)} /></div>;
          const sees = n.sees;
          const att = f.attitude ? attitudeOf(n) : null;
          const held = p.dm && sees !== 'all';   // players do not get all of this card
          const status = STATUSES.find((s) => s[0] === n.status && (s[0] === 'dead' || s[0] === 'missing'))?.[1];
          const pic = f.portraits && n.data?.file ? `${base}/file/${n.id}?v=${encodeURIComponent(String(n.data.file).slice(-12))}` : null;
          const options = SEES.filter(([s]) => (f.partial || (s !== 'portrait' && s !== 'name') || s === sees) && (s !== 'some' || mode.defaults.named || sees === 'some'));
          return (
            <article key={n.id} className={'np-card' + (p.dm && isHidden(n) && sees !== 'some' ? ' hid' : '')} aria-label={n.title}>
              {f.portraits ? (
                <div className="np-pic">
                  {pic ? <img src={pic} alt={'Portrait of ' + n.title} loading="lazy" /> : <span className="np-nopic" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg><small>Portrait</small></span>}
                  {p.dm && pic && sees === 'name' ? <span className="np-pictag"><HiddenTag>Players don&apos;t see this</HiddenTag></span> : null}
                </div>
              ) : null}
              <div className="np-body">
                <div className="np-name">
                  <h3>{n.title}</h3>
                  {att ? <span className={'np-att ' + att}>{attitudeLabel(att)}</span> : null}
                </div>
                {n.data?.role ? <p className="np-role">{String(n.data.role)}</p> : null}
                {status ? <p className="np-status">{status}</p> : null}
                {n.data?.known ? <p className={'np-bg' + (held && sees !== 'some' ? ' held' : '')}>{String(n.data.known)}</p> : null}
                {held && (sees === 'portrait' || sees === 'name') ? <p className="np-bg held">Players only know {sees === 'portrait' ? 'the name and face' : 'the name'}.</p> : null}
                {metLine(n, p.dm, { people, chapters: p.chapters, beats: p.beats }) ? <p className="np-met">{metLine(n, p.dm, { people, chapters: p.chapters, beats: p.beats })}</p> : null}
              </div>
              {edit ? (
                <div className="np-sees">
                  <label>Players see
                    <select className={held ? 'held' : ''} value={sees === 'later' ? 'later' : sees} onChange={(e) => void setSees(n.id, e.target.value as Sees)}>
                      {sees === 'later' ? <option value="later">Nothing yet (waiting)</option> : null}
                      {options.map(([s, label]) => <option key={s} value={s}>{s === 'some' && sees === 'some' ? `Only ${n.vis_players.map((id) => people.find((x) => x.id === id)?.label ?? 'a player').join(', ') || 'some players'}` : label}</option>)}
                    </select>
                  </label>
                  <div className="np-acts">
                    <WhoSees value={{ vis: n.vis, vis_players: n.vis_players ?? [], vis_stage: n.vis_stage, vis_entry: n.vis_entry }} stages={p.stages} members={p.members} beats={mode.beats}
                      canName={p.make.player_secrets} named={mode.defaults.named} nextSession={mode.nextSession} label="Who and when" openSignal={signal.id === n.id ? signal.n : 0}
                      onChange={(v) => void save({ id: n.id, campaign_id: p.campaignId, kind: 'npc', ...v })} />
                    <button type="button" className="np-edit-btn" onClick={() => setOpen(n.id)}>Edit</button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
        {edit ? <button type="button" className="np-card np-new" onClick={() => setOpen('new')}><span aria-hidden="true">+</span>Add NPC</button> : null}
      </div>
      {shown.length ? null : <p className="np-empty">{npcs.length ? 'Nobody matches that.' : p.dm ? 'No NPCs yet. Add the first one.' : 'You have not met anyone yet.'}</p>}
    </div>
  );
}
