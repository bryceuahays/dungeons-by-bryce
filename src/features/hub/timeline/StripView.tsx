'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveEntry } from '@/components/tools/kit';
import type { Column } from './model';

// The strip itself: a line of sessions that scrolls sideways, starting at "Up next". The DM can add
// a custom event (a beat that has happened, in a session, for everyone unless they hide it later).
export function StripView({ slug, campaignId, dm, columns, canAdd, session, full }: { slug: string; campaignId: string; dm: boolean; columns: Column[]; canAdd: boolean; session: number; full: boolean }) {
  const row = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [at, setAt] = useState(Math.max(1, session));
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  useEffect(() => {
    const next = row.current?.querySelector<HTMLElement>('[data-state="next"]');
    if (next && row.current) row.current.scrollLeft = Math.max(0, next.offsetLeft - row.current.clientWidth / 2);
  }, []);
  const add = () => start(async () => {
    setErr('');
    const r = await saveEntry({ campaign_id: campaignId, kind: 'beat', title: title.trim().slice(0, 120), status: 'hit', live: true, vis: 'all', vis_players: [], data: { custom: true, hitSession: at } });
    if (r.error) return setErr(r.error);
    setTitle(''); setAdding(false); router.refresh();
  });

  return (
    <section className={'tls' + (full ? ' full' : '')} aria-labelledby="tls-h">
      <div className="tls-top">
        <div>
          <h2 id="tls-h">Timeline</h2>
          <p className="tls-sub">{dm ? 'Played sessions, planned sessions, scheduled reveals and custom events' : 'What has happened so far, updated after every session'}</p>
        </div>
        <div className="tls-key">
          <span className="tls-k story">Story event</span>
          <span className="tls-k custom">Custom event</span>
          {dm ? <span className="tls-k planned">Planned · DM only</span> : null}
          {canAdd ? <button type="button" className="act" onClick={() => setAdding(!adding)} aria-expanded={adding}>+ Add custom event</button> : null}
          {!full ? <Link className="tls-open" href={`/c/${slug}/tools/timeline`}>Open the timeline</Link> : null}
        </div>
      </div>
      {adding ? (
        <form className="tls-add" onSubmit={(e) => { e.preventDefault(); if (title.trim()) add(); }}>
          <label className="f">What happened<input value={title} maxLength={120} placeholder="The harvest festival" onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="f tls-n">In session<input type="number" min={1} max={999} value={at} onChange={(e) => setAt(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} /></label>
          <button className="act" disabled={pending || !title.trim()}>Add it</button>
          <p className="muted">Everyone sees it. To hide it, open it in the Timeline tool.</p>
          {err ? <p className="err" role="alert">{err}</p> : null}
        </form>
      ) : null}
      <div className="tls-row" ref={row} tabIndex={0} aria-label="Sessions">
        <ol>
          {columns.map((c) => (
            <li key={c.n} className={'tls-col ' + c.state} data-state={c.state}>
              <span className="tls-dot" aria-hidden="true" />
              <span className="tls-line" aria-hidden="true" />
              <b>{c.label}</b>
              <small>{c.sub}</small>
              {c.events.length ? (
                <ul>{c.events.map((e) => <li key={e.id} className={'tls-ev ' + e.kind}>{e.label}</li>)}</ul>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
