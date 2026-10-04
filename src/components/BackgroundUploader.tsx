'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type Result = { error?: string; note?: string } | null;
type Shape = 'wide' | 'tall';

const LIMITS: Record<Shape, [number, number]> = { wide: [2560, 1600], tall: [1440, 2560] };
const MAX_UPLOAD = 3 * 1024 * 1024;

// Shrinks and compresses the chosen picture in the browser, so people can pick a photo
// straight off their phone or a large piece of art without worrying about file size.
async function prepare(file: File, shape: Shape): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use a JPG, PNG, or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('That file is over 20 MB. Choose a smaller one.');
  const bmp = await createImageBitmap(file);
  if (shape === 'wide' && bmp.width < bmp.height) throw new Error('The desktop image needs to be wider than it is tall (landscape).');
  if (shape === 'tall' && bmp.width > bmp.height) throw new Error('The phone image needs to be taller than it is wide (portrait).');
  const [mw, mh] = LIMITS[shape];
  const scale = Math.min(1, mw / bmp.width, mh / bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const encode = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  for (const [type, q] of [['image/webp', 0.84], ['image/webp', 0.7], ['image/jpeg', 0.8], ['image/jpeg', 0.6]] as [string, number][]) {
    const blob = await encode(type, q);
    if (blob && blob.type === type && blob.size <= MAX_UPLOAD) return blob;
  }
  throw new Error('That image could not be made small enough. Try a simpler or smaller one.');
}

// Two pictures are needed: one for wide screens and one for phones. `folder` is the
// private storage folder this person is allowed to write to (their own, or a campaign they run).
export function BackgroundUploader({ folder, has, save }: { folder: string; has: boolean; save: (on: boolean) => Promise<Result> }) {
  const router = useRouter();
  const [files, setFiles] = useState<Partial<Record<Shape, File>>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Result>(null);

  const ready = has ? !!(files.wide || files.tall) : !!(files.wide && files.tall);

  async function upload() {
    setBusy(true); setMsg(null);
    try {
      const supabase = supabaseBrowser();
      for (const shape of ['wide', 'tall'] as Shape[]) {
        const f = files[shape];
        if (!f) continue;
        const blob = await prepare(f, shape);
        const { error } = await supabase.storage.from('backgrounds').upload(`${folder}/${shape}`, blob, { upsert: true, contentType: blob.type, cacheControl: '31536000' });
        if (error) throw new Error('The upload did not go through. Try again in a moment.');
      }
      const r = await save(true);
      setMsg(r);
      if (!r?.error) { setFiles({}); router.refresh(); }
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : 'Something went wrong.' });
    }
    setBusy(false);
  }

  async function remove() {
    if (!confirm('Remove your background and go back to the standard one?')) return;
    setBusy(true); setMsg(null);
    const r = await save(false);
    setMsg(r); setBusy(false);
    if (!r?.error) router.refresh();
  }

  const pick = (shape: Shape) => (e: React.ChangeEvent<HTMLInputElement>) => { setFiles((p) => ({ ...p, [shape]: e.target.files?.[0] })); setMsg(null); };

  return (
    <div className="bgup">
      <div className="bgup-note">
        <b>You need two versions of your picture:</b>
        <ul>
          <li><b>Desktop:</b> wider than tall (landscape). 1920 × 1080 pixels or larger works best.</li>
          <li><b>Phone:</b> taller than wide (portrait). 1080 × 1920 pixels or larger works best.</li>
        </ul>
        JPG, PNG, or WebP, up to 20 MB each. The site shrinks and compresses them for you. Darker pictures work best, because text sits on top. Only use pictures you have the right to use.
      </div>
      <div className="bgup-row">
        <label className="f">Desktop picture (landscape)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick('wide')} disabled={busy} /></label>
        <label className="f">Phone picture (portrait)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick('tall')} disabled={busy} /></label>
      </div>
      <p className="bgup-actions">
        <button type="button" className="act" onClick={upload} disabled={busy || !ready}>{busy ? 'Working…' : has ? 'Replace background' : 'Use these pictures'}</button>
        {has ? <button type="button" className="act quiet" onClick={remove} disabled={busy}>Remove my background</button> : null}
        {!has && !ready ? <span className="bgup-hint">Choose both pictures to continue.</span> : null}
        {msg?.error ? <span className="bad err" role="alert">{msg.error}</span> : null}
        {msg?.note ? <span className="good okmsg" role="status">{msg.note}</span> : null}
      </p>
    </div>
  );
}
