'use client';
import { useState, useTransition } from 'react';
import { MAX_RECAP } from './model';
import { publishRecap, revealNow, saveNext, saveRecapDraft, type WelcomeState } from './actions';

function Note({ s }: { s: WelcomeState }) {
  if (s?.error) return <span className="err" role="alert">{s.error}</span>;
  if (s?.note) return <span className="okmsg" role="status">{s.note}</span>;
  return null;
}

// "Write the Session N recap" (WelcomeDM.png). The mockup's "Draft recap from notes" uses AI and
// belongs to issue 45, so it is left out: the DM writes the recap players will see.
export function RecapForm({ slug, session, draft, published }: { slug: string; session: number; draft: string; published: boolean }) {
  const [n, setN] = useState(session);
  const [text, setText] = useState(draft);
  const [msg, setMsg] = useState<WelcomeState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="wl-form">
      <div className="wl-row">
        <label className="wl-f wl-num">Session<input type="number" min={1} max={999} value={n} onChange={(e) => { setMsg(null); setN(Math.max(1, Math.min(999, Number(e.target.value) || 1))); }} /></label>
        <span className={'wl-pill' + (published ? ' on' : '')}>{published ? 'Published' : 'Not published yet'}</span>
      </div>
      <label className="wl-f">What players will read
        <textarea rows={7} maxLength={MAX_RECAP} value={text} onChange={(e) => { setMsg(null); setText(e.target.value); }} placeholder="What the party did, who they met, and where they left off." />
      </label>
      <p className="wl-acts">
        <button type="button" className="wl-btn" disabled={pending} onClick={() => start(async () => setMsg(await saveRecapDraft(slug, n, text)))}>Save draft</button>
        <button type="button" className="wl-go" disabled={pending || !text.trim()} onClick={() => start(async () => setMsg(await publishRecap(slug, n, text)))}>{pending ? 'Saving' : 'Publish recap'}</button>
        <Note s={msg} />
      </p>
    </div>
  );
}

export function NextForm({ slug, when, where }: { slug: string; when: string; where: string }) {
  const [v, setV] = useState({ when, where });
  const [msg, setMsg] = useState<WelcomeState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="wl-form">
      <label className="wl-f">When<input value={v.when} maxLength={120} placeholder="Friday 18 October, 7pm" onChange={(e) => { setMsg(null); setV({ ...v, when: e.target.value }); }} /></label>
      <label className="wl-f">Where we left off<input value={v.where} maxLength={200} placeholder="At the gates of Saltmere" onChange={(e) => { setMsg(null); setV({ ...v, where: e.target.value }); }} /></label>
      <p className="wl-acts">
        <button type="button" className="wl-btn" disabled={pending} onClick={() => start(async () => setMsg(await saveNext(slug, v)))}>{pending ? 'Saving' : 'Save next session'}</button>
        <Note s={msg} />
      </p>
    </div>
  );
}

export function RevealNowButton({ slug, id, title }: { slug: string; id: string; title: string }) {
  const [msg, setMsg] = useState<WelcomeState>(null);
  const [pending, start] = useTransition();
  if (msg?.note) return <span className="okmsg" role="status">{msg.note}</span>;
  return (
    <>
      <button type="button" className="wl-reveal" disabled={pending} onClick={() => start(async () => setMsg(await revealNow(slug, id)))}>{pending ? 'Revealing' : 'Reveal now'}<span className="wl-sr">: {title}</span></button>
      <Note s={msg} />
    </>
  );
}
