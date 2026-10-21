'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import type { Entry, ToolProps } from '@/lib/entry-types';
import { uploadPicture, type Result } from '@/components/tools/kit';
import { ConfirmButton } from '@/components/ConfirmButton';
import { WhoSees } from '@/features/hub/visibility/WhoSees';
import { useVisMode } from '@/features/hub/visibility/VisMode';
import type { VisValue } from '@/features/hub/visibility/model';
import type { LoreCategory, LoreField } from '@/config/lore-categories';
import { cleanData, factsOf, splitFacts, type Fact } from './model';

type Named = { id: string; title: string };
type Save = (row: Partial<Entry> & { campaign_id: string; kind: string }, secret?: Record<string, any>) => Promise<Result>;

// The form for one lore entry, with its category's own fields (Setup2Lore.png). What players may
// read goes on the entry; the DM's notes, and a creature's facts the party has not learned yet,
// go with the DM-only secrets.
export function LoreEditor({ entry, cat, p, regions, npcs, factions, save, remove, close }: {
  entry: Partial<Entry>; cat: LoreCategory; p: ToolProps; regions: Named[]; npcs: Named[]; factions: Named[];
  save: Save; remove: (id: string) => Promise<Result>; close: () => void;
}) {
  const mode = useVisMode();
  const isNew = !entry.id;
  const [title, setTitle] = useState(entry.title ?? '');
  const [values, setValues] = useState<Record<string, any>>({ ...(entry.data ?? {}) });
  const [notes, setNotes] = useState(String(entry.secret?.notes ?? ''));
  const [facts, setFacts] = useState<Fact[]>(() => factsOf({ id: entry.id ?? '', title: '', data: entry.data ?? {}, secret: entry.secret }));
  const [vis, setVis] = useState<VisValue>(isNew ? { vis: mode.defaults.newVis, vis_players: [], vis_stage: null, vis_entry: null } : { vis: entry.vis!, vis_players: entry.vis_players ?? [], vis_stage: entry.vis_stage ?? null, vis_entry: entry.vis_entry ?? null });
  const [position, setPosition] = useState<number>(Number(entry.sort) || 0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setValues((x) => ({ ...x, [k]: v }));
  const id = (k: string) => `lore-${entry.id ?? 'new'}-${k}`;

  const submit = async () => {
    if (!title.trim()) return setErr('Give it a name.');
    setBusy(true);
    const data = cleanData(cat, values, p.campaignId);
    let secret: Record<string, unknown> = { notes: notes.trim().slice(0, 5000) || undefined };
    if (cat.layout === 'bestiary') {
      const f = splitFacts(facts);
      if (f.learned.length) data.learned = f.learned;
      if (f.more) data.more = f.more;
      secret = { ...secret, unlearned: f.unlearned.length ? f.unlearned : undefined };
    }
    const r = await save({ id: entry.id, campaign_id: p.campaignId, kind: 'lore', title: title.trim().slice(0, 120), data, live: true, sort: cat.layout === 'timeline' ? position : Number(entry.sort) || 0, ...vis }, JSON.parse(JSON.stringify(secret)));
    setBusy(false);
    if (r.error) setErr(r.error); else close();
  };

  const field = (f: LoreField) => {
    const v = values[f.key];
    switch (f.kind) {
      case 'long': return <label key={f.key} className="f wide" htmlFor={id(f.key)}>{f.label}<textarea id={id(f.key)} rows={4} value={v ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />{f.help ? <small className="muted">{f.help}</small> : null}</label>;
      case 'number': return <label key={f.key} className="f" htmlFor={id(f.key)}>{f.label}<input id={id(f.key)} type="number" min={1} max={999} value={v ?? ''} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} /></label>;
      case 'check': return <label key={f.key} className="ck lr-ck"><input type="checkbox" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}</label>;
      case 'select': return <label key={f.key} className="f" htmlFor={id(f.key)}>{f.label}<select id={id(f.key)} value={v ?? ''} onChange={(e) => set(f.key, e.target.value)}>{(f.options ?? []).some(([o]) => o === '') ? null : <option value="">Choose…</option>}{(f.options ?? []).map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select></label>;
      case 'list': return <label key={f.key} className="f" htmlFor={id(f.key)}>{f.label}<input id={id(f.key)} value={Array.isArray(v) ? v.join(', ') : v ?? ''} onChange={(e) => set(f.key, e.target.value)} />{f.help ? <small className="muted">{f.help}</small> : null}</label>;
      case 'region': return <label key={f.key} className="f" htmlFor={id(f.key)}>{f.label}<select id={id(f.key)} value={v ?? ''} onChange={(e) => set(f.key, e.target.value)}><option value="">No region</option>{regions.filter((r) => r.id !== entry.id).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select>{regions.length ? null : <small className="muted">Add a place of type Region to nest places inside it.</small>}</label>;
      case 'npcs': case 'factions': {
        const list = f.kind === 'npcs' ? npcs : factions;
        const on: string[] = Array.isArray(v) ? v : [];
        return (
          <fieldset key={f.key} className="lr-links wide"><legend>{f.label}</legend>
            {list.length ? list.map((x) => <label key={x.id} className="ck"><input type="checkbox" checked={on.includes(x.id)} onChange={(e) => set(f.key, e.target.checked ? [...on, x.id] : on.filter((y) => y !== x.id))} /> {x.title}</label>)
              : <small className="muted">{f.kind === 'npcs' ? 'No NPCs yet.' : 'No factions yet. Add them under Factions.'}</small>}
          </fieldset>
        );
      }
      case 'image': return (
        <label key={f.key} className="f" htmlFor={id(f.key)}>{f.label} (optional)
          <input id={id(f.key)} type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const up = await uploadPicture(p.campaignId, 'lore', file, 960); if (up.error) setErr(up.error); else { setErr(''); set(f.key, up.path); } }} />
          {v ? <small className="muted">A picture is attached. <button type="button" className="act sm" onClick={() => set(f.key, '')}>Remove it</button></small> : null}
        </label>
      );
      default: return <label key={f.key} className="f" htmlFor={id(f.key)}>{f.label}<input id={id(f.key)} value={v ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} /></label>;
    }
  };

  return (
    <form className="plate lr-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h3>{isNew ? `New entry · ${cat.name}` : `Edit ${entry.title}`}</h3>
      <div className="fields wide">
        <label className="f" htmlFor={id('name')}>Name<input id={id('name')} value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} /></label>
        {cat.fields.map(field)}
        {cat.layout === 'timeline' ? <label className="f" htmlFor={id('pos')}>Order on the timeline<input id={id('pos')} type="number" value={position} onChange={(e) => setPosition(Math.trunc(Number(e.target.value)) || 0)} /><small className="muted">Lower numbers come first.</small></label> : null}
      </div>

      {cat.layout === 'bestiary' ? (
        <fieldset className="lr-facts"><legend>What the party can learn</legend>
          <p className="muted">Tick a fact when the party learns it. Until then only DMs see it; players are told how many are left.</p>
          {facts.map((fact, i) => (
            <div key={i} className="lr-fact">
              <input aria-label="Fact" value={fact.text} placeholder="Weak to silver" onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              <input aria-label="Learned in session" type="number" min={1} max={999} placeholder="Session" value={fact.session ?? ''} onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, session: e.target.value ? Number(e.target.value) : undefined } : x)))} />
              <label className="ck"><input type="checkbox" checked={fact.learned} onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, learned: e.target.checked } : x)))} /> Learned</label>
              <button type="button" className="act sm" onClick={() => setFacts(facts.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button type="button" className="act sm" onClick={() => setFacts([...facts, { text: '', learned: false }])}>+ Add a fact</button>
        </fieldset>
      ) : null}

      <div className="lr-vis">
        <WhoSees value={vis} onChange={setVis} stages={p.stages} members={p.members} beats={mode.beats} canName={p.make.player_secrets} named={mode.defaults.named} nextSession={mode.nextSession} label="Players can see this" />
      </div>
      <label className="f wide lr-notes" htmlFor={id('notes')}>DM-only notes<textarea id={id('notes')} rows={3} value={notes} placeholder="Traps, secrets, what is really going on" onChange={(e) => setNotes(e.target.value)} /></label>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <p className="row">
        <button className="act" disabled={busy}>{busy ? 'Saving…' : 'Save entry'}</button>
        <button type="button" className="act sm" onClick={close}>Cancel</button>
        {entry.id ? <ConfirmButton className="act sm danger" ask="Delete this entry for good?" yes="Yes, delete" onConfirm={() => { void remove(entry.id!).then(close); }}>Delete</ConfirmButton> : null}
      </p>
    </form>
  );
}
