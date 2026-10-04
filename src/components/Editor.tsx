'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState, useTransition } from 'react';
import { deleteContentRow, duplicateContentRow, moveContentRow, saveContentRow, saveSessionBeat, saveSessionNotes } from '@/app/c/[slug]/actions';
import type { ContentRow } from '@/lib/types';

// ---------------------------------------------------------------- rich text

// Edit formatted text in place, or switch to the raw HTML for full control.
function RichHtml({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [raw, setRaw] = useState(false);
  const initial = useRef(value);
  const box = useRef<HTMLDivElement>(null);
  return (
    <div>
      {raw ? (
        <textarea className="mono" rows={Math.min(24, Math.max(4, value.split('\n').length + 2))} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      ) : (
        <div ref={box} className="rich" contentEditable suppressContentEditableWarning onInput={(e) => onChange((e.target as HTMLElement).innerHTML)} dangerouslySetInnerHTML={{ __html: initial.current }} />
      )}
      <p className="muted" style={{ margin: '4px 0 0' }}>
        <button type="button" className="act sm" onClick={() => { initial.current = value; setRaw(!raw); }}>{raw ? 'Back to plain editing' : 'Edit as HTML'}</button>
        {raw ? null : ' Click into the box and type. Use Ctrl+B for bold and Ctrl+I for italics.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- structured fields (races, factions)

const isStrings = (v: any) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isRows = (v: any) => Array.isArray(v) && v.length > 0 && v.every((x) => Array.isArray(x) && x.every((y: any) => typeof y === 'string' || typeof y === 'number'));
const LABELS: Record<string, string> = {
  n: 'Name', who: 'Who they are', want: 'What they want', members: 'Members', leader: 'Leader', res: 'Resources', resDm: 'Resources (DM addition)',
  idle: 'If the players do nothing', small: 'Small moves (one per line)', big: 'Big development', dm: 'DM notes (one per line)',
  id: 'Id (do not change once characters use it)', name: 'Name', pron: 'Pronunciation', kind: 'Origin', src: 'Source editions', color: 'Colour', size: 'Size', speed: 'Speed',
  line: 'One-line summary', keys: 'Key points (one per line)', look: 'Look', life: 'Life cycle (one per line)', culture: 'Culture (one per line)', voth: 'Under Voth', now: 'Now',
  slayer: 'Their part in the one-shot', traits: 'Traits (one per line: name | rule | source)', up: 'Level 7 upgrade', sug: 'Suggested lore', glyph: 'Glyph (SVG shapes)',
};

function Fields({ value, onChange }: { value: Record<string, any>; onChange: (v: Record<string, any>) => void }) {
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {Object.entries(value).map(([k, v]) => {
        const label = LABELS[k] || k;
        if (typeof v === 'boolean') return <label key={k} className="ck"><input type="checkbox" checked={v} onChange={(e) => set(k, e.target.checked)} /> {label}</label>;
        if (typeof v === 'number') return <label key={k} className="f">{label}<input type="number" value={v} onChange={(e) => set(k, Number(e.target.value))} /></label>;
        if (typeof v === 'string') return <label key={k} className="f">{label}<textarea rows={v.length > 90 ? 3 : 1} className={k === 'glyph' ? 'mono' : undefined} value={v} onChange={(e) => set(k, e.target.value)} /></label>;
        if (isStrings(v)) return <label key={k} className="f">{label}<textarea rows={Math.max(2, v.length + 1)} value={v.join('\n')} onChange={(e) => set(k, e.target.value.split('\n').filter((l) => l.trim()))} /></label>;
        if (isRows(v)) return <label key={k} className="f">{label}<textarea rows={v.length + 1} value={v.map((r: any[]) => r.join(' | ')).join('\n')} onChange={(e) => set(k, e.target.value.split('\n').filter((l) => l.trim()).map((l) => { const p = l.split('|').map((x) => x.trim()); while (p.length < 3) p.push(''); return p; }))} /></label>;
        return <JsonField key={k} label={label} value={v} onChange={(nv) => set(k, nv)} />;
      })}
    </div>
  );
}

function JsonField({ label, value, onChange }: { label: string; value: any; onChange: (v: any) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <label className="f">{label}{bad ? <span className="err"> (not valid JSON yet)</span> : null}
      <textarea className="mono" rows={Math.min(20, text.split('\n').length + 1)} value={text} spellCheck={false}
        onChange={(e) => { setText(e.target.value); try { onChange(JSON.parse(e.target.value)); setBad(false); } catch { setBad(true); } }} />
    </label>
  );
}

// ---------------------------------------------------------------- one content row

const KIND_LABEL: Record<string, string> = {
  hero: 'Page header', heading: 'Heading', html: 'Text', plate: 'Card', secret: 'Secret box', table: 'Table', checklist: 'Checklist',
  'faction-table': 'Faction table (automatic)', 'faction-cards': 'Faction cards (automatic)', 'race-cards': 'Race cards (automatic)',
  'race-browser': 'Race browser (automatic)', 'upgrade-table': 'Upgrade table (automatic)',
  race: 'Race entry', 'race-phase': 'Race entry: one phase', 'race-dm': 'Race entry: DM notes', 'sheet-slot': 'Character sheet form: part', faction: 'Faction entry', 'faction-dm': 'Faction entry: DM notes', 'sheet-template': 'Character sheet form',
};
const AUTO = new Set(['faction-table', 'faction-cards', 'race-cards', 'race-browser', 'upgrade-table']);

function RowEditor({ slug, row, twin, phases }: { slug: string; row: ContentRow; twin?: ContentRow; phases: { id: string; label: string }[] }) {
  const [body, setBody] = useState<any>(row.body || {});
  const [title, setTitle] = useState(row.title);
  const [msg, setMsg] = useState<{ error?: string; note?: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<any>) => start(async () => { const r = await fn(); if (r && (r.error || r.note)) setMsg(r); });
  const save = (patch: Parameters<typeof saveContentRow>[2]) => run(() => saveContentRow(slug, row.id, patch));
  const isDm = row.visibility === 'dm';

  let form: React.ReactNode;
  if (AUTO.has(row.kind)) form = <p className="muted">This block fills itself in from the {row.kind.startsWith('race') || row.kind === 'upgrade-table' ? 'race' : 'faction'} entries. Edit those entries to change it.</p>;
  else if (row.kind === 'heading') form = <label className="f">Heading<input value={body.text ?? ''} onChange={(e) => { setBody({ ...body, text: e.target.value }); setTitle(e.target.value); }} /></label>;
  else if (row.kind === 'secret') form = <><label className="f">Label<input value={body.tag ?? ''} onChange={(e) => setBody({ ...body, tag: e.target.value })} /></label><div style={{ marginTop: 8 }}><RichHtml value={body.html ?? ''} onChange={(html) => setBody({ ...body, html })} /></div></>;
  else if (row.kind === 'checklist') form = <label className="f">Items, one per line<textarea rows={(body.items?.length ?? 0) + 2} value={(body.items ?? []).map((i: any) => i.text).join('\n')} onChange={(e) => setBody({ ...body, items: e.target.value.split('\n').filter((l) => l.trim()).map((text) => ({ text, done: !!(body.items ?? []).find((i: any) => i.text === text)?.done })) })} /></label>;
  else if (typeof body.html === 'string') form = <RichHtml value={body.html} onChange={(html) => setBody({ ...body, html })} />;
  else form = <Fields value={body} onChange={setBody} />;

  return (
    <details className={'ed' + (isDm ? ' dm' : '') + (row.hidden ? ' off' : '')}>
      <summary>
        <b>{title || KIND_LABEL[row.kind] || row.kind}</b>
        <span className="pillb">{KIND_LABEL[row.kind] || row.kind}</span>
        <span className={'pillb ' + (isDm ? 'dm' : 'pl')}>{isDm ? 'DM only' : 'Players and DM'}</span>
        {twin ? <span className="pillb">{isDm ? 'your wording; players see another' : 'players’ wording; you see another'}</span> : null}
        {row.phase ? <span className="pillb">{phases.find((p) => p.id === row.phase)?.label ?? row.phase}</span> : null}
        {row.hidden ? <span className="pillb">hidden</span> : null}
      </summary>
      <div style={{ marginTop: 10 }}>
        {form}
        <div className="row" style={{ marginTop: 12 }}>
          {AUTO.has(row.kind) ? null : <button className="act" disabled={pending} onClick={() => save({ body, title })}>Save</button>}
          <label className="row muted">Who sees it
            <select className="small" value={row.visibility} disabled={pending} onChange={(e) => { const v = e.target.value as 'player' | 'dm'; if (v === 'dm' || confirm('Show this block to players?')) save({ visibility: v }); }}>
              <option value="dm">DM only</option><option value="player">Players and DM</option>
            </select>
          </label>
          {phases.length ? (
            <label className="row muted">When
              <select className="small" value={row.phase ?? ''} disabled={pending} onChange={(e) => save({ phase: e.target.value || null })}>
                <option value="">Always</option>{phases.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          ) : null}
          <button className="act sm" disabled={pending} onClick={() => save({ hidden: !row.hidden })}>{row.hidden ? 'Show again' : 'Hide'}</button>
          <button className="act sm" disabled={pending} onClick={() => run(() => moveContentRow(slug, row.section, row.id, -1))}>Move up</button>
          <button className="act sm" disabled={pending} onClick={() => run(() => moveContentRow(slug, row.section, row.id, 1))}>Move down</button>
          <button className="act sm" disabled={pending} onClick={() => run(() => duplicateContentRow(slug, row.id))}>Duplicate</button>
          <button className="act sm danger" disabled={pending} onClick={() => { if (confirm('Delete this block for good?')) run(() => deleteContentRow(slug, row.id)); }}>Delete</button>
          {msg?.error ? <span className="err" role="alert">{msg.error}</span> : null}
          {msg?.note ? <span className="okmsg" role="status">{msg.note}</span> : null}
        </div>
      </div>
    </details>
  );
}

export function ContentEditor({ slug, rows, phases }: { slug: string; rows: ContentRow[]; phases: { id: string; label: string }[] }) {
  const twinOf = (r: ContentRow) => rows.find((x) => x.id !== r.id && x.key === r.key && x.visibility !== r.visibility && !/-dm$/.test(x.kind) && !/-dm$/.test(r.kind) && x.kind === r.kind);
  const blocks = rows.filter((r) => r.sort < 1000);
  const entries = rows.filter((r) => r.sort >= 1000);
  return (
    <>
      {blocks.map((r) => <RowEditor key={r.id + r.visibility + String(r.hidden) + (r.phase ?? '')} slug={slug} row={r} twin={twinOf(r)} phases={phases} />)}
      {entries.length ? <><h2>Entries</h2><p className="muted">These fill in the automatic blocks above. To add one, duplicate an entry and change it.</p></> : null}
      {entries.map((r) => <RowEditor key={r.id + r.visibility + String(r.hidden) + (r.phase ?? '')} slug={slug} row={r} phases={phases} />)}
    </>
  );
}

// ---------------------------------------------------------------- sessions

export function BeatEditor({ slug, sessionId, beatId, label, html }: { slug: string; sessionId: string; beatId: string; label: string; html: string }) {
  const [value, setValue] = useState(html);
  const [msg, setMsg] = useState<{ error?: string; note?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <details className="ed dm">
      <summary><b>{label}</b></summary>
      <div style={{ marginTop: 10 }}>
        <RichHtml value={value} onChange={setValue} />
        <p className="row" style={{ marginTop: 10 }}>
          <button className="act" disabled={pending} onClick={() => start(async () => setMsg(await saveSessionBeat(slug, sessionId, beatId, value)))}>Save</button>
          {msg?.error ? <span className="err">{msg.error}</span> : null}{msg?.note ? <span className="okmsg">{msg.note}</span> : null}
        </p>
      </div>
    </details>
  );
}

export function SessionNotes({ slug, sessionId, notes }: { slug: string; sessionId: string; notes: string }) {
  const [value, setValue] = useState(notes);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="plate">
      <label className="f">Planning notes<textarea rows={10} value={value} onChange={(e) => { setValue(e.target.value); setSaved(false); }} /></label>
      <p className="row" style={{ marginTop: 10 }}>
        <button className="act" disabled={pending} onClick={() => start(async () => { await saveSessionNotes(slug, sessionId, value); setSaved(true); })}>Save notes</button>
        {saved ? <span className="okmsg">Saved.</span> : null}
      </p>
    </div>
  );
}
