// The core promises, as automated tests: what a player can and cannot get from the
// database and from the site, reveal stages, joining, live updates, and roles.
// They run against the dummy campaign in tests/fixtures (node scripts/seed-fixture.mjs).
// Run with the app running:  TEST_SITE_URL=<url> npm test   (defaults to http://localhost:3000)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { admin, anonClient, campaign, cleanup, cookieFor, invite, makeUser, page, wait, BUCKET, ROOT, SITE, SLUG, URL_, ANON } from './helpers.mjs';
import { DUMMY as seed, FACES, WORDS, RACE_IDS } from './fixtures/dummy-campaign.mjs';
import { blankV2 } from '../src/lib/rules/engine.ts';

// never, for any player, at any stage
const leaks = (text) => WORDS.dmOnly.filter((w) => text.includes(w));
// not while the stage is "before" (exact, case-sensitive)
const early = (text) => WORDS.afterOnly.filter((t) => text.includes(t));
const BEFORE_SLUG = FACES.before.slug;
const BEFORE_TITLE = FACES.before.title, AFTER_TITLE = FACES.after.title;
const AFTER_TABS = seed.sections.filter((s) => s.phase === 'after').map((s) => s.slug);
const lore = (id, phase) => seed.content.find((r) => r.kind === 'race-phase' && r.key === id && r.phase === phase).body;

let C, S, dm, player, other, outsider, originalPhase;

async function setPhase(phase) {
  const r = await admin.from('campaigns').update({ phase }).eq('id', C.id);
  assert.equal(r.error, null);
  C = await campaign();
  S = C.slug;
}

before(async () => {
  await cleanup();
  C = await campaign();
  originalPhase = C.phase;
  await setPhase('before');
  [dm, player, other, outsider] = await Promise.all([makeUser('dm', { dmOf: C.id }), makeUser('player'), makeUser('other'), makeUser('outsider')]);
  const code = await invite(C.id);
  for (const u of [player, other]) {
    const { error } = await u.client.rpc('join_campaign', { p_code: code });
    assert.equal(error, null);
  }
});

after(async () => {
  await setPhase(originalPhase);
  await cleanup();
});

// ------------------------------------------------------------------ direct Supabase queries as a player

test('player: direct queries for DM content return nothing', async () => {
  const all = await player.client.from('content').select('id, visibility, body, title').eq('campaign_id', C.id);
  assert.equal(all.error, null);
  assert.ok(all.data.length > 10, 'player should still get the player rows');
  assert.equal(all.data.filter((r) => r.visibility !== 'player').length, 0);
  assert.deepEqual(leaks(JSON.stringify(all.data)), []);
  const dmOnly = await player.client.from('content').select('id').eq('visibility', 'dm');
  assert.equal(dmOnly.data.length, 0);
  const secrets = await player.client.from('content').select('id').eq('section', 'secrets');
  assert.equal(secrets.data.length, 0);
  const sections = await player.client.from('sections').select('slug, audience');
  assert.ok(!sections.data.some((s) => s.audience === 'dm'));
});

test('player: direct queries for sessions, invites and private tables return nothing', async () => {
  for (const table of ['sessions', 'invites', 'app_config', 'campaign_faces', 'character_private', 'feedback']) {
    const r = await player.client.from(table).select('*');
    assert.equal((r.data ?? []).length, 0, table + ' must be empty for a player');
  }
});

test('player: cannot read another player\'s character, only the public card', async () => {
  const mine = await other.client.from('characters').insert({ owner: other.id, campaign_id: C.id, data: { ...blankV2(), name: 'Secret Keeper', race: 'Reedfolk', cls: 'Wizard', level: 3, notes: 'private note' } }).select('id').single();
  assert.equal(mine.error, null);
  const peek = await player.client.from('characters').select('*').eq('id', mine.data.id);
  assert.equal(peek.data.length, 0);
  const all = await player.client.from('characters').select('*').eq('campaign_id', C.id);
  assert.ok(all.data.every((r) => r.owner === player.id));
  const cards = await player.client.rpc('party_cards', { c: C.id });
  assert.equal(cards.error, null);
  const card = cards.data.find((x) => x.id === mine.data.id);
  assert.ok(card, 'party card is visible');
  assert.deepEqual(Object.keys(card).sort(), ['cls', 'id', 'level', 'name', 'owner', 'player', 'race']);
  assert.ok(!/private note/i.test(JSON.stringify(card)));
  const hack = await player.client.from('characters').update({ data: { name: 'hacked' } }).eq('id', mine.data.id).select('id');
  assert.equal((hack.data ?? []).length, 0);
});

test('player: cannot change their own role, or write DM tables', async () => {
  await player.client.from('profiles').update({ role: 'dm' }).eq('id', player.id);
  const me = await admin.from('profiles').select('role').eq('id', player.id).single();
  assert.equal(me.data.role, 'player');
  const ins = await player.client.from('content').insert({ campaign_id: C.id, section: 'overview', kind: 'html', key: 'x', body: {}, visibility: 'player' }).select('id');
  assert.ok(ins.error || (ins.data ?? []).length === 0);
  const upd = await player.client.from('campaigns').update({ phase: 'after' }).eq('id', C.id).select('id');
  assert.equal((upd.data ?? []).length, 0);
  const face = await player.client.from('campaign_faces').insert({ campaign_id: C.id, phase: 'x', slug: 'hacked-face', title: 'x' }).select();
  assert.ok(face.error || (face.data ?? []).length === 0);
  const mem = await outsider.client.from('memberships').insert({ user_id: outsider.id, campaign_id: C.id }).select();
  assert.ok(mem.error || (mem.data ?? []).length === 0, 'cannot join without a code');
});

test('signed-out visitors get nothing from the API, except the public demo campaign as a player sees it', async () => {
  const anon = anonClient();
  for (const table of ['rules', 'characters', 'sessions', 'media', 'profiles', 'campaign_faces', 'character_private']) {
    const r = await anon.from(table).select('*').limit(1);
    assert.equal((r.data ?? []).length, 0, table);
  }
  // The one thing a visitor can read is the campaign flagged as the demo (never this one).
  const demo = ((await admin.from('campaigns').select('id').eq('is_demo', true)).data ?? []).map((c) => c.id);
  const camps = (await anon.from('campaigns').select('id')).data ?? [];
  assert.ok(camps.every((c) => demo.includes(c.id)) && !camps.some((c) => c.id === C.id), 'campaigns');
  for (const table of ['content', 'sections']) {
    const r = (await anon.from(table).select('*').limit(2000)).data ?? [];
    assert.ok(r.every((x) => demo.includes(x.campaign_id)), table + ': only the demo');
    assert.equal(r.filter((x) => x.campaign_id === C.id).length, 0, table);
    if (table === 'content') assert.ok(r.every((x) => x.visibility === 'player' && !x.hidden), 'and only its player rows');
  }
});

