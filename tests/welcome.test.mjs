// Hub version 2, item 9 (issue 89): the Welcome page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RECAPS, cleanNext, welcomeOf, withRecap } from '../src/features/hub/welcome/model.ts';
import { admin, cleanup, makeUser, page } from './helpers.mjs';

test('the welcome settings: published recaps and the next session, cleaned', () => {
  assert.deepEqual(welcomeOf(null), { next: { when: '', where: '' }, recaps: [] });
  assert.deepEqual(welcomeOf({ welcome: 'x' }), { next: { when: '', where: '' }, recaps: [] });
  assert.deepEqual(cleanNext({ when: '  Friday, 7pm ', where: 'The gates', extra: 1 }), { when: 'Friday, 7pm', where: 'The gates' });
  assert.equal(cleanNext({ when: 'x'.repeat(500) }).when.length, 120);
  let w = welcomeOf({});
  w = withRecap(w, 1, 'First.', '2026-10-01');
  w = withRecap(w, 2, 'Second.', '2026-10-08');
  w = withRecap(w, 1, 'First, rewritten.', '2026-10-09');
  assert.deepEqual(w.recaps.map((r) => [r.session, r.text]), [[1, 'First, rewritten.'], [2, 'Second.']], 'one recap per session, the newest first');
  assert.deepEqual(withRecap(w, 3, '   '), w, 'an empty recap is not published');
  for (let i = 0; i < 40; i++) w = withRecap(w, i + 10, 'R' + i);
  assert.equal(w.recaps.length, MAX_RECAPS);
  assert.deepEqual(welcomeOf({ welcome: { recaps: [{ session: 'x', text: '' }, { session: 4, text: 'Kept', at: 5 }, null] } }).recaps, [{ session: 4, text: 'Kept', at: '' }]);
});

