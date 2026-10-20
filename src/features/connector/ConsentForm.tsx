'use client';
import { useState, useTransition } from 'react';
import { decide } from './actions';

// Allow or Deny on the consent screen.
export function ConsentForm({ authorizationId }: { authorizationId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const go = (allow: boolean) => start(async () => { const r = await decide(authorizationId, allow); if (r?.error) setError(r.error); });
  return (
    <>
      {error ? <p className="bad" role="alert">{error}</p> : null}
      <p className="inline">
        <button type="button" disabled={pending} onClick={() => go(true)}>{pending ? 'One moment' : 'Allow'}</button>
        <button type="button" className="quiet" disabled={pending} onClick={() => go(false)}>Deny</button>
      </p>
    </>
  );
}
