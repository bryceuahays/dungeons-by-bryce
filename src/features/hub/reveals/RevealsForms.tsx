'use client';
import { useActionState, useState, useTransition } from 'react';
import { saveContentRow } from '@/app/c/[slug]/actions';
import { WhoSees } from '@/features/hub/visibility/WhoSees';
import type { ContentRow } from '@/lib/types';
import { BlockReveal, type RevealInfo } from './BlockReveal';
import { addPlotSecret, revealNow, setWhen } from './actions';
import type { Ref } from './schedule';

type Msg = { error?: string; note?: string } | null;
const Say = ({ msg }: { msg: Msg }) => (msg?.error ? <span className="err" role="alert">{msg.error}</span> : msg?.note ? <span className="okmsg" role="status">{msg.note}</span> : null);

// "Reveal now" on one hidden thing.
export function RevealNowButton({ slug, item }: { slug: string; item: Ref }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="rv-now" disabled={pending} onClick={() => start(async () => setMsg(await revealNow(slug, item)))}>{pending ? 'Revealing…' : 'Reveal now'}</button>
      <Say msg={msg} />
    </>
  );
}

type Vis = { vis: string; vis_players: string[]; vis_stage: string | null; vis_entry?: string | null };

// "Change when" on an entry or attached homebrew: the "Who sees this?" dialog.
export function EntryWhen({ slug, item, value, stages, members, beats, nextSession, canName, named }: {
  slug: string; item: Ref; value: Vis; stages: { id: string; label: string }[]; members: { user_id: string; display_name: string }[];
  beats: { id: string; title: string }[]; nextSession: number; canName: boolean; named: boolean;
}) {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <WhoSees value={value} stages={stages} members={members} beats={beats} nextSession={nextSession} canName={canName} named={named} disabled={pending} label="Who and when"
        onChange={(v) => start(async () => setMsg(await setWhen(slug, item, v)))} />
      <Say msg={msg} />
    </>
  );
}

// "Change when" on a page block: the block editor's own reveal controls.
export function BlockWhen({ slug, row, chapters, info }: { slug: string; row: ContentRow; chapters: { id: string; label: string }[]; info: RevealInfo }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <details className="rv-change">
      <summary>Change when</summary>
      <BlockReveal row={row} chapters={chapters} info={info} pending={pending} save={(p) => start(async () => setMsg(await saveContentRow(slug, row.id, p)))} />
      <Say msg={msg} />
    </details>
  );
}

// "+ Add plot secret".
export function PlotSecretForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addPlotSecret.bind(null, slug), null);
  if (!open) return <button type="button" className="rv-add" onClick={() => setOpen(true)}>+ Add plot secret</button>;
  return (
    <form action={action} className="rv-form">
      <label className="f">The secret<input name="title" required maxLength={200} placeholder="What lies beneath the ruins" /></label>
      <label className="f">Detail (only DMs see this)<textarea name="detail" rows={3} maxLength={5000} /></label>
      <p className="row">
        <button className="act" disabled={pending}>Add secret</button>
        <button type="button" className="act sm" onClick={() => setOpen(false)}>Close</button>
        <Say msg={state} />
      </p>
    </form>
  );
}
