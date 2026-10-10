'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Entry, ToolProps } from '@/lib/entry-types';
import { saveSetting } from '@/app/c/[slug]/actions';
import { UpgradeHint } from '../UpgradeHint';
import { visLabel } from '../VisPicker';
import { ConfirmButton } from '../ConfirmButton';
import { EntryForm, Problem, useEntries, visOf, type F } from './kit';

// ================================================================ per-player secrets and private notes

type Note = { id: string; user_id: string; kind: 'secret' | 'note'; title: string; body: string; updated_at: string };

export function NotesTool(p: ToolProps & { initial: Note[] }) {
  const [rows, setRows] = useState<Note[]>(p.initial);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<{ user: string; title: string; body: string }>({ user: p.members[0]?.user_id ?? '', title: '', body: '' });
  const supabase = supabaseBrowser();
  const add = async (kind: 'secret' | 'note', user_id: string) => {
    const { data, error } = await supabase.from('player_notes').insert({ campaign_id: p.campaignId, user_id, kind, title: draft.title.slice(0, 200), body: draft.body.slice(0, 20000) }).select('*').single();
    if (error || !data) return setErr(/upgrade:|row-level/.test(error?.message || '') && kind === 'secret' && !p.can.player_secrets ? 'Per-player secrets are part of Pro.' : 'That did not save.');
    setErr(''); setRows([data as Note, ...rows]); setDraft({ ...draft, title: '', body: '' });
  };
  const change = async (n: Note, body: string) => { const { error } = await supabase.from('player_notes').update({ body }).eq('id', n.id); if (!error) setRows(rows.map((x) => (x.id === n.id ? { ...x, body } : x))); else setErr('That did not save.'); };
  const drop = async (n: Note) => { const { error } = await supabase.from('player_notes').delete().eq('id', n.id); if (!error) setRows(rows.filter((x) => x.id !== n.id)); };
  const NoteCard = ({ n, editable }: { n: Note; editable: boolean }) => (
    <div className="plate">
      <h3>{n.title || 'Untitled'}</h3>
      {editable ? <textarea rows={Math.min(14, Math.max(3, n.body.split('\n').length + 1))} defaultValue={n.body} onBlur={(e) => { if (e.target.value !== n.body) void change(n, e.target.value); }} aria-label={'Text of ' + (n.title || 'note')} /> : <p style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>}
      {editable ? <p className="row"><span className="muted">Saved when you click away.</span><ConfirmButton className="act sm danger" ask="Delete this for good?" yes="Yes, delete" onConfirm={() => { void drop(n); }}>Delete</ConfirmButton></p> : null}
    </div>
  );

  if (p.dm) {
    return (
      <div className="wrap">
        <h2>Player secrets</h2>
        <p className="lede">Write something for one player. Only that player and you can read it. Your players also keep private notes here, which you cannot read.</p>
        {p.make.player_secrets ? null : <UpgradeHint feature="player_secrets" />}
        {err ? <p className="err" role="alert">{err}</p> : null}
        {p.members.length ? (
          <>
            {p.make.player_secrets && p.canWrite ? (
              <div className="plate">
                <div className="fields">
                  <label className="f">For<select value={draft.user} onChange={(e) => setDraft({ ...draft, user: e.target.value })}>{p.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name || 'Unnamed'}</option>)}</select></label>
                  <label className="f">Title<input value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
                </div>
                <label className="f" style={{ marginTop: 10 }}>The secret<textarea rows={4} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
                <p className="row" style={{ marginTop: 10 }}><button type="button" className="act" disabled={!draft.title.trim() || !draft.user} onClick={() => add('secret', draft.user)}>Give this secret</button></p>
              </div>
            ) : null}
            {p.members.map((m) => {
              const theirs = rows.filter((r) => r.kind === 'secret' && r.user_id === m.user_id);
              return <section key={m.user_id}><h3>{m.display_name || 'Unnamed'} ({theirs.length})</h3>{theirs.map((n) => <NoteCard key={n.id} n={n} editable={p.canWrite} />)}{theirs.length ? null : <p className="who">No secrets for this player yet.</p>}</section>;
            })}
          </>
        ) : <p className="who">Nobody has joined this campaign yet.</p>}
      </div>
    );
  }
  const secrets = rows.filter((r) => r.kind === 'secret');
  const notes = rows.filter((r) => r.kind === 'note');
  return (
    <div className="wrap">
      <h2>Secrets and notes</h2>
      <h3>From your DM, for you alone</h3>
      {secrets.length ? secrets.map((n) => <NoteCard key={n.id} n={n} editable={false} />) : <p className="who">Nothing yet.</p>}
      <h3>Your private notes</h3>
      <p className="muted">Only you can read these. Not the other players, and not your DM.</p>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <div className="plate">
        <label className="f">Title<input value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="f" style={{ marginTop: 10 }}>Note<textarea rows={3} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
        <p className="row" style={{ marginTop: 10 }}><button type="button" className="act" disabled={!draft.title.trim()} onClick={() => add('note', p.userId)}>Add note</button></p>
      </div>
      {notes.map((n) => <NoteCard key={n.id} n={n} editable />)}
    </div>
  );
}

