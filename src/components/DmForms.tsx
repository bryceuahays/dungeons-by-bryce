'use client';
import { useActionState, useState, useTransition } from 'react';
import { addContentRow, addSection, addSession, createInvite, deleteCampaign, importPages, saveSetting, saveStages, updateCampaign, updateSection, updateSession, type ActionState } from '@/app/c/[slug]/actions';

function Msg({ state }: { state: ActionState }) {
  if (state?.error) return <span className="err" role="alert">{state.error}</span>;
  if (state?.note) return <span className="okmsg" role="status">{state.note}</span>;
  return null;
}

export function SessionForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addSession.bind(null, slug), null);
  return (
    <form action={action}>
      <div className="fields">
        <label className="f">Number<input name="number" type="number" required /></label>
        <label className="f">Title<input name="title" required maxLength={120} /></label>
      </div>
      <label className="f" style={{ marginTop: 10 }}>Summary<textarea name="summary" rows={2} /></label>
      <p className="row" style={{ marginTop: 10 }}><button className="act" disabled={pending}>Add session</button> <Msg state={state} /></p>
    </form>
  );
}

export function SessionEditForm({ slug, session }: { slug: string; session: { id: string; title: string; meta: string; summary: string; status: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSession.bind(null, slug, session.id), null);
  return (
    <form action={action}>
      <div className="fields wide">
        <label className="f">Title<input name="title" defaultValue={session.title} required maxLength={120} /></label>
        <label className="f">Short line (length, level)<input name="meta" defaultValue={session.meta} maxLength={200} /></label>
        <label className="f">Status<select name="status" defaultValue={session.status}><option value="unplanned">Not planned yet</option><option value="planned">Planned</option><option value="ready">Ready to run</option><option value="played">Played</option></select></label>
      </div>
      <label className="f" style={{ marginTop: 10 }}>Summary<textarea name="summary" rows={3} defaultValue={session.summary} /></label>
      <p className="row" style={{ marginTop: 10 }}><button className="act" disabled={pending}>Save</button> <Msg state={state} /></p>
    </form>
  );
}

export function InviteForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createInvite.bind(null, slug), null);
  return (
    <form action={action}>
      <div className="fields">
        <label className="f">How many people can use it (blank for no limit)<input name="uses" type="number" min={1} max={99} placeholder="6" /></label>
        <label className="f">Days until it expires (blank for never)<input name="days" type="number" min={1} max={365} placeholder="14" /></label>
      </div>
      <p className="row" style={{ marginTop: 10 }}><button className="act" disabled={pending}>Create invite code</button> <Msg state={state} /></p>
    </form>
  );
}

type FaceRow = { phase: string; slug: string; title: string; tagline: string };

export function CampaignForm({ slug, campaign, faces }: { slug: string; campaign: { title: string; tagline: string; theme: unknown; phases: { id: string; label: string }[] }; faces: FaceRow[] }) {
  const real = faces.find((f) => f.phase === '') ?? { phase: '', slug, title: campaign.title, tagline: campaign.tagline };
  const [state, action, pending] = useActionState<ActionState, FormData>(updateCampaign.bind(null, slug), null);
  return (
    <form action={action}>
      <div className="fields wide">
        <label className="f">Title<input name="title" defaultValue={real.title} required maxLength={80} /></label>
      </div>
      <label className="f" style={{ marginTop: 10 }}>Tagline (shown on the campaign card)<textarea name="tagline" rows={2} defaultValue={real.tagline} maxLength={300} /></label>
      <p className="muted" style={{ marginTop: 6 }}>Web address: /c/{real.slug}</p>
      {campaign.phases.map((p) => {
        const f = faces.find((x) => x.phase === p.id);
        return (
          <details key={p.id} style={{ marginTop: 10 }} open={!!f}>
            <summary className="muted" style={{ cursor: 'pointer' }}>A different title while the stage is &quot;{p.label}&quot;{f ? '' : ' (none)'}</summary>
            <p className="muted">While the campaign is at this stage, players see this title, address, and tagline everywhere, and the real ones cannot be reached by them. Clear the title to remove it.</p>
            <div className="fields wide">
              <label className="f">Title<input name={'face-title-' + p.id} defaultValue={f?.title ?? ''} maxLength={80} /></label>
              <label className="f">Web address (lowercase letters, numbers, dashes)<input name={'face-slug-' + p.id} defaultValue={f?.slug ?? ''} maxLength={60} /></label>
            </div>
            <label className="f" style={{ marginTop: 10 }}>Tagline<textarea name={'face-tagline-' + p.id} rows={2} defaultValue={f?.tagline ?? ''} maxLength={300} /></label>
          </details>
        );
      })}
      <p className="row" style={{ marginTop: 10 }}><button className="act" disabled={pending}>Save campaign settings</button> <Msg state={state} /></p>
    </form>
  );
}

