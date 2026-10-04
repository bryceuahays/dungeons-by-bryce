'use client';
import { useActionState } from 'react';
import { requestCommission, type RequestState } from '@/app/(public)/custom/actions';
import { COMMISSION_TIERS } from '@/config/commissions';

export function CommissionForm() {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestCommission, null);
  if (state?.note) return <p className="good" role="status">{state.note}</p>;
  return (
    <form action={action}>
      <div className="fieldrow">
        <label>Your name<input name="name" required maxLength={100} autoComplete="name" /></label>
        <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
      </div>
      <label>Which tier<select name="tier" defaultValue="starter">{COMMISSION_TIERS.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.price})</option>)}</select></label>
      <label>The pitch: what is your campaign about?<textarea name="pitch" rows={5} required maxLength={4000} /></label>
      <label>Tone: how should it feel?<textarea name="tone" rows={2} maxLength={1000} placeholder="Grim and muddy, bright and swashbuckling, cosmic and strange…" /></label>
      <label>References: books, films, games, art, or links to anything that looks right<textarea name="refs" rows={3} maxLength={2000} /></label>
      <div className="fieldrow">
        <label>How many players<input name="players" maxLength={40} /></label>
        <label>When do you need it by<input name="deadline" maxLength={100} placeholder="A date, or no rush" /></label>
      </div>
      <label className="vh" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      {state?.error ? <p className="bad" role="alert">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? 'Sending' : 'Send request'}</button>
    </form>
  );
}
