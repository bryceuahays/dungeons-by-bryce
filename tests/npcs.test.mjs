// Hub version 2, item 10 (issue 90): the NPCs page. Cards with portrait, attitude, role, what the
// players know and when they were met; the DM chooses on each card how much players see. Every
// privacy rule is proved as a player's own login, through the database and the page HTML.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { attitudeOf, isHidden, matches, metLine, seesOf } from '../src/features/hub/npcs/model.ts';
import { cleanup, makeUser, page } from './helpers.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rnd = () => Math.random().toString(36).slice(2, 8);

// ------------------------------------------------------------------ the sums

test('attitude: its own field, or what the old statuses said', () => {
  assert.equal(attitudeOf({ status: 'alive', data: { attitude: 'ally' } }), 'ally');
  assert.equal(attitudeOf({ status: 'hostile', data: {} }), 'hostile', 'an NPC from before: hostile was a status');
  assert.equal(attitudeOf({ status: 'allied', data: {} }), 'ally');
  assert.equal(attitudeOf({ status: 'alive', data: {} }), 'neutral');
  assert.equal(attitudeOf({ status: '', data: { reveal: 'name' } }), null, 'a player told only the name does not know the attitude');
  assert.equal(attitudeOf({ status: 'dead', data: { attitude: 'friend' } }), 'neutral', 'nonsense is not an attitude');
});

test('"Players see", read from what is stored', () => {
  const n = (vis, data = {}) => ({ vis, vis_players: [], data });
  assert.equal(seesOf(n('all')), 'all');
  assert.equal(seesOf(n('all', { reveal: 'portrait' })), 'portrait');
  assert.equal(seesOf(n('all', { reveal: 'name' })), 'name');
  assert.equal(seesOf(n('dm')), 'hidden');
  for (const v of ['players', 'players_stage', 'players_entry', 'players_when']) assert.equal(seesOf(n(v)), 'some', v);
  for (const v of ['stage', 'entry', 'when']) assert.equal(seesOf(n(v)), 'later', v);
  assert.ok(isHidden(n('dm')) && isHidden(n('when')) && isHidden(n('players')) && !isHidden(n('all', { reveal: 'name' })));
});

test('the "met" line says what each reader may know', () => {
  const people = [{ id: A, label: 'Mira' }], chapters = [{ id: 'act2', label: 'Act two' }];
  assert.equal(metLine({ vis: 'all', data: { met: 1 } }, false), 'Met in Session 1');
  assert.equal(metLine({ vis: 'all', data: {} }, false), '');
  assert.equal(metLine({ vis: 'players', vis_players: [A], data: { met: 3 } }, true, { people }), 'Seen by one player (Mira), Session 3');
  assert.equal(metLine({ vis: 'when', vis_stage: 'session:5:started', data: {} }, true), 'Reveals when Session 5 starts');
  assert.equal(metLine({ vis: 'stage', vis_stage: 'act2', data: {} }, true, { chapters }), 'Reveals when Act two starts');
  assert.equal(metLine({ vis: 'dm', data: {} }, true), 'Hidden until you reveal them');
  assert.equal(metLine({ vis: 'players', vis_players: [A], data: { met: 3 } }, false), 'Met in Session 3', 'a player is not told who else saw them');
});

test('filters and search', () => {
  const a = { title: 'Bartholomew', vis: 'all', status: 'alive', data: { attitude: 'ally', role: 'Innkeeper' } };
  const h = { title: 'Grim', vis: 'dm', status: 'alive', data: { attitude: 'hostile' }, secret: { secret: 'Serves the cult' } };
  assert.ok(matches(a, 'all', '') && matches(a, 'ally', '') && !matches(a, 'hostile', '') && !matches(a, 'hidden', ''));
  assert.ok(matches(h, 'hostile', '') && matches(h, 'hidden', ''));
  assert.ok(matches(a, 'all', 'innkeep'), 'by role');
  assert.ok(matches(h, 'all', 'cult'), 'the DM finds by their own notes');
  assert.ok(!matches(a, 'all', 'cult'));
});

// ------------------------------------------------------------------ the page

