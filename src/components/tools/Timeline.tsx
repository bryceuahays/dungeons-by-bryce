'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useTransition } from 'react';
import type { Entry, ToolProps } from '@/lib/entry-types';
import { saveSetting } from '@/app/c/[slug]/actions';
import { VisPicker, visLabel } from '../VisPicker';
import { EntryForm, Problem, useEntries, visOf, type F } from './kit';

export const beatOverdue = (b: Pick<Entry, 'status' | 'data'>, session: number) => b.status === 'planned' && !!b.data.key && Number(b.data.target) > 0 && session > Number(b.data.target);
const today = () => new Date().toISOString().slice(0, 10);

// The story timeline. The DM plans beats ahead of time (they stay with the DM until they
// happen), flags the ones that must happen, and marks each as hit with one click. Players
// only ever receive beats that have happened and that they are allowed to see, plus the
// ones they add themselves.
export function TimelineTool(p: ToolProps & { initial: Entry[]; npcs: { id: string; title: string }[] }) {
  const { rows, save, remove, msg } = useEntries(p.initial);
  const [open, setOpen] = useState<string | null>(null);
  const [session, setSession] = useState(p.session);
  const [, start] = useTransition();
  const beats = rows.filter((r) => r.kind === 'beat').sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  const notes = rows.filter((r) => r.kind === 'note');
  const key = beats.filter((b) => b.status === 'planned' && b.data.key);
  const who = (id: string | null) => (id === p.userId ? 'you' : p.members.find((m) => m.user_id === id)?.display_name ?? 'a player');

  const fields: F[] = [
    { key: 'title', label: 'What happens', title: true },
    { key: 'note', label: 'Short note', kind: 'long' },
    { key: 'location', label: 'Where (optional)' },
    ...(p.dm ? [
      { key: 'key', label: 'Key beat: this must happen', kind: 'check' } as F,
      { key: 'target', label: 'Target session for a key beat (optional)', kind: 'number' } as F,
      { key: 'stage', label: 'Happens by itself when the campaign reaches', kind: 'select', options: [['', 'Nothing: I mark it myself'], ...p.stages.map((s) => [s.id, s.label] as [string, string])] } as F,
      { key: 'npcs', label: 'NPCs involved (names, separated by commas)' } as F,
    ] : [{ key: 'mine', label: 'Only I see it', kind: 'check' } as F]),
  ];

  const hit = (b: Entry) => save({ id: b.id, campaign_id: p.campaignId, kind: 'beat', status: 'hit', live: true, vis: b.vis === 'dm' ? 'all' : b.vis, data: { ...b.data, hitAt: today(), hitSession: session || null } });
  const move = async (b: Entry, dir: -1 | 1) => {
    const i = beats.findIndex((x) => x.id === b.id), j = i + dir;
    if (j < 0 || j >= beats.length) return;
    const order = [...beats]; [order[i], order[j]] = [order[j], order[i]];
    await Promise.all(order.map((x, k) => (x.sort === (k + 1) * 10 ? null : save({ id: x.id, campaign_id: p.campaignId, kind: 'beat', sort: (k + 1) * 10 }))));
  };

  return (
    <div className="wrap">
      <h2>Story timeline</h2>
      <p className="lede">{p.dm ? 'Plan the beats of your story. Planned beats are yours alone until they happen.' : 'The story so far. Add your own moments and notes as you go.'}</p>
      <Problem r={msg} />

      {p.dm ? (
        <div className="plate">
          <div className="tbar">
            <label className="f" style={{ maxWidth: 190 }}>The session you are on
              <input type="number" min={0} max={999} value={session} onChange={(e) => setSession(Number(e.target.value) || 0)} onBlur={() => start(async () => { await saveSetting(p.slug, 'session', session); })} />
            </label>
            {p.canWrite ? <button type="button" className="act" onClick={() => setOpen('new')}>Plan a beat</button> : null}
          </div>
          <h3>Key beats remaining ({key.length})</h3>
          {key.length ? (
            <ul className="check">
              {key.map((b) => (
                <li key={b.id}><label><input type="checkbox" checked={false} onChange={() => hit(b)} aria-label={'Mark as hit: ' + b.title} /><span>{b.title}{b.data.target ? <small className="who"> · aim for session {b.data.target}</small> : null}{b.vis === 'players' ? <small className="who"> · for {b.vis_players.map(who).join(', ')}</small> : null}{beatOverdue(b, session) ? <span className="pillb dm">Overdue</span> : null}</span></label></li>
              ))}
            </ul>
          ) : <p className="who">No key beats are waiting.</p>}
        </div>
      ) : (p.canWrite ? <p className="row"><button type="button" className="act" onClick={() => setOpen('new')}>Add to the timeline</button></p> : null)}

      {open === 'new' ? (
        <div className="plate">
          <h3>{p.dm ? 'Plan a beat' : 'Add to the timeline'}</h3>
          <EntryForm fields={fields} entry={{ vis: 'all' }} stages={p.stages} members={p.members} canName={true} allowVis={p.dm ? ['all', 'players', 'stage'] : null} saveLabel={p.dm ? 'Plan it' : 'Add'} onCancel={() => setOpen(null)}
            onSave={async (patch) => {
              const r = await save(p.dm
                ? { ...patch, campaign_id: p.campaignId, kind: 'beat', status: 'planned', live: false, sort: (beats.at(-1)?.sort ?? 0) + 10 }
                : { ...patch, campaign_id: p.campaignId, kind: 'beat', status: 'hit', live: true, vis: patch.data?.mine ? 'players' : 'all', vis_players: patch.data?.mine ? [p.userId] : [], owner: p.userId, sort: (beats.at(-1)?.sort ?? 0) + 10, data: { ...patch.data, hitAt: today(), hitSession: session || null } });
              if (!r.error) setOpen(null);
              return r;
            }}>
            {p.dm ? <p className="muted">To plan a beat for one player, choose &quot;Only the players I name&quot;. Only that player and you will ever see it.</p> : null}
          </EntryForm>
        </div>
      ) : null}

      <ol className="tl">
        {beats.map((b, i) => {
          const mine = b.owner === p.userId, canEdit = p.canWrite && (p.dm || mine);
          const personal = b.vis === 'players';
          if (open === b.id) return (
            <li key={b.id} className="plate">
              <EntryForm fields={fields} entry={b} stages={p.stages} members={p.members} canName={true} allowVis={p.dm ? ['all', 'players', 'stage'] : null} onCancel={() => setOpen(null)}
                onDelete={() => { void remove(b.id); setOpen(null); }}
                onSave={async (patch) => { const r = await save({ ...patch, id: b.id, campaign_id: p.campaignId, kind: 'beat', status: b.status, ...(p.dm ? {} : { vis: patch.data?.mine ? 'players' : 'all', vis_players: patch.data?.mine ? [p.userId] : [] }) }); if (!r.error) setOpen(null); return r; }} />
            </li>
          );
          return (
            <li key={b.id} className={'tl-beat ' + b.status + (b.data.key ? ' key' : '')}>
              <div className="tl-head">
                <b>{b.title}</b>
                {p.dm ? <span className={'pillb ' + (b.status === 'hit' ? 'pl' : 'dm')}>{b.status === 'hit' ? 'Hit' : b.status === 'dropped' ? 'Dropped' : 'Planned'}</span> : null}
                {b.data.key ? <span className="pillb">Key</span> : null}
                {beatOverdue(b, session) ? <span className="pillb dm">Overdue</span> : null}
                {personal ? <span className="pillb dm">{b.owner && !p.dm && mine ? 'Private to you' : 'For ' + b.vis_players.map(who).join(', ')}</span> : null}
                {b.owner && b.owner !== p.userId && !p.dm ? <span className="pillb">added by {who(b.owner)}</span> : null}
                {p.dm && b.owner && p.members.some((m) => m.user_id === b.owner) ? <span className="pillb">added by {who(b.owner)}</span> : null}
              </div>
              <p className="who">{[b.data.hitSession ? 'Session ' + b.data.hitSession : b.status === 'planned' && b.data.target ? 'Aim for session ' + b.data.target : '', b.data.hitAt, b.data.location, b.data.npcs ? 'With ' + b.data.npcs : ''].filter(Boolean).join(' · ')}</p>
              {b.data.note ? <p style={{ whiteSpace: 'pre-wrap' }}>{b.data.note}</p> : null}
              {p.dm && b.status !== 'dropped' ? <p className="muted">{b.status === 'hit' ? 'Seen by: ' : 'When it happens, seen by: '}{visLabel(visOf(b), p.stages, p.members)}{b.data.stage ? ` · happens by itself at "${p.stages.find((s) => s.id === b.data.stage)?.label ?? b.data.stage}"` : ''}</p> : null}
              {p.dm && b.status === 'hit' && p.canWrite ? <p><VisPicker value={visOf(b)} stages={p.stages} members={p.members} allow={['all', 'players', 'stage', 'dm']} onChange={(v) => save({ id: b.id, campaign_id: p.campaignId, kind: 'beat', ...v })} /></p> : null}
              {notes.filter((n) => n.parent === b.id).map((n) => (
                <p key={n.id} className="tl-note"><b>{who(n.owner)}:</b> {n.title}{n.vis === 'players' ? <span className="pillb dm">private</span> : null} {p.canWrite && (n.owner === p.userId || p.dm) ? <button type="button" className="act sm" onClick={() => remove(n.id)}>Remove</button> : null}</p>
              ))}
              <p className="row">
                {p.dm && p.canWrite && b.status === 'planned' ? <button type="button" className="act" onClick={() => hit(b)}>It happened</button> : null}
                {p.dm && p.canWrite && b.status === 'planned' ? <button type="button" className="act sm" onClick={() => save({ id: b.id, campaign_id: p.campaignId, kind: 'beat', status: 'dropped', live: false })}>Drop it</button> : null}
                {p.dm && p.canWrite && b.status !== 'planned' ? <button type="button" className="act sm" onClick={() => save({ id: b.id, campaign_id: p.campaignId, kind: 'beat', status: 'planned', live: false })}>Back to planned</button> : null}
                {p.dm && p.canWrite ? <><button type="button" className="act sm" disabled={i === 0} onClick={() => move(b, -1)}>Earlier</button><button type="button" className="act sm" disabled={i === beats.length - 1} onClick={() => move(b, 1)}>Later</button></> : null}
                {canEdit ? <button type="button" className="act sm" onClick={() => setOpen(b.id)}>Edit</button> : null}
                {p.canWrite && b.status === 'hit' ? <NoteAdder onAdd={(text, priv) => save({ campaign_id: p.campaignId, kind: 'note', parent: b.id, title: text, owner: p.userId, live: true, vis: priv ? 'players' : 'all', vis_players: priv ? [p.userId] : [] })} /> : null}
              </p>
            </li>
          );
        })}
      </ol>
      {beats.length ? null : <p className="who">{p.dm ? 'Nothing planned yet.' : 'Nothing has happened yet.'}</p>}
    </div>
  );
}

function NoteAdder({ onAdd }: { onAdd: (text: string, priv: boolean) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [priv, setPriv] = useState(false);
  if (!open) return <button type="button" className="act sm" onClick={() => setOpen(true)}>Add a note</button>;
  return (
    <span className="row" style={{ flex: '1 1 100%' }}>
      <input aria-label="Your note" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} style={{ flex: '1 1 220px' }} />
      <label className="ck"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Only I see it</label>
      <button type="button" className="act sm" disabled={!text.trim()} onClick={async () => { await onAdd(text.trim(), priv); setText(''); setOpen(false); }}>Save note</button>
    </span>
  );
}
