// Follow-up build, parts 1 to 6: the free official pack, paid packs, two editions of a
// campaign product with upgrades and spoiler protection, what a bought campaign unlocks,
// and the custom campaign service.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { admin, anonClient, campaign, cleanup, cookieFor, makeUser, page, SITE } from './helpers.mjs';
import { blankV2 } from '../src/lib/rules/engine.ts';
import { STORE } from '../src/config/store.ts';
import { COMMISSIONS, COMMISSION_TIERS, tierPrice } from '../src/config/commissions.ts';

const rnd = () => Math.random().toString(36).slice(2, 8);
let head, pro, free, buyer;
const post = (path, session, fields) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) (Array.isArray(v) ? v : [v]).forEach((x) => body.append(k, String(x)));
  return fetch(SITE + path, { method: 'POST', redirect: 'manual', headers: { cookie: session ? cookieFor(session) : '', 'content-type': 'application/x-www-form-urlencoded' }, body });
};
const where = (res) => decodeURIComponent(res.headers.get('location') ?? '').replace(/\+/g, ' ');
async function makeCampaign(owner, title, extra = {}) {
  const slug = 'st-' + rnd();
  const made = await owner.client.from('campaigns').insert({ slug, title, ...extra }).select('id, slug, settings').single();
  assert.equal(made.error, null, made.error?.message);
  await owner.client.from('sections').insert([{ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' }, { campaign_id: made.data.id, slug: 'sheet', title: 'My character', sort: 20, audience: 'player', kind: 'sheet' }, { campaign_id: made.data.id, slug: 'secrets', title: 'Secrets', sort: 30, audience: 'dm', kind: 'content' }]);
  return made.data;
}
async function join(owner, campaignId, user) {
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await owner.client.from('invites').insert({ campaign_id: campaignId, code });
  assert.equal((await user.client.rpc('join_campaign', { p_code: code })).error, null);
}
const webhook = (event) => {
  const body = JSON.stringify({ livemode: false, ...event });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${crypto.createHmac('sha256', process.env.TEST_WEBHOOK_SECRET || 'whsec_localtest').update(`${t}.${body}`).digest('hex')}`;
  return fetch(SITE + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sig }, body });
};
const bought = (userId, productId, extra = {}, amount = 700) => webhook({ id: 'evt_test_' + rnd(), type: 'checkout.session.completed', data: { object: { id: 'cs_test_' + rnd(), amount_total: amount, metadata: { user_id: userId, kind: 'product', product_id: productId, ...extra } } } });

before(async () => {
  await cleanup();
  [head, pro, free, buyer] = await Promise.all([makeUser('shead', { head: true }), makeUser('spro'), makeUser('sfree', { free: true }), makeUser('sbuyer', { free: true })]);
});
after(cleanup);

// ------------------------------------------------------------------ Part 1

test('Bryce\'s Originals: free to every DM with one click, and never counted against the free limit', async () => {
  const pack = (await admin.from('packs').select('id, official, free').eq('name', STORE.originals.name).single()).data;
  assert.ok(pack.official && pack.free);
  const inside = (await free.client.from('pack_entities').select('entities(id, name, type, source, status)').eq('pack_id', pack.id)).data.map((x) => x.entities);
  assert.ok(inside.length >= 1 && inside.every((e) => e && e.source === 'homebrew' && e.status === 'live'), 'a free account can read the pack; nothing private is in it');
  const shelf = await page('/store', null);
  assert.ok(shelf.status === 200 && shelf.text.includes('Bryce&#x27;s Originals') && shelf.text.includes('Free'));
  const listing = await page('/store/' + STORE.originals.slug, null);
  assert.ok(listing.status === 200 && listing.text.includes('Free preview') && listing.text.includes(inside[0].name) && listing.text.includes('never count toward the free plan'));

  const mine = await makeCampaign(free, 'Free DM Realm', { settings: { rules: '2024' } });
  assert.ok((await buyer.client.rpc('attach_pack', { p: pack.id, c: mine.id })).error, 'only into a campaign you run');
  const added = await free.client.rpc('attach_pack', { p: pack.id, c: mine.id });
  assert.ok(added.error === null && added.data === inside.length, 'one call adds the whole pack, on the free plan');
  assert.equal((await free.client.rpc('attach_pack', { p: pack.id, c: mine.id })).data, 0, 'adding it twice adds nothing twice');
  await join(free, mine.id, buyer);
  await buyer.client.from('characters').insert({ owner: buyer.id, campaign_id: mine.id, data: { ...blankV2(), name: 'P' } });
  assert.ok((await page(`/c/${mine.slug}/sheet`, buyer.session)).text.includes(inside[0].name), 'a player sees the pack\'s races on the sheet');

  // pack entries do not count; the DM's own three still fit; a clone is their own and counts
  assert.equal((await free.client.rpc('my_plan')).data.homebrew, 0);
  for (let i = 0; i < 2; i++) assert.equal((await free.client.from('entities').insert({ type: 'item', slug: 'own-' + i + rnd(), name: 'Own ' + i }).select()).error, null);
  const clone = await free.client.from('entities').insert({ type: 'race', slug: 'clone-' + rnd(), name: inside[0].name + ' (mine)', cloned_from: inside[0].id, origin: 'product' }).select('origin').single();
  assert.deepEqual([clone.error, clone.data.origin], [null, 'own'], 'a clone is the account\'s own entry, whatever it claims');
  assert.equal((await free.client.rpc('my_plan')).data.homebrew, 3);
  assert.ok(/upgrade:homebrew/.test((await free.client.from('entities').insert({ type: 'item', slug: 'own-x' + rnd(), name: 'Fourth' }).select()).error?.message ?? ''));

  // nobody edits the official entries, and nobody else can make a pack official
  assert.equal(((await free.client.from('entities').update({ name: 'x' }).eq('id', inside[0].id).select('id')).data ?? []).length, 0);
  const own = await pro.client.from('packs').insert({ name: 'Mine' }).select('id').single();
  assert.ok((await pro.client.from('packs').update({ official: true, free: true }).eq('id', own.data.id).select()).error);
  assert.ok((await pro.client.from('packs').insert({ name: 'Sneaky', official: true, free: true }).select()).error);
  const offer = await page('/new-campaign', pro.session);
  assert.ok(offer.text.includes('Bryce&#x27;s Originals') && offer.text.includes('name="pack"'), 'offered during campaign creation');
});

// ------------------------------------------------------------------ Part 2

test('paid packs: admin-only, never with private content, usable only once bought, attachable to the buyer\'s campaigns', async () => {
  const ent = async (name, extra = {}) => (await head.client.from('entities').insert({ type: 'race', slug: 'pk-' + rnd(), name, status: 'live', depth: 'advanced', data: { desc: name + ' desc', effects: [{ t: 'ability', ab: 'str', n: 2 }] }, ...extra }).select('id').single()).data.id;
  const [a, b, secret] = [await ent('Ashwalker'), await ent('Brinefolk'), await ent('Converted Thing', { source: 'private' })];
  const pack = (await head.client.from('packs').insert({ name: 'Coastal Peoples ' + rnd() }).select('id').single()).data;
  await head.client.from('pack_entities').insert([a, b, secret].map((entity_id) => ({ pack_id: pack.id, entity_id })));
  const slug = 'coastal-' + rnd();
  assert.equal((await post('/admin/store/publish-pack', pro.session, { pack: pack.id, title: 'x', slug })).status, 403, 'admin-only publishing');
  const refused = where(await post('/admin/store/publish-pack', head.session, { pack: pack.id, title: 'Coastal Peoples', slug, price: '5', status: 'live' }));
  assert.ok(refused.includes('Converted Thing') && /private/i.test(refused), 'a pack holding a private entry cannot be published');
  await head.client.from('pack_entities').delete().eq('pack_id', pack.id).eq('entity_id', secret);
  assert.ok(where(await post('/admin/store/publish-pack', head.session, { pack: pack.id, title: 'Coastal Peoples', slug, price: '5', status: 'live', preview: b, pitch: 'Two peoples of the shore.' })).includes('published=' + slug));

  const prod = (await anonClient().from('products').select('*').eq('slug', slug).single()).data;
  assert.deepEqual([prod.kind, prod.price_cents, prod.includes.length, prod.preview[0].title], ['pack', 500, 2, 'Brinefolk'], 'the listing shows what is inside and one entry in full');
  const listing = await page('/store/' + slug, buyer.session);
  assert.ok(listing.text.includes('Brinefolk desc') && !listing.text.includes('Ashwalker desc') && listing.text.includes('$5') && listing.text.includes('Buy this pack'));

  const mine = await makeCampaign(buyer, 'Buyer Realm');
  assert.equal(((await buyer.client.from('entities').select('id').in('id', [a, b])).data ?? []).length, 0, 'before buying: not readable');
  assert.ok((await buyer.client.rpc('attach_pack', { p: pack.id, c: mine.id })).error, 'and not attachable');
  assert.ok((await buyer.client.from('pack_owners').insert({ user_id: buyer.id, pack_id: pack.id }).select()).error, 'nobody can give themselves a pack');
  assert.ok(where(await post(`/store/${slug}/buy`, buyer.session, {})).endsWith('?pay=off'), 'no charge without Stripe');

  const hook = await bought(buyer.id, prod.id, {}, 500);
  if (hook.status === 503) return;
  assert.equal(hook.status, 200);
  assert.equal((await buyer.client.from('entities').select('id').in('id', [a, b])).data.length, 2, 'bought: in the account');
  assert.equal((await buyer.client.rpc('attach_pack', { p: pack.id, c: mine.id })).data, 2);
  assert.equal((await buyer.client.rpc('my_plan')).data.homebrew, 0, 'bought entries are not counted');
  assert.ok((await page('/store/' + slug, buyer.session)).text.includes('This pack is in your account'));
  assert.ok((await page('/homebrew', buyer.session)).text.includes('Coastal Peoples'));
  assert.equal(((await free.client.from('entities').select('id').in('id', [a, b])).data ?? []).length, 0, 'someone who has not bought it still cannot read it');
});

// ------------------------------------------------------------------ Parts 3 and 4

test('editions: framework and full, the upgrade path, spoiler protection, and what works on the free plan', async () => {
  // "To be a god" has a listing, as unpublished drafts only
  const tbg = await campaign();
  const drafts = (await admin.from('products').select('slug, status, edition, price_cents, spoiler_campaign, full_product').eq('campaign_id', tbg.id)).data;
  assert.deepEqual(drafts.map((d) => [d.edition, d.status, d.price_cents]).sort(), [['framework', 'draft', STORE.editions.framework.cents], ['full', 'draft', STORE.editions.full.cents]]);
  assert.ok(drafts.every((d) => d.spoiler_campaign === tbg.id) && drafts.find((d) => d.edition === 'framework').full_product);
  assert.equal(((await anonClient().from('products').select('id').eq('campaign_id', tbg.id)).data ?? []).length, 0);
  assert.equal(((await buyer.client.from('products').select('id').eq('campaign_id', tbg.id)).data ?? []).length, 0, 'drafts are the admin\'s alone');

  // a story campaign with three stages, a custom resource of the seller's own, and a player in it
  const src = await makeCampaign(head, 'The Salt Road', { phases: [{ id: 'one', label: 'Act one' }, { id: 'two', label: 'Act two' }, { id: 'three', label: 'Act three' }], phase: 'one' });
  await head.client.from('content').insert([
    { campaign_id: src.id, section: 'overview', kind: 'hero', key: 'hero', sort: 10, title: 'h', visibility: 'player', body: { html: '<h1>The Salt Road</h1><p class="premise">A caravan that never arrives.</p>' } },
    { campaign_id: src.id, section: 'overview', kind: 'html', key: 'lore', sort: 20, title: 'l', visibility: 'player', body: { html: '<p>The caravan master is already dead.</p>' } },
    { campaign_id: src.id, section: 'overview', kind: 'html', key: 'lore2', sort: 30, title: 'l2', visibility: 'player', from_stage: 'two', body: { html: '<p>The wells are poisoned.</p>' } },
    { campaign_id: src.id, section: 'secrets', kind: 'secret', key: 's1', sort: 10, title: 's', visibility: 'dm', body: { tag: 'DM only', html: '<p>The guide sold them out.</p>' } },
  ]);
  const e = async (r) => (await head.client.from('entries').insert({ campaign_id: src.id, ...r }).select('id').single()).data.id;
  await e({ kind: 'beat', title: 'The first dry well', status: 'planned', live: false, vis: 'all', data: { key: true } });
  await e({ kind: 'npc', title: 'Guide Hesh', status: 'alive', vis: 'all', data: { known: 'Knows the road.' } });
  const pool = (await head.client.from('entities').insert({ type: 'resource', slug: 'water-' + rnd(), name: 'Water', status: 'live', depth: 'advanced', data: { max: 'prof', recharge: 'long' } }).select('id').single()).data.id;
  await head.client.from('campaign_entities').insert({ campaign_id: src.id, entity_id: pool });
  await join(head, src.id, free);   // `free` plays in it: the listing must never reach them

  // the generator: structure kept, story stripped, labelled slots left
  assert.equal((await post('/admin/store/generate', pro.session, { campaign: src.id, mode: 'framework' })).status, 403);
  const fwSlug = /made=([^&]+)/.exec(where(await post('/admin/store/generate', head.session, { campaign: src.id, mode: 'framework' })))[1];
  const fw = (await admin.from('campaigns').select('id, phases, copied_from, owner_id').eq('slug', fwSlug).single()).data;
  assert.deepEqual([fw.copied_from, fw.owner_id, fw.phases.length], [src.id, head.id, 3], 'a copy in the admin\'s account, with the reveal stages');
  const fwText = JSON.stringify((await admin.from('content').select('section, kind, body, visibility, from_stage').eq('campaign_id', fw.id)).data);
  for (const story of ['caravan', 'poisoned', 'sold them out', 'Salt Road']) assert.ok(!fwText.includes(story), 'no story in the framework: ' + story);
  assert.ok(fwText.includes('[Your campaign') && fwText.includes('Your text goes here') && fwText.includes('A secret') && fwText.includes('"from_stage":"two"'), 'labelled slots, in the same places and at the same stages');
  assert.equal((await admin.from('sections').select('slug').eq('campaign_id', fw.id)).data.length, 3, 'the tab layout');
  const fwEntries = (await admin.from('entries').select('kind, title').eq('campaign_id', fw.id)).data;
  assert.ok(fwEntries.some((x) => x.kind === 'npc' && x.title === '[An NPC]') && fwEntries.some((x) => x.kind === 'beat') && !fwEntries.some((x) => /Hesh|dry well/.test(x.title)));
  assert.equal((await admin.from('campaign_entities').select('entity_id').eq('campaign_id', fw.id)).data[0].entity_id, pool, 'the custom resource comes along');

  // both editions published; the framework points at its full edition
  const fullSlug = 'salt-road-' + rnd(), fwProdSlug = fullSlug + '-framework';
  const p1 = where(await post('/admin/store/publish', head.session, { campaign: src.id, title: 'The Salt Road', slug: fullSlug, price: '20', status: 'live', edition: 'full', preview: ['overview'], pitch: 'A caravan that never arrives.' }));
  assert.ok(p1.includes('published='), p1);
  const p2 = where(await post('/admin/store/publish', head.session, { campaign: fw.id, title: 'The Salt Road: framework', slug: fwProdSlug, price: '7', status: 'live', edition: 'framework', full_slug: fullSlug }));
  assert.ok(p2.includes('published='), p2);
  const [full, fwProd] = await Promise.all([fullSlug, fwProdSlug].map(async (s) => (await admin.from('products').select('*').eq('slug', s).single()).data));
  assert.deepEqual([full.edition, fwProd.edition, fwProd.full_product, fwProd.spoiler_campaign], ['full', 'framework', full.id, src.id]);

  // spoiler protection
  for (const s of [fullSlug, fwProdSlug]) {
    assert.equal(((await free.client.from('products').select('id').eq('slug', s)).data ?? []).length, 0, 'a player in the campaign cannot read the listing');
    assert.equal((await page('/store/' + s, free.session)).status, 404);
    assert.equal(((await anonClient().from('products').select('id').eq('slug', s)).data ?? []).length, 0, 'nor a signed-out visitor, who could be one');
    assert.equal((await page('/store/' + s, null)).status, 404);
    assert.equal((await page('/store/' + s, buyer.session)).status, 200, 'anyone else signed in can');
  }
  assert.ok(!(await page('/store', free.session)).text.includes('Salt Road') && (await page('/store', buyer.session)).text.includes('Salt Road'));
  assert.ok(where(await post(`/store/${fullSlug}/buy`, free.session, {})).endsWith('/store'), 'and cannot buy it');
  const fwPage = await page('/store/' + fwProdSlug, buyer.session);
  assert.ok(['Framework edition', '$7', 'the full edition', 'Works on every plan', 'Needs Pro', 'Never part of the price'].every((t) => fwPage.text.includes(t)), 'the listing says plainly what works on the free plan');
  assert.ok((await page('/store/' + fullSlug, pro.session)).text.includes('$16'), 'subscribers pay 20 percent less');
  assert.ok((await page('/store/' + fullSlug, buyer.session)).text.includes('The caravan master is already dead'), 'the chosen preview tab can be read without buying');

  // the buyer (free plan, with a campaign of their own already) buys the framework
  const h1 = await bought(buyer.id, fwProd.id);
  if (h1.status === 503) return;
  const copy = (await admin.from('campaigns').select('id, slug').eq('owner_id', buyer.id).eq('purchased', true).ilike('slug', 'salt-road-%').single()).data;
  assert.equal((await admin.from('purchases').select('campaign_id').eq('user_id', buyer.id).eq('product_id', fwProd.id).single()).data.campaign_id, copy.id);

  // Part 4: what was delivered works on the free plan; making new Pro-only things does not
  assert.equal((await buyer.client.rpc('my_plan')).data.campaigns, 1, 'the bought campaign is not counted');
  const theirBeat = (await buyer.client.from('entries').select('id, kind').eq('campaign_id', copy.id)).data.find((x) => x.kind === 'beat');
  assert.equal((await buyer.client.from('entries').update({ status: 'hit', live: true }).eq('id', theirBeat.id).select('id')).data.length, 1, 'a delivered beat can be marked as hit');
  assert.equal((await buyer.client.from('campaigns').update({ phase: 'three' }).eq('id', copy.id).select('id')).data.length, 1, 'the delivered third stage can be reached');
  assert.ok((await buyer.client.from('content').update({ title: 'edited' }).eq('campaign_id', copy.id).select('id')).data.length > 0, 'and everything can be edited');
  for (const [what, row] of [['a new planned beat', { kind: 'beat', title: 'New', status: 'planned', live: false, vis: 'all' }], ['a new world-state entry', { kind: 'clock', title: 'New', vis: 'dm' }]]) {
    assert.ok(/upgrade:/.test((await buyer.client.from('entries').insert({ campaign_id: copy.id, ...row }).select()).error?.message ?? ''), what + ' needs Pro');
  }
  assert.ok(/upgrade:stages/.test((await buyer.client.from('campaigns').update({ phases: [{ id: 'one', label: 'a' }, { id: 'two', label: 'b' }, { id: 'three', label: 'c' }, { id: 'four', label: 'd' }] }).eq('id', copy.id).select()).error?.message ?? ''), 'a fourth stage needs Pro');
  assert.ok(/upgrade:player_secrets/.test((await buyer.client.from('content').insert({ campaign_id: copy.id, section: 'overview', kind: 'html', key: 'np', visibility: 'player', only_players: [free.id], body: {} }).select()).error?.message ?? ''));
  const tl = await page(`/c/${copy.slug}/tools/timeline`, buyer.session);
  assert.ok(tl.status === 200 && tl.text.includes('Key beats remaining') && tl.text.includes('Planning new beats is part of Pro') && !tl.text.includes('>Plan a beat<'), 'the tool opens, with the usual prompt in place of "new"');
  assert.equal((await buyer.client.rpc('my_plan')).data.homebrew, 0, 'homebrew that came with it is not counted');

  // the buyer writes in one slot, leaves the rest, then upgrades for the difference
  const slots = (await buyer.client.from('content').select('id, key').eq('campaign_id', copy.id).eq('section', 'overview')).data;
  await buyer.client.from('content').update({ body: { html: '<p>My own caravan, with my own secret.</p>' } }).eq('id', slots.find((s) => s.key === 'lore').id);
  const offer = await page('/store/' + fullSlug, buyer.session);
  assert.ok(offer.text.includes('Upgrade my copy to the full edition') && offer.text.includes('$13') && offer.text.includes('less the $7 you paid'), 'the full edition costs the difference');
  const count = async () => (await admin.from('campaigns').select('id', { count: 'exact', head: true }).eq('owner_id', buyer.id)).count;
  const was = await count();
  await bought(buyer.id, full.id, { upgrade_campaign: copy.id }, 1300);
  assert.equal(await count(), was, 'the upgrade goes into the existing copy');
  const after = (await buyer.client.from('content').select('key, body, visibility').eq('campaign_id', copy.id)).data;
  const text = (k) => after.find((r) => r.key === k)?.body.html ?? '';
  assert.ok(text('lore').includes('My own caravan'), 'what the buyer wrote is kept');
  assert.ok(text('lore-full').includes('The caravan master is already dead') && after.find((r) => r.key === 'lore-full').visibility === 'dm', 'and the full edition\'s version is added beside it');
  assert.ok(text('hero').includes('The Salt Road') && text('lore2').includes('wells are poisoned') && text('s1').includes('sold them out'), 'untouched slots are filled; the rest of the story arrives, secrets included');
  const nowEntries = (await buyer.client.from('entries').select('kind, title').eq('campaign_id', copy.id)).data;
  assert.ok(nowEntries.some((x) => x.title === 'Guide Hesh') && nowEntries.some((x) => x.title === 'The first dry well') && !nowEntries.some((x) => x.title === '[An NPC]'), 'the NPCs and beats arrive; unused placeholders go');
  // someone else cannot aim an upgrade at this copy
  await bought(pro.id, full.id, { upgrade_campaign: copy.id }, 1300);
  assert.equal((await admin.from('content').select('id', { count: 'exact', head: true }).eq('campaign_id', copy.id).eq('key', 'lore-full')).count, 1);

  // private content: a live listing is refused, a draft can exist, and the publishable copy leaves it out
  const tainted = await makeCampaign(head, 'Old Rules Realm');
  await head.client.from('rules').insert({ campaign_id: tainted.id, kind: 'class', key: 'old', data: {} });
  await head.client.from('content').insert({ campaign_id: tainted.id, section: 'overview', kind: 'html', key: 'k', title: 'k', visibility: 'player', body: { html: '<p>Mine</p>' } });
  assert.ok(/cannot be published/.test(where(await post('/admin/store/publish', head.session, { campaign: tainted.id, title: 'Tainted', slug: 'tainted-' + rnd(), status: 'live' }))));
  assert.ok(/cannot go live yet/.test(where(await post('/admin/store/publish', head.session, { campaign: tainted.id, title: 'Tainted', slug: 'tainted-d-' + rnd(), status: 'draft' }))));
  const cleanSlug = /made=([^&]+)/.exec(where(await post('/admin/store/generate', head.session, { campaign: tainted.id, mode: 'full' })))[1];
  const cleanId = (await admin.from('campaigns').select('id').eq('slug', cleanSlug).single()).data.id;
  assert.equal((await admin.from('rules').select('id', { count: 'exact', head: true }).eq('campaign_id', cleanId)).count, 0, 'no private rules in the publishable copy');
  assert.equal((await admin.from('content').select('id', { count: 'exact', head: true }).eq('campaign_id', cleanId).eq('key', 'k')).count, 1, 'and the story is all there');
});

// ------------------------------------------------------------------ Parts 5 and 6

test('the custom campaign service is easy to find, shows three tiers from config, and runs from request to delivery', async () => {
  assert.deepEqual(COMMISSION_TIERS.map((t) => [t.name, t.cents, t.revisions, t.proMonths]), [['Starter', 5000, 1, 0], ['Full Build', 12500, 2, 3], ['Premium', 20000, 3, 12]]);
  // linked from everywhere the brief lists
  const link = (html) => new RegExp(`href="/custom[^"]*"[^>]*>(?:<[^>]+>)*${COMMISSIONS.label}`).test(html);
  const land = await page('/', null);
  assert.ok(link(land.text) && land.text.includes('Or have Bryce build it') && (land.text.match(/href="\/custom"/g) ?? []).length >= 3, 'landing: a section, a button and the footer');
  assert.ok(link((await page('/pricing', null)).text), 'pricing, beside the plans, and the signed-out navigation');
  for (const p of ['/campaigns', '/homebrew', '/upgrade']) assert.ok(link((await page(p, free.session)).text), 'signed-in navigation and footer on ' + p);
  assert.ok((await page('/campaigns', free.session)).text.includes('class="ccard service" href="/custom"'), 'a card on the DM dashboard');
  const create = await page('/new-campaign', free.session);
  assert.ok(create.text.includes('Build it myself') && create.text.includes('Have Bryce build it'), 'both options in campaign creation');

  // the page
  const pg = await page('/custom?tier=premium', null);
  assert.equal(pg.status, 200);
  for (const t of COMMISSION_TIERS) assert.ok(pg.text.includes(t.name) && pg.text.includes(tierPrice(t)) && pg.text.includes(`/custom?tier=${t.id}#request`), t.name);
  assert.ok(['$50', '$125', '$200', 'Request this', 'Includes 3 months of Pro', 'Includes 12 months of Pro', 'trailer', 'name="material"', 'name="refs"', 'name="players"', 'name="deadline"', 'name="pitch"', 'name="tone"'].every((x) => pg.text.includes(x)));
  assert.ok(/<option value="premium" selected/.test(pg.text), 'the form opens with the chosen tier selected');

  // the admin workflow
  const client = await makeUser('sclient', { free: true });
  const job = (await admin.from('commissions').insert({ name: 'Test Client', email: client.email, tier: 'full', pitch: 'A haunted lighthouse campaign for four players.', price_cents: 12500, pro_months: 3, revisions_included: 2 }).select('id, status').single()).data;
  assert.equal(job.status, 'requested');
  assert.equal(((await free.client.from('commissions').select('id')).data ?? []).length, 0);
  assert.ok((await free.client.rpc('deliver_commission', { p_id: job.id, c: job.id })).error, 'admin only');
  const biz = await page('/admin/business', head.session);
  assert.ok(['Test Client', 'Accept', 'Decline', 'Revision rounds used', 'Publish a homebrew pack', 'Generate a framework'].every((t) => biz.text.includes(t)));
  for (const s of ['accepted', 'paid', 'in_progress', 'in_review']) assert.equal((await head.client.from('commissions').update({ status: s }).eq('id', job.id)).error, null, s);
  assert.ok((await head.client.from('commissions').update({ status: 'building' }).eq('id', job.id).select()).error, 'only the listed statuses');
  await head.client.from('commissions').update({ status: 'accepted', revisions_used: 1 }).eq('id', job.id);
  // the client pays through the link: the request is marked paid
  const paid = await webhook({ id: 'evt_test_' + rnd(), type: 'checkout.session.completed', data: { object: { id: 'cs_test_' + rnd(), amount_total: 12500, metadata: { kind: 'commission', commission_id: job.id, user_id: '' } } } });
  if (paid.status !== 503) assert.equal((await admin.from('commissions').select('status').eq('id', job.id).single()).data.status, 'paid');
  // delivery: ownership moves, and the tier's Pro months start
  const built = await makeCampaign(head, 'The Lighthouse');
  await makeCampaign(client, 'Client\'s own first campaign');
  assert.equal((await client.client.rpc('my_plan')).data.pro, false);
  assert.equal((await head.client.rpc('deliver_commission', { p_id: job.id, c: built.id })).error, null);
  const now = (await admin.from('campaigns').select('owner_id, purchased').eq('id', built.id).single()).data;
  assert.deepEqual([now.owner_id, now.purchased], [client.id, true]);
  const plan = (await client.client.rpc('my_plan')).data;
  const months = (new Date(plan.gift_until) - Date.now()) / (30.4 * 86400000);
  assert.ok(plan.pro && months > 2.8 && months < 3.2, 'three months of Pro, from today');
  assert.equal((await admin.from('commissions').select('status').eq('id', job.id).single()).data.status, 'delivered');
  assert.equal((await client.client.from('entries').insert({ campaign_id: built.id, kind: 'beat', title: 'Mine', status: 'planned', live: false, vis: 'all' }).select('id')).error, null, 'with Pro they can make new Pro-only things in it');
  assert.ok((await page('/upgrade', client.session)).text.includes('included with your custom campaign'));
  await admin.from('commissions').delete().eq('id', job.id);
});