// ------------------------------------------------------------------ what a player's browser receives

const playerRoutes = async () => {
  const sections = (await player.client.from('sections').select('slug').eq('campaign_id', C.id)).data.map((s) => s.slug);
  return { sections, routes: [...sections.map((s) => `/c/${S}/${s}`), `/c/${S}/peoples?race=${RACE_IDS[0]}`, `/c/${S}`, '/campaigns', '/characters', '/account'] };
};

test('player: no campaign route delivers DM words, in HTML or in the page data', async () => {
  const { sections, routes } = await playerRoutes();
  assert.deepEqual(sections.sort(), ['campaign', 'combat', 'overview', 'peoples', 'sheet']);
  await player.client.from('characters').insert({ owner: player.id, campaign_id: C.id, data: { ...blankV2(), name: 'Leak Tester', t: 1 } });
  for (const r of routes) {
    const html = await page(r, player.session);
    assert.ok(html.status === 200 || (r === `/c/${S}` && html.status >= 300 && html.status < 400), r + ' should load for a player');
    assert.deepEqual(leaks(html.text), [], 'leak in HTML of ' + r);
    const res = await fetch(SITE + r, { headers: { cookie: cookieFor(player.session), RSC: '1' }, redirect: 'manual' });
    assert.deepEqual(leaks(await res.text()), [], 'leak in page data of ' + r);
  }
  const overview = await page(`/c/${S}/overview`, player.session);
  assert.ok(overview.text.includes(BEFORE_TITLE) && overview.text.includes('Queen of Reeds'), 'player overview has the before wording');
});

test('player: DM routes are closed', async () => {
  for (const r of [`/c/${S}/secrets`, `/c/${S}/sessions`, `/c/${S}/players`, `/c/${S}/session/0`]) {
    const res = await page(r, player.session);
    assert.equal(res.status, 404, r);
  }
  for (const r of [`/c/${S}/manage`, `/c/${S}/edit/overview`, '/admin']) {
    const res = await page(r, player.session);
    assert.ok(res.status >= 300 && res.status < 400, r + ' should redirect a player away');
  }
});

test('no JavaScript or CSS bundle contains DM words or anything held back until after', async () => {
  const dir = path.join(ROOT, '.next', 'static');
  if (!fs.existsSync(dir)) return; // only present after a build
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(dir).filter((x) => /\.(js|css)$/.test(x))) {
    const text = fs.readFileSync(f, 'utf8');
    assert.deepEqual(leaks(text), [], 'leak in bundle ' + path.basename(f));
    assert.deepEqual(early(text), [], 'after-only word in bundle ' + path.basename(f));
  }
});

test('DM: sees everything, with the real title and a label on what players cannot see yet', async () => {
  const overview = await page(`/c/${S}/overview`, dm.session);
  assert.equal(overview.status, 200);
  assert.ok(overview.text.includes('DM only: what really happened') && overview.text.includes('Odrin Vale'));
  assert.ok(overview.text.includes(AFTER_TITLE) && overview.text.includes(BEFORE_TITLE), 'real title with the before title beside it');
  assert.ok(overview.text.includes(WORDS.afterLabel));
  assert.ok(overview.text.includes(WORDS.beforeLabel));
  assert.ok(overview.text.includes('<title>' + AFTER_TITLE));
  for (const r of ['secrets', ...AFTER_TABS, 'session/0', 'players', 'manage']) assert.equal((await page(`/c/${S}/${r}`, dm.session)).status, 200, r);
  const races = await page(`/c/${S}/peoples?race=reedfolk`, dm.session);
  assert.ok(races.text.includes(lore('reedfolk', 'after').history) && races.text.includes(lore('reedfolk', 'before').history), 'the DM sees both histories');
  // the DM can use the real address too: it sends them to the current one
  const real = await page(`/c/${SLUG}/overview`, dm.session);
  assert.ok(real.status >= 300 && real.status < 400 && real.location.endsWith('/c/' + S));
  const hub = await page('/campaigns', dm.session);
  assert.ok(hub.text.includes(AFTER_TITLE) && hub.text.includes(BEFORE_TITLE));
});

test('DM: "view as player" receives exactly the player version for the current phase', async () => {
  const cookie = 'dbb-view-as-player=1';
  const res = await page(`/c/${S}/overview`, dm.session, cookie);
  assert.equal(res.status, 200);
  assert.deepEqual(leaks(res.text), []);
  assert.deepEqual(early(res.text), []);
  assert.ok(res.text.includes(BEFORE_TITLE) && !/Hidden from players/.test(res.text));
  for (const r of ['secrets', ...AFTER_TABS]) assert.equal((await page(`/c/${S}/${r}`, dm.session, cookie)).status, 404, r);
});

// ------------------------------------------------------------------ signed out

test('signed out: every page but the landing and sign-in pages redirects to sign-in', async () => {
  assert.equal((await page(`/c/${S}/media/v/reedfolk.jpg`, null)).status, 401, 'a picture is refused outright');
  for (const r of ['/campaigns', `/c/${S}`, `/c/${S}/overview`, '/characters']) {
    const res = await page(r, null);
    assert.ok(res.status >= 300 && res.status < 400 && /sign-in/.test(res.location || ''), r);
  }
  assert.equal((await page('/', null)).status, 200);
  assert.equal((await page('/sign-in', null)).status, 200);
});

// ------------------------------------------------------------------ stages and pictures

