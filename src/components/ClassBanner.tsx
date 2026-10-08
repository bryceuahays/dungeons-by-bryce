'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

// A class's banner picture (data.banner: { path, pos }). It lives in the DM's own folder of the
// private "backgrounds" bucket (user/<account id>/banners/<random>), which that account may
// already write to, so it works before the class is first saved. Shown here with a short-lived
// signed address; anyone else will get it through the server once players can see classes.

const MAX_UPLOAD = 3 * 1024 * 1024;
const POSITIONS: [string, string][] = [['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']];
// Each SRD class's own default banner, shown until the DM adds one. focus is the crop's centre
// (the figure's face and weapon), so it stays in frame on wide screens and on phones alike.
// Pictures go in public/class-banners/, e.g. Paladin: { src: '/class-banners/paladin.webp', focus: '30% 20%' }.
const DEFAULT_BANNERS: Record<string, { src: string; focus: string }> = {};
// the class a homebrew class started from (set by the class picker), else its own name
const defaultFor = (data: any, name: string) => DEFAULT_BANNERS[data.baseClass] ?? Object.entries(DEFAULT_BANNERS).find(([k]) => k.toLowerCase() === (name ?? '').trim().toLowerCase())?.[1];

// Shrink and compress in the browser, so a phone photo or large art works without fuss.
async function prepare(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use a JPG, PNG, or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('That file is over 20 MB. Choose a smaller one.');
  const bmp = await createImageBitmap(file);
  if (bmp.width < bmp.height) throw new Error('A banner needs a wide picture (wider than it is tall).');
  const scale = Math.min(1, 2400 / bmp.width, 1200 / bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const encode = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  for (const [type, q] of [['image/webp', 0.84], ['image/webp', 0.7], ['image/jpeg', 0.8], ['image/jpeg', 0.6]] as [string, number][]) {
    const blob = await encode(type, q);
    if (blob && blob.type === type && blob.size <= MAX_UPLOAD) return blob;
  }
  throw new Error('That image could not be made small enough. Try a smaller one.');
}

export function ClassBanner({ data, name, onChange, noun = 'class' }: { data: any; name: string; onChange: (d: any) => void; noun?: string }) {
  const banner: { path: string; pos?: string } | undefined = data.banner?.path ? data.banner : undefined;
  const fallback = defaultFor(data, name);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    if (!banner?.path) { setUrl(''); return; }
    supabaseBrowser().storage.from('backgrounds').createSignedUrl(banner.path, 3600).then(({ data: d }: { data: { signedUrl: string } | null }) => { if (live) setUrl(d?.signedUrl ?? ''); });
    return () => { live = false; };
  }, [banner?.path]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const supabase = supabaseBrowser();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sign in again, then try once more.');
      const blob = await prepare(file);
      const path = `user/${auth.user.id}/banners/${crypto.randomUUID()}`;
      const { error: up } = await supabase.storage.from('backgrounds').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (up) throw new Error('The upload did not go through. Try again in a moment.');
      if (banner?.path) await supabase.storage.from('backgrounds').remove([banner.path]);
      onChange({ ...data, banner: { path, pos: banner?.pos ?? 'center' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async () => {
    if (!banner) return;
    setBusy(true);
    await supabaseBrowser().storage.from('backgrounds').remove([banner.path]);
    const { banner: _gone, ...rest } = data;
    onChange(rest);
    setBusy(false);
  };

  return (
    <div className={'cls-banner' + (!banner && !fallback ? ' empty' : '')}>
      {banner && url ? <img src={url} alt="" style={{ objectPosition: 'center ' + (banner.pos ?? 'center') }} /> : null}
      {!banner && fallback ? <img src={fallback.src} alt="" style={{ objectPosition: fallback.focus }} /> : null}
      {!banner && fallback ? <p className="cls-banner-note">Default banner. Add your own and players will see it at the top of this {noun}.</p> : null}
      {!banner && !fallback ? <p className="cls-banner-hint">Add a banner picture for this {noun}. Players will see it at the top of the {noun}.</p> : null}
      <div className="cls-banner-tools">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => choose(e.target.files?.[0])} />
        <button type="button" className="small-btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Working…' : banner ? 'Change image' : fallback ? 'Add your own image' : 'Add a banner image'}</button>
        {banner ? (
          <>
            <label className="ckrow">Focus<select value={banner.pos ?? 'center'} onChange={(e) => onChange({ ...data, banner: { ...banner, pos: e.target.value } })}>{POSITIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <button type="button" className="quiet small-btn danger" disabled={busy} onClick={remove}>Remove</button>
          </>
        ) : null}
      </div>
      {error ? <p className="bad cls-banner-error" role="alert">{error}</p> : null}
    </div>
  );
}
