'use client';
import { useActionState, useState, useTransition } from 'react';
import { commissionPayLink, deliverCommission, setCommission, transferCampaign, type FormState } from '@/app/(hub)/actions';

type Job = { id: string; status: string; notes: string; revisions_used: number; revisions_included: number; pay_url: string; pro_months: number };

// One request: accept or decline, payment link, paid, status, revision rounds, notes, delivery.
export function CommissionRow({ job, options, campaigns }: { job: Job; options: [string, string][]; campaigns: { id: string; title: string }[] }) {
  const [pending, start] = useTransition();
  const [n, setN] = useState(job.notes);
  const [msg, setMsg] = useState<FormState>(null);
  const [copied, setCopied] = useState(false);
  const [deliver, action, delivering] = useActionState<FormState, FormData>(deliverCommission.bind(null, job.id), null);
  const set = (patch: Parameters<typeof setCommission>[1]) => start(() => setCommission(job.id, patch));
  return (
    <div className="job">
      {job.status === 'requested' ? (
        <p className="inline">
          <button type="button" disabled={pending} onClick={() => set({ status: 'accepted' })}>Accept</button>
          <button type="button" className="quiet" disabled={pending} onClick={() => { if (confirm('Decline this request?')) set({ status: 'declined' }); }}>Decline</button>
        </p>
      ) : null}
      <label>Status<select value={job.status} disabled={pending} onChange={(e) => set({ status: e.target.value })}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {job.status === 'accepted' ? (
        <p className="inline">
          <button type="button" className="quiet small-btn" disabled={pending} onClick={() => start(async () => setMsg(await commissionPayLink(job.id)))}>{job.pay_url ? 'Make a new payment link' : 'Make a payment link'}</button>
          <button type="button" className="quiet small-btn" disabled={pending} onClick={() => set({ status: 'paid' })}>Mark as paid</button>
        </p>
      ) : null}
      {job.pay_url && job.status === 'accepted' ? (
        <p className="inline"><input readOnly aria-label="Payment link" value={job.pay_url} onFocus={(e) => e.target.select()} /><button type="button" className="quiet small-btn" onClick={async () => { try { await navigator.clipboard.writeText(job.pay_url); setCopied(true); } catch { /* select and copy by hand */ } }}>{copied ? 'Copied' : 'Copy link'}</button></p>
      ) : null}
      <p className="inline">
        <span>Revision rounds used: <b>{job.revisions_used}</b> of {job.revisions_included}</span>
        <button type="button" className="quiet small-btn" disabled={pending || job.revisions_used <= 0} onClick={() => set({ revisions: job.revisions_used - 1 })} aria-label="One fewer revision round">−</button>
        <button type="button" className="quiet small-btn" disabled={pending} onClick={() => set({ revisions: job.revisions_used + 1 })} aria-label="One more revision round">+</button>
      </p>
      <textarea aria-label="Your notes" rows={2} value={n} placeholder="Your notes" onChange={(e) => setN(e.target.value)} onBlur={() => n !== job.notes && set({ notes: n })} />
      {['paid', 'in_progress', 'in_review'].includes(job.status) ? (
        <details>
          <summary>Deliver: hand the campaign over{job.pro_months ? ` and start ${job.pro_months} months of Pro` : ''}</summary>
          <form action={action}>
            <label>The campaign you built<select name="campaign" required defaultValue="">{[<option key="" value="">Choose…</option>, ...campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)]}</select></label>
            <label>Type DELIVER to confirm<input name="confirm" autoComplete="off" /></label>
            <button type="submit" disabled={delivering}>{delivering ? 'Delivering' : 'Deliver to the client'}</button>
          </form>
        </details>
      ) : null}
      {[msg, deliver].map((s, i) => (s?.error ? <p key={i} className="bad" role="alert">{s.error}</p> : s?.note ? <p key={i} className="good" role="status">{s.note}</p> : null))}
    </div>
  );
}

export function TransferForm({ campaigns }: { campaigns: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(transferCampaign, null);
  return (
    <form action={action}>
      <div className="fieldrow">
        <label>Campaign<select name="campaign" required defaultValue="">{[<option key="" value="">Choose…</option>, ...campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)]}</select></label>
        <label>The other account&apos;s email<input name="email" type="email" required /></label>
        <label>Type HAND OVER to confirm<input name="confirm" autoComplete="off" /></label>
      </div>
      {state?.error ? <p className="bad" role="alert">{state.error}</p> : null}
      {state?.note ? <p className="good" role="status">{state.note}</p> : null}
      <button type="submit" className="quiet" disabled={pending}>{pending ? 'Handing over' : 'Hand it over'}</button>
    </form>
  );
}
