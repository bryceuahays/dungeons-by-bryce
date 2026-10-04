// Campaign themes: colours, fonts and layout tokens, applied as CSS variables on a
// campaign's pages. `premium: false` themes are the defaults every plan can use. The
// premium ones, and the theme editor (your own colours, fonts, layout, hero image),
// are part of Pro.
//
// The first theme is the look of the first campaign on the site, token for token. That
// campaign keeps its own stored copy; this preset lets other campaigns wear it. It is
// named for how it looks, not for the campaign: this file is sent to every browser, and
// that campaign's real title is a secret from its own players until its reveal.
//
// No imports here: scripts and tests load this file directly.

export type ThemeTokens = {
  preset?: string;
  colors: Record<string, string>;
  fonts: { display: string; body: string; href: string };
  goldHi?: string; goldLo?: string; starfield?: boolean;
  layout?: { radius?: string; wrap?: string };
  hero?: number;
};

const FONTS = {
  fell: { display: '"IM Fell English","Iowan Old Style","Palatino Linotype",Georgia,serif', body: '"Spectral",Georgia,"Times New Roman",serif', href: 'https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap' },
  cinzel: { display: '"Cinzel",Georgia,serif', body: '"Crimson Pro",Georgia,serif', href: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap' },
  grenze: { display: '"Grenze Gotisch",Georgia,serif', body: '"Lora",Georgia,serif', href: 'https://fonts.googleapis.com/css2?family=Grenze+Gotisch:wght@400;600&family=Lora:ital,wght@0,400;0,600;1,400&display=swap' },
  space: { display: '"Space Grotesk",system-ui,sans-serif', body: '"Inter",system-ui,sans-serif', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Space+Grotesk:wght@400;600&display=swap' },
};

export const THEMES: { id: string; name: string; blurb: string; premium: boolean; theme: ThemeTokens }[] = [
  {
    id: 'midnight', name: 'Midnight and gold', blurb: 'Midnight blue, old gold and a field of stars.', premium: true,
    theme: { preset: 'midnight', fonts: FONTS.fell, colors: { dim: '#a8a4b4', deep: '#0c1020', gold: '#c8a45a', line: '#2a3152', star: '#8fa7d6', verd: '#6fb3a0', void: '#070914', ember: '#e0672f', field: '#0a0d1c', plate: '#10152a', plate2: '#141a33', vellum: '#e9e2d0', 'on-gold': '#1a1405' }, goldHi: '#e3c47f', goldLo: '#b58f45', starfield: true },
  },
  {
    id: 'slate', name: 'Slate and sea-glass', blurb: 'Cool grey stone with a green-glass accent.', premium: false,
    theme: { preset: 'slate', fonts: FONTS.cinzel, colors: { void: '#101014', deep: '#16161c', plate: '#1c1c24', plate2: '#22222c', line: '#34343f', field: '#0d0d11', vellum: '#e8e6e1', dim: '#a3a1a8', gold: '#7fb8a4', ember: '#c97a8f', star: '#8fa7d6', verd: '#9bc47a', 'on-gold': '#0f1513' }, starfield: false },
  },
  {
    id: 'ember', name: 'Ember and ash', blurb: 'Firelight on dark wood.', premium: false,
    theme: { preset: 'ember', fonts: FONTS.grenze, colors: { void: '#140d0a', deep: '#1c120d', plate: '#241812', plate2: '#2c1e16', line: '#4a3023', field: '#100a07', vellum: '#f0e4d6', dim: '#b9a391', gold: '#e0963f', ember: '#d9573b', star: '#e3b27a', verd: '#c2a05a', 'on-gold': '#1c1005' }, starfield: false },
  },
  {
    id: 'grove', name: 'Deep grove', blurb: 'Moss, bark and lantern light.', premium: false,
    theme: { preset: 'grove', fonts: FONTS.fell, colors: { void: '#0a120e', deep: '#0f1a14', plate: '#14221a', plate2: '#192a20', line: '#2c4636', field: '#08100c', vellum: '#e4eadd', dim: '#9db0a2', gold: '#9fca6b', ember: '#d9a441', star: '#7fc4b5', verd: '#7fd08c', 'on-gold': '#0d1707' }, starfield: false },
  },
  {
    id: 'vellum', name: 'Vellum', blurb: 'A light page, like a well-kept journal.', premium: false,
    theme: { preset: 'vellum', fonts: FONTS.fell, colors: { void: '#f3ecdc', deep: '#ebe2ce', plate: '#fbf6ea', plate2: '#f5eedd', line: '#cdbf9f', field: '#ffffff', vellum: '#2b2418', dim: '#6b5f4a', gold: '#8a5a1c', ember: '#a33a22', star: '#2f5d8a', verd: '#3f7a4f', 'on-gold': '#fff8e8' }, starfield: false },
  },
  {
    id: 'abyss', name: 'Abyssal', blurb: 'Violet depths and cold starlight.', premium: true,
    theme: { preset: 'abyss', fonts: FONTS.space, colors: { void: '#0b0714', deep: '#120b20', plate: '#190f2c', plate2: '#201438', line: '#3a2760', field: '#090511', vellum: '#ece6f7', dim: '#aaa0c2', gold: '#b693f5', ember: '#f06aa8', star: '#7fb6f0', verd: '#72d3c0', 'on-gold': '#12081f' }, goldHi: '#d2bbff', goldLo: '#9a78dd', starfield: true },
  },
  {
    id: 'frost', name: 'Frostbound', blurb: 'Pale ice over deep water.', premium: true,
    theme: { preset: 'frost', fonts: FONTS.cinzel, colors: { void: '#07121a', deep: '#0b1a25', plate: '#102330', plate2: '#152c3c', line: '#2a4a5f', field: '#050e14', vellum: '#e6f2f7', dim: '#9fb8c5', gold: '#8fd6ee', ember: '#f2a65a', star: '#b9c8f5', verd: '#8ee0c4', 'on-gold': '#04141c' }, goldHi: '#c5ecf8', goldLo: '#6fb8d2', starfield: false },
  },
];

export const TOKEN_LABELS: [string, string][] = [
  ['void', 'Page background'], ['deep', 'Deep panels'], ['plate', 'Cards'], ['plate2', 'Card highlight'], ['line', 'Borders'], ['field', 'Form fields'], ['vellum', 'Text'], ['dim', 'Quiet text'],
  ['gold', 'Main accent'], ['ember', 'Second accent'], ['star', 'Links'], ['verd', 'Notes'], ['on-gold', 'Text on the accent'],
];
export const LAYOUT = { radius: [['2px', 'Square'], ['8px', 'Soft'], ['16px', 'Round']], wrap: [['960px', 'Narrow'], ['1120px', 'Standard'], ['1320px', 'Wide']] } as const;
export const FONT_CHOICES = FONTS;
export const freeThemes = () => Object.fromEntries(THEMES.filter((t) => !t.premium).map((t) => [t.id, t.theme]));
