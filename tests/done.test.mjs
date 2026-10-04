// BRIEF section 11, "Done means", as automated tests.
// Run with the app running:  TEST_SITE_URL=<url> npm test   (defaults to http://localhost:3000)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { admin, anonClient, campaign, cleanup, invite, makeUser, page, wait, BUCKET, ROOT, SITE, SLUG, URL_, ANON } from './helpers.mjs';

const FORBIDDEN = [/\bAdo\b/, /Zandrioch/, /Ideas in reserve/, /Still to decide/];
const leaks = (text) => FORBIDDEN.filter((re) => re.test(text)).map(String);

let C, dm, player, other, outsider, originalPhase;

before(async () => {
  await cleanup();
  C = await campaign();
  originalPhase = C.phase;
  await admin.from('campaigns').update({ phase: 'before' }).eq('id', C.id);
  [dm, player, other, outsider] = await Promise.all([makeUser('dm', 'dm'), makeUser('player'), makeUser('other'), makeUser('outsider')]);
  const code = await invite(C.id);
  for (const u of [player, other]) {
    const { error } = await u.client.rpc('join_campaign', { p_code: code });
    assert.equal(error, null);
  }
});

after(async () => {
  await admin.from('campaigns').update({ phase: originalPhase }).eq('id', C.id);
  await cleanup();
});

// ------------------------------------------------------------------ direct Supabase queries as a player

test('player: direct queries for DM content return nothing', async () => {
  const all = await player.client.from('content').select('id, visibility, body, title').eq('campaign_id', C.id);
  assert.equal(all.error, null);
  assert.ok(all.data.length > 30, 'player should still get the player rows');
  assert.equal(all.data.filter((r) => r.visibility !== 'player').length, 0);
  assert.deepEqual(leaks(JSON.stringify(all.data)), []);
  const dmOnly = await player.client.from('content').select('id').eq('visibility', 'dm');
  assert.equal(dmOnly.data.length, 0);
  const secrets = await player.client.from('content').select('id').eq('section', 'secrets');
  assert.equal(secrets.data.length, 0);
  const sections = await player.client.from('sections').select('slug, audience');
  assert.ok(!sections.data.some((s) => s.audience === 'dm'));
});

test('player: direct queries for sessions and invites return nothing', async () => {
  for (const table of ['sessions', 'invites', 'app_config']) {
    const r = await player.client.from(table).select('*');
    assert.equal((r.data ?? []).length, 0, table + ' must be empty for a player');
  }
});

test('player: cannot read another player\'s character, only the public card', async () => {
  const mine = await other.client.from('characters').insert({ owner: other.id, campaign_id: C.id, data: { name: 'Secret Keeper', race: 'lorn', cls: 'Wizard', level: 3, tier: 'God', spark: 5, faith: 4, domain: 'Silence', notes: 'private note', ab: { str: 8 } } }).select('id').single();
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
  assert.ok(!/God|Silence|private note|spark|faith/i.test(JSON.stringify(card)));
  // and a player cannot write to it or reassign it
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
  const mem = await outsider.client.from('memberships').insert({ user_id: outsider.id, campaign_id: C.id }).select();
  assert.ok(mem.error || (mem.data ?? []).length === 0, 'cannot join without a code');
});

test('signed-out visitors get nothing from the API', async () => {
  const anon = anonClient();
  for (const table of ['content', 'campaigns', 'rules', 'characters', 'sessions', 'media', 'profiles']) {
    const r = await anon.from(table).select('*').limit(1);
    assert.equal((r.data ?? []).length, 0, table);
  }
});

// ------------------------------------------------------------------ what a player's browser receives

test('player: no campaign route delivers DM words, in HTML or in the page data', async () => {
  const sections = (await player.client.from('sections').select('slug').eq('campaign_id', C.id)).data.map((s) => s.slug);
  assert.deepEqual(sections.sort(), ['campaign', 'combat', 'divinity', 'factions', 'overview', 'races', 'sheet']);
  await player.client.from('characters').insert({ owner: player.id, campaign_id: C.id, data: { name: 'Leak Tester', race: 'corrin', cls: 'Fighter', level: 1, t: 1, ab: {} } });
  const routes = [...sections.map((s) => `/c/${SLUG}/${s}`), `/c/${SLUG}/builder`, `/c/${SLUG}/races?race=lorn`, '/campaigns', '/characters', '/account'];
  for (const r of routes) {
    const html = await page(r, player.session);
    assert.equal(html.status, 200, r + ' should load for a player');
    assert.deepEqual(leaks(html.text), [], 'leak in HTML of ' + r);
    // the same route as a client-side navigation (React Server Component payload)
    const res = await fetch(SITE + r, { headers: { cookie: (await import('./helpers.mjs')).cookieFor(player.session), RSC: '1' } });
    assert.deepEqual(leaks(await res.text()), [], 'leak in page data of ' + r);
  }
  const overview = await page(`/c/${SLUG}/overview`, player.session);
  assert.ok(/The dead god/.test(overview.text) && /Voth/.test(overview.text), 'player overview has the player wording');
});

