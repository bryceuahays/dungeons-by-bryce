import { safeCssValue } from './sanitize';
import type { Campaign } from './types';
import { secretOf } from '@/config/themes';

// A campaign's theme as CSS variables. Every value is checked first, because it ends up in a style attribute.
export function themeStyle(theme: Campaign['theme']): Record<string, string> {
  const s: Record<string, string> = {};
  const put = (name: string, v: unknown) => { const ok = safeCssValue(v); if (ok) s[name] = ok; };
  Object.entries(theme?.colors ?? {}).forEach(([k, v]) => { if (/^[a-z0-9-]+$/.test(k)) put('--' + k, v); });
  put('--secret', secretOf(theme));   // the theme's "hidden from players" colour (src/config/themes.ts)
  put('--display', theme?.fonts?.display);
  put('--body', theme?.fonts?.body);
  put('--gold-hi', theme?.goldHi);
  put('--gold-lo', theme?.goldLo);
  put('--radius', theme?.layout?.radius);
  put('--wrap', theme?.layout?.wrap);
  return s;
}
