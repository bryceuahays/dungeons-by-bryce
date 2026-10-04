'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { FEATURES } from '@/config/plans';
import type { Entry } from '@/lib/entry-types';
import { VisPicker, type Member, type Stage, type Vis } from '../VisPicker';

// The table tools write straight to the database from the browser, as the signed-in
// person. The database decides what is allowed (who may write, what a plan includes),
// so these helpers only have to report what it said.

export type Result = { row?: Entry; error?: string; upgrade?: string };

const explain = (message: string | undefined): Result => {
  const m = /upgrade:([a-z_]+)/.exec(message || '');
  if (m) return { upgrade: m[1], error: `${(FEATURES as any)[m[1]]?.name ?? 'That'} is part of Pro.` };
  return { error: /row-level security|permission|not allowed/i.test(message || '') ? 'You are not allowed to change that.' : 'That did not save. Try again.' };
};

export async function saveEntry(row: Partial<Entry> & { campaign_id: string; kind: string }, secret?: Record<string, any>): Promise<Result> {
  const supabase = supabaseBrowser();
  const { id, secret: _drop, created_at: _c, updated_at: _u, ...rest } = row as any;
  void _drop; void _c; void _u;
  const q = id ? supabase.from('entries').update(rest).eq('id', id) : supabase.from('entries').insert(rest);
  const { data, error } = await q.select('*').maybeSingle();
  if (error || !data) return explain(error?.message);
  if (secret !== undefined) {
    const s = await supabase.from('entry_secrets').upsert({ entry_id: data.id, campaign_id: data.campaign_id, data: secret });
    if (s.error) return explain(s.error.message);
  }
  return { row: { ...(data as Entry), ...(secret !== undefined ? { secret } : {}) } };
}

export async function removeEntry(id: string): Promise<Result> {
  const { error } = await supabaseBrowser().from('entries').delete().eq('id', id);
  return error ? explain(error.message) : {};
}

// Local list state with add, change and remove.
export function useEntries(initial: Entry[]) {
  const [rows, setRows] = useState<Entry[]>(initial);
  const [msg, setMsg] = useState<Result | null>(null);
  const put = (r: Entry) => setRows((prev) => (prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? { ...x, ...r } : x)) : [...prev, r]));
  const save = async (row: Partial<Entry> & { campaign_id: string; kind: string }, secret?: Record<string, any>) => {
    const r = await saveEntry(row, secret);
    setMsg(r.error ? r : null);
    if (r.row) put(r.row);
    return r;
  };
  const remove = async (id: string) => {
    const r = await removeEntry(id);
    setMsg(r.error ? r : null);
    if (!r.error) setRows((prev) => prev.filter((x) => x.id !== id && x.parent !== id));
    return r;
  };
  return { rows, setRows, save, remove, msg, setMsg };
}

// Live updates for one campaign's entries of some kinds (the initiative tracker uses this).
// Row-level security applies to what is delivered, exactly as it does to a query.
export function useLive(campaignId: string, kinds: string[], onChange: (kind: 'put' | 'gone', row: any) => void) {
  const key = kinds.join(',');
  useEffect(() => {
    const supabase = supabaseBrowser();
    let gone = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (gone) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (gone) return;
      channel = supabase.channel('entries-' + campaignId + '-' + key)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: 'campaign_id=eq.' + campaignId }, (p: any) => {
          if (p.eventType === 'DELETE') onChange('gone', p.old);
          else if (kinds.includes(p.new.kind)) onChange('put', p.new);
        })
        .subscribe();
    })();
    return () => { gone = true; if (channel) supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, key]);
}

export function Problem({ r }: { r: Result | null }) {
  if (!r?.error) return null;
  return <p className="err" role="alert">{r.error} {r.upgrade ? <Link href="/upgrade">See what Pro adds</Link> : null}</p>;
}

export const visOf = (e: Partial<Entry>): Vis => ({ vis: e.vis ?? 'dm', vis_players: e.vis_players ?? [], vis_stage: e.vis_stage ?? null, vis_entry: e.vis_entry ?? null });

// ---------------------------------------------------------------- a generic entry form

export type F = { key: string; label: string; kind?: 'text' | 'long' | 'number' | 'select' | 'check'; options?: (string | [string, string])[]; secret?: boolean; title?: boolean; status?: boolean; help?: string; def?: any };

