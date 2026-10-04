'use client';
import { useActionState } from 'react';
import { requestCommission, type RequestState } from '@/app/(public)/custom/actions';
import { COMMISSION_TIERS, tierPrice } from '@/config/commissions';

export function CommissionForm({ tier }: { tier: string }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestCommission, null);
  if (state?.note) {
    return (
      <div role="status">
        <p className="good"><b>Your request is in.{state.tier ? ` (${state.tier})` : ''}</b></p>
        <p>What happens next:</p>
        <ol>
          <li>I read your request and reply by email, usually within a few days, with any questions.</li>
          <li>If I can take it on, I accept it and send you a payment link for your tier. Nothing is charged before that.</li>
          <li>Once it is paid I build your campaign and send it to you to review. Your tier&apos;s rounds of revisions start there.</li>
          <li>When you are happy, the campaign is handed over to your account. You are its DM and you own it. Any Pro months in your tier start that day.</li>
        </ol>
        <p className="dim">You will need a free account on this site to receive the campaign. You can make it any time before delivery.</p>
      </div>
    );
  }
  return (
    <form action={action}>
      <div className="fieldrow">
        <label>Your name<input name="name" required maxLength={100} autoComplete="name" /></label>
        <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
      </div>
      <label>Tier<select name="tier" defaultValue={COMMISSION_TIERS.some((t) => t.id === tier) ? tier : COMMISSION_TIERS[0].id}>{COMMISSION_TIERS.map((t) => <option key={t.id} value={t.id}>{t.name} ({tierPrice(t)})</option>)}</select></label>
      <label>The pitch: what is your campaign about?<textarea name="pitch" rows={5} required maxLength={4000} /></label>
      <label>Tone: how should it feel?<textarea name="tone" rows={2} maxLength={1000} placeholder="Grim and muddy, bright and swashbuckling, cosmic and strange…" /></label>
      <label>Reference images and links: paste links to pictures, boards, or anything that looks right<textarea name="refs" rows={3} maxLength={2000} placeholder="https://…" /></label>
      <label>How much material already exists? Notes, documents, maps, a wiki…<textarea name="material" rows={3} maxLength={2000} /></label>
      <div className="fieldrow">
        <label>How many players<input name="players" maxLength={40} /></label>
        <label>When do you need it by<input name="deadline" maxLength={100} placeholder="A date, or no rush" /></label>
      </div>
      <label className="vh" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      {state?.error ? <p className="bad" role="alert">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? 'Sending' : 'Send request'}</button>
      <p className="dim">Sending a request costs nothing and commits you to nothing. Payment happens only after I accept it.</p>
    </form>
  );
}
