// Issue 117: reveals that are easy to use. A trigger ("when Session 4 starts", "when Session 4
// is marked played", "once a story beat happens", "when a chapter starts") on table-tool
// entries, attached homebrew and page blocks; a switch on each page block; one-step "Start
// session" and "Mark played"; stages called chapters. Every privacy rule is proved as a
// player's own login, through the database and through the page HTML.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { entryOpen } from '../src/lib/entry-types.ts';
import { metKeys, parseTrigger, triggerKey, triggerWords } from '../src/features/hub/reveals/triggers.ts';
import { describe, fromChoice, problem, shortLabel, toChoice } from '../src/features/hub/visibility/model.ts';
import { ROOT, admin, cleanup, makeUser, page } from './helpers.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', BEAT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const rnd = () => Math.random().toString(36).slice(2, 8);

// ------------------------------------------------------------------ the rule, in code

test('a trigger is a short key, and only a well-formed one can ever happen', () => {
  assert.deepEqual(parseTrigger('session:4:started'), { kind: 'session', n: 4, when: 'started' });
  assert.deepEqual(parseTrigger('session:12:played'), { kind: 'session', n: 12, when: 'played' });
  assert.deepEqual(parseTrigger('beat:' + BEAT), { kind: 'beat', id: BEAT });
  assert.deepEqual(parseTrigger('chapter:act2'), { kind: 'chapter', id: 'act2' });
  for (const bad of ['session:4', 'session:x:played', 'session:4:ended', 'session:4:played:x', 'beat:not-a-uuid', 'chapter:', 'chapter:a:b', 'anything', '', null, 7]) assert.equal(parseTrigger(bad), null, String(bad));
  for (const k of ['session:4:started', 'session:4:played', 'beat:' + BEAT, 'chapter:act2']) assert.equal(triggerKey(parseTrigger(k)), k);

  const met = metKeys({ sessions: [{ number: 1, status: 'played' }, { number: 2, status: 'running' }, { number: 3, status: 'ready' }], hitBeats: [BEAT], stages: ['act1', 'act2', 'act3'], stage: 'act2' });
  assert.deepEqual([...met].sort(), ['beat:' + BEAT, 'chapter:act1', 'chapter:act2', 'session:1:played', 'session:1:started', 'session:2:started'].sort(), 'a played session has started too; a chapter reached stays reached');

  assert.equal(triggerWords('session:4:played'), 'Session 4 is marked played');
  assert.equal(triggerWords('session:4:started'), 'Session 4 starts');
  assert.equal(triggerWords('chapter:act2', { chapters: [{ id: 'act2', label: 'Act two' }] }), 'the chapter "Act two" starts');
  assert.equal(triggerWords('beat:' + BEAT, { beats: [{ id: BEAT, label: 'The vault opens' }] }), '"The vault opens" happens');
});

test('the rule: everyone or named players, once the trigger has happened', () => {
  const v = (player, met) => ({ player, stage: 's1', stages: ['s1'], met: new Set(met) });
  const row = (vis, key = 'session:4:played') => ({ vis, vis_players: [A], vis_stage: key, vis_entry: null });
  const none = new Set();
  assert.equal(entryOpen(row('when'), v(B, []), none), false, 'not before it happens');
  assert.equal(entryOpen(row('when'), v(B, ['session:4:started']), none), false, 'started is not played');
  assert.equal(entryOpen(row('when'), v(B, ['session:4:played']), none), true);
  assert.equal(entryOpen(row('players_when'), v(A, ['session:4:played']), none), true);
  assert.equal(entryOpen(row('players_when'), v(B, ['session:4:played']), none), false, 'it has happened, but not named');
  assert.equal(entryOpen(row('players_when'), v(null, ['session:4:played']), none), false, 'a preview as any player names nobody');
  assert.equal(entryOpen(row('when', null), v(B, ['session:4:played']), none), false, 'no key, never');
  assert.equal(entryOpen(row('when'), { player: B, stage: 's1', stages: ['s1'] }, none), false, 'without knowing what happened, closed');
});

