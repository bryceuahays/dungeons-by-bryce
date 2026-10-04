'use client';
import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { adminDeleteCampaign, changePassword, createCampaign, deleteMyCharacter, feedbackDelete, feedbackEmailWaiting, feedbackSetDone, headReveal, joinCampaign, submitFeedback, updateAccount, type FormState } from '@/app/(hub)/actions';
import { FONT_PAIRS } from '@/lib/fonts';

function Msg({ state }: { state: FormState }) {
  if (state?.error) return <p className="bad" role="alert">{state.error}</p>;
  if (state?.note) return <p className="good" role="status">{state.note}</p>;
  return null;
}

export function JoinForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(joinCampaign, null);
  return (
    <form action={action}>
      <div className="inline">
        <label>Invite code<input name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="From your DM" required /></label>
        <button type="submit" disabled={pending}>{pending ? 'Joining' : 'Join campaign'}</button>
      </div>
      <Msg state={state} />
    </form>
  );
}

export function AccountForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateAccount, null);
  return (
    <form action={action}>
      <label>Your name, as the table sees it<input name="display_name" defaultValue={name} maxLength={60} required /></label>
      <Msg state={state} />
      <button type="submit" disabled={pending}>Save</button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, null);
  return (
    <form action={action}>
      <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <Msg state={state} />
      <button type="submit" className="quiet" disabled={pending}>Change password</button>
    </form>
  );
}

const TOKENS: [string, string, string][] = [
  ['void', 'Page background', '#101014'], ['deep', 'Deep panels', '#16161c'], ['plate', 'Cards', '#1c1c24'], ['plate2', 'Card highlight', '#22222c'],
  ['line', 'Borders', '#34343f'], ['field', 'Form fields', '#0d0d11'], ['vellum', 'Text', '#e8e6e1'], ['dim', 'Quiet text', '#a3a1a8'],
  ['gold', 'Main accent', '#7fb8a4'], ['ember', 'Second accent', '#c97a8f'], ['star', 'Links', '#8fa7d6'], ['verd', 'Notes', '#9bc47a'], ['on-gold', 'Text on the accent', '#0f1513'],
];

export function NewCampaignForm({ campaigns }: { campaigns: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createCampaign, null);
  return (
    <form action={action}>
      <div className="panel">
        <label>Title<input name="title" maxLength={80} placeholder="Leave empty if your pasted text starts with # Title" /></label>
        <label>Web address (lowercase letters, numbers, dashes). Leave empty to make one from the title.<input name="slug" pattern="[a-z0-9][a-z0-9-]{1,60}" placeholder="my-next-campaign" /></label>
        <label>Tagline<textarea name="tagline" rows={2} maxLength={300} /></label>
      </div>
      <h2>Paste your campaign (optional)</h2>
      <div className="panel">
        <p className="dim">If you already have your campaign written down, paste it here and the site will build the tabs, headings, cards, tables, and DM-only secrets for you. It needs a few simple marks so the site knows what is what. <Link href="/help/campaign-format" target="_blank">See how to format it</Link> (opens in a new tab, with an example you can copy).</p>
        <label>Your campaign text<textarea name="paste" rows={10} spellCheck={false} placeholder={'# My campaign\n> One line about it.\n\n## Overview\nThe first paragraph…\n\n[secret: What is really going on]\nOnly you see this.\n[/secret]'} /></label>
        <p className="dim">You can also leave this empty and add pages later, from the campaign&apos;s Manage page or the page editor.</p>
      </div>
      <h2>Look</h2>
      <div className="panel">
        <p className="dim">Each campaign has its own colours and fonts. You can change these later, and upload your own background image, on the campaign&apos;s Manage page.</p>
        <div className="fieldrow">
          {TOKENS.map(([k, label, def]) => (
            <label key={k}>{label}<input type="color" name={'c-' + k} defaultValue={def} /></label>
          ))}
        </div>
        <label>Fonts<select name="fonts" defaultValue="cinzel">{FONT_PAIRS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" name="starfield" style={{ width: 'auto' }} /> Starfield behind the pages</label>
      </div>
      <h2>Character rules</h2>
      <div className="panel">
        <label>Start from another campaign&apos;s character builder rules and sheet
          <select name="copy" defaultValue="">
            <option value="">Start empty (no character builder)</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>Copy from {c.title}</option>)}
          </select>
        </label>
        <p className="dim">You can copy from any campaign you run or play in. Rules cannot be written from scratch here.</p>
      </div>
      <Msg state={state} />
      <button type="submit" disabled={pending}>{pending ? 'Creating' : 'Create campaign'}</button>
    </form>
  );
}