test('player: DM routes are closed', async () => {
  for (const r of [`/c/${SLUG}/secrets`, `/c/${SLUG}/sessions`, `/c/${SLUG}/players`, `/c/${SLUG}/session/-1`]) {
    const res = await page(r, player.session);
    assert.equal(res.status, 404, r);
  }
  for (const r of [`/c/${SLUG}/manage`, `/c/${SLUG}/edit/overview`, '/new-campaign']) {
    const res = await page(r, player.session);
    assert.ok(res.status >= 300 && res.status < 400, r + ' should redirect a player away');
  }
});

test('no JavaScript or CSS bundle contains DM words', async () => {
  const dir = path.join(ROOT, '.next', 'static');
  if (!fs.existsSync(dir)) return; // only present after a build
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(dir).filter((x) => /\.(js|css)$/.test(x))) {
    assert.deepEqual(leaks(fs.readFileSync(f, 'utf8')), [], 'leak in bundle ' + path.basename(f));
  }
});

test('DM: sees the DM wording and the secrets', async () => {
  const overview = await page(`/c/${SLUG}/overview`, dm.session);
  assert.equal(overview.status, 200);
  assert.ok(/The two gods/.test(overview.text) && /\bAdo\b/.test(overview.text));
  assert.equal((await page(`/c/${SLUG}/secrets`, dm.session)).status, 200);
  const sheet = await page(`/c/${SLUG}/session/-1`, dm.session);
  assert.equal(sheet.status, 200);
});

test('DM: "view as player" receives exactly the player version', async () => {
  const res = await page(`/c/${SLUG}/overview`, dm.session, 'dbb-view-as-player=1');
  assert.equal(res.status, 200);
  assert.deepEqual(leaks(res.text), []);
  assert.ok(/The dead god/.test(res.text));
  assert.equal((await page(`/c/${SLUG}/secrets`, dm.session, 'dbb-view-as-player=1')).status, 404);
});

// ------------------------------------------------------------------ signed out

test('signed out: every page but the landing and sign-in pages redirects to sign-in', async () => {
  for (const r of ['/campaigns', `/c/${SLUG}`, `/c/${SLUG}/overview`, `/c/${SLUG}/media/v/human.mp4`, '/characters']) {
    const res = await page(r, null);
    assert.ok(res.status >= 300 && res.status < 400 && /sign-in/.test(res.location || ''), r);
  }
  assert.equal((await page('/', null)).status, 200);
  assert.equal((await page('/sign-in', null)).status, 200);
});

// ------------------------------------------------------------------ phase and media

test('phase "before": a player cannot obtain a working URL for any _after file', async () => {
  const afterFiles = (await admin.from('media').select('key, path').eq('campaign_id', C.id).eq('phase', 'after')).data;
  assert.ok(afterFiles.length >= 8, 'seed has the _after files');
  // 1. the media table shows no after rows
  const rows = await player.client.from('media').select('path, phase').eq('campaign_id', C.id);
  assert.ok(rows.data.length > 0);
  assert.ok(!rows.data.some((r) => r.phase === 'after' || /_after\./.test(r.path)));
  for (const f of afterFiles) {
    // 2. the player's own token cannot sign, download, or list the object
    const signed = await player.client.storage.from(BUCKET).createSignedUrl(f.path, 60);
    assert.ok(signed.error || !signed.data?.signedUrl, 'signed ' + f.path);
    const dl = await player.client.storage.from(BUCKET).download(f.path);
    assert.ok(dl.error, 'downloaded ' + f.path);
    // 3. public and authenticated object URLs do not work
    for (const u of [`${URL_}/storage/v1/object/public/${BUCKET}/${f.path}`, `${URL_}/storage/v1/object/authenticated/${BUCKET}/${f.path}`]) {
      const res = await fetch(u, { headers: { apikey: ANON, authorization: 'Bearer ' + player.session.access_token } });
      assert.ok(res.status >= 400, u + ' answered ' + res.status);
    }
    // 4. the app's media route gives the before file, even when asked for after
    const viaApp = await page(`/c/${SLUG}/media/${f.key}?phase=after`, player.session);
    assert.equal(viaApp.status, 302);
    assert.ok(/_before\./.test(viaApp.location) && !/_after\./.test(viaApp.location), 'route leaked ' + viaApp.location);
  }
  const list = await player.client.storage.from(BUCKET).list(SLUG + '/v');
  assert.equal((list.data ?? []).length, 0);
  // the before file itself works
  const ok = await page(`/c/${SLUG}/media/v/aarakocra.mp4`, player.session);
  assert.equal(ok.status, 302);
  const file = await fetch(ok.location, { headers: { range: 'bytes=0-99' } });
  assert.ok(file.status === 200 || file.status === 206);
  // an outsider gets nothing at all
  assert.equal((await page(`/c/${SLUG}/media/v/human.mp4`, outsider.session)).status, 404);
});