test('the picker offers session triggers, and says them in words', () => {
  const people = [{ id: A, label: 'Mira' }];
  const v = fromChoice({ who: 'all', when: 'started', players: [], stage: null, entry: null, session: 4 });
  assert.deepEqual(v, { vis: 'when', vis_players: [], vis_stage: 'session:4:started', vis_entry: null });
  assert.deepEqual(toChoice(v), { who: 'all', when: 'started', players: [], stage: null, entry: null, session: 4 });
  const named = fromChoice({ who: 'players', when: 'played', players: [A], stage: null, entry: null, session: 2 });
  assert.deepEqual(named, { vis: 'players_when', vis_players: [A], vis_stage: 'session:2:played', vis_entry: null });
  assert.equal(describe(v, people), 'Every player will see this when Session 4 starts.');
  assert.equal(describe(named, people), 'Only Mira will see this once Session 2 is marked played.');
  assert.equal(shortLabel(v, people), 'Reveals when Session 4 starts');
  assert.equal(shortLabel(named, people), 'Only Mira, after Session 2 is played');
  assert.equal(problem({ who: 'all', when: 'played', players: [], stage: null, entry: null, session: null }), 'Choose a session.');
  assert.equal(problem({ who: 'all', when: 'played', players: [], stage: null, entry: null, session: 0 }), 'Choose a session.');
  assert.equal(problem({ who: 'all', when: 'played', players: [], stage: null, entry: null, session: 3 }), null);
  // a stored chapter or beat key reads as the choice it already has
  assert.deepEqual(toChoice({ vis: 'when', vis_players: [], vis_stage: 'chapter:act2' }).when, 'stage');
  assert.deepEqual(toChoice({ vis: 'players_when', vis_players: [A], vis_stage: 'beat:' + BEAT }), { who: 'players', when: 'entry', players: [A], stage: null, entry: BEAT });
  // a key nobody understands is held back, as "when I reveal it"
  assert.equal(fromChoice(toChoice({ vis: 'when', vis_players: [], vis_stage: 'nonsense' })).vis, 'dm');
});

test('the database knows the same triggers as the code', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261019000001_reveal_triggers.sql'), 'utf8');
  const fn = sql.slice(sql.indexOf('create or replace function public.reveal_met'), sql.indexOf('$$;', sql.indexOf('create or replace function public.reveal_met')));
  assert.deepEqual([...fn.matchAll(/(?:if|elsif) kind = '([a-z]+)'/g)].map((m) => m[1]), ['session', 'beat', 'chapter']);
  assert.match(fn, /what in \('started', 'played'\)/);
  assert.match(fn, /s\.status = 'played' or \(what = 'started' and s\.status = 'running'\)/, 'played counts as started, as in metKeys()');
  assert.match(fn, /return false;\s*end/, 'anything else never happens');
});

// ------------------------------------------------------------------ in the database, as players

let dm, p1, p2, C, S2, BEAT_ID;
const entry = (row) => dm.client.from('entries').insert({ campaign_id: C.id, live: true, data: {}, ...row }).select('id').single();
const sees = async (who, id) => ((await who.client.from('entries').select('id').eq('id', id)).data ?? []).length === 1;
const blocks = async (who) => ((await who.client.from('content').select('key').eq('campaign_id', C.id).eq('section', 'overview')).data ?? []).map((r) => r.key).sort();
const logs = async (who) => ((await who.client.from('entries').select('title').eq('campaign_id', C.id).eq('kind', 'log')).data ?? []).map((r) => r.title);
const setStatus = async (status) => assert.equal((await dm.client.from('sessions').update({ status }).eq('id', S2)).error, null);

