// Hub version 2, item 17 (issue 96): the Quest log. Quests and their objectives are entries, each
// with its own visibility; a player never reads an objective of a quest they cannot see, is told only
// how many objectives are still hidden from them, and never gets a reward held back until the quest
// is completed. Each person's tracked quests are their own. Every rule is proved as a player's login.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { givenLine, heldNote, inputOf, progress, splitQuest, tabsOf, welcomeQuests } from '../src/features/hub/quests/model.ts';
import { buildTimeline } from '../src/features/hub/timeline/model.ts';
import { admin, cleanup, makeUser, page } from './helpers.mjs';

const rnd = () => Math.random().toString(36).slice(2, 8);
const NPC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLACE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// ------------------------------------------------------------------ the sums

test('saving a quest: what players may read, and what waits with the DM', () => {
  const now = splitQuest({ main: true, giver: NPC, place: 'not-an-id', placeName: ' The Drowned Library ', since: '1', done: '4', summary: ' Find the scholar ', reward: '500 gold', rewardWhen: 'now', notes: 'She is the thief', status: 'active' });
  assert.deepEqual(now, { status: 'active', data: { main: true, giver: NPC, placeName: 'The Drowned Library', since: 1, summary: 'Find the scholar', reward: '500 gold' }, secret: { notes: 'She is the thief', rewardWhen: 'now' } }, 'an active quest has no end session');
  const held = splitQuest({ reward: 'A writ of passage', rewardWhen: 'done', status: 'active' });
  assert.deepEqual(held, { status: 'active', data: { rewardLater: true }, secret: { reward: 'A writ of passage', rewardWhen: 'done' } }, 'a held reward is not on the quest');
  const won = splitQuest({ reward: 'A writ of passage', rewardWhen: 'done', status: 'completed', done: 3 });
  assert.equal(won.data.reward, 'A writ of passage', 'completed: the reward is revealed');
  assert.equal(won.data.done, 3);
  assert.equal(splitQuest({ reward: 'x', rewardWhen: 'done', status: 'failed' }).data.rewardLater, true, 'failed: still held');
  assert.equal(splitQuest({ status: 'nonsense' }).status, 'active');
  assert.deepEqual(inputOf({ status: 'completed', data: { reward: 'x' }, secret: { reward: 'x', rewardWhen: 'done' } }).rewardWhen, 'done');
});

test('the card: who gave it, progress, what is still hidden', () => {
  const q = { id: 'q1', title: 'Q', status: 'active', data: { giver: NPC, place: PLACE, since: 2 } };
  assert.equal(givenLine(q, [{ id: NPC, title: 'Lady Sable' }], [{ id: PLACE, title: 'Millbrook' }]), 'Given by Lady Sable · Millbrook · Since Session 2');
  assert.equal(givenLine(q, [], []), 'Since Session 2', 'a giver or place the reader cannot see is left out');
  assert.equal(givenLine({ ...q, status: 'completed', data: { giverName: 'A stranger', done: 4 } }, [], []), 'Given by A stranger · Done in Session 4');
  const objs = [{ id: 'a', title: 'a', status: 'done', parent: 'q1', data: {} }, { id: 'b', title: 'b', status: 'open', parent: 'q1', data: {} }];
  assert.deepEqual(progress(objs, 2), { done: 1, total: 4, line: '1 of 4 objectives' });
  assert.equal(heldNote(q, 1, { hidden: true, rewards: true }), '1 objective still hidden');
  assert.equal(heldNote({ ...q, data: { rewardLater: true } }, 0, { hidden: true, rewards: true }), 'Reward revealed on completion');
  assert.equal(heldNote(q, 3, { hidden: false, rewards: true }), '', 'hidden objectives switched off');
});