export function SettingForm({ slug, name, label, value }: { slug: string; name: 'video'; label: string; value: string }) {
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <label className="f">{label}<input value={v} onChange={(e) => setV(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></label>
      <p className="row" style={{ marginTop: 10 }}><button type="button" className="act" disabled={pending} onClick={() => start(async () => setMsg(await saveSetting(slug, name, v)))}>Save</button> <Msg state={msg} /></p>
    </div>
  );
}

// The ordered list of reveal stages, one per line.
export function StagesForm({ slug, stages, pro }: { slug: string; stages: { id: string; label: string }[]; pro: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveStages.bind(null, slug), null);
  return (
    <form action={action}>
      <label className="f">Stages, one per line, in the order they happen
        <textarea name="stages" rows={Math.max(3, stages.length + 1)} defaultValue={stages.map((s) => s.label).join('\n')} placeholder={'Before the reveal\nAfter the reveal'} />
      </label>
      <p className="muted" style={{ marginTop: 6 }}>{pro ? 'As many stages as your story needs.' : 'Two stages on the free plan. More are part of Pro.'} Renaming a stage keeps everything tagged with it. Removing one leaves its blocks tagged for a stage that no longer exists, so players stop seeing them until you retag them.</p>
      <p className="row" style={{ marginTop: 10 }}><button className="act" disabled={pending}>Save stages</button> <Msg state={state} /></p>
    </form>
  );
}

export function AddSectionForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addSection.bind(null, slug), null);
  return (
    <form action={action}>
      <div className="fields">
        <label className="f">New tab name<input name="title" required maxLength={40} /></label>
        <label className="f">Who sees it<select name="audience" defaultValue="all"><option value="all">Players and DM</option><option value="dm">DM only</option></select></label>
      </div>
      <p className="row" style={{ marginTop: 10 }}><button className="act" disabled={pending}>Add tab</button> <Msg state={state} /></p>
    </form>
  );
}

