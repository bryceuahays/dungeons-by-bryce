'use client';
import { useState, useTransition } from 'react';
import { continueWith } from './actions';
import type { Provider } from './providers';
import './sign-in-with.css';

const NAMES: Record<Provider, string> = { google: 'Google', discord: 'Discord', apple: 'Apple', azure: 'Microsoft', github: 'GitHub', twitch: 'Twitch', facebook: 'Facebook' };

// the providers' own marks, as their sign-in guidelines ask for on these buttons
const ICONS: Partial<Record<Provider, React.ReactNode>> = {
  google: (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  ),
  discord: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#5865F2" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z" />
    </svg>
  ),
};

// "Continue with Google", "Continue with Discord"... for the providers switched on in Supabase. The same
// buttons make an account on a first visit and sign in after that.
export function ProviderButtons({ providers, next }: { providers: Provider[]; next?: string }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<Provider | null>(null);
  const [error, setError] = useState('');
  if (!providers.length) return null;
  return (
    <div className="sign-in-with">
      {providers.map((p) => (
        <button key={p} type="button" className="quiet sign-in-with-btn" disabled={pending}
          onClick={() => { setWhich(p); setError(''); start(async () => { const r = await continueWith(p, next ?? ''); if (r?.error) setError(r.error); }); }}>
          {ICONS[p] ?? null}<span>{pending && which === p ? 'One moment' : `Continue with ${NAMES[p]}`}</span>
        </button>
      ))}
      {error ? <p className="bad" role="alert">{error}</p> : null}
      <p className="sign-in-with-or dim"><span>or with your email</span></p>
    </div>
  );
}
