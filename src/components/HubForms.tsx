'use client';
import { useActionState } from 'react';
import { changePassword, createCampaign, joinCampaign, updateAccount, type FormState } from '@/app/(hub)/actions';
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
        <label>Title<input name="title" required maxLength={80} /></label>
        <label>Web address (lowercase letters, numbers, dashes)<input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,60}" placeholder="my-next-campaign" /></label>
        <label>Tagline<textarea name="tagline" rows={2} maxLength={300} /></label>
      </div>
      <h2>Look</h2>
      <div className="panel">
        <p className="dim">Each campaign has its own colours and fonts. You can change these later.</p>
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
            <option value="">Start empty</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>Copy from {c.title}</option>)}
          </select>
        </label>
      </div>
      <Msg state={state} />
      <button type="submit" disabled={pending}>{pending ? 'Creating' : 'Create campaign'}</button>
    </form>
  );
}
