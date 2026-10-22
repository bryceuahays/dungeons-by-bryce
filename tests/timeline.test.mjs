// Hub version 2, item 15 (issue 94): the timeline strip, session by session. Players get the beats
// that have happened and that they may see; planned sessions, planned beats and scheduled reveals are
// the DM's alone, and never reach a player's browser.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from '../src/features/hub/timeline/model.ts';
import { admin, cleanup, makeUser, page } from './helpers.mjs';

const rnd = () => Math.random().toString(36).slice(2, 8);
const beat = (id, status, data = {}, vis = 'all') => ({ id, title: id, status, vis, data });

test('the strip: played sessions, up next, and what the DM has planned', () => {
  const beats = [beat('ambush', 'hit', { hitSession: 1 }), beat('bridge', 'hit', { hitSession: 2 }), beat('festival', 'hit', { hitSession: 2, custom: true }),
    beat('long-ago', 'hit', {}), beat('siege', 'planned', { target: 5, key: true }), beat('dropped', 'dropped', { target: 4 }), beat('missed', 'planned', { target: 2 })];
  const dm = buildTimeline({ session: 3, beats, dm: true, planned: [{ number: 5, title: 'The siege', status: 'planned' }], reveals: [{ title: 'Lady Sable', session: 4 }] });
  assert.deepEqual(dm.map((c) => [c.label, c.state]), [['Earlier', 'done'], ['Session 1', 'done'], ['Session 2', 'done'], ['Session 3', 'done'], ['Session 4', 'next'], ['Session 5', 'planned']]);
  assert.deepEqual(dm.find((c) => c.n === 2).events.map((e) => [e.label, e.kind]), [['bridge', 'story'], ['festival', 'custom']]);
  assert.deepEqual(dm.find((c) => c.n === 4).events.map((e) => e.label), ['Reveal: Lady Sable']);
  assert.equal(dm.find((c) => c.n === 5).sub, 'Planned · DM only · The siege');
  assert.deepEqual(dm.find((c) => c.n === 5).events.map((e) => [e.label, e.kind]), [['siege', 'planned']]);
  assert.ok(!dm.flatMap((c) => c.events).some((e) => e.label === 'dropped' || e.label === 'missed'), 'dropped beats, and planned ones aimed at a played session, are not on the strip');

  const player = buildTimeline({ session: 3, beats, dm: false, planned: [{ number: 5, title: 'The siege', status: 'planned' }], reveals: [{ title: 'Lady Sable', session: 4 }] });
  assert.deepEqual(player.map((c) => c.label), ['Earlier', 'Session 1', 'Session 2', 'Session 3', 'Session 4'], 'a player gets played sessions and the next one');
  assert.ok(!JSON.stringify(player).includes('siege') && !JSON.stringify(player).includes('Lady Sable'), 'nothing planned');

  assert.ok(!buildTimeline({ session: 3, beats, dm: true, custom: false }).flatMap((c) => c.events).some((e) => e.kind === 'custom'), 'custom events switched off');
  const noPlan = buildTimeline({ session: 3, beats, dm: true, planned: [{ number: 5, title: 'x', status: 'planned' }], reveals: [{ title: 'y', session: 4 }], showPlanned: false });
  assert.deepEqual(noPlan.map((c) => c.n), [0, 1, 2, 3, 4], 'planned sessions switched off');
  assert.ok(!noPlan.flatMap((c) => c.events).some((e) => e.kind === 'planned'));
  assert.deepEqual(buildTimeline({ session: 0, beats: [], dm: false }).map((c) => [c.label, c.state]), [['Session 1', 'next']], 'a new campaign: session 1 is up next');
});

let dm, p1, plain, C;
before(async () => {
  await cleanup();
  [dm, p1] = await Promise.all([makeUser('tldm'), makeUser('tlp1', { free: true })]);
  plain = await makeUser('tlplain', { unblocked: true, free: true });
  C = (await dm.client.from('campaigns').insert({ slug: 'tln-' + rnd(), title: 'Timeline Realm', phases: [], phase: '', settings: { session: 3 } }).select('id, slug').single()).data;
  await dm.client.from('sections').insert({ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' });
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await dm.client.from('invites').insert({ campaign_id: C.id, code });
  for (const u of [p1, plain]) assert.equal((await u.client.rpc('join_campaign', { p_code: code })).error, null);
  const add = async (row) => assert.equal((await dm.client.from('entries').insert({ campaign_id: C.id, live: true, vis_players: [], status: '', data: {}, ...row })).error, null, row.title);
  await add({ kind: 'beat', title: 'The bridge falls', status: 'hit', vis: 'all', data: { hitSession: 2 } });
  await add({ kind: 'beat', title: 'The harvest festival', status: 'hit', vis: 'all', data: { hitSession: 2, custom: true } });
  await add({ kind: 'beat', title: 'A secret meeting', status: 'hit', vis: 'dm', data: { hitSession: 3 } });
  await add({ kind: 'beat', title: 'The siege of Millbrook', status: 'planned', vis: 'all', live: false, data: { target: 5, key: true } });
  await add({ kind: 'npc', title: 'Lady Sable', vis: 'when', vis_stage: 'session:4:started' });
  await dm.client.from('sessions').insert({ campaign_id: C.id, number: 5, title: 'Fire on the walls', status: 'planned' });
});
after(cleanup);

test('a player\'s strip: what has happened that they may see, nothing planned', async () => {
  const pg = await page(`/c/${C.slug}/overview`, p1.session);
  assert.equal(pg.status, 200);
  for (const words of ['id="tls-h"', 'What has happened so far', 'Session 2', 'The bridge falls', 'The harvest festival', 'Up next']) assert.ok(pg.text.includes(words), words);
  for (const secret of ['A secret meeting', 'The siege of Millbrook', 'Lady Sable', 'Fire on the walls', 'Planned · DM only', 'Add custom event']) assert.ok(!pg.text.includes(secret), 'not sent: ' + secret);
});

test('the DM\'s strip: planned sessions, planned beats and scheduled reveals too', async () => {
  const pg = await page(`/c/${C.slug}/overview`, dm.session);
  for (const words of ['A secret meeting', 'The siege of Millbrook', 'Reveal: Lady Sable', 'Planned · DM only · Fire on the walls', '+ Add custom event']) assert.ok(pg.text.includes(words), words);
  const tool = await page(`/c/${C.slug}/tools/timeline`, dm.session);
  assert.equal((tool.text.match(/id="tls-h"/g) ?? []).length, 1, 'the Timeline tool leads with the strip, once');
  assert.ok(tool.text.includes('Story timeline'), 'and its planning is still there');
});

test('without the flags, the old banner as it was', async () => {
  const on = (await admin.from('feature_flags').select('name').in('name', ['hub_v2_timeline', 'hub_v2_shell']).eq('is_on', true)).data ?? [];
  if (on.length) return;
  const pg = await page(`/c/${C.slug}/overview`, plain.session);
  assert.ok(pg.text.includes('Story so far') && !pg.text.includes('id="tls-h"'));
});
