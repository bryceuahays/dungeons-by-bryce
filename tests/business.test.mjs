// Phases 11 to 13: themes, custom-site requests, handing a campaign over, the store,
// the public demo, and the public pages.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { admin, anonClient, campaign, cleanup, cookieFor, makeUser, page, SITE } from './helpers.mjs';
import { THEMES } from '../src/config/themes.ts';
import { cleanTheme, presetOf } from '../src/lib/theme.ts';
import { COMMISSION_TIERS } from '../src/config/commissions.ts';
import { PRICES } from '../src/config/plans.ts';

const rnd = () => Math.random().toString(36).slice(2, 8);
const theme = (id) => THEMES.find((t) => t.id === id).theme;
let head, pro, free, buyer;

const post = (path, session, fields) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) (Array.isArray(v) ? v : [v]).forEach((x) => body.append(k, String(x)));
  return fetch(SITE + path, { method: 'POST', redirect: 'manual', headers: { cookie: session ? cookieFor(session) : '', 'content-type': 'application/x-www-form-urlencoded' }, body });
};
async function makeCampaign(owner, title, extra = {}) {
  const slug = 'biz-' + rnd();
  const made = await owner.client.from('campaigns').insert({ slug, title, ...extra }).select('id, slug, theme').single();
  assert.equal(made.error, null, made.error?.message);
  await owner.client.from('sections').insert([{ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' }, { campaign_id: made.data.id, slug: 'secrets', title: 'Secrets', sort: 20, audience: 'dm', kind: 'content' }]);
  return made.data;
}

before(async () => {
  await cleanup();
  [head, pro, free, buyer] = await Promise.all([makeUser('bhead', { head: true }), makeUser('bpro'), makeUser('bfree', { free: true }), makeUser('bbuyer', { free: true })]);
});
after(cleanup);

// ------------------------------------------------------------------ Phase 11: themes

test('themes: default themes on every plan; premium themes and the editor on Pro', async () => {
  // "To be a god" is the first theme, and the preset is exactly what that campaign wears
  const tbg = await campaign();
  const { preset: _p, ...god } = theme('midnight');
  assert.deepEqual(tbg.theme, god, 'the preset matches the campaign token for token, so it looks identical');
  assert.equal(THEMES[0].id, 'midnight');
  assert.ok(THEMES.filter((t) => !t.premium).length >= 3, 'three or four default themes');

  const mine = await makeCampaign(free, 'Plain Realm', { theme: { colors: { gold: '#ff00ff' }, fonts: {} } });
  assert.deepEqual(mine.theme, theme('slate'), 'a free campaign created with a custom look gets the default theme instead of failing');
  assert.equal((await free.client.from('campaigns').update({ theme: theme('ember') }).eq('id', mine.id)).error, null, 'default themes are free');
  for (const t of [theme('abyss'), { ...theme('ember'), colors: { ...theme('ember').colors, gold: '#123456' } }, { ...theme('grove'), hero: 5 }]) {
    assert.ok(/upgrade:themes/.test((await free.client.from('campaigns').update({ theme: t }).eq('id', mine.id).select()).error?.message ?? ''), 'premium or custom is refused on the free plan');
  }
  assert.deepEqual((await admin.from('campaigns').select('theme').eq('id', mine.id).single()).data.theme, theme('ember'), 'and the theme it had is untouched');
  const proC = await makeCampaign(pro, 'Fancy Realm');
  const custom = cleanTheme({ ...theme('abyss'), preset: undefined, colors: { ...theme('abyss').colors, gold: '#ABCDEF' }, layout: { radius: '16px', wrap: '1320px' }, hero: 123 });
  assert.equal((await pro.client.from('campaigns').update({ theme: custom }).eq('id', proC.id)).error, null);
  const pg = await page(`/c/${proC.slug}/overview`, pro.session);
  assert.ok(pg.text.includes('--gold:#abcdef') && pg.text.includes('--wrap:1320px') && pg.text.includes('data-wrap') && pg.text.includes('/bg/hero?v=123'), 'colours, layout tokens and the hero image are applied');
  const manage = await page(`/c/${mine.slug}/manage`, free.session);
  assert.ok(manage.text.includes('Slate and sea-glass') && manage.text.includes('Abyssal') && manage.text.includes('part of Pro'));

  // the checker keeps only what is safe
  const dirty = cleanTheme({ colors: { gold: 'red; background:url(x)', void: '#000000', evil: '#ffffff' }, fonts: { display: 'x', href: 'https://evil.example/f.css' }, layout: { radius: '999px' }, starfield: 'yes' });
  assert.equal(dirty.colors.gold, theme('slate').colors.gold);
  assert.equal(dirty.colors.void, '#000000');
  assert.ok(!('evil' in dirty.colors) && dirty.fonts.href.startsWith('https://fonts.googleapis.com/') && !dirty.layout);
  assert.equal(presetOf({ ...theme('grove') })?.id, 'grove');
  assert.equal(presetOf(custom), null);
});

// ------------------------------------------------------------------ Phase 11: custom sites

test('custom campaign sites: a public page with the tiers; requests are for the admin only; a campaign can be handed to a client', async () => {
  const pg = await page('/custom', null);
  assert.ok(pg.status === 200 && pg.text.includes('$70') && COMMISSION_TIERS.every((t) => pg.text.includes(t.name)) && pg.text.includes('name="pitch"') && pg.text.includes('name="deadline"'));
  const made = await admin.from('commissions').insert({ name: 'Test Client', email: 'client-' + rnd() + '@test.dungeons.invalid', tier: 'starter', pitch: 'A haunted lighthouse campaign for four players.' }).select('id').single();
  assert.equal(made.error, null);
  assert.ok((await anonClient().from('commissions').insert({ name: 'x', email: 'x@test.dungeons.invalid', pitch: 'direct' }).select()).error, 'requests go in through the form only');
  assert.ok((await free.client.from('commissions').insert({ name: 'x', email: 'x@test.dungeons.invalid', pitch: 'direct' }).select()).error);
  assert.equal(((await free.client.from('commissions').select('id')).data ?? []).length, 0, 'nobody but the admin reads them');
  assert.ok(((await head.client.from('commissions').select('id, status')).data ?? []).some((r) => r.id === made.data.id));
  assert.equal((await head.client.from('commissions').update({ status: 'building' }).eq('id', made.data.id)).error, null);
  const biz = await page('/admin/business', head.session);
  assert.ok(biz.status === 200 && biz.text.includes('Test Client') && biz.text.includes('haunted lighthouse') && biz.text.includes('Hand a campaign to a client'));
  assert.ok((await page('/admin/business', free.session)).status >= 300);
  await admin.from('commissions').delete().eq('id', made.data.id);

  // hand-over: the client already has their one free campaign, and still gets an editable one
  const client = await makeUser('bclient', { free: true });
  const own = await makeCampaign(client, 'Client\'s own');
  const built = await makeCampaign(head, 'Built for a client', { theme: theme('abyss') });
  await head.client.from('content').insert({ campaign_id: built.id, section: 'overview', kind: 'html', key: 'a', title: 'a', visibility: 'player', body: { html: '<p>Welcome to your world</p>' } });
  assert.ok((await pro.client.rpc('transfer_campaign', { c: built.id, to_email: pro.email })).error, 'only the owner or the admin can hand a campaign over');
  assert.ok(/no account/.test((await head.client.rpc('transfer_campaign', { c: built.id, to_email: 'nobody@test.dungeons.invalid' })).error?.message ?? ''));
  assert.equal((await head.client.rpc('transfer_campaign', { c: built.id, to_email: client.email })).error, null);
  const now = await admin.from('campaigns').select('owner_id, purchased, theme').eq('id', built.id).single();
  assert.deepEqual([now.data.owner_id, now.data.purchased], [client.id, true]);
  assert.deepEqual(now.data.theme, theme('abyss'), 'the custom theme comes with it');
  assert.equal((await client.client.from('content').update({ title: 'mine now' }).eq('campaign_id', built.id).select('id')).data.length, 1, 'the client can edit it, on the free plan, alongside their own');
  assert.equal((await client.client.from('content').insert({ campaign_id: own.id, section: 'overview', kind: 'html', key: 'b', title: 'b', visibility: 'player', body: {} })).error, null, 'and their own campaign is still editable');
  assert.equal(((await head.client.from('content').select('id').eq('campaign_id', built.id)).data ?? []).length, 0, 'the admin no longer reads it');
  // nobody can mark their own campaign as bought, or as the demo
  assert.ok((await client.client.from('campaigns').update({ purchased: true }).eq('id', own.id).select()).error);
  assert.ok((await client.client.from('campaigns').update({ is_demo: true }).eq('id', own.id).select()).error);
});

// ------------------------------------------------------------------ Phase 12: the store

test('store: private content cannot be published; a product is a frozen copy; the buyer gets an editable campaign of their own', async () => {
  // only the admin publishes, and only campaigns they run
  const tbg = await campaign();
  assert.equal((await post('/admin/store/publish', free.session, { campaign: tbg.id, title: 'Stolen' })).status, 403);
  const notMine = await post('/admin/store/publish', head.session, { campaign: tbg.id, title: 'Not mine', slug: 'not-mine-' + rnd() });
  assert.ok(decodeURIComponent(notMine.headers.get('location')).includes('campaigns you run'));
  // a campaign holding private rules, or private homebrew, is refused
  const tainted = await makeCampaign(head, 'Tainted');
  assert.equal((await head.client.from('rules').insert({ campaign_id: tainted.id, kind: 'class', key: 'old-edition-class', data: {} })).error, null);
  const blocked = await post('/admin/store/publish', head.session, { campaign: tainted.id, title: 'Tainted', slug: 'tainted-' + rnd(), status: 'live' });
  assert.ok(/private content/.test(decodeURIComponent(blocked.headers.get('location')).replace(/\+/g, ' ')), 'private rules block publishing');
  const tainted2 = await makeCampaign(head, 'Tainted two');
  const priv = await head.client.from('entities').insert({ type: 'monster', slug: 'conv-' + rnd(), name: 'Converted Beast', source: 'private', status: 'live' }).select('id').single();
  await head.client.from('campaign_entities').insert({ campaign_id: tainted2.id, entity_id: priv.data.id });
  const blocked2 = await post('/admin/store/publish', head.session, { campaign: tainted2.id, title: 'Tainted two', slug: 'tainted2-' + rnd(), status: 'live' });
  assert.ok(decodeURIComponent(blocked2.headers.get('location')).replace(/\+/g, ' ').includes('Converted Beast'));
  assert.equal(((await admin.from('products').select('id').in('campaign_id', [tainted.id, tainted2.id])).data ?? []).length, 0);

  // a clean campaign with everything in it
  const src = await makeCampaign(head, 'The Glass Coast', { phases: [{ id: 'one', label: 'Act one' }, { id: 'two', label: 'Act two' }], phase: 'one', theme: theme('frost') });
  await head.client.from('content').insert([
    { campaign_id: src.id, section: 'overview', kind: 'html', key: 'p1', sort: 10, title: 'a', visibility: 'player', body: { html: '<p>The coast is made of glass</p><script>alert(1)</script>' } },
    { campaign_id: src.id, section: 'overview', kind: 'html', key: 'p2', sort: 20, title: 'b', visibility: 'player', from_stage: 'two', body: { html: '<p>The tide turns to sand</p>' } },
    { campaign_id: src.id, section: 'secrets', kind: 'secret', key: 's1', sort: 10, title: 'c', visibility: 'dm', body: { tag: 'DM only', html: '<p>The lighthouse keeper is the tide</p>' } },
  ]);
  const png = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#88aacc' } }).png().toBuffer();
  const file = `${src.id}/maps/${crypto.randomUUID()}.png`;
  await head.client.storage.from('campaign-files').upload(file, png, { contentType: 'image/png' });
  const ins = async (r) => (await head.client.from('entries').insert({ campaign_id: src.id, ...r }).select('id').single()).data.id;
  const beat = await ins({ kind: 'beat', title: 'The first wreck', status: 'hit', live: true, vis: 'all', data: { hitSession: 2, hitAt: '2026-09-01', key: true } });
  const npc = await ins({ kind: 'npc', title: 'Keeper Ysolde', status: 'alive', vis: 'all', data: { known: 'Keeps the light.' } });
  await head.client.from('entry_secrets').insert({ entry_id: npc, campaign_id: src.id, data: { secret: 'She is the tide.' } });
  const map = await ins({ kind: 'map', title: 'The coast', vis: 'all', data: { file, w: 80, h: 60 } });
  await ins({ kind: 'region', parent: map, title: 'The reef', vis: 'stage', vis_stage: 'two', data: { pts: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]] } });
  await ins({ kind: 'pin', parent: map, title: 'Wreck site', vis: 'entry', vis_entry: beat, data: { x: 0.3, y: 0.3, beat } });
  const brew = await head.client.from('entities').insert({ type: 'race', slug: 'glasskin-' + rnd(), name: 'Glasskin', status: 'live', depth: 'advanced', data: { effects: [{ t: 'ability', ab: 'dex', n: 2 }] } }).select('id').single();
  await head.client.from('campaign_entities').insert({ campaign_id: src.id, entity_id: brew.data.id });

  const slug = 'glass-coast-' + rnd();
  const pub = await post('/admin/store/publish', head.session, { campaign: src.id, title: 'The Glass Coast', slug, pitch: 'A coast made of glass.\n\nFour sessions.', includes: '3 pages\n1 map', preview: ['overview', 'secrets'], price: '0', status: 'live' });
  assert.ok(decodeURIComponent(pub.headers.get('location')).includes('published=' + slug), pub.headers.get('location'));

  // the public sees the product and its preview; never the frozen copy
  const prod = (await anonClient().from('products').select('*').eq('slug', slug).single()).data;
  assert.ok(prod && prod.status === 'live' && prod.preview.length === 1, 'DM-only tabs cannot be preview pages');
  assert.ok(prod.preview[0].html.includes('The coast is made of glass') && !prod.preview[0].html.includes('script') && !prod.preview[0].html.includes('tide'), 'the preview is what a player sees at the first stage, made safe');
  for (const who of [anonClient(), free.client, buyer.client]) assert.ok((await who.from('product_snapshots').select('*')).error || ((await who.from('product_snapshots').select('*')).data ?? []).length === 0, 'the frozen copy is not readable');
  assert.ok((await free.client.from('products').update({ price_cents: 0 }).eq('id', prod.id).select()).error || ((await free.client.from('products').update({ title: 'x' }).eq('id', prod.id).select()).data ?? []).length === 0);
  const shelf = await page('/store', null);
  assert.ok(shelf.status === 200 && shelf.text.includes('The Glass Coast') && shelf.text.includes('Free'));
  const detail = await page('/store/' + slug, null);
  assert.ok(detail.status === 200 && detail.text.includes('A coast made of glass') && detail.text.includes('1 map') && detail.text.includes('Free preview') && !detail.text.includes('keeper is the tide') && detail.text.includes('og:title'));
  // frozen: later changes to the original do not reach buyers
  await head.client.from('content').update({ body: { html: '<p>Changed after publishing</p>' } }).eq('campaign_id', src.id).eq('key', 'p1');

  // signed out: sent to sign up first. Signed in: a free product is delivered straight away.
  const anon = await post(`/store/${slug}/buy`, null, {});
  assert.ok(anon.headers.get('location').includes('/sign-up?next='));
  await makeCampaign(buyer, 'Buyer\'s own campaign');
  const bought = await post(`/store/${slug}/buy`, buyer.session, {});
  const where = bought.headers.get('location');
  assert.match(where, /\/c\/glass-coast-[a-z0-9-]+\/manage$/);
  const copy = (await admin.from('campaigns').select('*').eq('slug', where.split('/c/')[1].split('/')[0]).single()).data;
  assert.deepEqual([copy.owner_id, copy.purchased, copy.title, copy.phase], [buyer.id, true, 'The Glass Coast', 'one']);
  assert.deepEqual(copy.theme, theme('frost'));
  const got = (await buyer.client.from('content').select('body, visibility').eq('campaign_id', copy.id)).data;
  const text = got.map((r) => r.body.html).join(' ');
  assert.ok(got.length === 3 && text.includes('The coast is made of glass') && text.includes('lighthouse keeper is the tide') && !text.includes('Changed after publishing'), 'pages, with the DM secrets, as they were when it was frozen');
  const entries = (await buyer.client.from('entries').select('id, kind, title, status, live, vis, vis_entry, parent, data').eq('campaign_id', copy.id)).data;
  assert.deepEqual(entries.map((e) => e.kind).sort(), ['beat', 'map', 'npc', 'pin', 'region']);
  const nb = entries.find((e) => e.kind === 'beat'), nm = entries.find((e) => e.kind === 'map'), np = entries.find((e) => e.kind === 'pin');
  assert.deepEqual([nb.status, nb.live, nb.data.hitSession], ['planned', false, undefined], 'the story starts unplayed');
  assert.ok(np.parent === nm.id && np.vis_entry === nb.id && np.data.beat === nb.id && nb.id !== beat, 'links point at the buyer\'s own copies');
  assert.equal((await buyer.client.from('entry_secrets').select('data').eq('campaign_id', copy.id)).data[0].data.secret, 'She is the tide.');
  assert.ok(nm.data.file.startsWith(copy.id + '/') && !(await buyer.client.storage.from('campaign-files').createSignedUrl(nm.data.file, 60)).error, 'the map picture is the buyer\'s own copy');
  const myBrew = (await buyer.client.from('entities').select('id, name, source, data').eq('owner_id', buyer.id)).data;
  assert.ok(myBrew.length === 1 && myBrew[0].name === 'Glasskin' && myBrew[0].source === 'homebrew' && myBrew[0].id !== brew.data.id);
  assert.equal((await buyer.client.from('campaign_entities').select('entity_id').eq('campaign_id', copy.id)).data.length, 1);
  // the buyer is its DM, can edit it on the free plan, and it has the tools it was built with
  assert.equal((await buyer.client.from('content').update({ title: 'my copy' }).eq('campaign_id', copy.id).select('id')).data.length, 3);
  assert.equal((await buyer.client.from('entries').insert({ campaign_id: copy.id, kind: 'beat', title: 'My own beat', status: 'planned', live: false, vis: 'all' }).select('id')).error, null);
  const mg = await page(where.replace(SITE, ''), buyer.session);
  assert.ok(mg.status === 200 && mg.text.includes('Manage The Glass Coast') && !mg.text.includes('read-only'));
  assert.equal(((await head.client.from('campaigns').select('id').eq('id', copy.id)).data ?? []).length, 0, 'the seller cannot see the buyer\'s copy');

  // a paid product: no charge without Stripe; delivered when the payment is confirmed, once
  await admin.from('products').update({ price_cents: 1200 }).eq('id', prod.id);
  const nopay = await post(`/store/${slug}/buy`, pro.session, {});
  assert.ok(nopay.headers.get('location').endsWith(`/store/${slug}?pay=off`));
  assert.ok((await page(`/store/${slug}?pay=off`, pro.session)).text.includes('Nothing was charged'));
  const ev = JSON.stringify({ id: 'evt_test_' + rnd(), type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_' + rnd(), amount_total: 1200, metadata: { user_id: pro.id, kind: 'product', product_id: prod.id } } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${crypto.createHmac('sha256', process.env.TEST_WEBHOOK_SECRET || 'whsec_localtest').update(`${t}.${ev}`).digest('hex')}`;
  const hook = () => fetch(SITE + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sig }, body: ev });
  const first = await hook();
  if (first.status !== 503) {
    assert.equal(first.status, 200);
    await hook();
    const mine = (await admin.from('campaigns').select('id').eq('owner_id', pro.id).eq('purchased', true)).data;
    assert.equal(mine.length, 1, 'paid for once, delivered once');
  }
});

// ------------------------------------------------------------------ Phase 13: the demo and the public face

test('the demo: anyone can browse it as a player, and gets nothing a player would not', async () => {
  const anon = anonClient();
  const camps = (await anon.from('campaigns').select('id, slug, title, is_demo')).data;
  assert.ok(camps.length === 1 && camps[0].is_demo && camps[0].title === 'The Lantern Beneath', 'a signed-out visitor can read the demo campaign and no other');
  const D = camps[0].id;
  const rows = (await anon.from('content').select('visibility, body, from_stage, campaign_id')).data;
  assert.ok(rows.length > 5 && rows.every((r) => r.campaign_id === D && r.visibility === 'player' && !r.from_stage));
  assert.ok(!JSON.stringify(rows).includes('Sister Maren lit the lantern') && !JSON.stringify(rows).includes('congregation'));
  const ents = (await anon.from('entries').select('kind, title, status, vis, campaign_id')).data;
  assert.ok(ents.every((e) => e.campaign_id === D) && ents.some((e) => e.title === 'Hired by the Ferry Guild'));
  for (const hidden of ['Sister Maren admits she lit the lantern', 'The Sluice-Warden', 'Brother Aldous', 'The congregation', 'The sluice gate', 'Maren\'s boat']) assert.ok(!ents.some((e) => e.title === hidden), 'not sent: ' + hidden);
  assert.ok(!ents.some((e) => ['region', 'secret', 'clue', 'log', 'encounter'].includes(e.kind)));
  assert.ok((await anon.from('entry_secrets').select('*')).error || ((await anon.from('entry_secrets').select('*')).data ?? []).length === 0);
  assert.ok((await anon.from('entries').insert({ campaign_id: D, kind: 'pin', title: 'x', vis: 'all' }).select()).error, 'a visitor cannot write');
  assert.equal(((await anon.from('sections').select('slug, audience')).data ?? []).some((s) => s.audience === 'dm' || s.slug === 'the-drowned-quarter'), false);
  for (const t of ['rules', 'characters', 'memberships', 'invites', 'profiles', 'player_notes', 'safety_inputs', 'sessions']) assert.ok((await anon.from(t).select('*').limit(1)).error || ((await anon.from(t).select('*').limit(1)).data ?? []).length === 0, 'nothing from ' + t);

  const home = await page('/demo', null);
  assert.ok(home.status >= 300 && home.location.endsWith('/demo/overview'));
  const pg = await page('/demo/overview', null);
  assert.ok(pg.status === 200 && pg.text.includes('The Lantern Beneath') && pg.text.includes('This is a demo') && pg.text.includes('Story so far') && pg.text.includes('Since last session'));
  assert.ok(!pg.text.includes('The lantern is lit') && !pg.text.includes('Sister Maren lit') && !pg.text.includes('had the party followed'), 'no stage-held block, no DM secret, no DM-only consequence');
  assert.equal((await page('/demo/secrets', null)).status, 404);
  assert.equal((await page('/demo/the-drowned-quarter', null)).status, 404);
  const npcs = await page('/demo/tools/npcs', null);
  assert.ok(npcs.text.includes('Guildmistress Oda Venn') && npcs.text.includes('clearly frightened') && !npcs.text.includes('Sluice-Warden') && !npcs.text.includes('ordered the sluice opened') && !npcs.text.includes('Add an NPC'));
  const tl = await page('/demo/tools/timeline', null);
  assert.ok(tl.text.includes('A bell under the river') && !tl.text.includes('admits she lit') && !tl.text.includes('It happened'));
  const maps = await page('/demo/tools/maps', null);
  const m = /\/demo\/map\/([0-9a-f-]{36})/.exec(maps.text);
  assert.ok(m && maps.text.includes('The Eel and Anchor') && !maps.text.includes('The sluice gate'));
  const img = await fetch(`${SITE}/demo/map/${m[1]}`, { redirect: 'follow' });
  assert.equal(img.status, 200);
  const { data, info } = await sharp(Buffer.from(await img.arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (fx, fy) => data[(Math.floor(fy * info.height) * info.width + Math.floor(fx * info.width)) * info.channels];
  assert.ok(px(0.85, 0.85) < 40 && px(0.05, 0.1) > 150, 'the Drowned Quarter is painted over in the picture a visitor receives');
  // signed in or not, the demo is the same
  assert.equal((await page('/demo/overview', free.session)).status, 200);
});

test('public face: the landing page leads with secrets and reveals; pricing comes from the config; pages are shareable', async () => {
  const land = await page('/', null);
  assert.equal(land.status, 200);
  const at = (s) => land.text.indexOf(s);
  assert.ok(at('Secrets that stay secret') > 0 && at('Secrets that stay secret') < at('A timeline that remembers') && at('A timeline that remembers') < at('Maps that open') && at('Maps that open') < at('Homebrew you can finish'), 'secrets and reveals, then timeline and maps, then homebrew');
  assert.ok(land.text.includes('doorway-wide.webp') && land.text.includes('href="/demo"') && land.text.includes('href="/sign-up"') && land.text.includes('Fifth edition compatible'));
  assert.ok(land.text.includes('property="og:title"') && land.text.includes('og:image') && land.text.includes('name="description"'));
  const price = await page('/pricing', null);
  assert.ok(price.status === 200 && [PRICES.pro_monthly.label, PRICES.pro_yearly.label, PRICES.founder.label, 'seats left', 'Players are always free'].every((t) => price.text.includes(t)));
  for (const p of ['/', '/pricing', '/store', '/custom', '/legal', '/demo/overview']) {
    const r = await page(p, null);
    assert.equal(r.status, 200, p);
    assert.ok(!/D&amp;D|D&D|Dungeons (&amp;|&|and) Dragons/i.test(r.text), p + ' does not use the trademark');
    assert.ok(!/noindex/.test(r.text), p + ' can be indexed');
  }
  assert.ok(/noindex/.test((await page('/campaigns', free.session)).text), 'signed-in pages are not indexed');
  const robots = await (await fetch(SITE + '/robots.txt')).text();
  assert.ok(/Disallow: \/c\//.test(robots) && /Allow: \/demo/.test(robots) && /Sitemap:/.test(robots));
  const map = await (await fetch(SITE + '/sitemap.xml')).text();
  assert.ok(map.includes('/pricing') && map.includes('/demo') && !map.includes('/c/'));
  const og = await fetch(SITE + '/opengraph-image');
  assert.ok(og.status === 200 && og.headers.get('content-type').startsWith('image/png'));
});