export function DeleteCharacterButton({ id, name }: { id: string; name: string }) {
  const [ask, setAsk] = useState(false);
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();
  if (!ask) return <button type="button" className="quiet small-btn" onClick={() => setAsk(true)}>Delete</button>;
  return (
    <span className="confirm">
      <span className="bad">Delete {name || 'this character'} for good?</span>
      <button type="button" className="small-btn danger" disabled={pending} onClick={() => start(async () => setState(await deleteMyCharacter(id)))}>{pending ? 'Deleting' : 'Yes, delete'}</button>
      <button type="button" className="quiet small-btn" disabled={pending} onClick={() => setAsk(false)}>Keep</button>
      {state?.error ? <span className="bad" role="alert">{state.error}</span> : null}
    </span>
  );
}

export function FeedbackForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(submitFeedback, null);
  return (
    <form action={action} key={state?.note ? 'sent' : 'form'}>
      <label>What would you like to see added or changed?<textarea name="message" rows={7} maxLength={4000} required placeholder="For example: I would like to roll dice from the combat page." /></label>
      <Msg state={state} />
      <button type="submit" disabled={pending}>{pending ? 'Sending' : 'Send'}</button>
    </form>
  );
}

// ---------------------------------------------------------------- Head DM

export function AdminDeleteCampaign({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(adminDeleteCampaign.bind(null, id), null);
  if (!open) return <button type="button" className="quiet small-btn" onClick={() => setOpen(true)}>Delete</button>;
  return (
    <form action={action} className="confirm">
      <span className="bad">Delete {title.startsWith('the campaign') ? title : `“${title}”`} and everything in it? Type DELETE:</span>
      <input name="confirm" autoComplete="off" style={{ width: 110 }} aria-label="Type DELETE to confirm" />
      <button type="submit" className="small-btn danger" disabled={pending}>Delete</button>
      <button type="button" className="quiet small-btn" onClick={() => setOpen(false)}>Cancel</button>
      {state?.error ? <span className="bad" role="alert">{state.error}</span> : null}
    </form>
  );
}

// Unhide a campaign someone else runs, or hide it again.
export function HeadRevealButton({ id, shown, playing }: { id: string; shown: boolean; playing: boolean }) {
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  if (shown) return <button type="button" className="quiet small-btn" disabled={pending} onClick={() => start(() => headReveal(id, false))}>{pending ? 'Hiding' : 'Hide again'}</button>;
  // a campaign the Head DM plays in gets a second question, because unhiding it spoils it
  if (playing && ask) {
    return (
      <span className="confirm">
        <span className="bad">You play in this one. Unhiding shows you its DM&apos;s secrets.</span>
        <button type="button" className="small-btn" disabled={pending} onClick={() => start(() => headReveal(id, true))}>{pending ? 'Unhiding' : 'Unhide anyway'}</button>
        <button type="button" className="quiet small-btn" disabled={pending} onClick={() => setAsk(false)}>Keep hidden</button>
      </span>
    );
  }
  return <button type="button" className="small-btn" disabled={pending} onClick={() => (playing ? setAsk(true) : start(() => headReveal(id, true)))}>{pending ? 'Unhiding' : 'Unhide'}</button>;
}

export function EmailWaitingButton({ count }: { count: number }) {
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();
  return (
    <p className="inline">
      <button type="button" className="small-btn" disabled={pending} onClick={() => start(async () => setState(await feedbackEmailWaiting()))}>{pending ? 'Sending' : `Email me the ${count} note${count === 1 ? '' : 's'} not emailed yet`}</button>
      {state?.error ? <span className="bad" role="alert">{state.error}</span> : null}
      {state?.note ? <span className="good" role="status">{state.note}</span> : null}
    </p>
  );
}

export function FeedbackRowActions({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <span className="confirm">
      <button type="button" className="quiet small-btn" disabled={pending} onClick={() => start(() => feedbackSetDone(id, !done))}>{done ? 'Mark as open' : 'Mark as done'}</button>
      <button type="button" className="quiet small-btn" disabled={pending} onClick={() => { if (confirm('Delete this note?')) start(() => feedbackDelete(id)); }}>Delete</button>
    </span>
  );
}
