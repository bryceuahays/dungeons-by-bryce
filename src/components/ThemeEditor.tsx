'use client';
import { useState, useTransition } from 'react';
import { FONT_CHOICES, LAYOUT, THEMES, TOKEN_LABELS, type ThemeTokens } from '@/config/themes';
import { presetOf } from '@/lib/theme';
import { saveTheme, type ActionState } from '@/app/c/[slug]/actions';
import { supabaseBrowser } from '@/lib/supabase/client';
import { UpgradeHint } from './UpgradeHint';

// Pick a theme. Every plan: the default themes. Pro: the premium themes and the editor
// (your own colours, fonts, corners, page width, starfield, and a hero image).
// With `slug` it saves to that campaign; without, it writes the choice into a hidden
// field called "theme" for the form around it (the New campaign page).
export function ThemeEditor({ initial, pro, slug, campaignId }: { initial: ThemeTokens | null; pro: boolean; slug?: string; campaignId?: string }) {
  const [theme, setTheme] = useState<ThemeTokens>(initial && initial.colors ? initial : THEMES.find((t) => t.id === 'slate')!.theme);
  const [msg, setMsg] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const current = presetOf(theme);
  const fontId = Object.entries(FONT_CHOICES).find(([, f]) => f.href === theme.fonts?.href)?.[0] ?? 'fell';
  const custom = (patch: Partial<ThemeTokens>) => setTheme({ ...theme, ...patch, preset: undefined });
  const hero = async (file: File) => {
    if (!campaignId) return;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 2000 / bmp.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.82));
      if (!blob || blob.size > 3_000_000) return setMsg({ error: 'That picture is too large even after shrinking. Try a smaller one.' });
      const { error } = await supabaseBrowser().storage.from('backgrounds').upload(`campaign/${campaignId}/hero`, blob, { contentType: blob.type, upsert: true });
      if (error) return setMsg({ error: 'The picture could not be uploaded.' });
      custom({ hero: Date.now() });
      setMsg({ note: 'Hero image uploaded. Save the theme to use it.' });
    } catch { setMsg({ error: 'That file is not a picture this browser can read.' }); }
  };
  return (
    <div className="themer">
      {slug ? null : <input type="hidden" name="theme" value={JSON.stringify(theme)} />}
      <div className="swatches" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => {
          const locked = t.premium && !pro;
          return (
            <button key={t.id} type="button" role="radio" aria-checked={current?.id === t.id} disabled={locked} className="swatch" onClick={() => setTheme(t.theme)}
              style={{ background: t.theme.colors.void, color: t.theme.colors.vellum, borderColor: t.theme.colors.line }}>
              <span className="dots">{['gold', 'ember', 'star', 'plate2'].map((k) => <i key={k} style={{ background: t.theme.colors[k] }} />)}</span>
              <b style={{ color: t.theme.colors.gold }}>{t.name}</b>
              <small>{t.blurb}{t.premium ? (locked ? ' Pro.' : ' Premium.') : ''}</small>
            </button>
          );
        })}
      </div>
      {pro ? (
        <details className="theme-custom">
          <summary>Make it your own{current ? '' : ' (customised)'}</summary>
          <div className="tokens">
            {TOKEN_LABELS.map(([k, label]) => <label key={k}>{label}<input type="color" value={theme.colors[k] ?? '#000000'} onChange={(e) => custom({ colors: { ...theme.colors, [k]: e.target.value } })} /></label>)}
          </div>
          <div className="tokens wide">
            <label>Fonts<select value={fontId} onChange={(e) => custom({ fonts: FONT_CHOICES[e.target.value as keyof typeof FONT_CHOICES] })}>
              <option value="fell">IM Fell English and Spectral (old print)</option><option value="cinzel">Cinzel and Crimson Pro (carved stone)</option><option value="grenze">Grenze Gotisch and Lora (gothic)</option><option value="space">Space Grotesk and Inter (clean, modern)</option>
            </select></label>
            <label>Corners<select value={theme.layout?.radius ?? ''} onChange={(e) => custom({ layout: { ...theme.layout, radius: e.target.value || undefined } })}><option value="">As the theme has them</option>{LAYOUT.radius.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>Page width<select value={theme.layout?.wrap ?? ''} onChange={(e) => custom({ layout: { ...theme.layout, wrap: e.target.value || undefined } })}><option value="">As the theme has it</option>{LAYOUT.wrap.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="row-ck"><input type="checkbox" checked={!!theme.starfield} onChange={(e) => custom({ starfield: e.target.checked })} /> Starfield behind the pages</label>
          </div>
          {campaignId ? (
            <div className="tokens wide">
              <label>Hero image, shown across the top of your first tab (a wide picture, about 2000 by 700 pixels)<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void hero(f); e.target.value = ''; }} /></label>
              {theme.hero ? <button type="button" className="act sm quiet small-btn" onClick={() => custom({ hero: undefined })}>Remove the hero image</button> : null}
            </div>
          ) : null}
        </details>
      ) : <UpgradeHint feature="themes" />}
      {slug ? (
        <p className="row" style={{ marginTop: 10 }}>
          <button type="button" className="act" disabled={pending} onClick={() => start(async () => setMsg(await saveTheme(slug, theme)))}>{pending ? 'Saving' : 'Save theme'}</button>
          {msg?.error ? <span className="err bad" role="alert">{msg.error}</span> : null}{msg?.note ? <span className="okmsg good" role="status">{msg.note}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
