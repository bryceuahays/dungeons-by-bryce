// Hub version 2, item 4 (issue 85): one visibility rule for everything, "who" combined with
// "when", NPC partial reveals, named players on map regions, and attached homebrew.
// Every privacy rule here is proved three ways: the database API as a player, the page HTML
// as a player, and the Realtime feed as a player.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { entryOpen } from '../src/lib/entry-types.ts';
import { WHEN, WHO, describe, fromChoice, namesPlayers, npcFull, npcSplit, problem, revealOf, shortLabel, toChoice, waitsForBeat, waitsForStage } from '../src/features/hub/visibility/model.ts';
import { ANON, ROOT, SITE, URL_, admin, cleanup, cookieFor, makeUser, page, wait } from './helpers.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', BEAT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
// 'when' and 'players_when' (a trigger: a session, a beat or a chapter) came with issue 117
const VALUES = ['all', 'dm', 'players', 'stage', 'entry', 'players_stage', 'players_entry', 'when', 'players_when'];
// the newest migration that says this (a later one replaces an earlier one's definition)
const newest = (marker) => fs.readdirSync(path.join(ROOT, 'supabase/migrations')).sort().reverse()
  .map((f) => fs.readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8')).find((s) => s.includes(marker));

// ------------------------------------------------------------------ the rule, in code

test('the rule: who and when, alone and combined', () => {
  const stages = ['s1', 's2'];
  const at = (player, stage) => ({ player, stage, stages });
  const row = (vis, extra = {}) => ({ vis, vis_players: [A], vis_stage: 's2', vis_entry: BEAT, ...extra });
  const none = new Set(), hit = new Set([BEAT]);
  // one question at a time
  assert.equal(entryOpen(row('all'), at(B, 's1'), none), true);
  assert.equal(entryOpen(row('dm'), at(A, 's2'), hit), false);
  assert.equal(entryOpen(row('players'), at(A, 's1'), none), true);
  assert.equal(entryOpen(row('players'), at(B, 's2'), hit), false);
  assert.equal(entryOpen(row('stage'), at(B, 's1'), none), false);
  assert.equal(entryOpen(row('stage'), at(B, 's2'), none), true);
  assert.equal(entryOpen(row('entry'), at(B, 's1'), none), false);
  assert.equal(entryOpen(row('entry'), at(B, 's1'), hit), true);
  // both at once: the named player, and only once the time has come
  assert.equal(entryOpen(row('players_stage'), at(A, 's1'), hit), false, 'named, but too early');
  assert.equal(entryOpen(row('players_stage'), at(A, 's2'), none), true);
  assert.equal(entryOpen(row('players_stage'), at(B, 's2'), hit), false, 'the stage has come, but not named');
  assert.equal(entryOpen(row('players_entry'), at(A, 's1'), none), false, 'named, but the beat has not happened');
  assert.equal(entryOpen(row('players_entry'), at(A, 's1'), hit), true);
  assert.equal(entryOpen(row('players_entry'), at(B, 's2'), hit), false, 'the beat has happened, but not named');
  // a preview as "any player" names nobody; an unknown value is closed; a missing beat never opens
  for (const vis of ['players', 'players_stage', 'players_entry']) assert.equal(entryOpen(row(vis), at(null, 's2'), hit), false);
  assert.equal(entryOpen(row('everyone'), at(A, 's2'), hit), false);
  assert.equal(entryOpen(row('players_entry', { vis_entry: null }), at(A, 's2'), hit), false);
  assert.equal(entryOpen(row('entry', { vis_entry: null }), at(A, 's2'), hit), false);
});

test('the database rule and the code rule know the same values', () => {
  const sql = newest('create or replace function public.entry_open');
  const from = sql.indexOf('create or replace function public.entry_open');
  const fn = sql.slice(from, sql.indexOf('$$;', from));
  assert.deepEqual([...fn.matchAll(/when '([a-z_]+)' then/g)].map((m) => m[1]).sort(), VALUES.filter((v) => v !== 'dm').sort(), 'entry_open() opens exactly these; anything else, DM only included, is closed');
  const ts = fs.readFileSync(path.join(ROOT, 'src/lib/entry-types.ts'), 'utf8');
  assert.deepEqual([...ts.matchAll(/case '([a-z_]+)': return/g)].map((m) => m[1]).sort(), VALUES.filter((v) => v !== 'dm').sort(), 'and so does entryOpen()');
  for (const table of ['entries', 'campaign_entities']) assert.match(newest(`add constraint ${table}_vis_check`), new RegExp(`alter table public\\.${table} add constraint ${table}_vis_check\\s+check \\(vis in \\(${VALUES.map((v) => `'${v}'`).join(', ')}\\)\\)`), table + ' accepts exactly these values');
});

test('the picker\'s two questions turn into one stored value and back', () => {
  const base = { vis_players: [A], vis_stage: 's2', vis_entry: BEAT };
  for (const vis of VALUES.filter((v) => v !== 'dm')) assert.equal(fromChoice(toChoice({ vis, ...base, ...(/when$/.test(vis) ? { vis_stage: 'session:3:played' } : {}) })).vis, vis, vis + ' survives the round trip');
  assert.deepEqual(toChoice({ vis: 'players_stage', ...base }), { who: 'players', when: 'stage', players: [A], stage: 's2', entry: BEAT });
  assert.deepEqual(toChoice({ vis: 'entry', ...base }), { who: 'all', when: 'entry', players: [A], stage: 's2', entry: BEAT });
  // "only DMs" forgets the names; "when I reveal it" keeps them and is still closed
  assert.deepEqual(fromChoice({ who: 'dm', when: 'stage', players: [A], stage: 's2', entry: null }), { vis: 'dm', vis_players: [], vis_stage: 's2', vis_entry: null });
  const held = fromChoice({ who: 'players', when: 'hold', players: [A], stage: null, entry: null });
  assert.deepEqual(held, { vis: 'dm', vis_players: [A], vis_stage: null, vis_entry: null });
  assert.equal(entryOpen(held, { player: A, stage: 's2', stages: ['s1', 's2'] }, new Set([BEAT])), false, 'held back means nobody but the DM, the named player included');
  assert.deepEqual(toChoice(held), { who: 'players', when: 'hold', players: [A], stage: null, entry: null });
  assert.equal(fromChoice({ who: 'all', when: 'hold', players: [A], stage: null, entry: null }).vis, 'dm');
  assert.equal(toChoice({ vis: 'dm', vis_players: [], vis_stage: null }).who, 'dm');
  assert.equal(fromChoice({ who: 'all', when: 'now', players: [A], stage: null, entry: null }).vis_players.length, 0, 'everyone names nobody');
  // every pair of answers stores one of the seven values
  for (const [who] of WHO) for (const [when] of WHEN) assert.ok(VALUES.includes(fromChoice({ who, when, players: [A], stage: 's1', entry: BEAT }).vis), who + ' ' + when);
  assert.ok(namesPlayers('players_entry') && !namesPlayers('entry') && waitsForStage('players_stage') && !waitsForStage('players') && waitsForBeat('entry') && waitsForBeat('players_entry'));
  // it will not save an answer with a hole in it
  assert.equal(problem({ who: 'players', when: 'now', players: [], stage: null, entry: null }), 'Choose at least one player.');
  assert.equal(problem({ who: 'all', when: 'stage', players: [], stage: null, entry: null }), 'Choose a chapter.');
  assert.equal(problem({ who: 'players', when: 'entry', players: [A], stage: null, entry: null }), 'Choose a story beat.');
  assert.equal(problem({ who: 'dm', when: 'stage', players: [], stage: null, entry: null }), null, 'only DMs needs no when');
  assert.equal(problem({ who: 'players', when: 'stage', players: [A], stage: 's2', entry: null }), null);
});

test('the picker says in words who will see it, and when', () => {
  const people = [{ id: A, label: 'Mira' }, { id: B, label: 'Tobin' }], stages = [{ id: 's2', label: 'Act two' }], beats = [{ id: BEAT, label: 'The vault opens' }];
  const say = (v) => describe({ vis_players: [], vis_stage: null, vis_entry: null, ...v }, people, stages, beats);
  const tag = (v) => shortLabel({ vis_players: [], vis_stage: null, vis_entry: null, ...v }, people, stages, beats);
  assert.equal(say({ vis: 'all' }), 'Every player sees this.');
  assert.equal(say({ vis: 'dm' }), 'Hidden from players. Only DMs see this.');
  assert.equal(say({ vis: 'players', vis_players: [A] }), 'Only Mira sees this.');
  assert.equal(say({ vis: 'players', vis_players: [A, B] }), 'Only Mira and Tobin see this.');
  assert.equal(say({ vis: 'stage', vis_stage: 's2' }), 'Every player will see this from Act two onward.');
  assert.equal(say({ vis: 'players_stage', vis_players: [A], vis_stage: 's2' }), 'Only Mira will see this from Act two onward.');
  assert.equal(say({ vis: 'players_entry', vis_players: [B], vis_entry: BEAT }), 'Only Tobin will see this once "The vault opens" has happened.');
  assert.equal(say({ vis: 'dm', vis_players: [A] }), 'Hidden from players for now. Only Mira will see this when you reveal it.');
  assert.equal(tag({ vis: 'all' }), 'Everyone');
  assert.equal(tag({ vis: 'dm' }), 'Hidden from players');
  assert.equal(tag({ vis: 'players', vis_players: [A] }), 'Only Mira');
  assert.equal(tag({ vis: 'stage', vis_stage: 's2' }), 'Reveals from Act two');
  assert.equal(tag({ vis: 'players_stage', vis_players: [A], vis_stage: 's2' }), 'Only Mira, from Act two');
  assert.equal(tag({ vis: 'players_entry', vis_players: [A], vis_entry: BEAT }), 'Only Mira, after "The vault opens"');
  assert.equal(tag({ vis: 'dm', vis_players: [A] }), 'Only Mira, when you reveal it');
});

test('NPC partial reveals: what goes on the NPC itself and what is held back', () => {
  const full = { status: 'hostile', data: { location: 'The Salt Docks', faction: 'The Tide Wardens', known: 'She pays in old coin.', file: 'c/npc/face.webp' } };
  const notes = { wants: 'The ledger.', secret: 'She is the heir.' };
  const all = npcSplit(full, notes, 'all');
  assert.deepEqual(all, { status: 'hostile', data: full.data, secret: notes });
  const portrait = npcSplit(full, notes, 'portrait');
  assert.deepEqual(portrait.data, { reveal: 'portrait', file: 'c/npc/face.webp' }, 'the row a player can read: the picture, nothing else');
  assert.equal(portrait.status, '');
  assert.deepEqual(portrait.secret, { ...notes, held: { status: 'hostile', location: 'The Salt Docks', faction: 'The Tide Wardens', known: 'She pays in old coin.' } });
  const name = npcSplit(full, notes, 'name');
  assert.deepEqual(name.data, { reveal: 'name' }, 'name only: not even the picture');
  assert.equal(name.status, '');
  assert.equal(name.secret.held.file, 'c/npc/face.webp');
  assert.ok(!JSON.stringify({ status: name.status, data: name.data }).match(/Salt|Tide|coin|hostile|face/), 'nothing held back is left on the row');
  // the DM's view puts it back together, whatever the level, and changing level loses nothing
  for (const kept of [all, portrait, name]) assert.deepEqual(npcFull(kept), full);
  assert.deepEqual(npcSplit(npcFull(name), name.secret, 'all'), all, 'name only back to everything');
  assert.deepEqual(npcSplit(npcFull(portrait), portrait.secret, 'name'), name, 'portrait down to name only');
  assert.equal(revealOf(name.data), 'name');
  assert.equal(revealOf(portrait.data), 'portrait');
  for (const d of [all.data, {}, null, { reveal: 'everything' }, { reveal: 7 }]) assert.equal(revealOf(d), 'all');
  // an NPC with no picture, and a player's copy (no secrets), are handled too
  assert.deepEqual(npcSplit({ status: 'alive', data: { known: 'x', file: undefined } }, {}, 'portrait').data, { reveal: 'portrait' });
  assert.deepEqual(npcFull({ status: '', data: { reveal: 'name' } }), { status: '', data: {} });
});

// ------------------------------------------------------------------ the database, as players

let dm, plainDm, a, b, outsider, C, P, beatHit, beatPlanned;
const rnd = () => Math.random().toString(36).slice(2, 8);
const WORDS = { location: 'Zorvath Docks', faction: 'Quillfen Wardens', known: 'She pays in brindlemark coin.', wants: 'The ossuary ledger.' };
const leak = (text) => ['Zorvath', 'Quillfen', 'brindlemark', 'ossuary'].filter((w) => String(text).includes(w));
async function makeCampaign(owner, title) {
  const made = await owner.client.from('campaigns').insert({ slug: 'vis-' + rnd(), title, phases: [{ id: 's1', label: 'Act one' }, { id: 's2', label: 'Act two' }], phase: 's1' }).select('id, slug').single();
  assert.equal(made.error, null, made.error?.message);
  assert.equal((await owner.client.from('sections').insert({ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' })).error, null);
  return made.data;
}
const entry = (who, row) => who.client.from('entries').insert(row).select('*').single();
const readable = async (who, ids) => new Set(((await who.client.from('entries').select('id').in('id', ids)).data ?? []).map((r) => r.id));
const viewAs = (v) => 'dbb-view-as-player=' + encodeURIComponent(JSON.stringify(v));
const listen = async (who) => {
  const events = [];
  const live = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await live.auth.setSession({ access_token: who.session.access_token, refresh_token: who.session.refresh_token });
  await live.realtime.setAuth(who.session.access_token);
  await new Promise((resolve, reject) => {
    // every table this player is sent anything from, so a leak through another table would show too
    live.channel('vis-' + rnd()).on('postgres_changes', { event: '*', schema: 'public' }, (p) => events.push(p))
      .subscribe((s) => { if (s === 'SUBSCRIBED') resolve(); if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(s)); });
  });
  await wait(4000);   // Realtime needs a moment after SUBSCRIBED before it delivers table changes
  return { events, stop: () => live.removeAllChannels() };
};

before(async () => {
  await cleanup();
  // dm: a test account, so hub version 2 flags are on for it. plainDm: an ordinary DM.
  [dm, plainDm, a, b, outsider] = await Promise.all([makeUser('visdm'), makeUser('visplain', { unblocked: true }), makeUser('visa'), makeUser('visb'), makeUser('visout')]);
  [C, P] = await Promise.all([makeCampaign(dm, 'Veil Realm'), makeCampaign(plainDm, 'Plain Veil')]);
  const joined = await admin.from('memberships').insert([{ user_id: a.id, campaign_id: C.id, role: 'player' }, { user_id: b.id, campaign_id: C.id, role: 'player' }]);
  assert.equal(joined.error, null, joined.error?.message);
  beatHit = (await entry(dm, { campaign_id: C.id, kind: 'beat', title: 'The vault opens', status: 'hit', live: true, vis: 'all' })).data;
  beatPlanned = (await entry(dm, { campaign_id: C.id, kind: 'beat', title: 'The tide turns', status: 'planned', live: false, vis: 'dm' })).data;
  assert.ok(beatHit && beatPlanned);
});
after(cleanup);

test('the database and the code agree, for every value, for each player, as the stage and the beats move', async () => {
  const rows = [];
  const add = async (label, row) => { const r = await entry(dm, { campaign_id: C.id, kind: 'consequence', title: label, live: true, vis_players: [], ...row }); assert.equal(r.error, null, label + ': ' + r.error?.message); rows.push(r.data); };
  await add('all', { vis: 'all' });
  await add('dm', { vis: 'dm' });
  await add('dm, a named for later', { vis: 'dm', vis_players: [a.id] });
  await add('players a', { vis: 'players', vis_players: [a.id] });
  await add('players a and b', { vis: 'players', vis_players: [a.id, b.id] });
  await add('stage s1', { vis: 'stage', vis_stage: 's1' });
  await add('stage s2', { vis: 'stage', vis_stage: 's2' });
  await add('beat hit', { vis: 'entry', vis_entry: beatHit.id });
  await add('beat planned', { vis: 'entry', vis_entry: beatPlanned.id });
  await add('a from s1', { vis: 'players_stage', vis_players: [a.id], vis_stage: 's1' });
  await add('a from s2', { vis: 'players_stage', vis_players: [a.id], vis_stage: 's2' });
  await add('b from s2', { vis: 'players_stage', vis_players: [b.id], vis_stage: 's2' });
  await add('a after hit beat', { vis: 'players_entry', vis_players: [a.id], vis_entry: beatHit.id });
  await add('a after planned beat', { vis: 'players_entry', vis_players: [a.id], vis_entry: beatPlanned.id });
  await add('b after planned beat', { vis: 'players_entry', vis_players: [b.id], vis_entry: beatPlanned.id });
  const ids = rows.map((r) => r.id);

  const compare = async (when, stage, hit) => {
    for (const [name, who] of [['a', a], ['b', b]]) {
      const got = await readable(who, ids);
      for (const r of rows) assert.equal(got.has(r.id), entryOpen(r, { player: who.id, stage, stages: ['s1', 's2'] }, hit), `${when}: "${r.title}" for player ${name}`);
    }
    assert.equal((await readable(dm, ids)).size, rows.length, 'the DM reads them all');
    assert.equal((await readable(outsider, ids)).size, 0, 'someone outside the campaign reads none');
  };
  await compare('at the first stage', 's1', new Set([beatHit.id]));
  // spot checks in plain words, so the comparison above cannot agree by both being wrong
  const title = (id) => rows.find((r) => r.id === id).title;
  assert.deepEqual([...(await readable(b, ids))].map(title).sort(), ['all', 'beat hit', 'players a and b', 'stage s1']);
  assert.deepEqual([...(await readable(a, ids))].map(title).sort(), ['a after hit beat', 'a from s1', 'all', 'beat hit', 'players a', 'players a and b', 'stage s1']);

  assert.equal((await dm.client.from('campaigns').update({ phase: 's2' }).eq('id', C.id)).error, null);
  await compare('at the second stage', 's2', new Set([beatHit.id]));
  assert.ok((await readable(a, ids)).has(rows.find((r) => r.title === 'a from s2').id) && !(await readable(b, ids)).has(rows.find((r) => r.title === 'a from s2').id));

  assert.equal((await dm.client.from('entries').update({ status: 'hit', live: true, vis: 'all' }).eq('id', beatPlanned.id)).error, null);
  await compare('after the second beat', 's2', new Set([beatHit.id, beatPlanned.id]));
  assert.ok((await readable(b, ids)).has(rows.find((r) => r.title === 'b after planned beat').id));

  // back to the start for the tests below
  await dm.client.from('campaigns').update({ phase: 's1' }).eq('id', C.id);
  await dm.client.from('entries').update({ status: 'planned', live: false, vis: 'dm' }).eq('id', beatPlanned.id);
  // a player cannot give themselves the combined values, or anything else
  assert.equal(((await a.client.from('entries').update({ vis: 'all' }).eq('id', rows[1].id).select('id')).data ?? []).length, 0);
  assert.ok((await entry(a, { campaign_id: C.id, kind: 'pin', parent: null, title: 'x', owner: a.id, live: true, vis: 'players_stage', vis_players: [a.id], vis_stage: 's1' })).error);
  assert.ok((await entry(dm, { campaign_id: C.id, kind: 'consequence', title: 'bad', vis: 'everybody' })).error, 'a value that is not one of the seven is refused');
});

test('an NPC shown by name only: players get the name and nothing else, by API, page, picture and Realtime', async () => {
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#884422' } }).png().toBuffer();
  const file = `${C.id}/npc/${crypto.randomUUID()}.png`;
  assert.equal((await dm.client.storage.from('campaign-files').upload(file, png, { contentType: 'image/png' })).error, null);
  const full = { status: 'hostile', data: { location: WORDS.location, faction: WORDS.faction, known: WORDS.known, file } };
  const notes = { wants: WORDS.wants };

  // saved the way the NPC tool saves it
  const kept = npcSplit(full, notes, 'name');
  const npc = await entry(dm, { campaign_id: C.id, kind: 'npc', title: 'Ysolde Varn', live: true, vis: 'all', vis_players: [], status: kept.status, data: kept.data });
  assert.equal(npc.error, null, npc.error?.message);
  assert.equal((await dm.client.from('entry_secrets').upsert({ entry_id: npc.data.id, campaign_id: C.id, data: kept.secret })).error, null);
  const pic = (who, extra = '') => fetch(`${SITE}/c/${C.slug}/file/${npc.data.id}`, { headers: { cookie: cookieFor(who.session) + (extra ? '; ' + extra : '') }, redirect: 'manual' });

  // the database API, as a player
  for (const who of [a, b]) {
    const row = (await who.client.from('entries').select('*').eq('id', npc.data.id).single()).data;
    assert.equal(row.title, 'Ysolde Varn');
    assert.deepEqual(row.data, { reveal: 'name' });
    assert.equal(row.status, '');
    assert.deepEqual(leak(JSON.stringify(row)), []);
    assert.equal(((await who.client.from('entry_secrets').select('*').eq('entry_id', npc.data.id)).data ?? []).length, 0, 'the held-back part is the DM\'s alone');
    assert.equal(((await who.client.from('entry_secrets').select('*').eq('campaign_id', C.id)).data ?? []).length, 0);
    assert.ok((await who.client.storage.from('campaign-files').download(file)).error, 'the picture file cannot be fetched directly');
  }
  // the page, as a player
  const seen = await page(`/c/${C.slug}/tools/npcs`, a.session);
  assert.equal(seen.status, 200);
  assert.ok(seen.text.includes('Ysolde Varn'), 'the name is there');
  assert.deepEqual(leak(seen.text), [], 'and none of the rest');
  assert.ok(!seen.text.includes(`/file/${npc.data.id}`) && !seen.text.includes('class="who">Hostile'), 'no portrait, no status');
  assert.equal((await pic(a)).status, 404, 'the portrait route has nothing for a player');
  // the DM: everything, put back together, and the picture
  const mine = await page(`/c/${C.slug}/tools/npcs`, dm.session);
  assert.equal(leak(mine.text).length, 4);
  assert.ok(mine.text.includes('Players see: name only') && mine.text.includes(`/file/${npc.data.id}`) && mine.text.includes('class="who">Hostile'));
  assert.equal((await pic(dm)).status, 302, 'the DM still gets the portrait');
  // the DM previewing as that player gets the player's page
  const preview = await page(`/c/${C.slug}/tools/npcs`, dm.session, viewAs({ p: a.id }));
  assert.ok(preview.text.includes('Ysolde Varn'));
  assert.deepEqual(leak(preview.text), []);
  assert.ok(!preview.text.includes(`/file/${npc.data.id}`));

  // Realtime, as a player: the change arrives, without the held-back part
  const spy = await listen(a);
  const renamed = npcSplit({ ...full, data: { ...full.data, known: WORDS.known + ' Twice.' } }, notes, 'name');
  assert.equal((await dm.client.from('entries').update({ title: 'Ysolde Varn the Elder', status: renamed.status, data: renamed.data }).eq('id', npc.data.id)).error, null);
  assert.equal((await dm.client.from('entry_secrets').upsert({ entry_id: npc.data.id, campaign_id: C.id, data: renamed.secret })).error, null);
  for (let i = 0; i < 60 && !spy.events.some((e) => e.new?.title === 'Ysolde Varn the Elder'); i++) await wait(250);
  await wait(1500);
  await spy.stop();
  assert.ok(spy.events.some((e) => e.table === 'entries' && e.new?.title === 'Ysolde Varn the Elder'), 'the player hears that the NPC changed');
  assert.deepEqual(leak(JSON.stringify(spy.events)), [], 'and nothing held back comes with it');
  assert.ok(!spy.events.some((e) => e.table === 'entry_secrets'), 'the DM-only part is never broadcast to a player');

  // name and portrait: the picture is now the player's, the rest still is not
  const withFace = npcSplit(full, notes, 'portrait');
  assert.equal((await dm.client.from('entries').update({ status: withFace.status, data: withFace.data }).eq('id', npc.data.id)).error, null);
  assert.equal((await dm.client.from('entry_secrets').upsert({ entry_id: npc.data.id, campaign_id: C.id, data: withFace.secret })).error, null);
  const row = (await a.client.from('entries').select('status, data').eq('id', npc.data.id).single()).data;
  assert.deepEqual(row, { status: '', data: { reveal: 'portrait', file } });
  assert.equal((await pic(a)).status, 302, 'the player gets the portrait');
  const faced = await page(`/c/${C.slug}/tools/npcs`, a.session);
  assert.ok(faced.text.includes(`/file/${npc.data.id}`));
  assert.deepEqual(leak(faced.text), []);

  // everything: back on the row, for the players who can see the NPC
  const open = npcSplit(full, notes, 'all');
  assert.equal((await dm.client.from('entries').update({ status: open.status, data: open.data }).eq('id', npc.data.id)).error, null);
  assert.equal((await dm.client.from('entry_secrets').upsert({ entry_id: npc.data.id, campaign_id: C.id, data: open.secret })).error, null);
  const all = await page(`/c/${C.slug}/tools/npcs`, a.session);
  assert.deepEqual(leak(all.text).sort(), ['Quillfen', 'Zorvath', 'brindlemark'], 'what the players know, the place and the faction, and never the DM\'s notes');

  // who sees the NPC at all is still the visibility: name only, for one player
  const one = npcSplit(full, notes, 'name');
  assert.equal((await dm.client.from('entries').update({ vis: 'players', vis_players: [a.id], status: one.status, data: one.data }).eq('id', npc.data.id)).error, null);
  assert.equal((await readable(a, [npc.data.id])).size, 1);
  assert.equal((await readable(b, [npc.data.id])).size, 0, 'the other player does not get even the name');
  assert.ok(!(await page(`/c/${C.slug}/tools/npcs`, b.session)).text.includes('Ysolde'));
  assert.equal((await pic(b)).status, 404);
});

test('the database refuses a partly shown NPC that still carries what is held back', async () => {
  const make = (row) => entry(dm, { campaign_id: C.id, kind: 'npc', title: 'Guard test', live: true, vis: 'all', ...row });
  assert.ok((await make({ status: '', data: { reveal: 'name', known: WORDS.known } })).error, 'name only, with what the players know');
  assert.ok((await make({ status: '', data: { reveal: 'name', file: C.id + '/npc/x.png' } })).error, 'name only, with a portrait');
  assert.ok((await make({ status: 'hostile', data: { reveal: 'name' } })).error, 'name only, with a status');
  assert.ok((await make({ status: '', data: { reveal: 'portrait', location: WORDS.location } })).error, 'name and portrait, with a place');
  assert.ok((await make({ status: '', data: { reveal: 'portrait', anything: 'new' } })).error, 'a field nobody has thought of yet is held back too');
  assert.ok((await make({ status: 'alive', data: { reveal: 'sometimes' } })).error, 'a level that does not exist');
  const ok = await make({ status: '', data: { reveal: 'portrait', file: C.id + '/npc/x.png' } });
  assert.equal(ok.error, null, ok.error?.message);
  assert.ok((await dm.client.from('entries').update({ data: { reveal: 'name', file: C.id + '/npc/x.png' } }).eq('id', ok.data.id).select('id')).error, 'and it is checked on a change, not only when the NPC is made');
  assert.ok((await dm.client.from('entries').update({ status: 'dead' }).eq('id', ok.data.id).select('id')).error);
  // an ordinary NPC, and other kinds of entry, are as they always were
  assert.equal((await make({ status: 'alive', data: { known: 'x', location: 'y', faction: 'z', file: C.id + '/npc/y.png' } })).error, null);
  assert.equal((await make({ status: 'alive', data: { reveal: 'all', known: 'x' } })).error, null);
  assert.equal((await entry(dm, { campaign_id: C.id, kind: 'consequence', title: 'not an NPC', vis: 'dm', status: 'x', data: { reveal: 'name', known: 'kept' } })).error, null, 'only NPCs have reveal levels');
});

test('a map region for named players: the picture is painted for everyone else, on the server', async () => {
  const png = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const file = `${C.id}/maps/${crypto.randomUUID()}.png`;
  assert.equal((await dm.client.storage.from('campaign-files').upload(file, png, { contentType: 'image/png' })).error, null);
  const map = await entry(dm, { campaign_id: C.id, kind: 'map', title: 'The Vale', live: true, vis: 'all', data: { file, w: 200, h: 100 } });
  const region = await entry(dm, { campaign_id: C.id, kind: 'region', parent: map.data.id, title: 'West', live: true, vis: 'players', vis_players: [a.id], data: { pts: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]] } });
  assert.ok(!map.error && !region.error, map.error?.message ?? region.error?.message);
  const west = async (who, extra = '') => {
    const res = await fetch(`${SITE}/c/${C.slug}/map/${map.data.id}`, { headers: { cookie: cookieFor(who.session) + (extra ? '; ' + extra : '') }, redirect: 'follow' });
    assert.equal(res.status, 200);
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return data[(50 * info.width + 40) * info.channels];
  };
  assert.ok((await west(a)) > 220, 'the named player sees that part of the map');
  assert.ok((await west(b)) < 40, 'for the other player it is painted over');
  assert.ok((await west(dm, viewAs({ p: b.id }))) < 40, 'and the DM previewing as that player gets the painted picture');
  assert.ok((await west(dm, viewAs({ p: a.id }))) > 220);
  assert.equal((await readable(b, [region.data.id])).size, 0, 'the other player does not get the outline either');
  // combined with a stage: the named player waits too
  assert.equal((await dm.client.from('entries').update({ vis: 'players_stage', vis_stage: 's2' }).eq('id', region.data.id)).error, null);
  assert.ok((await west(a)) < 40, 'named, but the stage has not come');
  await dm.client.from('campaigns').update({ phase: 's2' }).eq('id', C.id);
  assert.ok((await west(a)) > 220 && (await west(b)) < 40, 'at the stage: the named player only');
  await dm.client.from('campaigns').update({ phase: 's1' }).eq('id', C.id);
});

test('attached homebrew has the same choices, and "view as player" shows exactly what that player gets', async () => {
  const brew = await dm.client.from('entities').insert({ type: 'item', slug: 'vis-' + rnd(), name: 'Thrumglass Lantern', status: 'live', data: {} }).select('id').single();
  assert.equal(brew.error, null, brew.error?.message);
  const attach = (v) => dm.client.from('campaign_entities').upsert({ campaign_id: C.id, entity_id: brew.data.id, vis_players: [], vis_stage: null, vis_entry: null, ...v });
  const gets = async (who) => ((await who.client.from('entities').select('id').eq('id', brew.data.id)).data ?? []).length === 1;
  const shown = async (session, extra = '') => (await page(`/c/${C.slug}/tools/compendium`, session, extra)).text.includes('Thrumglass Lantern');

  assert.equal((await attach({ vis: 'players', vis_players: [a.id] })).error, null);
  assert.deepEqual([await gets(a), await gets(b)], [true, false]);
  assert.deepEqual([await shown(a.session), await shown(b.session)], [true, false], 'the page, as each player');
  assert.deepEqual([await shown(dm.session, viewAs({ p: a.id })), await shown(dm.session, viewAs({ p: b.id }))], [true, false], 'and the DM previewing as each of them');
  assert.equal(await shown(dm.session), true, 'the DM sees it');

  // once a story beat happens (new for attached homebrew), alone and with a named player
  assert.equal((await attach({ vis: 'entry', vis_entry: beatPlanned.id })).error, null);
  assert.deepEqual([await gets(a), await gets(b), await shown(dm.session, viewAs({ p: a.id }))], [false, false, false], 'the beat has not happened');
  assert.equal((await attach({ vis: 'entry', vis_entry: beatHit.id })).error, null);
  assert.deepEqual([await gets(a), await gets(b), await shown(dm.session, viewAs({ p: b.id }))], [true, true, true]);
  assert.equal((await attach({ vis: 'players_entry', vis_players: [b.id], vis_entry: beatHit.id })).error, null);
  assert.deepEqual([await gets(a), await gets(b)], [false, true]);
  assert.deepEqual([await shown(a.session), await shown(dm.session, viewAs({ p: a.id })), await shown(dm.session, viewAs({ p: b.id }))], [false, false, true]);
  // from a stage, for a named player: the preview follows the stage being previewed
  assert.equal((await attach({ vis: 'players_stage', vis_players: [a.id], vis_stage: 's2' })).error, null);
  assert.deepEqual([await gets(a), await shown(dm.session, viewAs({ p: a.id })), await shown(dm.session, viewAs({ p: a.id, s: 's2' })), await shown(dm.session, viewAs({ p: b.id, s: 's2' }))], [false, false, true, false]);
  // a beat from another campaign cannot be used, and a made-up value is refused
  const other = await entry(plainDm, { campaign_id: P.id, kind: 'beat', title: 'Elsewhere', status: 'hit', live: true, vis: 'all' });
  assert.ok((await attach({ vis: 'entry', vis_entry: other.data.id })).error, 'not a beat of this campaign');
  assert.ok((await attach({ vis: 'whenever' })).error);
  assert.ok((await a.client.from('campaign_entities').upsert({ campaign_id: C.id, entity_id: brew.data.id, vis: 'all' })).error, 'a player cannot change who sees it');
});

test('the new picker is behind its flag: a DM with it gets "Who sees this?", a DM without it gets the control as it was', async () => {
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const pages = {};
  for (const [who, camp] of [[dm, C], [plainDm, P]]) {
    const file = `${camp.id}/maps/${crypto.randomUUID()}.png`;
    assert.equal((await who.client.storage.from('campaign-files').upload(file, png, { contentType: 'image/png' })).error, null);
    assert.equal((await entry(who, { campaign_id: camp.id, kind: 'map', title: 'Flag map', live: true, vis: 'all', sort: 999, data: { file, w: 20, h: 20 } })).error, null);
    pages[who.id] = await page(`/c/${camp.slug}/tools/maps`, who.session);
    assert.equal(pages[who.id].status, 200);
  }
  const on = pages[dm.id].text, off = pages[plainDm.id].text;
  assert.ok(on.includes('class="vis2"') && on.includes('who sees it</span>'), 'the new control, with its Change button');
  assert.ok(!on.includes('class="vis"'), 'and not the old one');
  assert.ok(off.includes('class="vis"') && off.includes('Everyone at the table'), 'the old control, as it was');
  assert.ok(!off.includes('vis2') && !off.includes('Who sees this?'), 'and nothing of the new one');
  // a player gets neither
  const player = (await page(`/c/${C.slug}/tools/maps`, a.session)).text;
  assert.ok(!player.includes('vis2') && !player.includes('class="vis"'));
});