test('phase "before": a player cannot obtain a working URL for any _after file', async () => {
  const afterFiles = (await admin.from('media').select('key, path').eq('campaign_id', C.id).eq('phase', 'after')).data;
  assert.ok(afterFiles.length >= 3, 'the fixture has its _after files');
  const rows = await player.client.from('media').select('path, phase').eq('campaign_id', C.id);
  assert.ok(rows.data.length > 0);
  assert.ok(!rows.data.some((r) => r.phase === 'after' || /_after\./.test(r.path)));
  assert.ok(!rows.data.some((r) => r.path.includes(SLUG)), 'storage paths do not name the campaign');
  for (const f of afterFiles) {
    const signed = await player.client.storage.from(BUCKET).createSignedUrl(f.path, 60);
    assert.ok(signed.error || !signed.data?.signedUrl, 'signed ' + f.path);
    const dl = await player.client.storage.from(BUCKET).download(f.path);
    assert.ok(dl.error, 'downloaded ' + f.path);
    for (const u of [`${URL_}/storage/v1/object/public/${BUCKET}/${f.path}`, `${URL_}/storage/v1/object/authenticated/${BUCKET}/${f.path}`]) {
      const res = await fetch(u, { headers: { apikey: ANON, authorization: 'Bearer ' + player.session.access_token } });
      assert.ok(res.status >= 400, u + ' answered ' + res.status);
    }
    const viaApp = await page(`/c/${S}/media/${f.key}?phase=after`, player.session);
    assert.equal(viaApp.status, 302);
    assert.ok(/_before\./.test(viaApp.location) && !/_after\./.test(viaApp.location), 'route leaked ' + viaApp.location);
    assert.ok(!viaApp.location.includes(SLUG), 'the signed URL does not name the campaign');
  }
  const list = await player.client.storage.from(BUCKET).list(C.id + '/v');
  assert.equal((list.data ?? []).length, 0);
  const ok = await page(`/c/${S}/media/v/kilnborn.jpg`, player.session);
  assert.equal(ok.status, 302);
  const file = await fetch(ok.location, { headers: { range: 'bytes=0-99' } });
  assert.ok(file.status === 200 || file.status === 206);
  assert.equal((await page(`/c/${S}/media/v/reedfolk.jpg`, outsider.session)).status, 404);
});

test('phase "before": players get no after-only tabs, rows, title, or address', async () => {
  assert.equal(S, BEFORE_SLUG);
  // what the database gives a player directly
  const mine = await player.client.from('campaigns').select('*');
  assert.equal(mine.data.length, 1);
  assert.deepEqual([mine.data[0].title, mine.data[0].slug], [BEFORE_TITLE, BEFORE_SLUG]);
  assert.deepEqual(early(JSON.stringify(mine.data)), []);
  const tabs = (await player.client.from('sections').select('slug, title, phase')).data;
  assert.ok(!tabs.some((t) => AFTER_TABS.includes(t.slug) || t.phase === 'after'));
  const content = (await player.client.from('content').select('*').eq('campaign_id', C.id)).data;
  assert.equal(content.filter((r) => r.phase === 'after').length, 0);
  assert.equal(content.filter((r) => AFTER_TABS.includes(r.section)).length, 0);
  assert.equal(content.filter((r) => r.kind === 'faction').length, 0, 'factions are not queryable');
  assert.deepEqual(early(JSON.stringify(content)), [], 'player-readable content');
  assert.deepEqual(early(JSON.stringify((await player.client.from('media').select('*')).data)), []);
  assert.equal((await player.client.rpc('campaign_alias', { p_slug: SLUG })).data, null, 'the real address is not confirmed to a player');
  assert.equal((await player.client.rpc('join_campaign', { p_code: await invite(C.id) })).data, BEFORE_SLUG);

  // what the site gives a player
  for (const r of [...AFTER_TABS.map((t) => `/c/${S}/${t}`), `/c/${SLUG}`, `/c/${SLUG}/overview`, `/c/${SLUG}/peoples`, `/c/${SLUG}/media/v/reedfolk.jpg`]) {
    assert.equal((await page(r, player.session)).status, 404, r + ' must be not-found for a player');
  }
  const { routes } = await playerRoutes();
  for (const r of routes) {
    const html = await page(r, player.session);
    assert.deepEqual(early(html.text + ' ' + (html.location || '')), [], 'after-only words in HTML of ' + r);
    const res = await fetch(SITE + r, { headers: { cookie: cookieFor(player.session), RSC: '1' }, redirect: 'manual' });
    assert.deepEqual(early(await res.text()), [], 'after-only words in page data of ' + r);
    if (r.startsWith('/c/') && html.status === 200) {
      assert.ok(!new RegExp(`href="[^"]*/(${AFTER_TABS.join('|')})"`).test(html.text), 'no after-only tab in the tab bar of ' + r);
      assert.ok(html.text.includes('<title>' + BEFORE_TITLE), 'browser tab title on ' + r);
    }
  }
  const hub = await page('/campaigns', player.session);
  assert.ok(hub.text.includes(BEFORE_TITLE) && hub.text.includes('This year the Queen of Reeds opens it herself.'));
  const overview = await page(`/c/${S}/overview`, player.session);
  assert.ok(overview.text.includes('For 3 to 5 players. Level 3.'));
  assert.ok(!/The empty seat|Who holds the valley/.test(overview.text));
  const camp = await page(`/c/${S}/campaign`, player.session);
  assert.ok(camp.text.includes('Opening night') && camp.text.includes('Table rules') && !camp.text.includes('The road ahead'));
});

