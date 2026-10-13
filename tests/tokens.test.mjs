// Hub version 2 design tokens (issue 83): the new colours every theme gets, the "hidden from
// players" colour, and that both are readable in all seven themes, the light one included.
// The colours are worked out here from the real stylesheet, so a change there is tested.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { THEMES, TOKEN_LABELS, secretOf } from '../src/config/themes.ts';
import { cleanTheme, presetOf } from '../src/lib/theme.ts';
import { ROOT, SITE, cleanup, makeUser, page } from './helpers.mjs';

// ---- the stylesheet's own sums: --name: value pairs from the .campaign block
const css = fs.readFileSync(path.join(ROOT, 'src/styles/campaign.css'), 'utf8');
const start = css.indexOf('.campaign{');
const sheet = Object.fromEntries([...css.slice(start, css.indexOf('}', start)).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const NEW = ['--line-strong', '--vellum-soft', '--gold-tint', '--ember-tint', '--ember-text', '--secret', '--secret-bg', '--secret-line', '--secret-text'];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const parts = (s) => { const out = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
// what a browser makes of a value, given the theme's variables (color-mix in srgb is a straight blend)
function colour(value, vars) {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return hex(v);
  if (v === 'white') return [255, 255, 255];
  if (v === 'black') return [0, 0, 0];
  let m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  if (m) { assert.ok(vars[m[1]] ?? sheet[m[1]], 'no value for ' + m[1]); return colour(vars[m[1]] ?? sheet[m[1]], vars); }
  m = /^color-mix\(in srgb,(.*)\)$/s.exec(v);
  assert.ok(m, 'a value this test cannot read: ' + v);
  const [a, b] = parts(m[1]);
  const pm = /^(.*)\s(\d+(?:\.\d+)?)%$/.exec(a);
  assert.ok(pm, 'a mix this test cannot read: ' + v);
  const p = Number(pm[2]) / 100, ca = colour(pm[1], vars), cb = colour(b, vars);
  return ca.map((x, i) => x * p + cb[i] * (1 - p));
}
const lum = (c) => { const [r, g, b] = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const far = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

// A theme's variables as the page gets them: its stored colours, plus --secret for a preset.
const varsOf = (t, asCustom = false) => ({ ...Object.fromEntries(Object.entries(t.theme.colors).map(([k, v]) => ['--' + k, v])), ...(asCustom ? {} : { '--secret': t.secret }) });

test('the stylesheet gives every theme the nine new tokens, each worked out from the theme', () => {
  for (const name of NEW) assert.ok(sheet[name], name + ' is set on .campaign');
  for (const name of NEW.filter((n) => n !== '--secret')) assert.match(sheet[name], /^color-mix\(in srgb, var\(--/, name + ' comes from the theme, not a fixed colour');
  // and the older tokens are exactly as they were
  assert.equal(sheet['--gold-hi'], 'color-mix(in srgb, var(--gold) 80%, white)');
  assert.equal(sheet['--void'], '#101014');
});

test('every theme has a "hidden from players" colour, kept beside the theme and not inside it', () => {
  assert.equal(THEMES.length, 7);
  for (const t of THEMES) {
    assert.match(t.secret, /^#[0-9a-f]{6}$/, t.id);
    assert.equal(secretOf(t.theme), t.secret);
    // a campaign stores its own copy of the theme and the database compares it to the default
    // themes exactly, so the stored shape must not change
    assert.deepEqual(Object.keys(t.theme.colors).sort(), TOKEN_LABELS.map(([k]) => k).sort(), t.id + ' stores the same thirteen colours as before');
    assert.equal(presetOf(JSON.parse(JSON.stringify(t.theme)))?.id, t.id, 'a stored copy still matches its theme');
    assert.ok(!('secret' in cleanTheme(t.theme).colors));
  }
  assert.equal(secretOf({ ...THEMES[1].theme, preset: undefined }), null, 'a custom theme has none of its own');
  assert.equal(secretOf(null), null);
  assert.equal(secretOf({}), null);
  const vellum = THEMES.find((t) => t.id === 'vellum');
  assert.ok(lum(hex(vellum.secret)) < lum(hex(THEMES.find((t) => t.id === 'slate').secret)), 'darker on the light theme');
});

test('the hidden look and the new tints are readable in every theme, and for a custom theme too', () => {
  for (const t of THEMES) for (const asCustom of [false, true]) {
    const vars = varsOf(t, asCustom), c = (name) => colour('var(' + name + ')', vars), who = t.id + (asCustom ? ' (as a custom theme)' : '');
    const read = (text, back, least = 4.5) => assert.ok(contrast(c(text), c(back)) >= least, `${who}: ${text} on ${back} is ${contrast(c(text), c(back)).toFixed(2)} to 1, needs ${least}`);
    read('--secret-text', '--secret-bg');     // the label
    read('--vellum', '--secret-bg');          // ordinary text inside a hidden box
    read('--secret', '--plate');              // the colour itself on a card
    read('--secret-line', '--plate', 2);      // the dashed border can be seen (the label carries the meaning)
    read('--vellum-soft', '--plate');
    read('--vellum-soft', '--plate2');
    read('--ember-text', '--ember-tint');
    read('--vellum', '--gold-tint');
    read('--line-strong', '--plate', 1.5);
    assert.ok(contrast(c('--line-strong'), c('--plate')) > contrast(c('--line'), c('--plate')), who + ': the control border is stronger than the ordinary one');
    // Hidden must not be mistaken for the theme's accent, its danger colour or its "good" colour.
    // (Only the seven themes can promise that. A custom theme with a purple accent gets a purple
    // hidden colour too, which is why the look always has its dashes and its words.)
    if (!asCustom) for (const other of ['--gold', '--ember', '--verd']) assert.ok(far(c('--secret'), c(other)) > 60, `${who}: --secret is too close to ${other}`);
  }
});

let boss, plain, pro;
before(async () => {
  await cleanup();
  [boss, plain, pro] = await Promise.all([makeUser('tokhead', { head: true }), makeUser('tokplain', { unblocked: true }), makeUser('tokpro')]);
});
after(cleanup);

test('a campaign page carries its theme\'s hidden colour, and a custom theme leaves it to the stylesheet', async () => {
  const theme = (id) => THEMES.find((t) => t.id === id).theme;
  const make = async (look) => {
    const slug = 'tok-' + Math.random().toString(36).slice(2, 8);
    const made = await pro.client.from('campaigns').insert({ slug, title: 'Token Realm', theme: look }).select('id, slug, theme').single();
    assert.equal(made.error, null, made.error?.message);
    const s = await pro.client.from('sections').insert({ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' });
    assert.equal(s.error, null, s.error?.message);
    return made.data;
  };
  const light = await make(theme('vellum'));
  assert.deepEqual(light.theme, theme('vellum'), 'the stored theme is the preset, unchanged');
  const lightPage = await page(`/c/${light.slug}/overview`, pro.session);
  assert.equal(lightPage.status, 200);
  assert.ok(lightPage.text.includes('--secret:#6b4fa0'), 'Vellum gets its darker colour');
  assert.ok(lightPage.text.includes('--gold:#8a5a1c'), 'next to the colours it already had');

  const own = await make(cleanTheme({ ...theme('vellum'), preset: undefined, colors: { ...theme('vellum').colors, gold: '#225588' } }));
  const ownPage = await page(`/c/${own.slug}/overview`, pro.session);
  assert.equal(ownPage.status, 200);
  assert.ok(ownPage.text.includes('--gold:#225588') && !/--secret:/.test(ownPage.text.match(/class="campaign[^>]*>/)?.[0] ?? ''), 'a custom theme sets no --secret of its own');
});

test('the design samples page is for the Head DM only and shows the hidden look in words, in every theme', async () => {
  const samples = await page('/admin/design', boss.session);
  assert.equal(samples.status, 200);
  for (const t of THEMES) {
    assert.ok(samples.text.includes(t.name), t.name);
    assert.ok(samples.text.includes('--secret:' + t.secret), t.id + ' is drawn in its own hidden colour');
  }
  assert.equal(samples.text.split('class="hid-box"').length - 1, 7, 'one hidden box per theme');
  assert.ok(samples.text.split('class="hid-tag">Hidden from players<').length - 1 >= 14, 'and every one says so in words');
  assert.ok((await page('/admin', boss.session)).text.includes('href="/admin/design"'));
  for (const session of [plain.session, null]) {
    const r = await page('/admin/design', session);
    assert.ok(r.status >= 300 && r.status < 400);
    assert.equal(new URL(r.location ?? '', SITE).pathname, session ? '/campaigns' : '/sign-in');
    assert.equal(r.text, '');
  }
});
