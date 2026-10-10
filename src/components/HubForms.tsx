'use client';
import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { adminDeleteCampaign, changePassword, createCampaign, deleteMyCharacter, feedbackDelete, feedbackEmailWaiting, feedbackSetDone, headReveal, joinCampaign, setComp, submitFeedback, updateAccount, type FormState } from '@/app/(hub)/actions';
import { ThemeEditor } from './ThemeEditor';
import { ConfirmButton } from './ConfirmButton';
import { NEW_CAMPAIGN_RULES, RULES } from '@/config/rules';

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

export function NewCampaignForm({ pro, packs = [], worlds = [], world = '' }: { pro: boolean; packs?: { id: string; name: string; description: string; free: boolean }[]; worlds?: { id: string; name: string }[]; world?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createCampaign, null);
  return (
    <form action={action}>
      <div className="panel">
        <label>Title<input name="title" maxLength={80} placeholder="Leave empty if your pasted text starts with # Title" /></label>
        <label>Web address (lowercase letters, numbers, dashes). Leave empty to make one from the title.<input name="slug" pattern="[a-z0-9][a-z0-9\-]{1,60}" placeholder="my-next-campaign" /></label>
        <label>Tagline<textarea name="tagline" rows={2} maxLength={300} /></label>
        {worlds.length ? <label>World<select name="world" defaultValue={world}><option value="">None (a campaign of its own)</option>{worlds.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label> : null}
        {worlds.length ? <p className="dim">A campaign in a world plays by that world&apos;s rules and gets its homebrew (the rules version below is then ignored).</p> : null}
      </div>
      <h2>Paste your campaign (optional)</h2>
      <div className="panel">
        <p className="dim">If you already have your campaign written down, paste it here and the site will build the tabs, headings, cards, tables, and DM-only secrets for you. It needs a few simple marks so the site knows what is what. <Link href="/help/campaign-format" target="_blank">See how to format it</Link> (opens in a new tab, with an example you can copy).</p>
        <label>Your campaign text<textarea name="paste" rows={10} spellCheck={false} placeholder={'# My campaign\n> One line about it.\n\n## Overview\nThe first paragraph…\n\n[secret: What is really going on]\nOnly you see this.\n[/secret]'} /></label>
        <p className="dim">You can also leave this empty and add pages later, from the campaign&apos;s Manage page or the page editor.</p>
      </div>
      <h2>Look</h2>
      <div className="panel">
        <p className="dim">Each campaign has its own look. You can change it later on the campaign&apos;s Manage page, where you can also upload a background image.</p>
        <ThemeEditor initial={null} pro={pro} />
      </div>
      <h2>Character rules</h2>
      <div className="panel">
        {packs.length ? (
          <fieldset className="multi">
            <legend>Add a homebrew pack (free with your account, and it does not count toward any limit)</legend>
            {packs.map((p) => <label key={p.id} className="ckrow"><input type="checkbox" name="pack" value={p.id} defaultChecked={p.free} /> <span><b>{p.name}</b> <span className="dim">{p.description}</span></span></label>)}
          </fieldset>
        ) : null}
        <label>Rules version<select name="rules" defaultValue={NEW_CAMPAIGN_RULES}>{Object.entries(RULES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <p className="dim">Your players get the standard fifth edition sheet, with the SRD races and classes and any homebrew you attach.</p>
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

export function CompButton({ id, on }: { id: string; on: boolean }) {
  const [pending, start] = useTransition();
  return <button type="button" className="quiet small-btn" disabled={pending} onClick={() => start(() => setComp(id, !on))}>{on ? 'Take back full access' : 'Give full access'}</button>;
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
      <ConfirmButton className="quiet small-btn" disabled={pending} ask={'Delete this note?'} yes="Yes, delete" onConfirm={() => { start(() => feedbackDelete(id)); }}>Delete</ConfirmButton>
    </span>
  );
}