let dm, p1, p2, plain, C;
const ids = {};
before(async () => {
  await cleanup();
  [dm, p1, p2] = await Promise.all([makeUser('npdm'), makeUser('npp1', { free: true }), makeUser('npp2', { free: true })]);
  plain = await makeUser('npplain', { unblocked: true, free: true });
  const slug = 'npc-' + rnd();
  C = (await dm.client.from('campaigns').insert({ slug, title: 'NPC Realm', phases: [], phase: '' }).select('id, slug').single()).data;
  await dm.client.from('sections').insert({ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' });
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await dm.client.from('invites').insert({ campaign_id: C.id, code });
  for (const u of [p1, p2, plain]) assert.equal((await u.client.rpc('join_campaign', { p_code: code })).error, null);
  const add = async (key, row, secret) => {
    const r = await dm.client.from('entries').insert({ campaign_id: C.id, kind: 'npc', live: true, vis_players: [], data: {}, ...row }).select('id').single();
    assert.equal(r.error, null, key + ': ' + r.error?.message);
    ids[key] = r.data.id;
    if (secret) assert.equal((await dm.client.from('entry_secrets').upsert({ entry_id: r.data.id, campaign_id: C.id, data: secret })).error, null);
  };
  await add('inn', { title: 'Bartholomew Pike', status: 'alive', vis: 'all', data: { attitude: 'ally', role: 'Innkeeper', known: 'Pours a fine ale at the Gilded Goose', met: 1 } }, { wants: 'A quiet life' });
  // name and portrait only: everything else is with the DM's notes, as npcSplit() keeps it
  await add('grim', { title: 'Grim Veyl', status: '', vis: 'all', data: { reveal: 'portrait' } }, { held: { status: 'alive', attitude: 'hostile', role: 'Cult enforcer', known: 'Serves the Hollow Choir', met: 3 } });
  await add('hood', { title: 'The Hooded Stranger', status: 'alive', vis: 'players', vis_players: [p1.id], data: { attitude: 'neutral', role: 'Dream visitor', known: 'Appeared to Mira in a dream', met: 3 } });
  await add('patron', { title: 'Lady Sable', status: 'alive', vis: 'when', vis_stage: 'session:5:started', data: { attitude: 'neutral', role: 'Mysterious patron', known: 'Secretly funds the expedition' } });
});
after(cleanup);

test('a player gets what has been revealed to them, and nothing more', async () => {
  const pg = await page(`/c/${C.slug}/hub/npcs`, p2.session);
  assert.equal(pg.status, 200);
  for (const words of ['Bartholomew Pike', 'Innkeeper', 'Pours a fine ale at the Gilded Goose', 'Met in Session 1', 'Grim Veyl', 'The people you have met.']) assert.ok(pg.text.includes(words), words);
  for (const secret of ['Cult enforcer', 'Hollow Choir', 'np-att hostile', 'The Hooded Stranger', 'Dream visitor', 'Lady Sable', 'Mysterious patron', 'funds the expedition', 'A quiet life', 'Players see', 'Add NPC']) assert.ok(!pg.text.includes(secret), 'not sent: ' + secret);
  // through the database too
  const rows = (await p2.client.from('entries').select('title, data, status').eq('campaign_id', C.id).eq('kind', 'npc')).data ?? [];
  assert.deepEqual(rows.map((r) => r.title).sort(), ['Bartholomew Pike', 'Grim Veyl']);
  assert.deepEqual(rows.find((r) => r.title === 'Grim Veyl').data, { reveal: 'portrait' }, 'the partly revealed NPC carries nothing else');
  const mine = await page(`/c/${C.slug}/hub/npcs`, p1.session);
  assert.ok(mine.text.includes('The Hooded Stranger') && mine.text.includes('Appeared to Mira in a dream'), 'the named player gets theirs');
  assert.ok(!mine.text.includes('Lady Sable'));
});

test('the DM gets everyone, and chooses how much players see', async () => {
  const pg = await page(`/c/${C.slug}/hub/npcs`, dm.session);
  assert.equal(pg.status, 200);
  for (const words of ['Bartholomew Pike', 'Grim Veyl', 'Cult enforcer', 'Players only know the name and face', 'The Hooded Stranger', 'Seen by one player', 'Lady Sable', 'Reveals when Session 5 starts',
    'Players see', 'Everything', 'Name and portrait', 'Name only', 'Nothing (hidden)', '+ Add NPC', 'Choose how much players see of each.', 'np-att hostile', 'np-att ally']) assert.ok(pg.text.includes(words), words);
  assert.ok(pg.text.includes(`href="/c/${C.slug}/hub/npcs"`), 'the tab row links to it');
});

test('a DM previewing as a player gets what players get', async () => {
  const pg = await page(`/c/${C.slug}/hub/npcs`, dm.session, 'dbb-view-as-player=1');
  assert.equal(pg.status, 200);
  assert.ok(pg.text.includes('Bartholomew Pike') && !pg.text.includes('Lady Sable') && !pg.text.includes('The Hooded Stranger') && !pg.text.includes('Cult enforcer') && !pg.text.includes('Players see'));
});

test('behind its flag, and not for visitors', async () => {
  assert.notEqual((await page(`/c/${C.slug}/hub/npcs`, null)).status, 200);
  const off = await page(`/c/${C.slug}/hub/npcs`, plain.session);
  // an ordinary player, while the flag is not on for everyone
  if (off.status !== 200) assert.equal(off.status, 404);
  const home = await page(`/c/${C.slug}/overview`, plain.session);
  if (off.status === 404) assert.ok(!home.text.includes('/hub/npcs'), 'and no link to it');
});