let dm, a, b, plain, C, P;
const rnd = () => Math.random().toString(36).slice(2, 8);
async function makeCampaign(who, title) {
  const made = await who.client.from('campaigns').insert({ slug: 'wel-' + rnd(), title, tagline: 'Gulls wheel over the drowned bells of Saltmere.', phases: [{ id: 's1', label: 'Act one' }, { id: 's2', label: 'Act two' }], phase: 's1', settings: { session: 3, feed: true } }).select('id, slug').single();
  assert.equal(made.error, null, made.error?.message);
  assert.equal((await who.client.from('sections').insert({ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' })).error, null);
  return made.data;
}
const setWelcome = async (welcome, more = {}) => {
  const { data } = await admin.from('campaigns').select('settings').eq('id', C.id).single();
  const r = await dm.client.from('campaigns').update({ settings: { ...data.settings, welcome, ...more } }).eq('id', C.id).select('id');
  assert.equal(r.error, null, r.error?.message);
};
before(async () => {
  await cleanup();
  [dm, a, b, plain] = await Promise.all([makeUser('weldm'), makeUser('wela'), makeUser('welb'), makeUser('welplain', { unblocked: true })]);
  [C, P] = await Promise.all([makeCampaign(dm, 'The Hollow Tide'), makeCampaign(plain, 'Plain Tide')]);
  assert.equal((await admin.from('memberships').insert([{ user_id: a.id, campaign_id: C.id, role: 'player' }, { user_id: b.id, campaign_id: C.id, role: 'player' }, { user_id: a.id, campaign_id: P.id, role: 'player' }])).error, null);
});
after(cleanup);

test('Welcome is behind its flag, and is the first tab in the new frame', async () => {
  assert.equal((await page(`/c/${P.slug}/hub/welcome`, plain.session)).status, 404);
  assert.ok(!(await page(`/c/${P.slug}/overview`, plain.session)).text.includes('/hub/welcome'));
  const pg = await page(`/c/${C.slug}/overview`, a.session);
  const tabs = (pg.text.match(/<nav class="hs-tabs"[\s\S]*?<\/nav>/) ?? [''])[0];
  assert.ok(tabs.indexOf('/hub/welcome') > 0 && tabs.indexOf('/hub/welcome') < tabs.indexOf(`/c/${C.slug}/overview`), 'Welcome comes before the campaign\'s own tabs');
  const bar = (pg.text.match(/<nav class="hs-bar"[\s\S]*?<\/nav>/) ?? [''])[0];
  assert.match(bar, new RegExp(`href="/c/${C.slug}/hub/welcome"[^>]*><span>Home</span>`), 'and Home on a phone');
});

test('a player reads the published recap and the next session, and never the draft', async () => {
  // the DM's draft is on their own session record; the published recaps and next session are in the settings
  assert.equal((await dm.client.from('sessions').insert({ campaign_id: C.id, number: 3, title: 'Session 3', summary: 'DRAFT: the butler is the Leviathan.' })).error, null);
  await setWelcome({ next: { when: 'Friday, 7pm', where: 'At the gates of Saltmere' }, recaps: [{ session: 2, text: 'The party crossed the tidal flats.', at: '2026-10-08T00:00:00Z' }] });
  const mine = await page(`/c/${C.slug}/hub/welcome`, a.session);
  assert.equal(mine.status, 200);
  for (const words of ['Welcome to', 'The Hollow Tide', 'Gulls wheel over the drowned bells', 'Previously on', 'Session 2', 'The party crossed the tidal flats.', 'Next session', 'Friday, 7pm', 'Where we left off: At the gates of Saltmere']) assert.ok(mine.text.includes(words), words);
  for (const words of ['DRAFT', 'Leviathan', 'Write the Session', 'Publish recap', 'Save next session', 'Goes live when', 'Reveal now', 'Edit welcome section']) assert.ok(!mine.text.includes(words), 'not for a player: ' + words);
  assert.equal(((await a.client.from('sessions').select('id').eq('campaign_id', C.id)).data ?? []).length, 0, 'the draft is not readable through the database either');
  // the DM sees the draft in the writer, and the forms
  const theirs = await page(`/c/${C.slug}/hub/welcome`, dm.session);
  for (const words of ['Write the Session 3 recap', 'DRAFT: the butler is the Leviathan.', 'Not published yet', 'Publish recap', 'Save next session', 'Edit welcome section']) assert.ok(theirs.text.includes(words), words);
  // publishing (what the action does): the recap reaches players
  await setWelcome({ next: { when: 'Friday, 7pm', where: 'At the gates of Saltmere' }, recaps: [{ session: 3, text: 'They met the bell-keeper.', at: '2026-10-15T00:00:00Z' }, { session: 2, text: 'The party crossed the tidal flats.', at: '2026-10-08T00:00:00Z' }] });
  const after_ = await page(`/c/${C.slug}/hub/welcome`, a.session);
  assert.ok(after_.text.includes('They met the bell-keeper.') && after_.text.includes('Read every recap') && !after_.text.includes('Leviathan'));
  // only the DM changes the settings
  const tried = await a.client.from('campaigns').update({ settings: { welcome: { recaps: [{ session: 9, text: 'Forged' }] } } }).eq('id', C.id).select('id');
  assert.ok(tried.error || (tried.data ?? []).length === 0);
});

test('newly revealed is the reveal log as each player may read it', async () => {
  const npc = (await dm.client.from('entries').insert({ campaign_id: C.id, kind: 'npc', title: 'Morwenna Thrice', live: true, vis: 'dm' }).select('id').single()).data;
  const secret = (await dm.client.from('entries').insert({ campaign_id: C.id, kind: 'npc', title: 'Ysolde Varn', live: true, vis: 'dm' }).select('id').single()).data;
  // revealing writes a line in the reveal log, with the same visibility as the thing itself
  assert.equal((await dm.client.from('entries').update({ vis: 'all' }).eq('id', npc.id)).error, null);
  assert.equal((await dm.client.from('entries').update({ vis: 'players', vis_players: [b.id] }).eq('id', secret.id)).error, null);
  const forA = await page(`/c/${C.slug}/hub/welcome`, a.session);
  assert.ok(forA.text.includes('Someone new to know: Morwenna Thrice') && forA.text.includes('New NPC'));
  assert.ok(!forA.text.includes('Ysolde'), 'a reveal to another player is not in this player\'s list');
  assert.ok((await page(`/c/${C.slug}/hub/welcome`, b.session)).text.includes('Someone new to know: Ysolde Varn'));
  // with the campaign's "newly revealed" feed off, players get none of it
  const { data } = await admin.from('campaigns').select('settings').eq('id', C.id).single();
  await dm.client.from('campaigns').update({ settings: { ...data.settings, feed: false } }).eq('id', C.id);
  const off = await dm.client.from('entries').insert({ campaign_id: C.id, kind: 'npc', title: 'Quietly Revealed', live: true, vis: 'dm' }).select('id').single();
  await dm.client.from('entries').update({ vis: 'all' }).eq('id', off.data.id);
  assert.ok(!(await page(`/c/${C.slug}/hub/welcome`, a.session)).text.includes('Quietly Revealed'));
  await dm.client.from('campaigns').update({ settings: { ...data.settings, feed: true } }).eq('id', C.id);
});

test('the DM sees what waits for the next stage, and a player sees none of it', async () => {
  const waiting = (await dm.client.from('entries').insert({ campaign_id: C.id, kind: 'npc', title: 'The Drowned Abbot', live: true, vis: 'stage', vis_stage: 's2' }).select('id').single()).data;
  const forOne = (await dm.client.from('entries').insert({ campaign_id: C.id, kind: 'pin', parent: null, title: 'Sunken reliquary', live: true, vis: 'players_stage', vis_players: [a.id], vis_stage: 's2' }).select('id').single());
  const theirs = await page(`/c/${C.slug}/hub/welcome`, dm.session);
  assert.ok(theirs.text.includes('Goes live when Act two starts') && theirs.text.includes('The Drowned Abbot') && theirs.text.includes('Reveal now'));
  if (!forOne.error) assert.ok(theirs.text.includes('named players'));
  for (const who of [a, b]) {
    const t = (await page(`/c/${C.slug}/hub/welcome`, who.session)).text;
    assert.ok(!t.includes('Drowned Abbot') && !t.includes('Goes live') && !t.includes('Sunken reliquary'));
  }
  // "Reveal now" is a change of who sees it (what the action does); a player cannot make it
  assert.ok(((await a.client.from('entries').update({ vis: 'all' }).eq('id', waiting.id).select('id')).data ?? []).length === 0);
  assert.equal((await dm.client.from('entries').update({ vis: 'all' }).eq('id', waiting.id).select('id')).data.length, 1);
  assert.equal(((await a.client.from('entries').select('id').eq('id', waiting.id)).data ?? []).length, 1, 'the player has it now');
  assert.ok(!(await page(`/c/${C.slug}/hub/welcome`, dm.session)).text.includes('>The Drowned Abbot</span>'), 'and it no longer waits');
});

test('the Welcome page\'s switches leave out what is switched off', async () => {
  const { data } = await admin.from('campaigns').select('settings').eq('id', C.id).single();
  await dm.client.from('campaigns').update({ settings: { ...data.settings, features: { off: ['welcome.recap', 'welcome.next', 'welcome.revealed', 'welcome.banner'] } } }).eq('id', C.id);
  const t = (await page(`/c/${C.slug}/hub/welcome`, a.session)).text;
  for (const words of ['Previously on', 'They met the bell-keeper', 'Next session', 'Friday, 7pm', 'Newly revealed', 'Someone new to know', 'Welcome to']) assert.ok(!t.includes(words), 'switched off: ' + words);
  await dm.client.from('campaigns').update({ settings: { ...data.settings, features: { off: [] } } }).eq('id', C.id);
});