// ================================================================ reveal log and the "newly revealed" feed

export function LogTool(p: ToolProps & { initial: Entry[]; feed: boolean }) {
  const [feed, setFeed] = useState(p.feed);
  const [, start] = useTransition();
  const rows = [...p.initial].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const when = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="wrap">
      <h2>{p.dm ? 'Reveal log' : 'Newly revealed'}</h2>
      <p className="lede">{p.dm ? 'Everything that has become visible to players, newest first.' : 'What has opened up for you lately.'}</p>
      {p.dm ? (
        <div className="plate">
          <label className="ck"><input type="checkbox" checked={feed} disabled={!p.canWrite} onChange={(e) => { setFeed(e.target.checked); start(async () => { await saveSetting(p.slug, 'feed', e.target.checked); }); }} /> Show players a &quot;newly revealed&quot; feed</label>
          <p className="muted">When this is on, each player sees a line here for every new thing they are allowed to see. A stage change is announced without naming the stage. Lines written while it is off stay with you.</p>
        </div>
      ) : null}
      <ul className="loglist">
        {rows.map((r) => (
          <li key={r.id}><span className="who">{when(r.created_at)}</span> {r.title}
            {p.dm ? <> <span className={'pillb ' + (r.live ? 'pl' : 'dm')}>{r.live ? 'in the feed: ' + visLabel(visOf(r), p.stages, p.members) : 'not in the feed'}</span>{r.secret?.stage ? <span className="muted"> Stage: {r.secret.stage}</span> : null}</> : null}
          </li>
        ))}
      </ul>
      {rows.length ? null : <p className="who">Nothing yet.</p>}
    </div>
  );
}

// ================================================================ world state: consequences, clues, clocks

