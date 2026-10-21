'use client';
import { useState, useTransition } from 'react';
import { DownloadFirst } from '@/features/campaign-export/DownloadFirst';
import { ExportButton } from '@/features/campaign-export/ExportButton';
import { deleteMyAccount } from './actions';

type Facts = { campaigns: { title: string; players: number }[]; characters: number; homebrew: number; selling: number; pro: boolean; head: boolean };

// "Delete my account" on the Account page: what goes with it, a pop-up offering a download of
// everything first, then the confirmation.
export function DeleteAccount({ facts }: { facts: Facts }) {
  const [step, setStep] = useState<'closed' | 'ask' | 'confirm'>('closed');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const blocked = facts.head ? 'The Head DM account cannot be deleted from here. It looks after the whole site.'
    : facts.selling ? 'You sell campaigns in the store. Remove your products from the store first, then come back here.' : '';
  const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  return (
    <div className="panel">
      <p>Deleting your account removes everything you made, for good:</p>
      <ul className="dim">
        {facts.campaigns.length ? <li>{plural(facts.campaigns.length, 'campaign')} you created: {facts.campaigns.map((c) => `${c.title}${c.players ? ` (${plural(c.players, 'player')}, whose characters in it go too)` : ''}`).join('; ')}</li> : <li>No campaigns of your own.</li>}
        <li>{plural(facts.characters, 'character')} you made, wherever they play</li>
        <li>{plural(facts.homebrew, 'homebrew entry', 'homebrew entries')}, your game systems and worlds</li>
        {facts.pro ? <li>Your Pro subscription is cancelled, so you are not charged again.</li> : null}
      </ul>
      <p className="dim">It cannot be undone. You are offered a download of everything first.</p>
      {blocked ? <p className="err">{blocked}</p> : step !== 'confirm' ? (
        <p className="row">
          <button type="button" className="danger" onClick={() => setStep('ask')}>Delete my account…</button>
          <ExportButton className="quiet" label="Download everything (.zip)" />
        </p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); setErr(''); start(async () => { const r = await deleteMyAccount(confirm); if (r?.error) setErr(r.error); }); }}>
          <label className="f" style={{ maxWidth: 320 }}>Type DELETE to confirm<input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></label>
          <p className="row" style={{ marginTop: 10 }}>
            <button className="danger" disabled={pending}>{pending ? 'Deleting…' : 'Delete my account for good'}</button>
            <button type="button" className="quiet" disabled={pending} onClick={() => setStep('closed')}>Keep my account</button>
          </p>
          {err ? <p className="err" role="alert">{err}</p> : null}
        </form>
      )}
      {step === 'ask' ? <DownloadFirst title="your account" onContinue={() => setStep('confirm')} onCancel={() => setStep('closed')} /> : null}
    </div>
  );
}
