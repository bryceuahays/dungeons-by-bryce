'use client';
import Link from 'next/link';
import { useActionState, useRef, useState, useTransition } from 'react';
import { adminDeleteCampaign, changePassword, createCampaign, createMyCharacter, deleteMyCharacter, moveMyCharacter, feedbackDelete, feedbackEmailWaiting, feedbackSetDone, headReveal, joinCampaign, setComp, submitFeedback, updateAccount, type FormState } from '@/app/(hub)/actions';
import { ThemeEditor } from './ThemeEditor';
import { ConfirmButton } from './ConfirmButton';
import { NEW_CAMPAIGN_RULES } from '@/config/rules';
import { SYSTEMS } from '@/config/systems';
import { GENRES } from '@/config/genres';
import { TOOLS } from '@/config/tools';

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
  const [step, setStep] = useState(1);
  const [need, setNeed] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0 }); };
  // the second step needs a world chosen on the first
  const next = () => {
    if (!String(new FormData(form.current ?? undefined).get('world') || '')) { setNeed('Choose the world this campaign belongs to.'); return; }
    setNeed(''); go(2);
  };
  return (
    <form action={action} ref={form}>
      <div hidden={step !== 1}>
        <h2>Step 1 of 2: Details</h2>
        <div className="panel">
          <label>Name<input name="title" maxLength={80} placeholder="Leave empty if your pasted text starts with # Title" /></label>
          <label>Description<textarea name="tagline" rows={2} maxLength={300} placeholder="One or two lines about it." /></label>
          <label>Web address (lowercase letters, numbers, dashes). Leave empty to make one from the name.<input name="slug" pattern="[a-z0-9][a-z0-9\-]{1,60}" placeholder="my-next-campaign" /></label>
          <label>World<select name="world" defaultValue={world} required onChange={() => setNeed('')}><option value="">Choose a world…</option>{worlds.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <p className="dim">Every campaign belongs to a world and gets that world&apos;s homebrew. Need a new one? <Link href="/worlds">Make a world first</Link>.</p>
          <fieldset className="multi">
            <legend>System</legend>
            {SYSTEMS.map((sys) => <label key={sys.id} className="ckrow"><input type="radio" name="system" value={sys.id} defaultChecked={sys.id === NEW_CAMPAIGN_RULES} style={{ flexShrink: 0 }} /> <span><b>{sys.name}</b> <span className="dim">{sys.what}</span></span></label>)}
          </fieldset>
          <fieldset className="multi">
            <legend>Genres (tick any that fit)</legend>
            {GENRES.map((g) => <label key={g} className="ckrow"><input type="checkbox" name="genre" value={g} /> <span>{g}</span></label>)}
          </fieldset>
        </div>
        {need ? <p className="bad" role="alert">{need}</p> : null}
        <Msg state={state} />
        <button type="button" onClick={next}>Next: hub and tools</button>
      </div>

      <div hidden={step !== 2}>
        <h2>Step 2 of 2: Hub and tools</h2>
        <div className="panel">
          <p className="dim">Your campaign starts with the standard hub: an Overview page, a Secrets page only you see, My character and Combat for your players, and Sessions and Players for you. You can add, rename and reorder pages later on its Manage page.</p>
          <input type="hidden" name="tools_chosen" value="1" />
          <fieldset className="multi">
            <legend>Tools the hub starts with</legend>
            {TOOLS.map((t) => <label key={t.id} className="ckrow"><input type="checkbox" name="tool" value={t.id} defaultChecked style={{ flexShrink: 0 }} /> <span><b>{t.name}</b> <span className="dim">{t.what}</span></span></label>)}
          </fieldset>
          <p className="dim">You can turn tools on and off later on the campaign&apos;s Manage page.</p>
        </div>
        <h2>Look</h2>
        <div className="panel">
          <p className="dim">Each campaign has its own look. You can change it later on the campaign&apos;s Manage page, where you can also upload a background image.</p>
          <ThemeEditor initial={null} pro={pro} />
        </div>
        {packs.length ? (
          <>
            <h2>Homebrew packs</h2>
            <div className="panel">
              <fieldset className="multi">
                <legend>Add a homebrew pack (free with your account, and it does not count toward any limit)</legend>
                {packs.map((p) => <label key={p.id} className="ckrow"><input type="checkbox" name="pack" value={p.id} defaultChecked={p.free} /> <span><b>{p.name}</b> <span className="dim">{p.description}</span></span></label>)}
              </fieldset>
            </div>
          </>
        ) : null}
        <h2>Paste your campaign (optional)</h2>
        <div className="panel">
          <p className="dim">If you already have your campaign written down, paste it here and the site will build the tabs, headings, cards, tables, and DM-only secrets for you. It needs a few simple marks so the site knows what is what. <Link href="/help/campaign-format" target="_blank">See how to format it</Link> (opens in a new tab, with an example you can copy).</p>
          <label>Your campaign text<textarea name="paste" rows={10} spellCheck={false} placeholder={'# My campaign\n> One line about it.\n\n## Overview\nThe first paragraph…\n\n[secret: What is really going on]\nOnly you see this.\n[/secret]'} /></label>
          <p className="dim">You can also leave this empty and add pages later, from the campaign&apos;s Manage page or the page editor.</p>
        </div>
        <Msg state={state} />
        <p className="inline"><button type="button" className="quiet" onClick={() => go(1)}>Back to details</button><button type="submit" disabled={pending}>{pending ? 'Creating' : 'Create campaign'}</button></p>
      </div>
    </form>
  );
}

// A new character outside any campaign: choose its system, and the creator opens.
export function NewCharacterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createMyCharacter, null);
  return (
    <form action={action} className="panel narrow">
      <p className="dim">A character made here is not in a campaign. It can use the official rules for its system and your own homebrew. You can add it to a campaign that uses the same system at any time.</p>
      <fieldset className="multi">
        <legend>System</legend>
        {SYSTEMS.map((sys) => <label key={sys.id} className="ckrow"><input type="radio" name="system" value={sys.id} defaultChecked={sys.id === NEW_CAMPAIGN_RULES} style={{ flexShrink: 0 }} /> <span><b>{sys.name}</b> <span className="dim">{sys.what}</span></span></label>)}
      </fieldset>
      <Msg state={state} />
      <button type="submit" disabled={pending}>{pending ? 'Creating' : 'Create character'}</button>
    </form>
  );
}

// Add a character to a campaign, or move it to another. The page passes only campaigns that
// use the character's system.
export function MoveCharacterForm({ id, inCampaign, options }: { id: string; inCampaign: boolean; options: { id: string; title: string }[] }) {
  const [to, setTo] = useState('');
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();
  if (!options.length && !inCampaign) return <span>No campaign you are in uses this system.</span>;
  return (
    <>
      <select aria-label={inCampaign ? 'Move to another campaign' : 'Add to a campaign'} value={to} onChange={(e) => { setTo(e.target.value); setState(null); }}>
        <option value="">{inCampaign ? 'Move to…' : 'Add to a campaign…'}</option>
        {options.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        {inCampaign ? <option value="none">No campaign</option> : null}
      </select>
      <button type="button" className="quiet small-btn" disabled={!to || pending} onClick={() => start(async () => { setState(await moveMyCharacter(id, to === 'none' ? null : to)); setTo(''); })}>{pending ? 'Moving' : inCampaign ? 'Move' : 'Add'}</button>
      {state?.error ? <span className="bad" role="alert">{state.error}</span> : null}
    </>
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
