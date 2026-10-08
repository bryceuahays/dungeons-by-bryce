'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { TYPES } from '@/config/homebrew';
import { ClassBanner } from './ClassBanner';
import { addWorldEntity, createWorld, deleteWorld, removeWorldEntity, saveWorld, setCampaignWorld } from '@/app/(hub)/worlds/actions';

// My Worlds: a setting above campaigns. The world holds its campaigns and the homebrew of the setting;
// every campaign in it gets that homebrew (see src/app/(hub)/worlds/actions.ts).

export function CreateWorldForm() {
  const [state, action, pending] = useActionState(createWorld, null);
  return (
    <form action={action} className="panel narrow">
      <label>Name<input name="name" maxLength={80} required placeholder="For example: The Shattered Realms" /></label>
      <label>Tagline<input name="tagline" maxLength={300} placeholder="One line about it." /></label>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <p><button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create world'}</button></p>
    </form>
  );
}

type Camp = { id: string; slug: string; title: string; tagline?: string };
type Ent = { id: string; name: string; type: string };

export function WorldEditor({ world, campaigns, others, entries, mine }: {
  world: { id: string; name: string; tagline: string; data: any }; campaigns: Camp[]; others: (Camp & { world?: string })[]; entries: Ent[]; mine: Ent[];
}) {
  const router = useRouter();
  const [name, setName] = useState(world.name);
  const [tagline, setTagline] = useState(world.tagline);
  const [data, setData] = useState<any>(world.data ?? {});
  const [msg, setMsg] = useState('');
  const [busy, start] = useTransition();
  const [addCamp, setAddCamp] = useState('');
  const [addEnt, setAddEnt] = useState('');
  const run = (fn: () => Promise<any>) => start(async () => { const r = await fn(); setMsg(r?.error ?? r?.note ?? ''); router.refresh(); });
  const save = (d = data) => run(() => saveWorld(world.id, { name, tagline, data: d }));
  // the banner saves as soon as it is picked, so an upload is never left unsaved
  const setBanner = (d: any) => { setData(d); save(d); };
  const types = Object.keys(TYPES).filter((t) => entries.some((e) => e.type === t));
  const free = mine.filter((e) => !entries.some((x) => x.id === e.id));
  return (
    <div className="brew brew-wide">
      <ClassBanner data={data} name={name} onChange={setBanner} noun="world" />
      <div className="brew-head">
        <input className="cls-name" aria-label="World name" value={name} maxLength={80} placeholder="World name" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="panel">
        <label>Tagline<input value={tagline} maxLength={300} placeholder="One line about it." onChange={(e) => setTagline(e.target.value)} /></label>
        <label>About this world<textarea rows={6} value={data.desc ?? ''} placeholder="Its history, gods, regions, the tone you are going for. Only you see this page." onChange={(e) => setData({ ...data, desc: e.target.value })} /></label>
        <p className="inline"><button type="button" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save'}</button>{msg ? <span className="dim">{msg}</span> : null}</p>
      </div>

      <h2>Campaigns in this world</h2>
      <div className="panel">
        {campaigns.length ? (
          <ul className="list srd-list item-list">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link href={'/c/' + c.slug}><b>{c.title}</b></Link>
                <span className="dim">{c.tagline}</span>
                <button type="button" className="quiet small-btn" disabled={busy} onClick={() => run(() => setCampaignWorld(c.id, null))}>Take out of this world</button>
              </li>
            ))}
          </ul>
        ) : <p className="dim">No campaigns here yet. Start a new one in this world, or move in one you already run.</p>}
        <p className="inline">
          <Link className="button" href={'/new-campaign?world=' + world.id}>Start a new campaign in this world</Link>
          {others.length ? <>
            <select aria-label="A campaign you run" value={addCamp} onChange={(e) => setAddCamp(e.target.value)}>
              <option value="">Move in a campaign you run…</option>
              {others.map((c) => <option key={c.id} value={c.id}>{c.title}{c.world ? ` (now in ${c.world})` : ''}</option>)}
            </select>
            <button type="button" className="quiet" disabled={!addCamp || busy} onClick={() => { const id = addCamp; setAddCamp(''); run(() => setCampaignWorld(id, world.id)); }}>Move in</button>
          </> : null}
        </p>
        <p className="dim">A campaign in this world gets all of the world&apos;s homebrew below. Players join a campaign, not a world, and make their characters there.</p>
      </div>

      <h2>Homebrew in this world</h2>
      <div className="panel">
        {types.length ? types.map((t) => (
          <div key={t}>
            <h3>{TYPES[t].plural}</h3>
            <ul className="list srd-list item-list">
              {entries.filter((e) => e.type === t).map((e) => (
                <li key={e.id}>
                  <Link href={'/homebrew/' + e.id}><b>{e.name}</b></Link>
                  <span className="dim">{TYPES[t].label}</span>
                  <button type="button" className="quiet small-btn danger" disabled={busy} onClick={() => run(() => removeWorldEntity(world.id, e.id))}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
        )) : <p className="dim">Nothing yet. Add the races, classes, items, monsters and the rest that belong to this setting.</p>}
        <p className="inline">
          <select aria-label="Your homebrew" value={addEnt} onChange={(e) => setAddEnt(e.target.value)}>
            <option value="">{free.length ? 'Add some of your homebrew…' : mine.length ? 'All your homebrew is already here' : 'You have no homebrew yet'}</option>
            {Object.keys(TYPES).filter((t) => free.some((e) => e.type === t)).map((t) => (
              <optgroup key={t} label={TYPES[t].plural}>{free.filter((e) => e.type === t).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
            ))}
          </select>
          <button type="button" className="quiet" disabled={!addEnt || busy} onClick={() => { const id = addEnt; setAddEnt(''); run(() => addWorldEntity(world.id, id)); }}>Add</button>
          <Link className="button quiet" href="/homebrew">Make new homebrew</Link>
        </p>
      </div>

      <p><button type="button" className="quiet small-btn danger" disabled={busy} onClick={() => { if (confirm(`Delete ${name}? Its campaigns and homebrew are kept; they just stop being in this world.`)) start(() => deleteWorld(world.id)); }}>Delete this world</button></p>
    </div>
  );
}
