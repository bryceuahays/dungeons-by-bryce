'use client';
import { useActionState, useState, useTransition } from 'react';
import { setCommission, transferCampaign, type FormState } from '@/app/(hub)/actions';

export function CommissionRow({ id, status, notes, options }: { id: string; status: string; notes: string; options: [string, string][] }) {
  const [pending, start] = useTransition();
  const [n, setN] = useState(notes);
  return (
    <span className="confirm" style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 220 }}>
      <select aria-label="Status" defaultValue={status} disabled={pending} onChange={(e) => start(() => setCommission(id, { status: e.target.value }))}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <textarea aria-label="Your notes" rows={2} value={n} placeholder="Your notes" onChange={(e) => setN(e.target.value)} onBlur={() => n !== notes && start(() => setCommission(id, { notes: n }))} />
    </span>
  );
}

export function TransferForm({ campaigns }: { campaigns: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(transferCampaign, null);
  return (
    <form action={action}>
      <div className="fieldrow">
        <label>Campaign<select name="campaign" required defaultValue="">{[<option key="" value="">Choose…</option>, ...campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)]}</select></label>
        <label>The client&apos;s account email<input name="email" type="email" required /></label>
        <label>Type HAND OVER to confirm<input name="confirm" autoComplete="off" /></label>
      </div>
      {state?.error ? <p className="bad" role="alert">{state.error}</p> : null}
      {state?.note ? <p className="good" role="status">{state.note}</p> : null}
      <button type="submit" className="quiet" disabled={pending}>{pending ? 'Handing over' : 'Hand it over'}</button>
    </form>
  );
}