test('phase switch: after the DM switches, players get the after files and text', async () => {
  const sw = await dm.client.from('campaigns').update({ phase: 'after' }).eq('id', C.id).select('phase');
  assert.equal(sw.data[0].phase, 'after');
  const via = await page(`/c/${SLUG}/media/v/aarakocra.mp4`, player.session);
  assert.ok(/_after\./.test(via.location));
  const rules = await player.client.from('rules').select('data, phase').eq('kind', 'race-phase').eq('key', 'aarakocra');
  assert.deepEqual(rules.data.map((r) => r.phase), ['after']);
  await dm.client.from('campaigns').update({ phase: 'before' }).eq('id', C.id);
  const back = await player.client.from('rules').select('phase').eq('kind', 'race-phase').eq('key', 'aarakocra');
  assert.deepEqual(back.data.map((r) => r.phase), ['before']);
});

// ------------------------------------------------------------------ joining

test('a player with no membership sees no campaigns', async () => {
  const r = await outsider.client.from('campaigns').select('*');
  assert.equal(r.data.length, 0);
  for (const table of ['content', 'rules', 'media', 'sections']) assert.equal((await outsider.client.from(table).select('id').limit(5)).data.length, 0, table);
  const html = await page('/campaigns', outsider.session);
  assert.equal(html.status, 200);
  assert.ok(!/To be a god/.test(html.text) && /not in a campaign yet/.test(html.text));
  assert.equal((await page(`/c/${SLUG}/overview`, outsider.session)).status, 404);
  const bad = await outsider.client.rpc('join_campaign', { p_code: 'NOPE1234' });
  assert.ok(bad.error);
});

test('invite codes: uses run out, revoked codes fail', async () => {
  const one = await invite(C.id, 1);
  const a = await makeUser('joiner-a'), b = await makeUser('joiner-b');
  assert.equal((await a.client.rpc('join_campaign', { p_code: one.toLowerCase() })).data, SLUG);
  assert.ok((await b.client.rpc('join_campaign', { p_code: one })).error, 'used-up code must fail');
  const two = await invite(C.id, 5);
  await dm.client.from('invites').update({ revoked: true }).eq('code', two);
  assert.ok((await b.client.rpc('join_campaign', { p_code: two })).error, 'revoked code must fail');
  // the DM removes a member, and their access ends
  await dm.client.from('memberships').delete().eq('campaign_id', C.id).eq('user_id', a.id);
  assert.equal((await a.client.from('campaigns').select('id')).data.length, 0);
});

// ------------------------------------------------------------------ the whole player journey