test('tabs, groups, and the Welcome page\'s few', () => {
  const qs = [{ id: 's1', title: 'Side', status: 'active', data: {} }, { id: 'm', title: 'Main', status: 'active', data: { main: true } }, { id: 'd', title: 'Done', status: 'completed', data: {} }, { id: 's2', title: 'Side 2', status: 'active', data: {} }];
  const t = tabsOf(qs);
  assert.deepEqual(t.active.map((g) => [g.title, g.quests.map((q) => q.id)]), [['Main quest', ['m']], ['Side quests', ['s1', 's2']]]);
  assert.deepEqual(t.completed.map((g) => g.quests.map((q) => q.id)), [['d']]);
  assert.deepEqual(t.failed, []);
  assert.deepEqual(welcomeQuests(qs, new Set(['s2']), true).map((q) => q.id), ['s2'], 'the ones tracked');
  assert.deepEqual(welcomeQuests(qs, new Set(), true).map((q) => q.id), ['m', 's1', 's2'], 'none tracked: the main quest first');
  assert.deepEqual(welcomeQuests(qs, new Set(['s2']), false).map((q) => q.id), ['m', 's1', 's2'], 'tracking switched off');
});

test('the timeline strip: "Quest started" in its session', () => {
  const cols = buildTimeline({ session: 3, beats: [], dm: false, quests: [{ id: 'a', title: 'The missing scholar', since: 2 }, { id: 'b', title: 'Later', since: 9 }, { id: 'c', title: 'No session', since: 0 }] });
  assert.deepEqual(cols.find((c) => c.n === 2).events.map((e) => e.label), ['Quest started: The missing scholar']);
  assert.ok(!JSON.stringify(cols).includes('Later') && !JSON.stringify(cols).includes('No session'));
});

// ------------------------------------------------------------------ the database and the page (need the quests migration)

