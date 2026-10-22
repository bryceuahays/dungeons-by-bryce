'use client';
import { useState } from 'react';
import type { Entry, ToolProps } from '@/lib/entry-types';
import { Problem, useEntries } from '@/components/tools/kit';
import { supabaseBrowser } from '@/lib/supabase/client';
import { HiddenTag } from '@/features/hub/ui/Hidden';
import { useVisMode } from '@/features/hub/visibility/VisMode';
import { shortLabel, type VisValue } from '@/features/hub/visibility/model';
import { QuestEditor } from './QuestEditor';
import { byOrder, givenLine, heldNote, statusOf, tabsOf, type Named, type Status } from './model';

export type QuestFeatures = { hidden: boolean; rewards: boolean; track: boolean };
const TABS: [Status, string][] = [['active', 'Active'], ['completed', 'Completed'], ['failed', 'Failed']];

// The Quest log (Quests.png): Active, Completed and Failed, the main quest first, each quest with
// its giver, place, summary, objectives and reward. A player's browser only has the quests and
// objectives the database let them read, and only how many objectives are still hidden from them;
// this lays them out. The DM also adds and edits quests and ticks objectives off.
export function QuestsPage(p: ToolProps & { initial: Entry[]; hidden: Record<string, number>; tracked: string[]; npcs: Named[]; places: Named[]; features: QuestFeatures; canTrack: boolean }) {
  const { rows, save, remove, msg } = useEntries(p.initial);
  const mode = useVisMode();
  const [tab, setTab] = useState<Status>('active');
  const [open, setOpen] = useState<string | null>(null);   // a quest's id, or 'new'
  const [tracked, setTracked] = useState<Set<string>>(() => new Set(p.tracked));
  const [trackErr, setTrackErr] = useState('');
  const edit = p.dm && p.canWrite;
  const f = p.features;
  const people = p.members.map((m) => ({ id: m.user_id, label: m.display_name || 'Unnamed' }));
  const beatNames = mode.beats.map((b) => ({ id: b.id, label: b.title }));
  const label = (v: VisValue) => shortLabel(v, people, p.stages, beatNames);

  const quests = rows.filter((r) => r.kind === 'quest');
  const objectivesOf = (id: string) => rows.filter((r) => r.kind === 'objective' && r.parent === id).sort(byOrder);
  const tabs = tabsOf(quests);
  const count = (s: Status) => quests.filter((q) => statusOf(q) === s).length;

  const tick = (o: Entry) => save({ id: o.id, campaign_id: p.campaignId, kind: 'objective', status: o.status === 'done' ? 'open' : 'done' });
  const track = async (id: string) => {
    setTrackErr('');
    const sb = supabaseBrowser();
    const on = tracked.has(id);
    const { error } = on
      ? await sb.from('quest_tracks').delete().eq('quest_id', id).eq('user_id', p.userId)
      : await sb.from('quest_tracks').insert({ quest_id: id, campaign_id: p.campaignId });
    if (error) return setTrackErr('That did not save. Try again.');
    setTracked((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; });
  };

  const editor = (q: Partial<Entry>) => (
    <div className="qs-edit"><QuestEditor quest={q} objectives={q.id ? objectivesOf(q.id) : []} p={p} npcs={p.npcs} places={p.places} features={f} save={save} remove={remove} close={() => setOpen(null)} /></div>
  );

  const card = (q: Entry) => {
    if (open === q.id) return <div key={q.id}>{editor(q)}</div>;
    const objs = objectivesOf(q.id);
    const hidden = p.dm ? 0 : p.hidden[q.id] ?? 0;
    const note = heldNote(q, hidden, f);
    const status = statusOf(q);
    const reward = typeof q.data.reward === 'string' ? q.data.reward : q.data.rewardLater && status === 'active' ? '???' : '';
    const held = p.dm && q.vis !== 'all';
    const given = givenLine(q, p.npcs, p.places);
    return (
      <article key={q.id} className={'qs-card' + (q.data.main ? ' main' : '') + (held ? ' hid' : '')} aria-labelledby={'qs-' + q.id}>
        <div className="qs-head">
          <div className="qs-name">
            {held ? <HiddenTag>{label(q)}</HiddenTag> : null}
            <h3 id={'qs-' + q.id}>{q.title}</h3>
            {given ? <p className="qs-given">{given}</p> : null}
          </div>
          <div className="qs-acts">
            {f.track && p.canTrack && status === 'active' ? (
              <button type="button" className={'qs-track' + (tracked.has(q.id) ? ' on' : '')} aria-pressed={tracked.has(q.id)} onClick={() => void track(q.id)}>{tracked.has(q.id) ? 'Tracking' : 'Track'}</button>
            ) : null}
            {edit ? <button type="button" className="act sm" onClick={() => setOpen(q.id)}>Edit<span className="qs-sr"> {q.title}</span></button> : null}
          </div>
        </div>
        {typeof q.data.summary === 'string' && q.data.summary ? <p className="qs-sum">{q.data.summary}</p> : null}
        {objs.length || (f.hidden && hidden) ? (
          <ul className="qs-list" aria-label="Objectives">
            {objs.map((o) => {
              const done = o.status === 'done';
              const own = p.dm && o.vis !== 'all';
              return (
                <li key={o.id} className={done ? 'done' : ''}>
                  {edit ? (
                    <input type="checkbox" className="qs-box" checked={done} aria-label={`Done: ${o.title}`} onChange={() => void tick(o)} />
                  ) : <span className="qs-box" role="img" aria-label={done ? 'Done' : 'Not done yet'}>{done ? '✓' : ''}</span>}
                  <span className="qs-text">{o.title}</span>
                  {own ? <HiddenTag>{label(o)}</HiddenTag> : null}
                </li>
              );
            })}
            {f.hidden ? Array.from({ length: hidden }, (_, i) => (
              <li key={'h' + i} className="unknown"><span className="qs-box" aria-hidden="true" /><span className="qs-text">??? Not revealed yet</span></li>
            )) : null}
          </ul>
        ) : null}
        {(f.rewards && reward) || note ? (
          <div className="qs-foot">
            {f.rewards && reward ? <span className="qs-reward">{status === 'completed' ? 'Reward received' : 'Reward'}: <b>{reward}</b></span> : <span />}
            {note ? <span className="qs-note">{note}</span> : null}
          </div>
        ) : null}
        {p.dm && f.rewards && q.data.rewardLater && typeof q.secret?.reward === 'string' ? <p className="qs-dm"><HiddenTag>Only you see this</HiddenTag> {`Reward on completion: ${q.secret.reward}`}</p> : null}
      </article>
    );
  };

  const groups = tabs[tab];
  return (
    <div className="wrap qs">
      <header className="qs-top">
        <div>
          <h1>Quest log</h1>
          <p className="qs-lede">{p.dm ? 'What the party is working toward. Tick objectives off as they are done, and choose what players see of each quest.' : 'What the party is working toward. Objectives tick off as the DM updates them.'}</p>
        </div>
        {edit ? <button type="button" className="qs-add" onClick={() => setOpen('new')}>+ Add quest</button> : null}
      </header>

      <div className="qs-tabs" role="group" aria-label="Show">
        {TABS.map(([s, l]) => <button key={s} type="button" aria-pressed={tab === s} onClick={() => setTab(s)}>{`${l} · ${count(s)}`}</button>)}
      </div>

      <Problem r={msg} />
      {trackErr ? <p className="err" role="alert">{trackErr}</p> : null}
      {open === 'new' ? editor({}) : null}

      {groups.length ? groups.map((g) => (
        <section key={g.title} className="qs-group" aria-label={g.title}>
          <h2>{g.title}</h2>
          <div className="qs-cards">{g.quests.map(card)}</div>
        </section>
      )) : (
        <p className="qs-empty">{tab === 'active' ? (edit ? 'No active quests yet. Add the first one.' : 'No quests yet.') : tab === 'completed' ? 'No quests completed yet.' : 'No failed quests.'}</p>
      )}
    </div>
  );
}
