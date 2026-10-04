// Makes a theme safe to store: only known colour tokens with hex values, only the font
// pairings the site offers, only the listed layout values. Pure, so the server, the
// editor and the tests share it.
import { FONT_CHOICES, LAYOUT, THEMES, TOKEN_LABELS, type ThemeTokens } from '../config/themes.ts';

const HEX = /^#[0-9a-fA-F]{6}$/;

export function cleanTheme(input: unknown): ThemeTokens {
  const t = (input && typeof input === 'object' ? input : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const base = THEMES.find((x) => x.id === t.preset)?.theme ?? THEMES.find((x) => x.id === 'slate')!.theme;
  const colors: Record<string, string> = {};
  for (const [k] of TOKEN_LABELS) colors[k] = HEX.test(String(t.colors?.[k] ?? '')) ? String(t.colors[k]).toLowerCase() : base.colors[k];
  const fonts = Object.values(FONT_CHOICES).find((f) => f.href === t.fonts?.href && f.display === t.fonts?.display) ?? base.fonts;
  const out: ThemeTokens = { ...(typeof t.preset === 'string' && THEMES.some((x) => x.id === t.preset) ? { preset: t.preset } : {}), fonts: { ...fonts }, colors, starfield: !!t.starfield };
  if (HEX.test(String(t.goldHi ?? ''))) out.goldHi = String(t.goldHi).toLowerCase();
  if (HEX.test(String(t.goldLo ?? ''))) out.goldLo = String(t.goldLo).toLowerCase();
  const radius = LAYOUT.radius.find(([v]) => v === t.layout?.radius)?.[0], wrap = LAYOUT.wrap.find(([v]) => v === t.layout?.wrap)?.[0];
  if (radius || wrap) out.layout = { ...(radius ? { radius } : {}), ...(wrap ? { wrap } : {}) };
  if (Number(t.hero) > 0) out.hero = Number(t.hero);
  return out;
}

// A preset exactly as it is stored (what a free campaign must use).
export const presetTheme = (id: string): ThemeTokens | null => THEMES.find((x) => x.id === id)?.theme ?? null;

// Is this theme one of the presets, untouched? (Key order does not matter.)
const canon = (v: unknown): string => (v && typeof v === 'object' && !Array.isArray(v) ? '{' + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ':' + canon((v as Record<string, unknown>)[k])).join(',') + '}' : JSON.stringify(v));
export const presetOf = (theme: unknown) => THEMES.find((x) => canon(x.theme) === canon(theme)) ?? null;