let dm, p1, p2, plain, C, other, Q, HIDDEN, PERSONAL, ids;
before(async () => {
  await cleanup();
  [dm, p1, p2] = await Promise.all([makeUser('qsdm'), makeUser('qsp1', { free: true }), makeUser('qsp2', { free: true })]);
  plain = await makeUser('qsplain', { unblocked: true, free: true });
  C = (await dm.client.from('campaigns').insert({ slug: 'qst-' + rnd(), title: 'Quest Realm', phases: [], phase: '', settings: { session: 3 } }).select('id, slug').single()).data;
  other = (await dm.client.from('campaigns').insert({ slug: 'qso-' + rnd(), title: 'Other Realm', phases: [], phase: '', settings: {} }).select('id, slug').single()).data;
  await dm.client.from('sections').insert({ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' });
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await dm.client.from('invites').insert({ campaign_id: C.id, code });
  for (const u of [p1, p2, plain]) assert.equal((await u.client.rpc('join_campaign', { p_code: code })).error, null);
  const add = async (row, secret) => {
    const r = await dm.client.from('entries').insert({ campaign_id: C.id, live: true, status: '', vis: 'all', vis_players: [], data: {}, ...row }).select('id').single();
    assert.equal(r.error, null, row.title + ': ' + r.error?.message);
    if (secret) assert.equal((await dm.client.from('entry_secrets').upsert({ entry_id: r.data.id, campaign_id: C.id, data: secret })).error, null);
    return r.data.id;
  };
  const sable = await add({ kind: 'npc', title: 'Lady Sable' });
  await add({ kind: 'npc', title: 'The Masked Patron', vis: 'dm' });
  Q = await add({ kind: 'quest', title: 'The Missing Scholar', status: 'active', data: { main: true, giver: sable, placeName: 'The Drowned Library', since: 2, summary: 'Find Master Orrin before the tide.', reward: '500 gold' } }, { notes: 'Orrin faked his own vanishing', rewardWhen: 'now' });
  ids = {
    done: await add({ kind: 'objective', parent: Q, title: 'Search his study', status: 'done', sort: 0 }),
    open: await add({ kind: 'objective', parent: Q, title: 'Question the ferryman', status: 'open', sort: 1 }),
    hidden: await add({ kind: 'objective', parent: Q, title: 'Unmask the thief', status: 'open', sort: 2, vis: 'dm' }),
  };
  HIDDEN = await add({ kind: 'quest', title: 'The Patron\'s Bargain', status: 'active', vis: 'dm', data: { since: 3 } });
  ids.leak = await add({ kind: 'objective', parent: HIDDEN, title: 'Steal the bell', status: 'open', vis: 'all' });
  PERSONAL = await add({ kind: 'quest', title: 'A Debt Unpaid', status: 'active', vis: 'players', vis_players: [p1.id], data: { summary: 'Tied to your past.', rewardLater: true } }, { reward: 'Your brother\'s sword', rewardWhen: 'done' });
  await add({ kind: 'objective', parent: PERSONAL, title: 'Find the moneylender', status: 'open' });
  await add({ kind: 'quest', title: 'Rats in the Cellar', status: 'completed', data: { done: 1, reward: '10 silver' } });
});
after(async () => { await admin.from('campaigns').delete().eq('id', other?.id ?? '00000000-0000-0000-0000-000000000000'); await cleanup(); });

test('a player reads the objectives of quests they can see, and only the number still hidden', async () => {
  const rows = (await p2.client.from('entries').select('id, title, kind').eq('campaign_id', C.id).in('kind', ['quest', 'objective'])).data ?? [];
  assert.deepEqual(rows.map((r) => r.title).sort(), ['Question the ferryman', 'Rats in the Cellar', 'Search his study', 'The Missing Scholar'], 'not the hidden quest, its objective set to everyone, the hidden objective, or someone else\'s quest');
  const n = (await p2.client.rpc('quest_hidden', { c: C.id })).data ?? [];
  assert.deepEqual(n.map((r) => [r.quest, r.hidden]), [[Q, 1]], 'one hidden on the quest they can see; nothing about the quest they cannot');
  assert.equal(((await p2.client.from('entry_secrets').select('entry_id').eq('campaign_id', C.id)).data ?? []).length, 0, 'no notes or held rewards');
  const mine = (await p1.client.from('entries').select('title').eq('campaign_id', C.id).eq('kind', 'objective')).data ?? [];
  assert.ok(mine.some((r) => r.title === 'Find the moneylender'), 'the named player gets their quest\'s objectives');
  assert.ok(!mine.some((r) => r.title === 'Steal the bell'));
});

test('an objective belongs to a quest in the same campaign; reveals write no line for an objective', async () => {
  const bad = await dm.client.from('entries').insert({ campaign_id: other.id, kind: 'objective', parent: Q, title: 'x', vis: 'all', vis_players: [] });
  assert.ok(bad.error, 'not under another campaign\'s quest');
  const npc = (await dm.client.from('entries').select('id').eq('campaign_id', C.id).eq('kind', 'npc').limit(1).single()).data;
  assert.ok((await dm.client.from('entries').insert({ campaign_id: C.id, kind: 'objective', parent: npc.id, title: 'x', vis: 'all', vis_players: [] })).error, 'not under something that is not a quest');
  assert.equal((await dm.client.from('entries').update({ vis: 'all' }).eq('id', ids.hidden)).error, null);
  const log = (await dm.client.from('entries').select('title, data').eq('campaign_id', C.id).eq('kind', 'log')).data ?? [];
  assert.ok(!log.some((l) => l.data?.entry === ids.hidden), 'no line for the objective');
  assert.equal((await dm.client.from('entries').update({ vis: 'dm' }).eq('id', ids.hidden)).error, null);
});

test('tracking a quest: your own, and only quests you can see', async () => {
  assert.equal((await p2.client.from('quest_tracks').insert({ quest_id: Q, campaign_id: C.id })).error, null);
  assert.ok((await p2.client.from('quest_tracks').insert({ quest_id: HIDDEN, campaign_id: C.id })).error, 'not a quest they cannot see');
  assert.ok((await p2.client.from('quest_tracks').insert({ quest_id: Q, campaign_id: C.id, user_id: p1.id })).error, 'not for someone else');
  assert.equal(((await p1.client.from('quest_tracks').select('quest_id').eq('campaign_id', C.id)).data ?? []).length, 0, 'nobody else reads them');
  assert.equal(((await dm.client.from('quest_tracks').select('quest_id').eq('campaign_id', C.id)).data ?? []).length, 0, 'not even the DM');
});

test('the Quest log as a player: what is theirs to see, and nothing more', async () => {
  const pg = await page(`/c/${C.slug}/hub/quests`, p2.session);
  assert.equal(pg.status, 200);
  for (const words of ['Quest log', 'Objectives tick off as the DM updates them.', 'Active · 1', 'Completed · 1', 'Main quest', 'The Missing Scholar', 'Given by Lady Sable · The Drowned Library · Since Session 2',
    'Find Master Orrin before the tide.', 'Search his study', 'Question the ferryman', '??? Not revealed yet', '1 objective still hidden', '500 gold', 'Tracking']) assert.ok(pg.text.includes(words), words);
  for (const secret of ['Unmask the thief', 'The Patron', 'Steal the bell', 'A Debt Unpaid', 'moneylender', 'faked his own', 'brother', 'The Masked Patron', '+ Add quest', 'Edit<span class="qs-sr"']) assert.ok(!pg.text.includes(secret), 'not sent: ' + secret);
  const mine = await page(`/c/${C.slug}/hub/quests`, p1.session);
  for (const words of ['A Debt Unpaid', 'Tied to your past.', 'Reward revealed on completion', '???', 'Active · 2']) assert.ok(mine.text.includes(words), words);
  assert.ok(!mine.text.includes('brother'), 'the held reward stays with the DM');
  assert.ok(pg.text.includes(`href="/c/${C.slug}/hub/quests"`), 'the tab row links to it');
});

test('the Quest log as the DM: everything, marked, with the editor; Welcome, timeline and Reveals', async () => {
  const pg = await page(`/c/${C.slug}/hub/quests`, dm.session);
  assert.equal(pg.status, 200);
  for (const words of ['Unmask the thief', 'The Patron', 'Steal the bell', 'A Debt Unpaid', 'Only Test qsp1', 'Reward on completion: Your brother', '+ Add quest', 'Active · 3']) assert.ok(pg.text.includes(words), words);
  const wl = await page(`/c/${C.slug}/hub/welcome`, p2.session);
  assert.ok(wl.text.includes('Active quests') && wl.text.includes('The Missing Scholar') && wl.text.includes('1 of 3 objectives'), 'Welcome: the quest p2 tracks, with the hidden one counted');
  assert.ok(!wl.text.includes('The Patron'));
  const strip = await page(`/c/${C.slug}/overview`, p2.session);
  assert.ok(strip.text.includes('Quest started: The Missing Scholar') && !strip.text.includes('Quest started: The Patron'), 'the strip has the quests they may see');
  const rv = await page(`/c/${C.slug}/hub/reveals`, dm.session);
  assert.ok(rv.text.includes('Quest objective') && rv.text.includes('On quest: The Missing Scholar') && rv.text.includes('The Patron'), 'hidden quests and objectives are on the Reveals page');
});

test('a DM previewing as a player gets what players get; it is behind its flag', async () => {
  const pg = await page(`/c/${C.slug}/hub/quests`, dm.session, 'dbb-view-as-player=1');
  assert.equal(pg.status, 200);
  assert.ok(pg.text.includes('The Missing Scholar') && pg.text.includes('1 objective still hidden'));
  for (const secret of ['Unmask the thief', 'Steal the bell', 'The Patron', 'faked his own', '+ Add quest']) assert.ok(!pg.text.includes(secret), 'not sent: ' + secret);
  assert.notEqual((await page(`/c/${C.slug}/hub/quests`, null)).status, 200);
  const off = await page(`/c/${C.slug}/hub/quests`, plain.session);
  if (off.status !== 200) assert.equal(off.status, 404, 'an ordinary player, while the flag is off for everyone');
});
