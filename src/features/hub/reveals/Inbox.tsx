'use client';
import { useState, useTransition } from 'react';
import { ago } from '@/features/hub/players/model';
import { replyToPlayer, saveMessageAsSecret } from '@/features/hub/players/actions';

export type InboxThread = { player: string; name: string; items: { id: string; mine: boolean; body: string; at: string; fresh: boolean }[] };

// "From your players" (Secrets.png): each player's private messages to the DM, newest first, with
// the DM's replies. Reply answers that player alone; Save as secret keeps a message as a plot secret.
export function Inbox({ slug, threads, fresh, canSave }: { slug: string; threads: InboxThread[]; fresh: number; canSave: boolean }) {
  return (
    <aside className="rv-inbox" aria-labelledby="rv-inbox-h">
      <div className="rv-head"><h2 id="rv-inbox-h">From your players</h2>{fresh ? <span className="rv-new">{fresh} new</span> : null}</div>
      {threads.length ? threads.map((t) => <Thread key={t.player} slug={slug} t={t} canSave={canSave} />)
        : <p className="rv-dim">Nothing yet. Players send private notes from the Players page.</p>}
    </aside>
  );
}

function Thread({ slug, t, canSave }: { slug: string; t: InboxThread; canSave: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [say, setSay] = useState<{ error?: string; note?: string } | null>(null);
  const [pending, start] = useTransition();
  const last = t.items.find((i) => !i.mine);
  return (
    <section className={'rv-msg' + (t.items.some((i) => i.fresh) ? ' fresh' : '')} aria-label={'Messages from ' + t.name}>
      <div className="rv-msg-top"><b>{t.name}</b>{t.items[0] ? <small>{ago(t.items[0].at)}</small> : null}</div>
      <ul>
        {t.items.slice(0, 5).map((i) => <li key={i.id} className={i.mine ? 'mine' : ''}>{i.mine ? <small>You replied</small> : null}<span>{i.body}</span></li>)}
      </ul>
      <p className="rv-msg-acts">
        <button type="button" className="act sm" onClick={() => setOpen(!open)} aria-expanded={open}>Reply</button>
        {canSave && last ? <button type="button" className="act sm" disabled={pending} onClick={() => start(async () => setSay(await saveMessageAsSecret(slug, last.id)))}>Save as secret</button> : null}
      </p>
      {open ? (
        <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await replyToPlayer(slug, t.player, text); setSay(r); if (!r.error) { setText(''); setOpen(false); } }); }}>
          <label className="rv-sr" htmlFor={'rv-r-' + t.player}>Reply to {t.name}</label>
          <textarea id={'rv-r-' + t.player} rows={3} maxLength={2000} value={text} placeholder={`Only ${t.name}'s player sees this`} onChange={(e) => setText(e.target.value)} />
          <p className="row"><button className="act sm" disabled={pending || !text.trim()}>Send reply</button></p>
        </form>
      ) : null}
      {say?.error ? <p className="err" role="alert">{say.error}</p> : say?.note ? <p className="okmsg" role="status">{say.note}</p> : null}
    </section>
  );
}
