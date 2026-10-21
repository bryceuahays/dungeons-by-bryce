'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ExportButton } from './ExportButton';
import './export.css';

// The pop-up before a campaign is deleted: download everything first, or go on without.
// `onContinue` goes on to the delete confirmation; `onCancel` keeps the campaign.
export function DownloadFirst({ slug, title, onContinue, onCancel }: { slug: string; title: string; onContinue: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  return (
    <dialog ref={ref} className="ex-dialog" aria-labelledby={id} onCancel={(e) => { e.preventDefault(); onCancel(); }}>
      <h3 id={id}>Download everything first?</h3>
      <p>Before you delete &quot;{title}&quot;, you can keep a copy of everything in it, in one .zip file:</p>
      <ul>
        <li>every page, as web pages you can open, with DM-only and hidden parts marked</li>
        <li>characters, NPCs, lore, maps, the timeline and world state, with your DM notes</li>
        <li>sessions and planning notes, the secrets you wrote for players, and the homebrew you attached</li>
        <li>every picture: maps, portraits, lore pictures and backgrounds</li>
      </ul>
      <p className="ex-dim">Players&apos; own private notes are not included. They belong to the players.</p>
      <p className="ex-acts">
        <ExportButton slug={slug} className="act" label="Download (.zip)" onDone={() => setSaved(true)} />
      </p>
      <p className="ex-acts">
        <button type="button" className="act danger" onClick={onContinue}>{saved ? 'Continue to delete' : 'Delete without downloading'}</button>
        <button type="button" className="act" onClick={onCancel}>Keep the campaign</button>
      </p>
    </dialog>
  );
}