test('phase "before": each race shows the present-tense history, not the past-tense one', async () => {
  assert.equal(RACE_IDS.length, 3);
  for (const id of RACE_IDS) {
    const now = lore(id, 'before'), later = lore(id, 'after');
    const res = await page(`/c/${S}/peoples?race=${id}`, player.session);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('<h4>History </h4><p>' + now.history.replace(/'/g, '&#39;') + '</p>') || res.text.includes('<h4>History </h4><p>' + now.history + '</p>'), id + ': before history under "History"');
    assert.ok(!res.text.includes(later.history), id + ': past-tense history must not be sent');
    if (later.now) assert.ok(!res.text.includes(later.now), id + ': "Now" must not be sent');
    assert.ok(!res.text.includes(later.part), id + ': their part in the story must not be sent');
    for (const k of later.keys ?? []) if (!(now.keys ?? []).includes(k)) assert.ok(!res.text.includes(k), `${id}: key line "${k}" must not be sent`);
  }
});

// ------------------------------------------------------------------ the flip

test('flip to "after": everything appears; flip back: it all hides again', async () => {
  await setPhase('after');
  try {
    assert.equal(S, SLUG);
    const c = (await player.client.from('campaigns').select('title, slug, tagline')).data[0];
    assert.deepEqual([c.title, c.slug], [AFTER_TITLE, SLUG]);
    assert.ok(c.tagline.startsWith('The Queen of Reeds has vanished'));
    const tabs = (await player.client.from('sections').select('slug')).data.map((t) => t.slug).sort();
    assert.deepEqual(tabs, ['campaign', 'combat', 'factions', 'overview', 'peoples', 'sheet', 'the-seat']);
    // the before address now redirects
    const old = await page(`/c/${BEFORE_SLUG}/overview`, player.session);
    assert.ok(old.status >= 300 && old.status < 400 && old.location.endsWith('/c/' + SLUG), 'before address redirects');
    const overview = await page(`/c/${S}/overview`, player.session);
    assert.ok(overview.text.includes('<title>' + AFTER_TITLE) && overview.text.includes('The empty seat') && overview.text.includes('Who holds the valley') && overview.text.includes('The Reedwardens'));
    assert.ok(!overview.text.includes('One evening in the valley') && !/Hidden from players|Shown to players/.test(overview.text));
    assert.deepEqual(leaks(overview.text), []);
    for (const r of AFTER_TABS) { const res = await page(`/c/${S}/${r}`, player.session); assert.equal(res.status, 200, r); assert.deepEqual(leaks(res.text), []); }
    const camp = await page(`/c/${S}/campaign`, player.session);
    assert.ok(camp.text.includes('The road ahead') && !camp.text.includes('Opening night'));
    const reed = await page(`/c/${S}/peoples?race=reedfolk`, player.session);
    assert.ok(reed.text.includes(lore('reedfolk', 'after').history) && !reed.text.includes(lore('reedfolk', 'before').history) && reed.text.includes('Their part in the story'));
    // pictures follow the stage too
    const via = await page(`/c/${S}/media/v/kilnborn.jpg`, player.session);
    assert.ok(/_after\./.test(via.location));
  } finally { await setPhase('before'); }

  // back to before: hidden again
  assert.equal(S, BEFORE_SLUG);
  assert.equal((await page(`/c/${SLUG}/overview`, player.session)).status, 404);
  for (const t of AFTER_TABS) assert.equal((await page(`/c/${S}/${t}`, player.session)).status, 404);
  assert.deepEqual(early((await page(`/c/${S}/overview`, player.session)).text), []);
  assert.ok(/_before\./.test((await page(`/c/${S}/media/v/kilnborn.jpg`, player.session)).location));
});

// ------------------------------------------------------------------ joining

test('a player with no membership sees no campaigns', async () => {
  const r = await outsider.client.from('campaigns').select('*');
  assert.equal(r.data.length, 0);
  for (const table of ['content', 'rules', 'media', 'sections']) assert.equal((await outsider.client.from(table).select('id').limit(5)).data.length, 0, table);
  const html = await page('/campaigns', outsider.session);
  assert.equal(html.status, 200);
  assert.ok(!html.text.includes(AFTER_TITLE) && !html.text.includes(BEFORE_TITLE) && /not in a campaign yet/.test(html.text));
  assert.equal((await page(`/c/${S}/overview`, outsider.session)).status, 404);
  assert.equal((await outsider.client.rpc('campaign_alias', { p_slug: BEFORE_SLUG })).data, null);
  const bad = await outsider.client.rpc('join_campaign', { p_code: 'NOPE1234' });
  assert.ok(bad.error);
});

test('invite codes: uses run out, revoked codes fail', async () => {
  const one = await invite(C.id, 1);
  const a = await makeUser('joiner-a'), b = await makeUser('joiner-b');
  assert.equal((await a.client.rpc('join_campaign', { p_code: one.toLowerCase() })).data, S);
  assert.ok((await b.client.rpc('join_campaign', { p_code: one })).error, 'used-up code must fail');
  const two = await invite(C.id, 5);
  await dm.client.from('invites').update({ revoked: true }).eq('code', two);
  assert.ok((await b.client.rpc('join_campaign', { p_code: two })).error, 'revoked code must fail');
  await dm.client.from('memberships').delete().eq('campaign_id', C.id).eq('user_id', a.id);
  assert.equal((await a.client.from('campaigns').select('id')).data.length, 0);
});

// ------------------------------------------------------------------ the whole player journey

test('sign up, join by code, build a character, edit it: the DM sees it live', async () => {
  const fresh = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `signup-${Date.now()}@test.dungeons.invalid`;
  const up = await fresh.auth.signUp({ email, password: 'correct-horse-battery-' + Date.now(), options: { data: { display_name: 'Test Newcomer' } } });
  assert.equal(up.error, null);
  assert.ok(up.data.session, 'sign-up signs the player in (no email confirmation needed)');
  const me = await fresh.from('profiles').select('role, display_name').eq('id', up.data.user.id).single();
  assert.deepEqual(me.data, { role: 'player', display_name: 'Test Newcomer' });
  assert.equal((await fresh.from('campaigns').select('id')).data.length, 0, 'no campaigns before joining');

  const code = await invite(C.id, 1);
  assert.equal((await fresh.rpc('join_campaign', { p_code: code })).data, S);
  assert.equal((await fresh.from('campaigns').select('id')).data.length, 1);
  assert.equal((await page(`/c/${S}/sheet`, up.data.session)).status, 200);

  const events = [];
  const dmLive = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await dmLive.auth.setSession({ access_token: dm.session.access_token, refresh_token: dm.session.refresh_token });
  await dmLive.realtime.setAuth(dm.session.access_token);
  const ready = new Promise((resolve, reject) => {
    dmLive.channel('party-test').on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: 'campaign_id=eq.' + C.id }, (p) => events.push(p))
      .subscribe((s) => { if (s === 'SUBSCRIBED') resolve(); if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(s)); });
  });
  await ready;
  await wait(4000); // Realtime needs a moment after SUBSCRIBED before it delivers table changes

  const ins = await fresh.from('characters').insert({ owner: up.data.user.id, campaign_id: C.id, data: { ...blankV2(), name: '' } }).select('id').single();
  assert.equal(ins.error, null);
  const save = await fresh.from('characters').update({ data: { ...blankV2(), t: Date.now(), name: 'Brannoch', level: 3, hp: 24, hpMax: 24 } }).eq('id', ins.data.id).select('id');
  assert.equal(save.data.length, 1);
  const edit = await fresh.from('characters').update({ data: { ...blankV2(), t: Date.now(), name: 'Brannoch', level: 3, hp: 17, hpMax: 24 } }).eq('id', ins.data.id).select('id');
  assert.equal(edit.data.length, 1);

  for (let i = 0; i < 100 && !events.some((e) => e.new?.data?.hp === 17); i++) await wait(250);
  await dmLive.removeAllChannels();
  assert.ok(events.some((e) => e.eventType === 'INSERT' && e.new.id === ins.data.id), 'DM received the new character live');
  assert.ok(events.some((e) => e.eventType === 'UPDATE' && e.new.data.hp === 17), 'DM received the edit live, without a reload');

  const full = await dm.client.from('characters').select('data').eq('id', ins.data.id).single();
  assert.equal(full.data.data.hp, 17);
  const tab = await page(`/c/${S}/players`, dm.session);
  assert.equal(tab.status, 200);
  assert.ok(/Brannoch/.test(tab.text));
  const sheet = await page(`/c/${S}/sheet`, up.data.session);
  assert.equal(sheet.status, 200);
  assert.deepEqual(leaks(sheet.text), []);
});

