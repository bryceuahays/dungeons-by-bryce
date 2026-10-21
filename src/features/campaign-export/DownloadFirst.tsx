'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ExportButton } from './ExportButton';
import './export.css';

// The pop-up before a campaign (or, without a slug, the whole account) is deleted: download
// everything first, or go on without. `onContinue` goes on to the delete confirmation.
const CAMPAIGN_ITEMS = [
  'every page, as web pages you can open, with DM-only and hidden parts marked',
  'characters, NPCs, lore, maps, the timeline and world state, with your DM notes',
  'sessions and planning notes, the secrets you wrote for players, and the homebrew you attached',
  'every picture: maps, portraits, lore pictures and backgrounds',
];
const ACCOUNT_ITEMS = [
  'every campaign you created, laid out like a campaign download, with all its pictures',
  'every character you made, in any campaign',
  'your homebrew, game systems and worlds',
  'your own private notes, and your pictures',
];
export function DownloadFirst({ slug, title, onContinue, onCancel }: { slug?: string; title: string; onContinue: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  return (
    <dialog ref={ref} className="ex-dialog" aria-labelledby={id} onCancel={(e) => { e.preventDefault(); onCancel(); }}>
      <h3 id={id}>Download everything first?</h3>
      <p>{slug ? <>Before you delete &quot;{title}&quot;, you can keep a copy of everything in it, in one .zip file:</> : <>Before you delete your account, you can keep a copy of everything you made, in one .zip file:</>}</p>
      <ul>{(slug ? CAMPAIGN_ITEMS : ACCOUNT_ITEMS).map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="ex-dim">{slug ? <>Players&apos; own private notes are not included. They belong to the players.</> : <>Other people&apos;s private notes in your campaigns are not included. They belong to them.</>}</p>
      <p className="ex-acts">
        <ExportButton slug={slug} className="act" label="Download (.zip)" onDone={() => setSaved(true)} />
      </p>
      <p className="ex-acts">
        <button type="button" className="act danger" onClick={onContinue}>{saved ? 'Continue to delete' : 'Delete without downloading'}</button>
        <button type="button" className="act" onClick={onCancel}>{slug ? 'Keep the campaign' : 'Keep my account'}</button>
      </p>
    </dialog>
  );
}