before(async () => {
  await cleanup();
  [dm, p1, p2] = await Promise.all([makeUser('rdm'), makeUser('rp1', { free: true }), makeUser('rp2', { free: true })]);
  const slug = 'rev-' + rnd();
  const made = await dm.client.from('campaigns').insert({ slug, title: 'Reveal Realm', phases: [{ id: 'act1', label: 'Act one' }, { id: 'act2', label: 'Act two' }], phase: 'act1', settings: { feed: true } }).select('id, slug').single();
  assert.equal(made.error, null);
  C = made.data;
  assert.equal((await dm.client.from('sections').insert([{ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' }, { campaign_id: C.id, slug: 'sessions', title: 'Sessions', sort: 20, audience: 'dm', kind: 'sessions' }])).error, null);
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  assert.equal((await dm.client.from('invites').insert({ campaign_id: C.id, code })).error, null);
  for (const u of [p1, p2]) assert.equal((await u.client.rpc('join_campaign', { p_code: code })).error, null);
  const s = await dm.client.from('sessions').insert([{ campaign_id: C.id, number: 1, title: 'The road', status: 'played' }, { campaign_id: C.id, number: 2, title: 'The vault', status: 'ready' }]).select('id, number');
  assert.equal(s.error, null);
  S2 = s.data.find((x) => x.number === 2).id;
  const beat = await entry({ kind: 'beat', title: 'The bridge falls', status: 'planned', vis: 'all', live: false });
  assert.equal(beat.error, null);
  BEAT_ID = beat.data.id;
});
after(cleanup);

test('entries: shown when the session starts, or once it is played, to everyone or to the named players', async () => {
  const npc = await entry({ kind: 'npc', title: 'Warden Hask', status: 'neutral', vis: 'when', vis_stage: 'session:2:started' });
  const secret = await entry({ kind: 'secret', title: 'The idol is a fake', vis: 'players_when', vis_players: [p1.id], vis_stage: 'session:2:played' });
  const junk = await entry({ kind: 'npc', title: 'Nobody', status: 'neutral', vis: 'when', vis_stage: 'session:x:played' });
  const elsewhere = await entry({ kind: 'npc', title: 'Somebody', status: 'neutral', vis: 'when', vis_stage: 'beat:cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
  for (const r of [npc, secret, junk, elsewhere]) assert.equal(r.error, null);
  for (const p of [p1, p2]) for (const r of [npc, secret, junk, elsewhere]) assert.equal(await sees(p, r.data.id), false, 'nothing before its session');
  assert.equal(await sees(p1, (await entry({ kind: 'npc', title: 'Old friend', status: 'ally', vis: 'when', vis_stage: 'session:1:started' })).data.id), true, 'session 1 was played, so it has started');

  await setStatus('running');
  assert.equal(await sees(p1, npc.data.id), true, 'the session started');
  assert.equal(await sees(p2, npc.data.id), true);
  assert.equal(await sees(p1, secret.data.id), false, 'started is not played');
  assert.ok((await logs(p2)).includes('Someone new to know: Warden Hask'), 'the reveal log says so');
  assert.ok(!(await logs(p2)).some((t) => /idol/.test(t)));

  await setStatus('played');
  assert.equal(await sees(p1, secret.data.id), true, 'played, and named');
  assert.equal(await sees(p2, secret.data.id), false, 'played, but not named');
  assert.ok((await logs(p1)).includes('Newly revealed: The idol is a fake'));
  assert.ok(!(await logs(p2)).includes('Newly revealed: The idol is a fake'), 'the log line is only for the named player');
  for (const p of [p1, p2]) for (const r of [junk, elsewhere]) assert.equal(await sees(p, r.data.id), false, 'a key that cannot happen, or a beat from somewhere else, never opens');

  // the rule is live: moving the session back hides it again
  await setStatus('ready');
  assert.equal(await sees(p2, npc.data.id), false);
  await setStatus('played');
  assert.equal(await sees(p2, npc.data.id), true);
});

test('page blocks: hidden until a session is played or a beat happens, and the page HTML agrees', async () => {
  await setStatus('ready');
  const ins = await dm.client.from('content').insert([
    { campaign_id: C.id, section: 'overview', kind: 'html', key: 'open', sort: 10, title: 'a', visibility: 'player', hidden: false, reveal_when: null, body: { html: '<p>The gates are open</p>' } },
    { campaign_id: C.id, section: 'overview', kind: 'html', key: 'played', sort: 20, title: 'b', visibility: 'player', hidden: true, reveal_when: 'session:2:played', body: { html: '<p>The vault was empty all along</p>' } },
    { campaign_id: C.id, section: 'overview', kind: 'html', key: 'beat', sort: 30, title: 'c', visibility: 'player', hidden: true, reveal_when: 'beat:' + BEAT_ID, body: { html: '<p>The river is uncrossable</p>' } },
    { campaign_id: C.id, section: 'overview', kind: 'html', key: 'hand', sort: 40, title: 'd', visibility: 'player', hidden: true, reveal_when: null, body: { html: '<p>Held by hand</p>' } },
    { campaign_id: C.id, section: 'overview', kind: 'html', key: 'dmonly', sort: 50, title: 'e', visibility: 'dm', hidden: true, reveal_when: 'session:2:played', body: { html: '<p>DM eyes only</p>' } },
  ]);
  assert.equal(ins.error, null);
  assert.equal((await dm.client.from('content').update({ reveal_when: 'x'.repeat(81) }).eq('campaign_id', C.id).eq('key', 'hand')).error?.code, '23514', 'a key is short');

  assert.deepEqual(await blocks(p1), ['open']);
  let html = (await page(`/c/${C.slug}/overview`, p1.session)).text;
  assert.ok(html.includes('The gates are open') && !html.includes('vault was empty') && !html.includes('uncrossable') && !html.includes('Held by hand'));

  await setStatus('played');
  assert.deepEqual(await blocks(p1), ['open', 'played']);
  assert.deepEqual(await blocks(p2), ['open', 'played']);
  html = (await page(`/c/${C.slug}/overview`, p2.session)).text;
  assert.ok(html.includes('The vault was empty all along') && !html.includes('DM eyes only') && !html.includes('Held by hand'), 'played: shown; DM only stays DM only');
  assert.ok((await logs(p2)).includes('New on the Overview page'));

  // the DM previewing as a player gets the same
  const preview = (await page(`/c/${C.slug}/overview`, dm.session, 'dbb-view-as-player=1')).text;
  assert.ok(preview.includes('The vault was empty all along') && !preview.includes('uncrossable') && !preview.includes('Held by hand') && !preview.includes('DM eyes only'), 'the preview matches');

  const before = (await logs(p1)).filter((t) => t === 'New on the Overview page').length;
  assert.equal((await dm.client.from('entries').update({ status: 'hit' }).eq('id', BEAT_ID)).error, null);
  assert.deepEqual(await blocks(p1), ['beat', 'open', 'played'], 'the beat happened');
  assert.ok((await page(`/c/${C.slug}/overview`, p1.session)).text.includes('The river is uncrossable'));
  assert.equal((await logs(p1)).filter((t) => t === 'New on the Overview page').length, before + 1, 'and the log says so');
});

test('DM screens: the block switch, the session buttons, chapters', async () => {
  const edit = (await page(`/c/${C.slug}/edit/overview`, dm.session)).text;
  assert.ok(edit.includes('role="switch"') && edit.includes('Reveal it automatically?'), 'each block has the switch');
  assert.ok(edit.includes('Hidden. Players see it when you reveal it.'), 'a block held by hand says so');
  assert.ok(edit.includes('It was revealed when Session 2 was marked played.'), 'a block its trigger revealed says so');
  // a third session, with something waiting for it
  const s3 = await dm.client.from('sessions').insert({ campaign_id: C.id, number: 3, title: 'The tower', status: 'planned' }).select('id').single();
  assert.equal(s3.error, null);
  await entry({ kind: 'npc', title: 'The tower keeper', status: 'neutral', vis: 'when', vis_stage: 'session:3:started' });
  await dm.client.from('content').insert({ campaign_id: C.id, section: 'overview', kind: 'html', key: 'tower', sort: 60, title: 'f', visibility: 'player', hidden: true, reveal_when: 'session:3:played', body: { html: '<p>Tower</p>' } });
  const list = (await page(`/c/${C.slug}/sessions`, dm.session)).text;
  assert.ok(list.includes('Planned. 2 waiting to be revealed'), 'the list says what waits for each session');
  const one = (await page(`/c/${C.slug}/session/3`, dm.session)).text;
  assert.ok(one.includes('Start session') && one.includes('1 thing is waiting for this.'), 'and the session page has the button');
  assert.ok(one.includes('<option value="running"'), 'Under way is a status');
  const manage = (await page(`/c/${C.slug}/manage`, dm.session)).text;
  assert.ok(manage.includes('Chapters') && manage.includes('Start the next chapter'), 'stages are called chapters');
  // players get none of it
  assert.equal((await p1.client.from('sessions').select('id').eq('campaign_id', C.id)).data?.length ?? 0, 0, 'players cannot read sessions');
});

test('without the flag, the editor and the session page are as they were', async () => {
  const plain = await makeUser('rplain', { unblocked: true, dmOf: C.id });
  // an ordinary co-DM: hub_v2_visibility is off for them unless it is switched on for everyone
  if ((await admin.from('feature_flags').select('is_on').eq('name', 'hub_v2_visibility').maybeSingle()).data?.is_on) return;   // switched on for everyone: nothing to compare
  const edit = (await page(`/c/${C.slug}/edit/overview`, plain.session)).text;
  assert.ok(!edit.includes('role="switch"') && edit.includes('Show again') && !edit.includes('Reveal it automatically'));
  const one = (await page(`/c/${C.slug}/session/3`, plain.session)).text;
  assert.ok(one.includes('Save') && !one.includes('Start session') && !one.includes('<option value="running"'));
  assert.ok(!(await page(`/c/${C.slug}/manage`, plain.session)).text.includes('Start the next chapter'));
});