test('a player listening on Realtime does not receive other players\' sheets', async () => {
  const events = [];
  const spy = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await spy.auth.setSession({ access_token: player.session.access_token, refresh_token: player.session.refresh_token });
  await spy.realtime.setAuth(player.session.access_token);
  await new Promise((resolve, reject) => {
    spy.channel('spy').on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, (p) => events.push(p))
      .subscribe((s) => { if (s === 'SUBSCRIBED') resolve(); if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(s)); });
  });
  await wait(1500);
  const row = await other.client.from('characters').insert({ owner: other.id, campaign_id: C.id, data: { ...blankV2(), name: 'Hidden' } }).select('id').single();
  await other.client.from('characters').update({ data: { ...blankV2(), name: 'Hidden', level: 2 } }).eq('id', row.data.id);
  await wait(4000);
  await spy.removeAllChannels();
  assert.ok(!events.some((e) => e.new && e.new.id === row.data.id), 'another player\'s sheet arrived over Realtime');
});

// ------------------------------------------------------------------ the DM edits, the player sees

test('the DM edits a content row and the player sees the change', async () => {
  const row = (await dm.client.from('content').select('id, body').eq('campaign_id', C.id).eq('section', 'campaign').eq('kind', 'plate').eq('visibility', 'player').ilike('title', 'Table rules').single()).data;
  const marker = 'Edited by the test ' + Date.now();
  const edited = { ...row.body, html: row.body.html.replace('</ul>', `<li>${marker}</li></ul>`) };
  try {
    const r = await dm.client.from('content').update({ body: edited }).eq('id', row.id).select('id');
    assert.equal(r.data.length, 1);
    const seen = await player.client.from('content').select('body').eq('id', row.id).single();
    assert.ok(seen.data.body.html.includes(marker));
    const html = await page(`/c/${S}/campaign`, player.session);
    assert.ok(html.text.includes(marker), 'the player\'s page shows the edit');
    await dm.client.from('content').update({ hidden: true }).eq('id', row.id);
    assert.equal((await player.client.from('content').select('id').eq('id', row.id)).data.length, 0);
    assert.ok(!(await page(`/c/${S}/campaign`, player.session)).text.includes(marker));
    // tagging it for a later phase hides it the same way
    await dm.client.from('content').update({ hidden: false, phase: 'after' }).eq('id', row.id);
    assert.equal((await player.client.from('content').select('id').eq('id', row.id)).data.length, 0);
  } finally {
    await admin.from('content').update({ body: row.body, hidden: false, phase: null }).eq('id', row.id);
  }
});

// ------------------------------------------------------------------ hub artwork stays in the hub

test('the hall background is on every signed-in hub tab, and nowhere else', async () => {
  const hall = (t) => /class="hall-bg"/.test(t) && /\/hub\/hall-wide\.webp/.test(t) && /\/hub\/hall-tall\.webp/.test(t);
  for (const r of ['/campaigns', '/characters', '/account', '/new-campaign', '/feedback', '/help/campaign-format']) {
    const res = await page(r, player.session);
    assert.equal(res.status, 200, r);
    assert.ok(hall(res.text), r + ' should have the hall background');
    assert.deepEqual(leaks(res.text), [], r);
  }
  const dmNew = await page('/new-campaign', dm.session);
  assert.ok(hall(dmNew.text), 'New campaign should have the hall background');
  for (const [r, s] of [['/', null], ['/sign-in', null], ['/sign-up', null], [`/c/${S}/overview`, player.session], [`/c/${S}/sheet`, player.session]]) {
    const res = await page(r, s);
    assert.equal(res.status, 200, r);
    assert.ok(!/hall-bg|hall-wide|hall-tall/.test(res.text), r + ' must not have the hall background');
  }
  assert.ok(/doorway-wide\.webp/.test((await page('/', null)).text), 'the landing page keeps the doorway');
});

// ------------------------------------------------------------------ roles: everyone can be a DM in their own campaign

