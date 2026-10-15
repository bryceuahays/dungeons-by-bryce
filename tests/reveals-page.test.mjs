// Hub version 2, item 14 (issue 93): the Reveals page. Everything hidden across the hub, grouped
// by when it comes out, with "Reveal now" and "Change when". DM only: players, a DM previewing as
// one, and anyone without the flag get "not found", and nothing on it reaches their browser.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { revealedVis, schedule } from '../src/features/hub/reveals/schedule.ts';
import { admin, cleanup, makeUser, page } from './helpers.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BEAT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', HIT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const rnd = () => Math.random().toString(36).slice(2, 8);

// ------------------------------------------------------------------ the sums

const world = (over = {}) => ({
  met: new Set(['session:1:started', 'session:1:played', 'chapter:act1', 'beat:' + HIT]), stage: 'act1',
  chapters: [{ id: 'act1', label: 'Act one' }, { id: 'act2', label: 'Act two' }], beats: [{ id: BEAT, label: 'The vault opens' }, { id: HIT, label: 'The bridge falls' }], hitBeats: new Set([HIT]),
  people: [{ id: A, label: 'Mira' }, { id: B, label: 'Tobin' }], sessions: [{ number: 4, status: 'planned', title: 'The vault' }], tabs: [{ id: 'overview', label: 'Overview' }], ...over,
});
const e = (id, vis, over = {}) => ({ id, kind: 'npc', title: id, live: true, vis, vis_players: [], vis_stage: null, vis_entry: null, data: {}, ...over });

test('what is hidden, and when it comes out', () => {
  const groups = schedule({
    entries: [
      e('open', 'all'), e('named-now', 'players', { vis_players: [A] }), e('reached', 'stage', { vis_stage: 'act1' }), e('hit', 'entry', { vis_entry: HIT }), e('played1', 'when', { vis_stage: 'session:1:played' }),
      e('held', 'dm'), e('held-for-mira', 'dm', { vis_players: [A] }), e('draft', 'all', { live: false }),
      e('act2', 'stage', { vis_stage: 'act2' }), e('vault', 'players_entry', { vis_players: [B], vis_entry: BEAT }),
      e('s4', 'when', { vis_stage: 'session:4:started', data: { reveal: 'portrait' } }), e('s4b', 'when', { vis_stage: 'session:4:started', kind: 'clue' }), e('s6', 'players_when', { vis_stage: 'session:6:played', vis_players: [A] }),
      e('gone-chapter', 'stage', { vis_stage: 'act9' }), e('nonsense', 'when', { vis_stage: 'nonsense' }),
      e('a-log', 'dm', { kind: 'log' }), e('a-beat', 'dm', { kind: 'beat' }), e('a-fight', 'dm', { kind: 'encounter' }),
    ],
    brew: [{ entity_id: 'brew1', name: 'Moonblade', type: 'item', vis: 'when', vis_players: [], vis_stage: 'session:4:started' }, { entity_id: 'brew2', name: 'Open spell', type: 'spell', vis: 'all' }],
    blocks: [
      { id: 'b-open', section: 'overview', kind: 'html', title: 'Open', visibility: 'player', hidden: false, phase: null },
      { id: 'b-held', section: 'overview', kind: 'html', title: 'Held', visibility: 'player', hidden: true, phase: null },
      { id: 'b-s4', section: 'overview', kind: 'html', title: 'At four', visibility: 'player', hidden: true, phase: null, reveal_when: 'session:4:started', only_players: [B] },
      { id: 'b-met', section: 'overview', kind: 'html', title: 'Played one', visibility: 'player', hidden: true, phase: null, reveal_when: 'session:1:played' },
      { id: 'b-act2', section: 'overview', kind: 'html', title: 'Act two block', visibility: 'player', hidden: false, phase: null, from_stage: 'act2' },
      { id: 'b-dm', section: 'overview', kind: 'html', title: 'DM notes', visibility: 'dm', hidden: true, phase: null },
      { id: 'b-phase', section: 'overview', kind: 'html', title: 'Variant', visibility: 'player', hidden: false, phase: 'act2' },
    ],
  }, world());

  assert.deepEqual(groups.map((g) => g.title), ['Session 4', 'Session 6', 'Act two', 'Once “The vault opens” happens', 'Unscheduled'], 'sessions first, then chapters, beats, and what waits for you');
  const ids = (title) => groups.find((g) => g.title === title).items.map((i) => i.ref.id).sort();
  assert.deepEqual(ids('Session 4'), ['b-s4', 'brew1', 's4', 's4b']);
  assert.deepEqual(ids('Session 6'), ['s6']);
  assert.deepEqual(ids('Act two'), ['act2', 'b-act2']);
  assert.deepEqual(ids('Once “The vault opens” happens'), ['vault']);
  assert.deepEqual(ids('Unscheduled'), ['b-held', 'draft', 'gone-chapter', 'held', 'held-for-mira', 'nonsense'], 'a chapter or trigger that cannot happen waits for you');
  const all = groups.flatMap((g) => g.items.map((i) => i.ref.id));
  for (const out of ['open', 'named-now', 'reached', 'hit', 'played1', 'b-open', 'b-met', 'b-dm', 'b-phase', 'brew2', 'a-log', 'a-beat', 'a-fight']) assert.ok(!all.includes(out), out + ' is not hidden (or not this page\'s)');

  const s4 = groups[0];
  assert.equal(s4.sub, 'Goes live when the session starts · Planned · The vault');
  const item = (id) => groups.flatMap((g) => g.items).find((i) => i.ref.id === id);
  assert.equal(item('s4').note, 'Players will see: name and portrait');
  assert.equal(item('s4').type, 'NPC');
  assert.equal(item('s4b').type, 'Clue');
  assert.equal(item('brew1').type, 'Homebrew · Magic item');
  assert.equal(item('b-s4').note, 'On the Overview page · Only Tobin will see this');
  assert.equal(item('held-for-mira').note, 'Only Mira will see this · Players will see: everything');
  assert.equal(item('held-for-mira').type, 'Per-player · NPC');
  assert.equal(item('draft').note, 'Players will see: everything · Kept out of the feed');
  assert.equal(groups[1].sub, 'Goes live when the session is marked played · Not on your sessions list yet');

  // a session with both: each item says which
  const mixed = schedule({ entries: [e('x', 'when', { vis_stage: 'session:4:started' }), e('y', 'when', { vis_stage: 'session:4:played' })], brew: [], blocks: [] }, world());
  assert.equal(mixed[0].sub, 'Planned · The vault');
  assert.deepEqual(mixed[0].items.map((i) => i.when).sort(), ['Once the session is marked played', 'When the session starts']);
});

