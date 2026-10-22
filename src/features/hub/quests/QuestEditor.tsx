'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import type { Entry, ToolProps } from '@/lib/entry-types';
import type { Result } from '@/components/tools/kit';
import { ConfirmButton } from '@/components/ConfirmButton';
import { WhoSees } from '@/features/hub/visibility/WhoSees';
import { useVisMode } from '@/features/hub/visibility/VisMode';
import type { VisValue } from '@/features/hub/visibility/model';
import { REWARD_WHEN, STATUSES, byOrder, inputOf, splitQuest, type Named, type QuestInput, type RewardWhen } from './model';

type Save = (row: Partial<Entry> & { campaign_id: string; kind: string }, secret?: Record<string, any>) => Promise<Result>;
type Obj = { id?: string; title: string; done: boolean; vis: VisValue };
const EVERYONE: VisValue = { vis: 'all', vis_players: [], vis_stage: null, vis_entry: null };
const visOf = (e: Partial<Entry>): VisValue => ({ vis: e.vis ?? 'all', vis_players: e.vis_players ?? [], vis_stage: e.vis_stage ?? null, vis_entry: e.vis_entry ?? null });
const OTHER = 'other';

// The form for one quest and its objectives. What players may read goes on the quest and its
// objectives; the DM's notes, and a reward kept back until the quest is completed, go with the
// DM-only secrets. Each objective can be hidden on its own (when Hidden objectives is on); nobody
// sees an objective before they can see its quest.
export function QuestEditor({ quest, objectives, p, npcs, places, features, save, remove, close }: {
  quest: Partial<Entry>; objectives: Entry[]; p: ToolProps; npcs: Named[]; places: Named[]; features: { hidden: boolean; rewards: boolean };
  save: Save; remove: (id: string) => Promise<Result>; close: () => void;
}) {
  const mode = useVisMode();
  const isNew = !quest.id;
  const [title, setTitle] = useState(quest.title ?? '');
  const [v, setV] = useState<QuestInput>(() => { const i = inputOf(quest); return isNew ? { ...i, since: p.session || '' } : i; });
  const [giverOther, setGiverOther] = useState(!!v.giverName);
  const [placeOther, setPlaceOther] = useState(!!v.placeName);
  const [vis, setVis] = useState<VisValue>(isNew ? { ...EVERYONE, vis: mode.defaults.newVis } : visOf(quest));
  const [objs, setObjs] = useState<Obj[]>(() => [...objectives].sort(byOrder).map((o) => ({ id: o.id, title: o.title, done: o.status === 'done', vis: visOf(o) })));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<QuestInput>) => setV((x) => ({ ...x, ...patch }));
  const setObj = (i: number, patch: Partial<Obj>) => setObjs((list) => list.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const id = (k: string) => `qs-${quest.id ?? 'new'}-${k}`;

  const submit = async () => {
    if (!title.trim()) return setErr('Give the quest a name.');
    setBusy(true); setErr('');
    const split = splitQuest({ ...v, giver: giverOther ? '' : v.giver, giverName: giverOther ? v.giverName : '', place: placeOther ? '' : v.place, placeName: placeOther ? v.placeName : '' });
    const r = await save({ id: quest.id, campaign_id: p.campaignId, kind: 'quest', title: title.trim().slice(0, 120), status: split.status, data: split.data, live: true, sort: Number(quest.sort) || 0, ...vis }, split.secret);
    if (r.error || !r.row) { setBusy(false); return setErr(r.error ?? 'That did not save.'); }
    const questId = r.row.id;
    // the objectives, in order; ones taken off the list are deleted
    const kept = objs.filter((o) => o.title.trim());
    for (const o of objectives) if (!kept.some((k) => k.id === o.id)) { const x = await remove(o.id); if (x.error) { setBusy(false); return setErr(x.error); } }
    for (const [i, o] of kept.entries()) {
      const x = await save({ id: o.id, campaign_id: p.campaignId, kind: 'objective', parent: questId, title: o.title.trim().slice(0, 200), status: o.done ? 'done' : 'open', sort: i, live: true, ...(features.hidden ? o.vis : EVERYONE) });
      if (x.error) { setBusy(false); return setErr(x.error); }
    }
    setBusy(false);
    close();
  };

  return (
    <form className="plate qs-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h3>{isNew ? 'New quest' : `Edit ${quest.title}`}</h3>
      <div className="fields wide">
        <label className="f" htmlFor={id('name')}>Name<input id={id('name')} value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="f" htmlFor={id('status')}>Status
          <select id={id('status')} value={v.status} onChange={(e) => set({ status: e.target.value })}>{STATUSES.map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select>
        </label>
        <label className="ck qs-ck"><input type="checkbox" checked={!!v.main} onChange={(e) => set({ main: e.target.checked })} /> The main quest</label>

        <label className="f" htmlFor={id('giver')}>Given by
          <select id={id('giver')} value={giverOther ? OTHER : v.giver ?? ''} onChange={(e) => { const x = e.target.value; setGiverOther(x === OTHER); if (x !== OTHER) set({ giver: x }); }}>
            <option value="">Nobody in particular</option>
            {npcs.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
            <option value={OTHER}>Someone not on the NPCs page…</option>
          </select>
        </label>
        {giverOther ? <label className="f" htmlFor={id('giverName')}>Their name<input id={id('giverName')} value={v.giverName ?? ''} maxLength={80} onChange={(e) => set({ giverName: e.target.value })} /></label> : null}

        <label className="f" htmlFor={id('place')}>Where
          <select id={id('place')} value={placeOther ? OTHER : v.place ?? ''} onChange={(e) => { const x = e.target.value; setPlaceOther(x === OTHER); if (x !== OTHER) set({ place: x }); }}>
            <option value="">No place</option>
            {places.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
            <option value={OTHER}>Somewhere not in the lore…</option>
          </select>
        </label>
        {placeOther ? <label className="f" htmlFor={id('placeName')}>The place<input id={id('placeName')} value={v.placeName ?? ''} maxLength={80} onChange={(e) => set({ placeName: e.target.value })} /></label> : null}

        <label className="f" htmlFor={id('since')}>Started in session<input id={id('since')} type="number" min={1} max={999} value={String(v.since ?? '')} onChange={(e) => set({ since: e.target.value })} /></label>
        {v.status !== 'active' ? <label className="f" htmlFor={id('done')}>{v.status === 'failed' ? 'Failed in session' : 'Completed in session'}<input id={id('done')} type="number" min={1} max={999} value={String(v.done ?? '')} onChange={(e) => set({ done: e.target.value })} /></label> : null}
        <label className="f wide" htmlFor={id('summary')}>Summary<textarea id={id('summary')} rows={3} value={v.summary ?? ''} maxLength={2000} placeholder="What the party has been asked to do, and why it matters" onChange={(e) => set({ summary: e.target.value })} /></label>

        {features.rewards ? (
          <>
            <label className="f" htmlFor={id('reward')}>Reward<input id={id('reward')} value={v.reward ?? ''} maxLength={300} placeholder="500 gold and a writ of passage" onChange={(e) => set({ reward: e.target.value })} /></label>
            <label className="f" htmlFor={id('rewardWhen')}>Players see the reward
              <select id={id('rewardWhen')} value={v.rewardWhen} onChange={(e) => set({ rewardWhen: e.target.value as RewardWhen })}>{REWARD_WHEN.map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select>
            </label>
          </>
        ) : null}
      </div>

      <fieldset className="qs-objs"><legend>Objectives</legend>
        {features.hidden ? <p className="muted">Hide an objective until the party finds it. Players are told how many are still hidden. Nobody sees an objective before they can see the quest.</p> : null}
        {objs.map((o, i) => (
          <div key={o.id ?? 'n' + i} className="qs-obj">
            <label className="ck"><input type="checkbox" checked={o.done} onChange={(e) => setObj(i, { done: e.target.checked })} /> <span className="qs-sr">Done</span></label>
            <input aria-label={`Objective ${i + 1}`} value={o.title} maxLength={200} placeholder="Find the missing scholar" onChange={(e) => setObj(i, { title: e.target.value })} />
            {features.hidden ? <WhoSees value={o.vis} onChange={(x) => setObj(i, { vis: x })} stages={p.stages} members={p.members} beats={mode.beats} canName={p.make.player_secrets} named={mode.defaults.named} nextSession={mode.nextSession} label="Who sees it" /> : null}
            <button type="button" className="act sm" onClick={() => setObjs(objs.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="act sm" onClick={() => setObjs([...objs, { title: '', done: false, vis: EVERYONE }])}>+ Add an objective</button>
      </fieldset>

      <div className="qs-vis">
        <WhoSees value={vis} onChange={setVis} stages={p.stages} members={p.members} beats={mode.beats} canName={p.make.player_secrets} named={mode.defaults.named} nextSession={mode.nextSession} label="Players can see this quest" />
      </div>
      <label className="f wide qs-notes" htmlFor={id('notes')}>DM-only notes<textarea id={id('notes')} rows={3} value={v.notes ?? ''} maxLength={5000} placeholder="What is really going on" onChange={(e) => set({ notes: e.target.value })} /></label>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <p className="row">
        <button className="act" disabled={busy}>{busy ? 'Saving…' : 'Save quest'}</button>
        <button type="button" className="act sm" onClick={close}>Cancel</button>
        {quest.id ? <ConfirmButton className="act sm danger" ask="Delete this quest and its objectives for good?" yes="Yes, delete" onConfirm={() => { void remove(quest.id!).then(close); }}>Delete</ConfirmButton> : null}
      </p>
    </form>
  );
}