const rnd = () => Math.random().toString(36).slice(2, 8);
async function ownCampaign(owner, title = 'Test Realm') {
  const slug = 'test-' + rnd();
  const made = await owner.client.from('campaigns').insert({ slug, title, tagline: 'A throwaway campaign.' }).select('id, owner_id, slug').single();
  assert.equal(made.error, null);
  assert.equal(made.data.owner_id, owner.id, 'whoever creates a campaign owns it');
  const id = made.data.id;
  const s = await owner.client.from('sections').insert([
    { campaign_id: id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' },
    { campaign_id: id, slug: 'secrets', title: 'Secrets', sort: 20, audience: 'dm', kind: 'content' },
  ]);
  assert.equal(s.error, null);
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  assert.equal((await owner.client.from('invites').insert({ campaign_id: id, code, uses_left: 5 })).error, null);
  return { id, slug, code };
}

test('any account can create a campaign and is its DM; in other campaigns it is only a player', async () => {
  const mine = await ownCampaign(player);
  const rows = await player.client.from('content').insert([
    { campaign_id: mine.id, section: 'overview', kind: 'html', key: 'hello', sort: 10, title: 'hello', visibility: 'player',
      body: { html: '<p>Hello players</p><script>window.pwned=1</script><img src="x" onerror="window.pwned=2"><a href="javascript:window.pwned=3" onclick="window.pwned=4">link</a><iframe src="https://example.com"></iframe>' } },
    { campaign_id: mine.id, section: 'overview', kind: 'secret', key: 'whodunnit', sort: 20, title: 'DM only', visibility: 'dm', body: { tag: 'DM only', html: '<p>The butler did it</p>' } },
  ]);
  assert.equal(rows.error, null);

  // another account joins as a player
  assert.equal((await other.client.rpc('join_campaign', { p_code: mine.code })).data, mine.slug);
  const seen = await other.client.from('content').select('visibility, body').eq('campaign_id', mine.id);
  assert.ok(seen.data.length === 1 && seen.data[0].visibility === 'player');
  assert.ok(!JSON.stringify(seen.data).includes('butler'));
  assert.equal((await other.client.from('sections').select('slug').eq('campaign_id', mine.id)).data.length, 1);
  const theirs = await page(`/c/${mine.slug}/overview`, other.session);
  assert.equal(theirs.status, 200);
  assert.ok(theirs.text.includes('Hello players') && !theirs.text.includes('butler') && !theirs.text.includes('Edit this page'));
  // what a DM wrote is made safe before it reaches a player
  assert.ok(!/<script>window\.pwned|onerror=|onclick=|javascript:window|<iframe|<img src="x"/.test(theirs.text), 'unsafe markup must be stripped');
  assert.equal((await page(`/c/${mine.slug}/secrets`, other.session)).status, 404);
  const man = await page(`/c/${mine.slug}/manage`, other.session);
  assert.ok(man.status >= 300 && man.status < 400, 'a player cannot open Manage');
  // and a player cannot change anything in it
  assert.equal(((await other.client.from('content').update({ title: 'x' }).eq('campaign_id', mine.id).select('id')).data ?? []).length, 0);
  assert.ok((await other.client.from('content').insert({ campaign_id: mine.id, section: 'overview', kind: 'html', key: 'z', body: {}, visibility: 'player' }).select()).error);
  assert.equal(((await other.client.from('campaigns').update({ title: 'x' }).eq('id', mine.id).select('id')).data ?? []).length, 0);
  assert.equal(((await other.client.from('invites').select('id').eq('campaign_id', mine.id)).data ?? []).length, 0);

  // the owner is the DM here
  const dmView = await page(`/c/${mine.slug}/overview`, player.session);
  assert.ok(dmView.text.includes('The butler did it') && dmView.text.includes('Edit this page') && dmView.text.includes('Manage'));
  assert.equal((await page(`/c/${mine.slug}/manage`, player.session)).status, 200);
  const members = await player.client.rpc('campaign_members', { c: mine.id });
  assert.ok(members.data.length === 1 && members.data[0].display_name === 'Test other' && !('email' in members.data[0]));
  assert.equal(((await other.client.rpc('campaign_members', { c: mine.id })).data ?? []).length, 0, 'players cannot list members');
  // ...and still only a player in the campaign they joined
  assert.equal((await player.client.from('content').select('id').eq('campaign_id', C.id).eq('visibility', 'dm')).data.length, 0);
  assert.equal((await page(`/c/${S}/manage`, player.session)).status >= 300, true);

  // people outside see nothing of it, including the Head DM
  assert.equal((await outsider.client.from('campaigns').select('id').eq('id', mine.id)).data.length, 0);
  assert.equal((await page(`/c/${mine.slug}/overview`, outsider.session)).status, 404);
  const head = await makeUser('head', { head: true });
  assert.equal((await head.client.from('content').select('id').eq('campaign_id', mine.id)).data.length, 0, 'the Head DM cannot read another DM\'s content');
  assert.equal((await page(`/c/${mine.slug}/overview`, head.session)).status, 404);
  const all = await head.client.rpc('admin_campaigns');
  assert.ok(all.data.some((c) => c.id === mine.id) && all.data.some((c) => c.id === C.id), 'the Head DM can list every campaign');
  assert.equal(((await player.client.rpc('admin_campaigns')).data ?? []).length, 0, 'nobody else can');

  // ...until the Head DM unhides it. Hidden: not even its title or address.
  const hiddenRow = all.data.find((c) => c.id === mine.id);
  assert.ok(hiddenRow.shown === false && hiddenRow.title === '' && hiddenRow.slug === '', 'a hidden campaign is listed without its title or address');
  const hiddenAdmin = await page('/admin', head.session);
  assert.ok(hiddenAdmin.status === 200 && hiddenAdmin.text.includes('Hidden campaign') && hiddenAdmin.text.includes('Unhide') && !hiddenAdmin.text.includes('Test Realm') && !hiddenAdmin.text.includes(mine.slug));
  for (const t of ['campaign_faces', 'sections', 'rules', 'characters', 'sessions', 'memberships']) {
    assert.equal(((await head.client.from(t).select('*').eq('campaign_id', mine.id)).data ?? []).length, 0, `hidden: no ${t} rows for the Head DM`);
  }
  // only a Head DM can unhide
  assert.ok((await outsider.client.from('head_reveals').insert({ campaign_id: mine.id }).select()).error, 'nobody else can unhide a campaign');
  assert.ok((await other.client.from('head_reveals').insert({ campaign_id: mine.id }).select()).error);
  assert.equal(((await outsider.client.from('head_reveals').select('*')).data ?? []).length, 0);
  assert.equal((await head.client.from('head_reveals').insert({ campaign_id: mine.id })).error, null);
  // unhidden: reads what its DM reads
  const shownRow = (await head.client.rpc('admin_campaigns')).data.find((c) => c.id === mine.id);
  assert.ok(shownRow.shown === true && shownRow.title === 'Test Realm' && shownRow.slug === mine.slug);
  const headSeen = await head.client.from('content').select('visibility').eq('campaign_id', mine.id);
  assert.ok(headSeen.data.some((r) => r.visibility === 'dm') && headSeen.data.some((r) => r.visibility === 'player'), 'unhidden: the Head DM reads DM and player rows');
  const headPage = await page(`/c/${mine.slug}/overview`, head.session);
  assert.ok(headPage.status === 200 && headPage.text.includes('The butler did it') && headPage.text.includes('Hide it from me again'), 'unhidden: the page opens, with the notice');
  assert.ok(!headPage.text.includes('Edit this page') && !headPage.text.includes('View as player'), 'and without the DM\'s editing tools');
  const headManage = await page(`/c/${mine.slug}/manage`, head.session);
  assert.ok(headManage.status >= 300 && headManage.status < 400, 'the Head DM cannot open Manage in someone else\'s campaign');
  // ...and changes nothing
  assert.equal(((await head.client.from('content').update({ title: 'x' }).eq('campaign_id', mine.id).select('id')).data ?? []).length, 0, 'unhidden is read-only');
  assert.ok((await head.client.from('content').insert({ campaign_id: mine.id, section: 'overview', kind: 'html', key: 'hz', body: {}, visibility: 'player' }).select()).error);
  assert.equal(((await head.client.from('campaigns').update({ title: 'x' }).eq('id', mine.id).select('id')).data ?? []).length, 0);
  assert.equal(((await head.client.from('sections').delete().eq('campaign_id', mine.id).select('id')).data ?? []).length, 0);
  assert.equal(((await head.client.from('invites').select('id').eq('campaign_id', mine.id)).data ?? []).length, 0, 'invite codes stay with the DM');
  // one campaign unhidden does not open any other
  assert.equal((await head.client.from('content').select('id').eq('campaign_id', C.id)).data.length, 0, 'other campaigns stay hidden');
  // another Head DM sees it too (the switch is site-wide); an ordinary account never does
  assert.equal((await outsider.client.from('content').select('id').eq('campaign_id', mine.id)).data.length, 0);
  // hide again
  assert.equal((await head.client.from('head_reveals').delete().eq('campaign_id', mine.id)).error, null);
  assert.equal((await head.client.from('content').select('id').eq('campaign_id', mine.id)).data.length, 0, 'hidden again: nothing');
  assert.equal((await page(`/c/${mine.slug}/overview`, head.session)).status, 404);

  // character rules: a DM cannot write them, only copy an existing set they can already read
  assert.ok((await player.client.from('rules').insert({ campaign_id: mine.id, kind: 'class', key: 'evil', data: { feats: [[1, 'x', 'Free', { $fn: '()=>fetch("https://example.com")' }]] } }).select()).error, 'only the Head DM writes rules');
  assert.ok((await other.client.rpc('copy_campaign_rules', { src: C.id, dst: mine.id })).error, 'only the DM of the new campaign can copy rules into it');
  assert.ok((await player.client.rpc('copy_campaign_rules', { src: mine.id, dst: C.id })).error, 'and never into a campaign they do not run');
  // private rules stay with their owner: a player in a campaign cannot copy them into their own
  assert.ok((await player.client.rpc('copy_campaign_rules', { src: C.id, dst: mine.id })).error, 'private rules cannot be copied by a member');
  assert.equal((await admin.from('rules').select('id', { count: 'exact', head: true }).eq('campaign_id', mine.id)).count, 0);
  assert.equal((await page(`/c/${mine.slug}/builder`, other.session)).status, 404, 'the old builder address is gone');

  // deleting: only the owner (or the Head DM); never someone else's campaign
  assert.ok((await other.client.rpc('delete_campaign', { c: mine.id })).error);
  assert.ok((await player.client.rpc('delete_campaign', { c: C.id })).error);
  assert.ok((await dm.client.rpc('delete_campaign', { c: C.id })).error, 'even a co-DM cannot delete a campaign they do not own');
  assert.equal((await admin.from('campaigns').select('id').eq('id', C.id)).data.length, 1, 'the real campaign is untouched');
  const ch = await other.client.from('characters').insert({ owner: other.id, campaign_id: mine.id, data: { name: 'Doomed' } }).select('id').single();
  assert.equal((await player.client.rpc('delete_campaign', { c: mine.id })).error, null);
  assert.equal((await admin.from('campaigns').select('id').eq('id', mine.id)).data.length, 0);
  assert.equal((await admin.from('characters').select('id').eq('id', ch.data.id)).data.length, 0, 'its characters go with it');
  assert.equal((await admin.from('content').select('id').eq('campaign_id', mine.id)).data.length, 0);
  const second = await ownCampaign(other, 'Second Realm');
  assert.equal((await head.client.rpc('delete_campaign', { c: second.id })).error, null, 'the Head DM can delete any campaign');
  assert.equal((await admin.from('campaigns').select('id').eq('id', second.id)).data.length, 0);
});

test('characters can be deleted by their owner and by that campaign\'s DM, and by nobody else', async () => {
  const a = await player.client.from('characters').insert({ owner: player.id, campaign_id: C.id, data: { name: 'Delete me' } }).select('id').single();
  const b = await player.client.from('characters').insert({ owner: player.id, campaign_id: C.id, data: { name: 'DM removes me' } }).select('id').single();
  assert.equal(((await other.client.from('characters').delete().eq('id', a.data.id).select('id')).data ?? []).length, 0);
  assert.equal((await player.client.from('characters').delete().eq('id', a.data.id).select('id')).data.length, 1);
  assert.equal((await dm.client.from('characters').delete().eq('id', b.data.id).select('id')).data.length, 1);
  const hub = await page('/characters', player.session);
  assert.ok(hub.status === 200 && !hub.text.includes('Delete me'));
});

// ------------------------------------------------------------------ feedback

test('feedback: anyone signed in can send a note; only the Head DM can read them', async () => {
  const sent = await player.client.rpc('submit_feedback', { p_message: 'Please add dice rolling. (automated test)' });
  assert.ok(sent.error === null && sent.data);
  assert.equal(((await player.client.from('feedback').select('*')).data ?? []).length, 0, 'players cannot read feedback');
  assert.ok((await player.client.from('feedback').insert({ message: 'direct insert' }).select()).error, 'notes only go in through the form');
  for (let i = 0; i < 4; i++) assert.equal((await player.client.rpc('submit_feedback', { p_message: 'note ' + i })).error, null);
  assert.ok((await player.client.rpc('submit_feedback', { p_message: 'one too many' })).error, 'more than 5 an hour is refused');
  const head = await makeUser('head2', { head: true });
  const inbox = await head.client.from('feedback').select('message, name, email').eq('email', player.email);
  assert.equal(inbox.data.length, 5);
  assert.ok(inbox.data.some((n) => n.message.includes('dice rolling') && n.name === 'Test player'));
  assert.equal((await page('/feedback', player.session)).status, 200);
  const adminPage = await page('/admin', head.session);
  assert.ok(adminPage.status === 200 && adminPage.text.includes('dice rolling'));
  const blocked = await page('/admin', player.session);
  assert.ok(blocked.status >= 300 && blocked.status < 400);
});

// ------------------------------------------------------------------ uploaded backgrounds

test('backgrounds: people upload only to their own folder or a campaign they run; only members can see a campaign\'s', async () => {
  // a 1x1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const put = (who, path) => who.client.storage.from('backgrounds').upload(path, png, { upsert: true, contentType: 'image/png' });
  assert.equal((await put(player, `user/${player.id}/wide`)).error, null);
  assert.equal((await put(player, `user/${player.id}/tall`)).error, null);
  assert.ok((await put(player, `user/${other.id}/wide`)).error, 'not into someone else\'s folder');
  assert.ok((await put(player, `campaign/${C.id}/wide`)).error, 'not into a campaign they only play in');
  assert.ok((await put(player, 'loose-file')).error);
  assert.ok((await player.client.storage.from('backgrounds').upload(`user/${player.id}/note`, Buffer.from('hello'), { contentType: 'text/plain' })).error, 'pictures only');
  assert.ok((await other.client.storage.from('backgrounds').createSignedUrl(`user/${player.id}/wide`, 60)).error, 'nobody else can read it');

  // the hub uses it
  assert.equal((await player.client.from('profiles').update({ hub_bg: { wide: true, tall: true, v: 7 } }).eq('id', player.id)).error, null);
  const hub = await page('/campaigns', player.session);
  assert.ok(hub.text.includes('/bg/me/wide?v=7') && hub.text.includes('/bg/me/tall?v=7') && !hub.text.includes('hall-wide.webp'));
  const img = await page('/bg/me/wide?v=7', player.session);
  assert.equal(img.status, 302);
  assert.equal((await fetch(img.location)).status, 200);
  assert.equal((await page('/bg/me/wide', other.session)).status, 404, 'someone with no picture gets nothing');
  assert.ok(((await page('/campaigns', other.session)).text).includes('hall-wide.webp'));
  await player.client.from('profiles').update({ hub_bg: {} }).eq('id', player.id);

  // a campaign's background: its DM uploads, its members see it
  const mine = await ownCampaign(other, 'Painted Realm');
  assert.equal((await other.client.rpc('join_campaign', { p_code: mine.code })).data, mine.slug, 'an owner entering their own code is harmless');
  assert.equal((await player.client.rpc('join_campaign', { p_code: mine.code })).data, mine.slug);
  assert.equal((await put(other, `campaign/${mine.id}/wide`)).error, null);
  assert.equal((await put(other, `campaign/${mine.id}/tall`)).error, null);
  assert.ok((await put(player, `campaign/${mine.id}/wide`)).error, 'a player cannot replace it');
  assert.equal((await other.client.from('campaigns').update({ background: { wide: true, tall: true, v: 3 } }).eq('id', mine.id)).error, null);
  const asMember = await page(`/c/${mine.slug}/overview`, player.session);
  assert.ok(asMember.status === 200 && asMember.text.includes('camp-bg') && asMember.text.includes(`/c/${mine.slug}/bg/wide?v=3`));
  const pic = await page(`/c/${mine.slug}/bg/tall?v=3`, player.session);
  assert.equal(pic.status, 302);
  assert.equal((await fetch(pic.location)).status, 200);
  assert.equal((await page(`/c/${mine.slug}/bg/wide`, outsider.session)).status, 404);
  assert.ok((await outsider.client.storage.from('backgrounds').createSignedUrl(`campaign/${mine.id}/wide`, 60)).error);
  assert.ok(!(await page(`/c/${S}/overview`, player.session)).text.includes('camp-bg'), 'other campaigns are unchanged');
});

// ------------------------------------------------------------------ pasting a campaign

test('pasted campaign text becomes tabs, blocks, and DM-only secrets', async () => {
  const { parseCampaignText, IMPORT_EXAMPLE } = await import('../src/lib/import.ts');
  const r = parseCampaignText(IMPORT_EXAMPLE);
  assert.equal(r.title, 'The Sunken Crown');
  assert.ok(r.tagline.startsWith('A drowned kingdom'));
  assert.deepEqual(r.tabs.map((t) => [t.title, t.audience]), [['Overview', 'all'], ['Factions', 'all'], ['DM notes', 'dm']]);
  const kinds = r.tabs[0].blocks.map((b) => b.kind + ':' + b.visibility);
  assert.deepEqual(kinds, ['html:player', 'heading:player', 'html:player', 'plate:player', 'plate:player', 'secret:dm']);
  assert.equal(r.tabs[0].blocks[3].body.group, r.tabs[0].blocks[4].body.group, 'cards next to each other share a row');
  assert.ok(r.tabs[1].blocks[0].kind === 'table' && r.tabs[1].blocks[0].body.html.includes('<th>Faction</th>'));
  assert.ok(r.tabs[2].blocks.every((b) => b.visibility === 'dm'));
  const hostile = parseCampaignText('## Notes\nHello <script>alert(1)</script> **bold** [x](javascript:alert(1))\n[dm]\nhidden\n[/dm]\nshown');
  const html = hostile.tabs[0].blocks.map((b) => b.body.html).join('');
  assert.ok(html.includes('&lt;script&gt;') && html.includes('<b>bold</b>') && !html.includes('<script>') && !html.includes('href="javascript'));
  assert.deepEqual(hostile.tabs[0].blocks.map((b) => b.visibility), ['player', 'dm', 'player']);

  // end to end: a DM pastes pages into their campaign and a player gets only the player parts
  const mine = await ownCampaign(player, 'Pasted Realm');
  const { data: sess } = await player.client.auth.getSession();
  assert.ok(sess.session);
  const imported = parseCampaignText('## Lore\nThe sea is rising.\n\n[secret: Why]\nThe moon is falling.\n[/secret]\n\n## Plans (DM only)\nEnd it in the lighthouse.');
  for (const tab of imported.tabs) {
    await player.client.from('sections').insert({ campaign_id: mine.id, slug: tab.slug, title: tab.title, audience: tab.audience, kind: 'content', sort: 50 });
    await player.client.from('content').insert(tab.blocks.map((b, i) => ({ campaign_id: mine.id, section: tab.slug, kind: b.kind, key: 'k' + i, sort: i, title: b.title, body: b.body, visibility: b.visibility })));
  }
  await other.client.rpc('join_campaign', { p_code: mine.code });
  const lore = await page(`/c/${mine.slug}/lore`, other.session);
  assert.ok(lore.status === 200 && lore.text.includes('The sea is rising.') && !lore.text.includes('moon is falling'));
  assert.equal((await page(`/c/${mine.slug}/plans`, other.session)).status, 404);
  assert.ok((await page(`/c/${mine.slug}/lore`, player.session)).text.includes('The moon is falling.'));
  assert.equal((await page('/help/campaign-format', other.session)).status, 200);
});