test('sign up, join by code, build a character, edit it: the DM sees it live', async () => {
  // sign up through the public API, the way the sign-up page does
  const fresh = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `signup-${Date.now()}@test.dungeons.invalid`;
  const up = await fresh.auth.signUp({ email, password: 'correct-horse-battery-' + Date.now(), options: { data: { display_name: 'Test Newcomer' } } });
  assert.equal(up.error, null);
  assert.ok(up.data.session, 'sign-up signs the player in (no email confirmation needed)');
  const me = await fresh.from('profiles').select('role, display_name').eq('id', up.data.user.id).single();
  assert.deepEqual(me.data, { role: 'player', display_name: 'Test Newcomer' });
  assert.equal((await fresh.from('campaigns').select('id')).data.length, 0, 'no campaigns before joining');

  const code = await invite(C.id, 1);
  assert.equal((await fresh.rpc('join_campaign', { p_code: code })).data, SLUG);
  assert.equal((await fresh.from('campaigns').select('id')).data.length, 1);
  assert.equal((await page(`/c/${SLUG}/builder`, up.data.session)).status, 200);

  // the DM's Players tab listens through Realtime
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

  // build (the builder inserts the row, then saves the finished sheet)
  const ins = await fresh.from('characters').insert({ owner: up.data.user.id, campaign_id: C.id, data: { name: '', level: 1 }, builder: { race: 'corrin', cls: 'fighter', name: 'Brannoch' } }).select('id').single();
  assert.equal(ins.error, null);
  const save = await fresh.from('characters').update({ data: { t: Date.now(), name: 'Brannoch', race: 'corrin', cls: 'Fighter', level: 15, hp: 120, hpMax: 120, ab: { str: 16 } } }).eq('id', ins.data.id).select('id');
  assert.equal(save.data.length, 1);
  // edit on the combat page
  const edit = await fresh.from('characters').update({ data: { t: Date.now(), name: 'Brannoch', race: 'corrin', cls: 'Fighter', level: 15, hp: 77, hpMax: 120, ab: { str: 16 } } }).eq('id', ins.data.id).select('id');
  assert.equal(edit.data.length, 1);

  for (let i = 0; i < 100 && !events.some((e) => e.new?.data?.hp === 77); i++) await wait(250);
  await dmLive.removeAllChannels();
  assert.ok(events.some((e) => e.eventType === 'INSERT' && e.new.id === ins.data.id), 'DM received the new character live');
  assert.ok(events.some((e) => e.eventType === 'UPDATE' && e.new.data.hp === 77), 'DM received the edit live, without a reload');

  // the DM reads the full sheet; the Players tab renders it
  const full = await dm.client.from('characters').select('data').eq('id', ins.data.id).single();
  assert.equal(full.data.data.hp, 77);
  const tab = await page(`/c/${SLUG}/players`, dm.session);
  assert.equal(tab.status, 200);
  assert.ok(/Brannoch/.test(tab.text));
  // the player's own pages load with the character
  const sheet = await page(`/c/${SLUG}/sheet`, up.data.session);
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
  const row = await other.client.from('characters').insert({ owner: other.id, campaign_id: C.id, data: { name: 'Hidden', tier: 'Demigod', spark: 2 } }).select('id').single();
  await other.client.from('characters').update({ data: { name: 'Hidden', tier: 'God', spark: 6 } }).eq('id', row.data.id);
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
    const html = await page(`/c/${SLUG}/campaign`, player.session);
    assert.ok(html.text.includes(marker), 'the player\'s page shows the edit');
    // hiding it removes it for the player
    await dm.client.from('content').update({ hidden: true }).eq('id', row.id);
    assert.equal((await player.client.from('content').select('id').eq('id', row.id)).data.length, 0);
    assert.ok(!(await page(`/c/${SLUG}/campaign`, player.session)).text.includes(marker));
  } finally {
    await admin.from('content').update({ body: row.body, hidden: false }).eq('id', row.id);
  }
});

// ------------------------------------------------------------------ hub artwork stays in the hub

test('the hall background is on every signed-in hub tab, and nowhere else', async () => {
  const hall = (t) => /class="hall-bg"/.test(t) && /\/hub\/hall-wide\.webp/.test(t) && /\/hub\/hall-tall\.webp/.test(t);
  for (const r of ['/campaigns', '/characters', '/account']) {
    const res = await page(r, player.session);
    assert.equal(res.status, 200, r);
    assert.ok(hall(res.text), r + ' should have the hall background');
    assert.deepEqual(leaks(res.text), [], r);
  }
  const dmNew = await page('/new-campaign', dm.session);
  assert.ok(hall(dmNew.text), 'New campaign should have the hall background');
  for (const [r, s] of [['/', null], ['/sign-in', null], ['/sign-up', null], [`/c/${SLUG}/overview`, player.session], [`/c/${SLUG}/sheet`, player.session]]) {
    const res = await page(r, s);
    assert.equal(res.status, 200, r);
    assert.ok(!/hall-bg|hall-wide|hall-tall/.test(res.text), r + ' must not have the hall background');
  }
  assert.ok(/doorway-wide\.webp/.test((await page('/', null)).text), 'the landing page keeps the doorway');
});
