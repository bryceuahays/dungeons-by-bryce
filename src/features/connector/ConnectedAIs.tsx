'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ConfirmButton } from '@/components/ConfirmButton';
import { disconnect } from './actions';

// On the Account page: the AI apps connected to this account, each with a way to take its access away.
export function ConnectedAIs({ grants }: { grants: { id: string; name: string; since: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <div className="panel narrow">
      {grants.length ? (
        <ul className="list">
          {grants.map((g) => (
            <li key={g.id}>
              <span><b>{g.name || 'An AI app'}</b> <span className="dim">connected {new Date(g.since).toLocaleDateString()}</span></span>
              <ConfirmButton className="quiet small-btn" disabled={pending} yes="Disconnect" ask={`Disconnect ${g.name || 'this AI app'}? It loses access at once.`}
                onConfirm={() => start(async () => { const r = await disconnect(g.id); if (r.error) setError(r.error); else router.refresh(); })}>Disconnect</ConfirmButton>
            </li>
          ))}
        </ul>
      ) : <p className="dim">No AI apps are connected. <Link href="/help/connect-your-ai">How to connect yours</Link>.</p>}
      {error ? <p className="bad" role="alert">{error}</p> : null}
    </div>
  );
}