test('"Reveal now" keeps the players it names', () => {
  assert.deepEqual(revealedVis({ vis: 'when', vis_players: [], vis_stage: 'session:4:started' }), { vis: 'all', vis_players: [], vis_stage: null, vis_entry: null });
  assert.deepEqual(revealedVis({ vis: 'players_stage', vis_players: [A], vis_stage: 'act2' }), { vis: 'players', vis_players: [A], vis_stage: null, vis_entry: null });
  assert.deepEqual(revealedVis({ vis: 'dm', vis_players: [B] }), { vis: 'players', vis_players: [B], vis_stage: null, vis_entry: null }, 'held for Tobin: now Tobin');
  assert.deepEqual(revealedVis({ vis: 'dm', vis_players: [] }), { vis: 'all', vis_players: [], vis_stage: null, vis_entry: null });
  assert.deepEqual(revealedVis({ vis: 'stage', vis_players: [A], vis_stage: 'act2' }), { vis: 'all', vis_players: [], vis_stage: null, vis_entry: null }, 'everyone stays everyone, whatever names are left over');
});

// ------------------------------------------------------------------ the page

let dm, p1, plain, C;
before(async () => {
  await cleanup();
  [dm, p1] = await Promise.all([makeUser('rvdm'), makeUser('rvp1', { free: true })]);
  const slug = 'rvp-' + rnd();
  C = (await dm.client.from('campaigns').insert({ slug, title: 'Reveals Realm', phases: [{ id: 'act1', label: 'Act one' }, { id: 'act2', label: 'Act two' }], phase: 'act1' }).select('id, slug').single()).data;
  assert.ok(C);
  assert.equal((await dm.client.from('sections').insert([{ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' }])).error, null);
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await dm.client.from('invites').insert({ campaign_id: C.id, code });
  assert.equal((await p1.client.rpc('join_campaign', { p_code: code })).error, null);
  await dm.client.from('sessions').insert({ campaign_id: C.id, number: 4, title: 'The vault', status: 'planned' });
  const ins = await dm.client.from('entries').insert([
    { campaign_id: C.id, kind: 'npc', title: 'Warden Hask', status: '', vis: 'when', vis_stage: 'session:4:started', live: true, data: { reveal: 'portrait' } },
    { campaign_id: C.id, kind: 'npc', title: 'The Pale Queen', status: 'hostile', vis: 'stage', vis_stage: 'act2', live: true, data: {} },
    { campaign_id: C.id, kind: 'secret', title: 'The idol is a fake', status: '', vis: 'dm', live: true, data: {} },
    { campaign_id: C.id, kind: 'npc', title: 'Old friend', status: 'ally', vis: 'all', live: true, data: {} },
  ]);
  assert.equal(ins.error, null);
  await dm.client.from('content').insert({ campaign_id: C.id, section: 'overview', kind: 'html', key: 'k', sort: 10, title: 'The secret door', visibility: 'player', hidden: true, reveal_when: null, body: { html: '<p>Door</p>' } });
  plain = await makeUser('rvplain', { unblocked: true, dmOf: C.id });
});
after(cleanup);

test('the DM gets the page: what is hidden, by when, with Reveal now', async () => {
  const pg = await page(`/c/${C.slug}/hub/reveals`, dm.session);
  assert.equal(pg.status, 200);
  for (const words of ['<h1>Reveals</h1>', 'Only you can see this page.', 'Session 4', 'Goes live when the session starts', 'Warden Hask', 'Players will see: name and portrait',
    'Act two', 'The Pale Queen', 'Unscheduled', 'The idol is a fake', 'The secret door', 'On the Overview page', 'Reveal now', 'Start session', '+ Add plot secret', '4 things are hidden']) assert.ok(pg.text.includes(words), words);
  assert.ok(!pg.text.includes('Old friend'), 'what is already out is not listed');
  assert.ok(pg.text.includes(`href="/c/${C.slug}/hub/reveals"`), 'the tab row links to it');
});

test('nobody else gets it, or a link to it', async () => {
  const asPlayer = await page(`/c/${C.slug}/hub/reveals`, p1.session);
  assert.equal(asPlayer.status, 404, 'a player: not found');
  for (const secret of ['Warden Hask', 'The Pale Queen', 'The idol is a fake', 'The secret door']) assert.ok(!asPlayer.text.includes(secret));
  const home = await page(`/c/${C.slug}/overview`, p1.session);
  assert.equal(home.status, 200);
  assert.ok(!home.text.includes('/hub/reveals'), 'no link for a player');
  const preview = await page(`/c/${C.slug}/hub/reveals`, dm.session, 'dbb-view-as-player=1');
  assert.equal(preview.status, 404, 'a DM previewing as a player: not found');
  assert.ok(!(await page(`/c/${C.slug}/overview`, dm.session, 'dbb-view-as-player=1')).text.includes('/hub/reveals'));
  assert.equal((await page(`/c/${C.slug}/hub/reveals`, null)).status === 200, false, 'a visitor: never');
  // an ordinary co-DM, while the flag is not on for everyone
  if (!(await admin.from('feature_flags').select('is_on').eq('name', 'hub_v2_reveals').maybeSingle()).data?.is_on) {
    assert.equal((await page(`/c/${C.slug}/hub/reveals`, plain.session)).status, 404, 'behind its flag');
  }
});

test('a tab cannot take the hub\'s address', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/app/c/[slug]/actions.ts', import.meta.url), 'utf8');
  assert.match(src, /'session', 'hub', 'tools'/);
  const imp = (await import('node:fs')).readFileSync(new URL('../src/lib/import.ts', import.meta.url), 'utf8');
  assert.match(imp, /'players', 'hub', 'tools'/);
});
