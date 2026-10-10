// Commercial build: permissions, visibility and entitlements.
// Run with the app running:  npm test   (the local server needs STRIPE_WEBHOOK_SECRET=whsec_localtest
// for the billing tests; without it they are skipped).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { admin, anonClient, campaign, cleanup, invite, makeUser, page, SITE } from './helpers.mjs';
import { dbPlanConfig, FREE_LIMITS, FOUNDER } from '../src/config/plans.ts';

const WEBHOOK_SECRET = process.env.TEST_WEBHOOK_SECRET || 'whsec_localtest';
const rnd = () => Math.random().toString(36).slice(2, 8);
let C, free, pro, friend, outsider;

async function newCampaign(owner, title = 'Trial Realm') {
  const slug = 'trial-' + rnd();
  const made = await owner.client.from('campaigns').insert({ slug, title }).select('id, slug').single();
  if (made.error) return { error: made.error };
  await owner.client.from('sections').insert([{ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' }]);
  return made.data;
}
async function inviteTo(owner, campaignId, uses = 20) {
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  assert.equal((await owner.client.from('invites').insert({ campaign_id: campaignId, code, uses_left: uses })).error, null);
  return code;
}
const sign = (body, secret = WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
async function webhook(event, opts = {}) {
  const body = JSON.stringify({ livemode: false, ...event });
  return fetch(SITE + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': opts.signature ?? sign(body, opts.secret) }, body });
}
const myPlan = async (u) => (await u.client.rpc('my_plan')).data;

before(async () => {
  await cleanup();
  C = await campaign();
  [free, pro, friend, outsider] = await Promise.all([makeUser('free', { free: true }), makeUser('pro'), makeUser('friend', { free: true }), makeUser('outsider2', { free: true })]);
});
after(cleanup);

// ------------------------------------------------------------------ Phase 0: content sources

test('SRD content is open to everyone; everything that existed before is private', async () => {
  const srd = await free.client.from('entities').select('type, name, source').eq('source', 'srd').limit(1000);
  assert.ok(srd.data.length > 200, 'the SRD core set is there');
  for (const t of ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'item', 'monster']) assert.ok(srd.data.some((e) => e.type === t), 'SRD has a ' + t);
  assert.ok((await anonClient().from('entities').select('id').eq('source', 'srd').limit(5)).data.length === 5, 'signed-out visitors can read SRD entries');
  // nobody can write or alter SRD entries
  assert.ok((await pro.client.from('entities').insert({ owner_id: null, source: 'srd', type: 'race', slug: 'fake', name: 'Fake' }).select()).error);
  assert.equal(((await pro.client.from('entities').update({ name: 'Hacked' }).eq('source', 'srd').select('id')).data ?? []).length, 0);
  assert.equal(((await pro.client.from('entities').delete().eq('source', 'srd').select('id')).data ?? []).length, 0);
  // every rule row that existed before the commercial build is private
  const notPrivate = await admin.from('rules').select('id', { count: 'exact', head: true }).neq('source', 'private');
  assert.equal(notPrivate.count, 0);
  // and a new one is private unless something says otherwise
  const made = await admin.from('rules').insert({ campaign_id: C.id, kind: 'class', key: 'test-default-' + Date.now(), data: {} }).select('id, source').single();
  assert.equal(made.data.source, 'private');
  await admin.from('rules').delete().eq('id', made.data.id);
});

test('private rules stay with their owner: a member cannot copy them, another DM cannot see them', async (t) => {
  await free.client.rpc('join_campaign', { p_code: await invite(C.id) });
  const mine = await newCampaign(free);
  assert.ok(!mine.error);
  const rule = await admin.from('rules').insert({ campaign_id: C.id, kind: 'class', key: 'test-private-' + Date.now(), data: {} }).select('id').single();
  t.after(() => admin.from('rules').delete().eq('id', rule.data.id));
  assert.ok((await free.client.rpc('copy_campaign_rules', { src: C.id, dst: mine.id })).error, 'a player in the campaign cannot copy its rules');
  assert.equal((await outsider.client.from('rules').select('id').eq('campaign_id', C.id).limit(5)).data.length, 0, 'an outside account sees none of them');
  assert.equal((await admin.from('rules').select('id', { count: 'exact', head: true }).eq('campaign_id', mine.id)).count, 0);
  await free.client.rpc('delete_campaign', { c: mine.id });
});

test('/legal is public and carries the SRD attribution; public copy says fifth edition', async () => {
  const legal = await page('/legal', null);
  assert.equal(legal.status, 200);
  assert.ok(legal.text.includes('System Reference Document 5.1') && legal.text.includes('Creative Commons Attribution 4.0') && legal.text.includes('Terms of service') && legal.text.includes('Privacy'));
  for (const p of ['/', '/legal', '/pricing', '/sign-in', '/sign-up']) {
    const r = await page(p, null);
    if (r.status !== 200) continue;
    assert.ok(!/D&amp;D|D&D|Dungeons (&amp;|&|and) Dragons/i.test(r.text), p + ' does not use the trademark');
  }
});

// ------------------------------------------------------------------ Phase 1: invite links

test('an invite link takes a signed-out visitor to sign-up and a signed-in one straight into the campaign', async () => {
  const mine = await newCampaign(pro, 'Linked Realm');
  const code = await inviteTo(pro, mine.id);
  const out = await page('/join/' + code, null);
  assert.ok(out.status >= 300 && out.status < 400 && /\/sign-up\?next=%2Fjoin%2F/.test(out.location), 'signed out: sent to sign-up, keeping the code');
  const signup = await page('/sign-up?next=' + encodeURIComponent('/join/' + code), null);
  assert.ok(signup.status === 200 && signup.text.includes('name="next"') && signup.text.includes('/join/' + code));
  const into = await page('/join/' + code, friend.session);
  assert.ok(into.status >= 300 && into.status < 400 && into.location.endsWith('/c/' + mine.slug), 'signed in: lands on the campaign');
  assert.equal((await friend.client.from('campaigns').select('id').eq('id', mine.id)).data.length, 1);
  const bad = await page('/join/NOPE1234', friend.session);
  assert.ok(bad.status === 200 && bad.text.includes('did not work'));
});

// ------------------------------------------------------------------ Phase 2: plans

test('the limits in the database are the ones in src/config/plans.ts', async () => {
  const { data } = await admin.from('app_config').select('value').eq('key', 'plans').single();
  assert.deepEqual(JSON.parse(data.value), dbPlanConfig(), 'run: npm run sync-config');
});

test('nobody can give themselves a plan', async () => {
  assert.equal(((await free.client.from('profiles').update({ comp: true }).eq('id', free.id).select('id')).data ?? []).length, 0);
  assert.ok((await free.client.from('subscriptions').insert({ user_id: free.id, plan: 'founder' }).select()).error);
  assert.ok((await free.client.rpc('set_comp', { p_user: free.id, on_: true })).error, 'only the Head DM grants full access');
  assert.equal((await myPlan(free)).pro, false);
  assert.equal((await myPlan(pro)).pro, true);
  assert.equal(((await free.client.from('subscriptions').select('*')).data ?? []).length, 0, 'nobody reads other accounts\' subscriptions');
});

test('free: one campaign, and creating one needs no payment or special role', async () => {
  const first = await newCampaign(free, 'First');
  assert.ok(!first.error, 'a free account can create a campaign');
  const second = await newCampaign(free, 'Second');
  assert.ok(second.error && /upgrade:campaigns/.test(second.error.message), 'a second campaign is refused with an upgrade message');
  const prompt = await page('/new-campaign', free.session);
  assert.ok(prompt.status === 200 && prompt.text.includes('part of Pro') && prompt.text.includes('/upgrade'), 'the page explains and points to the upgrade page');
  // Pro: no limit
  for (let i = 0; i < 3; i++) assert.ok(!(await newCampaign(pro, 'Pro ' + i)).error);
});

test(`free: up to ${FREE_LIMITS.players} players in a campaign; Pro has no cap`, async () => {
  const { data: mine } = await free.client.from('campaigns').select('id').eq('owner_id', free.id).single();
  const code = await inviteTo(free, mine.id, 50);
  const players = await Promise.all(Array.from({ length: FREE_LIMITS.players + 1 }, (_, i) => makeUser('seat' + i, { free: true })));
  for (let i = 0; i < FREE_LIMITS.players; i++) assert.equal((await players[i].client.rpc('join_campaign', { p_code: code })).error, null, 'player ' + (i + 1) + ' joins');
  const over = await players[FREE_LIMITS.players].client.rpc('join_campaign', { p_code: code });
  assert.ok(over.error && /full/.test(over.error.message), 'the next one is told the campaign is full');
  assert.equal((await players[0].client.rpc('join_campaign', { p_code: code })).error, null, 'someone already in is not turned away');
  const full = await page('/join/' + code, players[FREE_LIMITS.players].session);
  assert.ok(full.text.includes('campaign is full'));
  // the same crowd fits in a Pro DM's campaign
  const big = await newCampaign(pro, 'Big table');
  const code2 = await inviteTo(pro, big.id, 50);
  for (const p of players) assert.equal((await p.client.rpc('join_campaign', { p_code: code2 })).error, null);
});

test(`free: ${FREE_LIMITS.homebrew} homebrew entries, Quick mode only; nothing made earlier is locked`, async () => {
  for (let i = 0; i < FREE_LIMITS.homebrew; i++) {
    const r = await free.client.from('entities').insert({ type: 'item', slug: 'thing-' + i, name: 'Thing ' + i, data: { desc: 'x' } }).select('id').single();
    assert.equal(r.error, null);
  }
  const over = await free.client.from('entities').insert({ type: 'item', slug: 'thing-x', name: 'One too many' }).select();
  assert.ok(over.error && /upgrade:homebrew/.test(over.error.message));
  const mine = await free.client.from('entities').select('id').eq('owner_id', free.id);
  assert.ok((await free.client.from('entities').update({ depth: 'advanced' }).eq('id', mine.data[0].id).select()).error, 'Advanced mode is refused on the free plan');
  assert.equal((await free.client.from('entities').update({ name: 'Renamed', data: { desc: 'still editable' } }).eq('id', mine.data[0].id).select('id')).data.length, 1, 'existing entries can still be edited');
  // an entry made on Pro in Advanced mode survives a downgrade and stays editable
  const adv = await pro.client.from('entities').insert({ type: 'race', slug: 'adv-' + rnd(), name: 'Deep Folk', depth: 'advanced' }).select('id').single();
  assert.equal(adv.error, null);
  await admin.from('profiles').update({ comp: false }).eq('id', pro.id);
  assert.equal((await pro.client.from('entities').update({ name: 'Deep Folk II' }).eq('id', adv.data.id).select('id')).data.length, 1);
  await admin.from('profiles').update({ comp: true }).eq('id', pro.id);
});

test('homebrew is private to its maker until attached to a campaign, and drafts stay hidden from players', async () => {
  const made = await pro.client.from('entities').insert({ type: 'race', slug: 'moth-' + rnd(), name: 'Mothfolk', status: 'draft', data: { desc: 'Dusty wings.' } }).select('id').single();
  assert.equal(made.error, null);
  const id = made.data.id;
  assert.equal((await outsider.client.from('entities').select('id').eq('id', id)).data.length, 0, 'another account cannot see it');
  assert.equal(((await outsider.client.from('entities').update({ name: 'x' }).eq('id', id).select('id')).data ?? []).length, 0);
  const camp = await newCampaign(pro, 'Moth Realm');
  await friend.client.rpc('join_campaign', { p_code: await inviteTo(pro, camp.id) });
  assert.equal((await pro.client.from('campaign_entities').insert({ campaign_id: camp.id, entity_id: id })).error, null);
  assert.equal((await friend.client.from('entities').select('id').eq('id', id)).data.length, 0, 'a draft is not shown to players');
  await pro.client.from('entities').update({ status: 'playtest' }).eq('id', id);
  assert.equal((await friend.client.from('entities').select('id').eq('id', id)).data.length, 1, 'past draft, players in the campaign see it');
  assert.equal((await outsider.client.from('entities').select('id').eq('id', id)).data.length, 0, 'and still nobody outside it');
  // DM-only attachment
  await pro.client.from('campaign_entities').update({ vis: 'dm' }).eq('campaign_id', camp.id).eq('entity_id', id);
  assert.equal((await friend.client.from('entities').select('id').eq('id', id)).data.length, 0);
  // nobody can attach an entry they do not own to their campaign
  const theirs = await newCampaign(friend, 'Friend Realm');
  assert.ok((await friend.client.from('campaign_entities').insert({ campaign_id: theirs.id, entity_id: id }).select()).error, 'someone else\'s homebrew cannot be attached');
});

test('billing webhooks: subscribe, renew, failed payment, cancel; a downgrade deletes nothing', async (t) => {
  const probe = await webhook({ id: 'evt_test_probe_' + rnd(), type: 'ping', data: { object: {} } });
  if (probe.status === 503) return t.skip('the server has no STRIPE_WEBHOOK_SECRET');
  assert.equal(probe.status, 200);
  const u = await makeUser('payer', { free: true });
  const one = await newCampaign(u, 'Kept');
  assert.ok(!one.error);

  // bad signature, and live-mode events, are refused
  assert.equal((await webhook({ id: 'evt_test_bad', type: 'checkout.session.completed', data: { object: {} } }, { secret: 'whsec_wrong' })).status, 400);
  assert.equal((await webhook({ id: 'evt_test_live_' + rnd(), type: 'checkout.session.completed', livemode: true, data: { object: { metadata: { user_id: u.id, kind: 'founder' } } } })).status, 400);
  assert.equal((await myPlan(u)).pro, false);

  // subscribe
  const sub = 'sub_test_' + rnd();
  const ev = { id: 'evt_test_' + rnd(), type: 'checkout.session.completed', data: { object: { id: 'cs_test_' + rnd(), customer: 'cus_test_' + rnd(), subscription: sub, amount_total: 700, metadata: { user_id: u.id, kind: 'pro_monthly' } } } };
  assert.equal((await webhook(ev)).status, 200);
  assert.equal((await myPlan(u)).pro, true, 'subscribed: Pro');
  assert.equal((await (await webhook(ev)).json()).repeated, true, 'the same event twice is handled once');
  const two = await newCampaign(u, 'Second, on Pro');
  assert.ok(!two.error, 'on Pro a second campaign is allowed');
  assert.equal((await u.client.from('content').insert({ campaign_id: two.id, section: 'overview', kind: 'html', key: 'a', title: 'a', body: { html: '<p>Kept text</p>' }, visibility: 'player' })).error, null);

  // renew
  const end = Math.floor(Date.now() / 1000) + 30 * 86400;
  await webhook({ id: 'evt_test_' + rnd(), type: 'invoice.paid', data: { object: { subscription: sub, lines: { data: [{ period: { end } }] } } } });
  assert.equal((await myPlan(u)).status, 'active');
  // failed payment: access is kept while Stripe retries
  await webhook({ id: 'evt_test_' + rnd(), type: 'invoice.payment_failed', data: { object: { subscription: sub } } });
  assert.deepEqual([(await myPlan(u)).status, (await myPlan(u)).pro], ['past_due', true]);
  // cancel
  await webhook({ id: 'evt_test_' + rnd(), type: 'customer.subscription.deleted', data: { object: { id: sub } } });
  assert.equal((await myPlan(u)).pro, false, 'cancelled: back to free');

  // nothing was deleted; the extra campaign is read-only, the first one still works
  assert.equal((await u.client.from('campaigns').select('id').eq('owner_id', u.id)).data.length, 2);
  assert.equal((await u.client.from('content').select('id').eq('campaign_id', two.id)).data.length, 1, 'its pages are still there to read');
  assert.equal(((await u.client.from('content').update({ title: 'changed' }).eq('campaign_id', two.id).select('id')).data ?? []).length, 0, 'the extra campaign cannot be changed');
  assert.ok((await u.client.from('content').insert({ campaign_id: two.id, section: 'overview', kind: 'html', key: 'b', body: {}, visibility: 'player' }).select()).error);
  assert.equal((await u.client.from('content').insert({ campaign_id: one.id, section: 'overview', kind: 'html', key: 'c', title: 'c', body: {}, visibility: 'player' })).error, null, 'the first campaign is still fully editable');
  const ro = await page(`/c/${two.slug}/overview`, u.session);
  assert.ok(ro.status === 200 && ro.text.includes('read-only') && ro.text.includes('Kept text'));
  assert.ok((await page(`/c/${one.slug}/overview`, u.session)).text.includes('Made with'), 'a free campaign carries the footer');

  // founder: lifetime, and it takes a seat
  const before = (await anonClient().rpc('founder_seats_left')).data;
  await webhook({ id: 'evt_test_' + rnd(), type: 'checkout.session.completed', data: { object: { id: 'cs_test_' + rnd(), customer: 'cus_test_' + rnd(), amount_total: 15000, metadata: { user_id: u.id, kind: 'founder' } } } });
  const plan = await myPlan(u);
  assert.deepEqual([plan.pro, plan.plan], [true, 'founder']);
  assert.equal((await anonClient().rpc('founder_seats_left')).data, before - 1, 'the seats-left counter went down by one');
  assert.ok(before <= FOUNDER.cap);
  assert.equal(((await u.client.from('content').update({ title: 'changed' }).eq('campaign_id', two.id).select('id')).data ?? []).length, 1, 'and the extra campaign unlocks again');
  assert.ok(!(await page(`/c/${one.slug}/overview`, u.session)).text.includes('Made with'), 'no footer on Pro');
  const up = await page('/upgrade', u.session);
  assert.ok(up.status === 200 && up.text.includes('founder lifetime access'));
});

test('the upgrade page lists the plans from the config, with the founder seats left', async () => {
  const up = await page('/upgrade', free.session);
  assert.ok(up.status === 200 && up.text.includes('$7 a month') && up.text.includes('$50 a year') && up.text.includes('$150 once') && /seats left/.test(up.text));
  assert.ok(up.text.includes('free plan'));
});