export function WorldTool(p: ToolProps & { initial: Entry[]; npcs: { id: string; title: string }[] }) {
  const { rows, save, remove, msg } = useEntries(p.initial);
  const [open, setOpen] = useState<string | null>(null);
  const cons = rows.filter((r) => r.kind === 'consequence').sort((a, b) => Number(b.data.session || 0) - Number(a.data.session || 0) || b.created_at.localeCompare(a.created_at));
  const secrets = rows.filter((r) => r.kind === 'secret');
  const clocks = rows.filter((r) => r.kind === 'clock');
  const tagsOf = (c: Entry): string[] => c.data.tags ?? [];
  const allTags = [...new Set(cons.flatMap(tagsOf))].sort((a, b) => a.localeCompare(b));
  const [tag, setTag] = useState('');
  const who = (id: string) => p.members.find((m) => m.user_id === id)?.display_name ?? 'someone';

  const conFields: F[] = [
    { key: 'title', label: 'What the players did, and what it changed', title: true },
    { key: 'session', label: 'Session', kind: 'number', def: p.session || '' },
    { key: 'tagText', label: 'Factions, NPCs and places it affected (separated by commas)', help: 'Use the same names each time. Each one gets a history.' },
  ];
  const clockFields: F[] = [
    { key: 'title', label: 'Faction', title: true },
    { key: 'goal', label: 'What they are working toward' },
    { key: 'segments', label: 'Segments on the clock', kind: 'select', options: ['4', '6', '8', '10', '12'], def: '6' },
    { key: 'onFill', label: 'What happens when it fills', kind: 'long', secret: true },
  ];
  const secretFields: F[] = [{ key: 'title', label: 'The secret', title: true }, { key: 'detail', label: 'Detail', kind: 'long', secret: true }];
  const clueFields: F[] = [{ key: 'title', label: 'The clue', title: true }, { key: 'where', label: 'Where it is found' }];

  return (
    <div className="wrap">
      <h2>World state</h2>
      <p className="lede">{p.dm ? 'What the party has changed, what they could find out, and what the factions are doing meanwhile.' : 'What your choices have changed.'}</p>
      <Problem r={msg} />

      <h3>Consequences</h3>
      {p.dm && p.canWrite && !p.make.world ? <><p className="muted">What came with this campaign works as it is. Adding new consequences, clocks and secrets is part of Pro.</p><UpgradeHint feature="world" /></> : null}
      {p.dm && p.canWrite && p.make.world ? <p className="row"><button type="button" className="act" onClick={() => setOpen('con')}>Log a consequence</button></p> : null}
      {open === 'con' ? <div className="plate"><EntryForm fields={conFields} entry={{ vis: 'dm', data: { session: p.session || '' } }} stages={p.stages} members={p.members} canName={p.make.player_secrets} onCancel={() => setOpen(null)}
        onSave={async (patch) => { const { tagText, ...d } = patch.data as any; const r = await save({ ...patch, campaign_id: p.campaignId, kind: 'consequence', data: { ...d, tags: String(tagText || '').split(',').map((t) => t.trim()).filter(Boolean) } }); if (!r.error) setOpen(null); return r; }} /></div> : null}
      {allTags.length ? <p className="chips"><button type="button" className="fchip" aria-pressed={!tag} onClick={() => setTag('')}>Everything</button>{allTags.map((t) => <button type="button" key={t} className="fchip" aria-pressed={tag === t} onClick={() => setTag(t)}>{t}</button>)}</p> : null}
      {tag ? <p className="muted">How the party has changed things for {tag}:</p> : null}
      <ul className="loglist">
        {cons.filter((c) => !tag || tagsOf(c).includes(tag)).map((c) => (
          <li key={c.id}>
            {c.data.session ? <span className="who">Session {c.data.session}</span> : null} {c.title} {tagsOf(c).map((t) => <span key={t} className="pillb">{t}</span>)}
            {p.dm ? <> <span className={'pillb ' + (c.vis === 'dm' ? 'dm' : 'pl')}>{visLabel(visOf(c), p.stages, p.members)}</span>{p.canWrite ? <> <button type="button" className="act sm" onClick={() => save({ id: c.id, campaign_id: p.campaignId, kind: 'consequence', vis: c.vis === 'dm' ? 'all' : 'dm' })}>{c.vis === 'dm' ? 'Show to players' : 'Make DM only'}</button> <ConfirmButton className="act sm danger" ask={'Delete this?'} yes="Yes, delete" onConfirm={() => { void remove(c.id); }}>Delete</ConfirmButton></> : null}</> : null}
          </li>
        ))}
      </ul>
      {cons.length ? null : <p className="who">Nothing logged yet.</p>}

      <h3>Faction clocks</h3>
      {p.dm && p.canWrite && p.make.world ? <p className="row"><button type="button" className="act" onClick={() => setOpen('clock')}>Add a clock</button></p> : null}
      {open === 'clock' ? <div className="plate"><EntryForm fields={clockFields} entry={{ vis: 'dm', data: { segments: '6', filled: 0 } }} stages={p.stages} members={p.members} canName={p.make.player_secrets} onCancel={() => setOpen(null)}
        onSave={async (patch, secret) => { const r = await save({ ...patch, campaign_id: p.campaignId, kind: 'clock', data: { ...patch.data, filled: 0 } }, secret); if (!r.error) setOpen(null); return r; }} /></div> : null}
      <div className="grid g2">
        {clocks.map((c) => {
          const n = Number(c.data.segments) || 6, filled = Math.min(n, Number(c.data.filled) || 0);
          return (
            <div key={c.id} className="plate">
              <h3>{c.title}</h3>
              {c.data.goal ? <p>{c.data.goal}</p> : null}
              <div className="clock" role="img" aria-label={`${filled} of ${n} segments filled`}>{Array.from({ length: n }, (_, i) => <span key={i} className={i < filled ? 'on' : ''} />)}</div>
              <p className="who">{filled} of {n}{filled >= n ? ': full' : ''}</p>
              {p.dm && c.secret?.onFill ? <div className="secret"><span className="tag">DM only</span><div className="sb"><p><b>When it fills:</b> {c.secret.onFill}</p></div></div> : null}
              {p.dm ? <p className="row">
                <span className={'pillb ' + (c.vis === 'dm' ? 'dm' : 'pl')}>{visLabel(visOf(c), p.stages, p.members)}</span>
                {p.canWrite ? <><button type="button" className="act" disabled={filled >= n} onClick={() => save({ id: c.id, campaign_id: p.campaignId, kind: 'clock', data: { ...c.data, filled: filled + 1 } })}>Advance</button>
                <button type="button" className="act sm" disabled={filled <= 0} onClick={() => save({ id: c.id, campaign_id: p.campaignId, kind: 'clock', data: { ...c.data, filled: filled - 1 } })}>Back</button>
                <button type="button" className="act sm" onClick={() => save({ id: c.id, campaign_id: p.campaignId, kind: 'clock', vis: c.vis === 'dm' ? 'all' : 'dm' })}>{c.vis === 'dm' ? 'Reveal to players' : 'Make DM only'}</button>
                <ConfirmButton className="act sm danger" ask={'Delete this clock?'} yes="Yes, delete" onConfirm={() => { void remove(c.id); }}>Delete</ConfirmButton></> : null}
              </p> : null}
            </div>
          );
        })}
      </div>
      {clocks.length ? null : <p className="who">{p.dm ? 'No clocks yet.' : 'Nothing known yet.'}</p>}

      {p.dm ? (
        <>
          <h3>Secrets and their clues</h3>
          <p className="muted">List each thing the players could discover, and the clues that point to it. Three clues is the usual safety margin: players miss one, misread another, and still have a third.</p>
          {p.canWrite && p.make.world ? <p className="row"><button type="button" className="act" onClick={() => setOpen('secret')}>Add a secret</button></p> : null}
          {open === 'secret' ? <div className="plate"><EntryForm fields={secretFields} entry={{ vis: 'dm' }} stages={p.stages} members={p.members} canName={false} allowVis={null} onCancel={() => setOpen(null)}
            onSave={async (patch, secret) => { const r = await save({ ...patch, campaign_id: p.campaignId, kind: 'secret', vis: 'dm' }, secret); if (!r.error) setOpen(null); return r; }} /></div> : null}
          {secrets.map((s) => {
            const clues = rows.filter((r) => r.kind === 'clue' && r.parent === s.id);
            return (
              <div key={s.id} className="plate">
                <h3>{s.title}</h3>
                {s.secret?.detail ? <p style={{ whiteSpace: 'pre-wrap' }}>{s.secret.detail}</p> : null}
                {clues.length < 3 ? <p className="err" role="status">This secret has {clues.length === 0 ? 'no clues' : clues.length === 1 ? 'only 1 clue' : 'only 2 clues'}. Aim for at least three.</p> : null}
                <ul className="check">
                  {clues.map((c) => (
                    <li key={c.id}>
                      <label><input type="checkbox" checked={c.status === 'found'} disabled={!p.canWrite} onChange={(e) => save({ id: c.id, campaign_id: p.campaignId, kind: 'clue', status: e.target.checked ? 'found' : '' })} /><span>{c.title}{c.data.where ? <small className="who"> · found: {c.data.where}</small> : null}</span></label>
                      {c.status === 'found' ? <label className="f inl">Found by<select value={c.data.by ?? ''} disabled={!p.canWrite} onChange={(e) => save({ id: c.id, campaign_id: p.campaignId, kind: 'clue', data: { ...c.data, by: e.target.value } })}><option value="">The party</option>{p.members.map((m) => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}</select></label> : null}
                      {p.canWrite ? <button type="button" className="act sm" onClick={() => remove(c.id)}>Remove</button> : null}
                    </li>
                  ))}
                </ul>
                {open === 'clue:' + s.id ? <EntryForm fields={clueFields} entry={{ vis: 'dm' }} stages={p.stages} members={p.members} canName={false} allowVis={null} saveLabel="Add clue" onCancel={() => setOpen(null)}
                  onSave={async (patch) => { const r = await save({ ...patch, campaign_id: p.campaignId, kind: 'clue', parent: s.id, vis: 'dm' }); if (!r.error) setOpen(null); return r; }} />
                  : p.canWrite ? <p className="row">{p.make.world ? <button type="button" className="act sm" onClick={() => setOpen('clue:' + s.id)}>Add a clue</button> : null}<ConfirmButton className="act sm danger" ask={'Delete this secret and its clues?'} yes="Yes, delete" onConfirm={() => { void remove(s.id); }}>Delete</ConfirmButton></p> : null}
              </div>
            );
          })}
        </>
      ) : null}
    </div>
  );
}

// ================================================================ session zero and safety tools

type Zero = { tone: string; lines: string; veils: string; table: string; house: string };
const ZERO_PARTS: [keyof Zero, string, string][] = [
  ['tone', 'Tone', 'What kind of game this is: heroic, grim, funny, slow-burning.'],
  ['lines', 'Lines', 'Things that will not appear in this game at all.'],
  ['veils', 'Veils', 'Things that can happen, but off-screen, without detail.'],
  ['table', 'Table rules', 'How the table runs: phones, lateness, taking turns, breaks.'],
  ['house', 'House rules', 'Where this game departs from the rules as written.'],
];

export function ZeroTool(p: ToolProps & { initial: Entry | null; inputs: { id: string; kind: string; body: string }[] }) {
  const [row, setRow] = useState<Entry | null>(p.initial);
  const [z, setZ] = useState<Zero>({ tone: '', lines: '', veils: '', table: '', house: '', ...(p.initial?.data ?? {}) });
  const [inputs, setInputs] = useState(p.inputs);
  const [state, setState] = useState('');
  const [mine, setMine] = useState({ kind: 'line', body: '' });
  const supabase = supabaseBrowser();
  const save = async () => {
    const base = { campaign_id: p.campaignId, kind: 'zero', title: 'Session zero', vis: 'all', live: true, data: z };
    const q = row ? supabase.from('entries').update(base).eq('id', row.id) : supabase.from('entries').insert(base);
    const { data, error } = await q.select('*').maybeSingle();
    setState(error || !data ? 'That did not save.' : 'Saved. Your players can read it.');
    if (data) setRow(data as Entry);
  };
  const send = async () => {
    const { error } = await supabase.rpc('submit_safety', { c: p.campaignId, p_kind: mine.kind, p_body: mine.body });
    setState(error ? (/too many/.test(error.message) ? 'You have sent a lot already. Talk to your DM directly.' : 'That did not send.') : 'Sent. Your DM sees it without your name.');
    if (!error) setMine({ ...mine, body: '' });
  };
  return (
    <div className="wrap">
      <h2>Session zero</h2>
      <p className="lede">What this table has agreed about the game before it starts.</p>
      {ZERO_PARTS.map(([k, label, hint]) => (
        <section key={k}>
          <h3>{label}</h3>
          {p.dm ? <label className="f"><span className="muted">{hint}</span><textarea rows={3} value={z[k]} disabled={!p.canWrite} onChange={(e) => setZ({ ...z, [k]: e.target.value })} /></label>
            : z[k] ? <div className="plate"><p style={{ whiteSpace: 'pre-wrap' }}>{z[k]}</p></div> : <p className="who">Nothing set yet.</p>}
        </section>
      ))}
      {p.dm && p.canWrite ? <p className="row" style={{ marginTop: 12 }}><button type="button" className="act" onClick={save}>Save</button><span className="who" role="status">{state}</span></p> : null}

      {p.dm ? (
        <>
          <h3>What your players asked for</h3>
          <p className="muted">Sent by players without their names, mixed together in no particular order. Nothing here says who wrote which line.</p>
          {inputs.length ? <ul className="loglist">{[...inputs].sort((a, b) => a.body.localeCompare(b.body)).map((i) => <li key={i.id}><span className="pillb">{i.kind === 'line' ? 'Line' : i.kind === 'veil' ? 'Veil' : 'Note'}</span> {i.body} {p.canWrite ? <button type="button" className="act sm" onClick={async () => { const { error } = await supabase.from('safety_inputs').delete().eq('id', i.id); if (!error) setInputs(inputs.filter((x) => x.id !== i.id)); }}>Remove</button> : null}</li>)}</ul> : <p className="who">Nothing has been sent.</p>}
        </>
      ) : !p.canWrite ? null : (
        <>
          <h3>Tell your DM, without your name</h3>
          <p className="muted">If there is something you would rather not have in the game, or only off-screen, say so here. It reaches your DM as part of one combined list. Your name is not stored with it. Please do not include health or medical details: a few words about the topic is all that is needed.</p>
          <div className="plate">
            <div className="fields">
              <label className="f">This is<select value={mine.kind} onChange={(e) => setMine({ ...mine, kind: e.target.value })}><option value="line">A line (not at all)</option><option value="veil">A veil (off-screen only)</option><option value="note">Something else</option></select></label>
              <label className="f">In a few words<input value={mine.body} maxLength={300} onChange={(e) => setMine({ ...mine, body: e.target.value })} /></label>
            </div>
            <p className="row" style={{ marginTop: 10 }}><button type="button" className="act" disabled={mine.body.trim().length < 2} onClick={send}>Send without my name</button><span className="who" role="status">{state}</span></p>
          </div>
        </>
      )}
    </div>
  );
}