export function EntryForm({ fields, entry, stages, members, beats, allowVis, canName, onSave, onCancel, onDelete, saveLabel = 'Save', children }: {
  fields: F[]; entry: Partial<Entry>; stages: Stage[]; members: Member[]; beats?: { id: string; title: string }[]; allowVis?: string[] | null; canName: boolean;
  onSave: (patch: Partial<Entry>, secret: Record<string, any>) => Promise<Result>; onCancel?: () => void; onDelete?: () => void; saveLabel?: string; children?: React.ReactNode;
}) {
  const [title, setTitle] = useState(entry.title ?? '');
  const [status, setStatus] = useState(entry.status ?? '');
  const [data, setData] = useState<Record<string, any>>(entry.data ?? {});
  const [secret, setSecret] = useState<Record<string, any>>(entry.secret ?? {});
  const [vis, setVis] = useState<Vis>(visOf(entry));
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const val = (f: F) => (f.title ? title : f.status ? status : (f.secret ? secret : data)[f.key] ?? f.def ?? (f.kind === 'check' ? false : ''));
  const put = (f: F, v: any) => (f.title ? setTitle(v) : f.status ? setStatus(v) : f.secret ? setSecret({ ...secret, [f.key]: v }) : setData({ ...data, [f.key]: v }));
  const submit = async () => {
    setBusy(true);
    const r = await onSave({ title: title.trim().slice(0, 200), status, data, ...(allowVis === null ? {} : vis) }, secret);
    setBusy(false);
    setRes(r.error ? r : null);
  };
  return (
    <div className="tform">
      <div className="fields">
        {fields.map((f) => {
          const label = <>{f.label}{f.secret ? <span className="pillb dm">DM only</span> : null}</>;
          const v = val(f);
          if (f.kind === 'long') return <label key={f.key} className="f wide">{label}<textarea rows={3} value={v} onChange={(e) => put(f, e.target.value)} />{f.help ? <small className="muted">{f.help}</small> : null}</label>;
          if (f.kind === 'select') return <label key={f.key} className="f">{label}<select value={v} onChange={(e) => put(f, e.target.value)}>{(f.options ?? []).map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o || 'None'}</option>))}</select></label>;
          if (f.kind === 'check') return <label key={f.key} className="ck"><input type="checkbox" checked={!!v} onChange={(e) => put(f, e.target.checked)} /> {label}</label>;
          if (f.kind === 'number') return <label key={f.key} className="f">{label}<input type="number" value={v} onChange={(e) => put(f, e.target.value === '' ? '' : Number(e.target.value))} /></label>;
          return <label key={f.key} className="f">{label}<input value={v} maxLength={f.title ? 200 : 500} onChange={(e) => put(f, e.target.value)} />{f.help ? <small className="muted">{f.help}</small> : null}</label>;
        })}
      </div>
      {children}
      {allowVis === null ? null : <p style={{ marginTop: 10 }}><VisPicker value={vis} onChange={setVis} stages={stages} members={members} beats={beats} allow={allowVis ?? ['dm', 'all', 'stage', 'players']} canName={canName} /></p>}
      <p className="row" style={{ marginTop: 10 }}>
        <button type="button" className="act" disabled={busy || !title.trim()} onClick={submit}>{busy ? 'Saving' : saveLabel}</button>
        {onCancel ? <button type="button" className="act sm" onClick={onCancel}>Cancel</button> : null}
        {onDelete ? <button type="button" className="act sm danger" onClick={() => { if (confirm('Delete this for good?')) onDelete(); }}>Delete</button> : null}
      </p>
      <Problem r={res} />
    </div>
  );
}

// ---------------------------------------------------------------- pictures

// Shrinks a picture in the browser and uploads it to the campaign's private files.
// Returns the stored path (the DM's own login is allowed to write only in campaigns they run).
export async function uploadPicture(campaignId: string, folder: string, file: File, maxPx: number): Promise<{ path?: string; w?: number; h?: number; error?: string }> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    let blob: Blob | null = null;
    for (const q of [0.86, 0.75, 0.6]) { blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', q)); if (blob && blob.size < 7_500_000) break; }
    if (!blob) return { error: 'That picture could not be read.' };
    if (blob.type !== 'image/webp') blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
    if (!blob) return { error: 'That picture could not be read.' };
    const path = `${campaignId}/${folder}/${crypto.randomUUID()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
    const { error } = await supabaseBrowser().storage.from('campaign-files').upload(path, blob, { contentType: blob.type, upsert: false });
    return error ? { error: 'The picture could not be uploaded.' } : { path, w, h };
  } catch { return { error: 'That file is not a picture this browser can read. Use a JPG, PNG or WebP.' }; }
}