export function SectionRow({ slug, section, first, last, phases }: { slug: string; section: { id: string; title: string; audience: string; kind: string; slug: string; phase: string | null; from_stage?: string | null }; first: boolean; last: boolean; phases: { id: string; label: string }[] }) {
  const [pending, start] = useTransition();
  const run = (patch: Parameters<typeof updateSection>[2]) => start(() => updateSection(slug, section.id, patch));
  const builtIn = section.kind !== 'content';
  return (
    <div className="orow">
      <span><b>{section.title}</b> <small>{builtIn ? 'built-in' : 'pages'} · {section.audience === 'all' ? 'players and DM' : section.audience === 'dm' ? 'DM only' : 'players only'}</small></span>
      <span className="row">
        <button className="act sm" disabled={pending || first} onClick={() => run({ move: -1 })}>Up</button>
        <button className="act sm" disabled={pending || last} onClick={() => run({ move: 1 })}>Down</button>
        <button className="act sm" disabled={pending} onClick={() => { const t = prompt('Tab name', section.title); if (t && t.trim()) run({ title: t }); }}>Rename</button>
        {!builtIn ? <button className="act sm" disabled={pending} onClick={() => run({ audience: section.audience === 'dm' ? 'all' : 'dm' })}>{section.audience === 'dm' ? 'Show to players' : 'Make DM only'}</button> : null}
        {phases.length && section.audience !== 'dm' ? (
          <select className="small" aria-label={'When players see ' + section.title} value={section.phase ?? ''} disabled={pending} onChange={(e) => run({ phase: e.target.value })}>
            <option value="">Players: always</option>{phases.map((p) => <option key={p.id} value={p.id}>Players: only {p.label.charAt(0).toLowerCase() + p.label.slice(1)}</option>)}
          </select>
        ) : null}
        {phases.length && section.audience !== 'dm' && !section.phase ? (
          <select className="small" aria-label={'From which stage players see ' + section.title} value={section.from_stage ?? ''} disabled={pending} onChange={(e) => run({ from_stage: e.target.value })}>
            <option value="">From the start</option>{phases.slice(1).map((p) => <option key={p.id} value={p.id}>From: {p.label}</option>)}
          </select>
        ) : null}
        {!builtIn ? <button className="act sm danger" disabled={pending} onClick={() => { if (confirm(`Delete the "${section.title}" tab and everything on it? This cannot be undone.`)) run({ remove: true }); }}>Delete</button> : null}
      </span>
    </div>
  );
}

export function AddBlockForm({ slug, section }: { slug: string; section: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addContentRow.bind(null, slug, section), null);
  return (
    <form action={action}>
      <div className="fields">
        <label className="f">Kind<select name="kind" defaultValue="html"><option value="heading">Heading</option><option value="html">Text</option><option value="plate">Card</option><option value="secret">Secret box</option><option value="table">Table</option><option value="checklist">Checklist</option><option value="video">Video (YouTube or Vimeo link)</option></select></label>
        <label className="f">Title (for headings and cards)<input name="title" maxLength={120} /></label>
        <label className="f">Who sees it<select name="visibility" defaultValue="dm"><option value="dm">DM only</option><option value="player">Players and DM</option></select></label>
      </div>
      <p className="row" style={{ marginTop: 10 }}><button className="act" disabled={pending}>Add block</button> <Msg state={state} /></p>
    </form>
  );
}

export function ImportPagesForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(importPages.bind(null, slug), null);
  return (
    <form action={action} key={state?.note ? state.note : 'form'}>
      <label className="f">Text to add<textarea name="paste" rows={8} spellCheck={false} placeholder={'## A new tab\nSome text…\n\n[secret: DM only]\nSomething only you see.\n[/secret]'} /></label>
      <p className="row" style={{ marginTop: 10 }}><button className="act" disabled={pending}>{pending ? 'Adding' : 'Add these pages'}</button> <Msg state={state} /></p>
    </form>
  );
}

export function DeleteCampaignForm({ slug, title, characters, members }: { slug: string; title: string; characters: number; members: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteCampaign.bind(null, slug), null);
  if (!open) return <p><button type="button" className="act danger" onClick={() => setOpen(true)}>Delete this campaign…</button></p>;
  return (
    <form action={action}>
      <p className="err">You are about to delete &quot;{title}&quot;{members || characters ? `, with ${members} player${members === 1 ? '' : 's'} and ${characters} character${characters === 1 ? '' : 's'}` : ''}.</p>
      <label className="f" style={{ maxWidth: 320 }}>Type DELETE to confirm<input name="confirm" autoComplete="off" /></label>
      <p className="row" style={{ marginTop: 10 }}>
        <button className="act danger" disabled={pending}>{pending ? 'Deleting' : 'Delete for good'}</button>
        <button type="button" className="act" disabled={pending} onClick={() => setOpen(false)}>Keep it</button>
        <Msg state={state} />
      </p>
    </form>
  );
}
