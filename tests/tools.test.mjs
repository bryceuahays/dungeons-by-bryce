// Phases 4 to 10: reveal stages, per-player visibility, "view as", table tools, the
// timeline, maps with hidden regions, world state, session zero, and video blocks.
// Everything here is about what a player's own login can and cannot reach.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { admin, cleanup, cookieFor, makeUser, page, SITE } from './helpers.mjs';
import { parseVideoUrl, embedVideos, videoSlot } from '../src/lib/video.ts';

const rnd = () => Math.random().toString(36).slice(2, 8);
let dm, p1, p2, outsider, freeDm, C, F;   // C: a Pro DM's campaign with two stages; F: a free DM's campaign

async function makeCampaign(owner, title, phases = []) {
  const slug = 'tool-' + rnd();
  const made = await owner.client.from('campaigns').insert({ slug, title, phases, phase: phases[0]?.id ?? '' }).select('id, slug').single();
  assert.equal(made.error, null);
  assert.equal((await owner.client.from('sections').insert([{ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' }, { campaign_id: made.data.id, slug: 'players', title: 'Players', sort: 20, audience: 'dm', kind: 'players' }])).error, null);
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  assert.equal((await owner.client.from('invites').insert({ campaign_id: made.data.id, code })).error, null);
  return { ...made.data, code };
}
const entry = (who, row) => who.client.from('entries').insert(row).select('*').single();
const sees = async (who, id) => ((await who.client.from('entries').select('id').eq('id', id)).data ?? []).length === 1;
const viewAs = (v) => 'dbb-view-as-player=' + encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v));

before(async () => {
  await cleanup();
  [dm, p1, p2, outsider, freeDm] = await Promise.all([makeUser('tdm'), makeUser('tp1', { free: true }), makeUser('tp2', { free: true }), makeUser('tout', { free: true }), makeUser('tfree', { free: true })]);
  C = await makeCampaign(dm, 'Stage Realm', [{ id: 'act1', label: 'Act one' }, { id: 'act2', label: 'Act two' }]);
  F = await makeCampaign(freeDm, 'Free Realm');
  for (const u of [p1, p2]) { assert.equal((await u.client.rpc('join_campaign', { p_code: C.code })).error, null); assert.equal((await u.client.rpc('join_campaign', { p_code: F.code })).error, null); }
});
after(cleanup);

// ------------------------------------------------------------------ Phase 4

test('blocks: from a stage onward, and for named players only', async () => {
  const rows = await dm.client.from('content').insert([
    { campaign_id: C.id, section: 'overview', kind: 'html', key: 'always', sort: 10, title: 'a', visibility: 'player', body: { html: '<p>Open from the start</p>' } },
    { campaign_id: C.id, section: 'overview', kind: 'html', key: 'later', sort: 20, title: 'b', visibility: 'player', from_stage: 'act2', body: { html: '<p>The vault is empty</p>' } },
    { campaign_id: C.id, section: 'overview', kind: 'html', key: 'forp1', sort: 30, title: 'c', visibility: 'player', only_players: [p1.id], body: { html: '<p>Your brother is the thief</p>' } },
    { campaign_id: C.id, section: 'overview', kind: 'secret', key: 'dmonly', sort: 40, title: 'd', visibility: 'dm', body: { tag: 'DM only', html: '<p>The duke hired them</p>' } },
  ]);
  assert.equal(rows.error, null);
  const bodies = async (u) => ((await u.client.from('content').select('body').eq('campaign_id', C.id)).data ?? []).map((r) => r.body.html).join(' ');
  assert.ok((await bodies(p1)).includes('Open from the start') && (await bodies(p1)).includes('Your brother') && !(await bodies(p1)).includes('vault') && !(await bodies(p1)).includes('duke'));
  assert.ok(!(await bodies(p2)).includes('Your brother'), 'a block for one player does not reach another');
  const pg1 = await page(`/c/${C.slug}/overview`, p1.session), pg2 = await page(`/c/${C.slug}/overview`, p2.session);
  assert.ok(pg1.text.includes('Your brother is the thief') && !pg1.text.includes('The vault is empty') && !pg1.text.includes('duke'));
  assert.ok(!pg2.text.includes('Your brother'));
  // a block for named players on a free campaign is refused
  assert.ok(/upgrade:player_secrets/.test((await freeDm.client.from('content').insert({ campaign_id: F.id, section: 'overview', kind: 'html', key: 'x', visibility: 'player', only_players: [p1.id], body: {} }).select()).error?.message ?? ''));

  // one click forward: the stage block arrives, and the change is logged
  assert.equal((await dm.client.from('campaigns').update({ phase: 'act2' }).eq('id', C.id)).error, null);
  assert.ok((await bodies(p2)).includes('The vault is empty'));
  const log = await dm.client.from('entries').select('id, title, live').eq('campaign_id', C.id).eq('kind', 'log');
  assert.ok(log.data.length === 1 && log.data[0].live === false, 'logged for the DM; not in the player feed unless the feed is on');
  assert.equal((await dm.client.from('entry_secrets').select('data').eq('entry_id', log.data[0].id)).data[0].data.stage, 'Act two', 'the stage name stays with the DM');
  assert.equal(((await p1.client.from('entries').select('id').eq('kind', 'log').eq('campaign_id', C.id)).data ?? []).length, 0);
  // and back
  await dm.client.from('campaigns').update({ phase: 'act1' }).eq('id', C.id);
  assert.ok(!(await bodies(p2)).includes('The vault is empty'), 'rolled back: hidden again');
  // a third stage needs Pro
  assert.ok(/upgrade:stages/.test((await freeDm.client.from('campaigns').update({ phases: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] }).eq('id', F.id).select()).error?.message ?? ''));
  assert.equal((await freeDm.client.from('campaigns').update({ phases: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], phase: 'a' }).eq('id', F.id)).error, null, 'two stages are free');
});

test('"view as": the DM previews as any player at any stage, and gets exactly what they would', async () => {
  const dmPage = await page(`/c/${C.slug}/overview`, dm.session);
  assert.ok(['Open from the start', 'The vault is empty', 'Your brother is the thief', 'The duke hired them'].every((t) => dmPage.text.includes(t)), 'the DM sees everything');
  const generic = await page(`/c/${C.slug}/overview`, dm.session, viewAs('1'));
  assert.ok(generic.text.includes('Open from the start') && !generic.text.includes('vault') && !generic.text.includes('Your brother') && !generic.text.includes('duke'));
  const asP1 = await page(`/c/${C.slug}/overview`, dm.session, viewAs({ p: p1.id, s: '' }));
  assert.ok(asP1.text.includes('Your brother is the thief') && !asP1.text.includes('vault') && !asP1.text.includes('duke') && asP1.text.includes('one named player'));
  const asP2Later = await page(`/c/${C.slug}/overview`, dm.session, viewAs({ p: p2.id, s: 'act2' }));
  assert.ok(asP2Later.text.includes('The vault is empty') && !asP2Later.text.includes('Your brother') && !asP2Later.text.includes('duke') && asP2Later.text.includes('Act two'));
  assert.ok(!asP2Later.text.includes('Edit this page'), 'no editing while previewing');
  // a player sending the same cookie gets nothing extra
  const cheat = await page(`/c/${C.slug}/overview`, p2.session, viewAs({ p: p1.id, s: 'act2' }));
  assert.ok(!cheat.text.includes('vault') && !cheat.text.includes('Your brother'));
});

test('per-player secrets and private notes', async () => {
  const s = await dm.client.from('player_notes').insert({ campaign_id: C.id, user_id: p1.id, kind: 'secret', title: 'Your debt', body: 'You owe the guild 500 gold.' }).select('id').single();
  assert.equal(s.error, null);
  const n = await p1.client.from('player_notes').insert({ campaign_id: C.id, user_id: p1.id, kind: 'note', title: 'Suspicions', body: 'I do not trust the DM.' }).select('id').single();
  assert.equal(n.error, null);
  const read = async (u) => ((await u.client.from('player_notes').select('title').eq('campaign_id', C.id)).data ?? []).map((r) => r.title).sort();
  assert.deepEqual(await read(p1), ['Suspicions', 'Your debt']);
  assert.deepEqual(await read(p2), [], 'another player reads neither');
  assert.deepEqual(await read(dm), ['Your debt'], 'the DM cannot read a player\'s private notes');
  assert.deepEqual(await read(outsider), []);
  assert.ok((await dm.client.from('player_notes').insert({ campaign_id: C.id, user_id: p1.id, kind: 'note', title: 'x' }).select()).error, 'the DM cannot write a "private note" for a player');
  assert.ok((await p2.client.from('player_notes').insert({ campaign_id: C.id, user_id: p1.id, kind: 'secret', title: 'x' }).select()).error);
  assert.equal(((await p1.client.from('player_notes').update({ body: 'edited' }).eq('id', s.data.id).select('id')).data ?? []).length, 0, 'a player cannot rewrite the DM\'s secret');
  assert.ok((await freeDm.client.from('player_notes').insert({ campaign_id: F.id, user_id: p1.id, kind: 'secret', title: 'x' }).select()).error, 'per-player secrets are part of Pro');
  const mine = await page(`/c/${C.slug}/tools/secrets`, p1.session);
  assert.ok(mine.status === 200 && mine.text.includes('You owe the guild') && mine.text.includes('Suspicions'));
  const dmSide = await page(`/c/${C.slug}/tools/secrets`, dm.session);
  assert.ok(dmSide.text.includes('You owe the guild') && !dmSide.text.includes('Suspicions') && !dmSide.text.includes('do not trust'));
  const preview = await page(`/c/${C.slug}/tools/secrets`, dm.session, viewAs({ p: p2.id, s: '' }));
  assert.ok(!preview.text.includes('You owe the guild'), 'previewing as another player does not show this player\'s secret');
});

// ------------------------------------------------------------------ Phase 5

test('NPCs: players get the public part of the NPCs they may see, never the DM\'s part', async () => {
  const hidden = await entry(dm, { campaign_id: C.id, kind: 'npc', title: 'Mara the Fence', status: 'alive', vis: 'dm', data: { location: 'Dockside', known: 'Sells odd things.' } });
  const open = await entry(dm, { campaign_id: C.id, kind: 'npc', title: 'Old Tam', status: 'allied', vis: 'all', data: { location: 'The Rusty Nail', known: 'Runs the inn.' } });
  const forP1 = await entry(dm, { campaign_id: C.id, kind: 'npc', title: 'The Whisperer', status: 'missing', vis: 'players', vis_players: [p1.id], data: { known: 'Only you have heard them.' } });
  const later = await entry(dm, { campaign_id: C.id, kind: 'npc', title: 'Queen Isolde', status: 'hostile', vis: 'stage', vis_stage: 'act2', data: {} });
  assert.ok(!hidden.error && !open.error && !forP1.error && !later.error);
  assert.equal((await dm.client.from('entry_secrets').insert({ entry_id: open.data.id, campaign_id: C.id, data: { wants: 'To sell the inn to the cult', secret: 'Poisoned the old innkeeper' } })).error, null);
  assert.deepEqual([await sees(p1, hidden.data.id), await sees(p1, open.data.id), await sees(p1, forP1.data.id), await sees(p1, later.data.id)], [false, true, true, false]);
  assert.deepEqual([await sees(p2, forP1.data.id), await sees(outsider, open.data.id)], [false, false]);
  assert.equal(((await p1.client.from('entry_secrets').select('*').eq('campaign_id', C.id)).data ?? []).length, 0, 'the DM-only part is in a table players cannot read');
  const pg = await page(`/c/${C.slug}/tools/npcs`, p1.session);
  assert.ok(pg.status === 200 && pg.text.includes('Old Tam') && pg.text.includes('Runs the inn') && pg.text.includes('The Whisperer'));
  for (const no of ['Mara the Fence', 'Queen Isolde', 'cult', 'Poisoned']) assert.ok(!pg.text.includes(no), 'not sent to the player: ' + no);
  const dmPg = await page(`/c/${C.slug}/tools/npcs`, dm.session);
  assert.ok(['Mara the Fence', 'Queen Isolde', 'To sell the inn to the cult'].every((t) => dmPg.text.includes(t)));
  const asP2 = await page(`/c/${C.slug}/tools/npcs`, dm.session, viewAs({ p: p2.id, s: 'act2' }));
  assert.ok(asP2.text.includes('Queen Isolde') && !asP2.text.includes('The Whisperer') && !asP2.text.includes('Mara') && !asP2.text.includes('cult'), 'previewing as a player at a later stage');
  // players cannot write NPCs, change them, or write DM notes
  assert.ok((await p1.client.from('entries').insert({ campaign_id: C.id, kind: 'npc', title: 'Fake', vis: 'all', owner: p1.id }).select()).error);
  assert.equal(((await p1.client.from('entries').update({ title: 'Hacked' }).eq('id', open.data.id).select('id')).data ?? []).length, 0);
  assert.equal(((await p1.client.from('entries').delete().eq('id', open.data.id).select('id')).data ?? []).length, 0);
  assert.ok((await p1.client.from('entry_secrets').insert({ entry_id: open.data.id, campaign_id: C.id, data: {} }).select()).error);
  // naming players on an NPC is part of Pro; the tracker itself is free
  assert.equal((await entry(freeDm, { campaign_id: F.id, kind: 'npc', title: 'Free NPC', vis: 'all' })).error, null);
  assert.ok(/upgrade:player_secrets/.test((await entry(freeDm, { campaign_id: F.id, kind: 'npc', title: 'X', vis: 'players', vis_players: [p1.id] })).error?.message ?? ''));
  // an entry cannot be moved to, or hung under, another campaign
  assert.ok((await dm.client.from('entries').update({ campaign_id: F.id }).eq('id', open.data.id).select()).error);
});

test('initiative: players get the turn order; hidden creatures and enemy hit points stay with the DM', async () => {
  const pub = { round: 2, turn: 'hidden', order: [{ id: 'a', name: 'Vessa', kind: 'pc', hp: 20, hpMax: 24, conditions: ['Prone'], conc: false }, { id: 'b', name: 'Bandit', kind: 'monster', conditions: [], conc: false }] };
  const full = { round: 2, turn: 'c', list: [{ id: 'a', name: 'Vessa', kind: 'pc' }, { id: 'b', name: 'Bandit', kind: 'monster', hp: 7, hpMax: 11 }, { id: 'c', name: 'Assassin in the rafters', kind: 'monster', hidden: true, hp: 60, hpMax: 78 }] };
  const row = await entry(dm, { campaign_id: C.id, kind: 'encounter', title: 'Encounter', vis: 'all', data: pub });
  assert.equal(row.error, null);
  assert.equal((await dm.client.from('entry_secrets').insert({ entry_id: row.data.id, campaign_id: C.id, data: full })).error, null);
  const got = await p1.client.from('entries').select('data').eq('id', row.data.id).single();
  assert.ok(!JSON.stringify(got.data.data).includes('Assassin') && !JSON.stringify(got.data.data).includes('"hp":7'));
  const pg = await page(`/c/${C.slug}/tools/initiative`, p1.session);
  assert.ok(pg.status === 200 && pg.text.includes('Vessa') && pg.text.includes('Bandit') && pg.text.includes('Something you cannot see is acting') && pg.text.includes('Hit points unknown'));
  assert.ok(!pg.text.includes('Assassin') && !pg.text.includes('rafters') && !/hpMax[^,}]{0,6}78/.test(pg.text));
  const dmPg = await page(`/c/${C.slug}/tools/initiative`, dm.session);
  assert.ok(dmPg.text.includes('Assassin in the rafters') && dmPg.text.includes('Hidden from players'));
  assert.equal(((await p1.client.from('entries').update({ data: { round: 99 } }).eq('id', row.data.id).select('id')).data ?? []).length, 0, 'players cannot change the tracker');
  assert.equal((await entry(freeDm, { campaign_id: F.id, kind: 'encounter', title: 'Encounter', vis: 'all', data: {} })).error, null, 'the tracker is on the free plan');
});

test('the DM can open any sheet in the campaign, read-only until they choose to edit', async () => {
  const ch = await p1.client.from('characters').insert({ owner: p1.id, campaign_id: C.id, data: { v: 2, name: 'Vessa Quill', level: 3, ab: { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 } } }).select('id').single();
  assert.equal(ch.error, null);
  const dmView = await page(`/c/${C.slug}/players?c=${ch.data.id}`, dm.session);
  assert.ok(dmView.status === 200 && dmView.text.includes('Vessa Quill') && dmView.text.includes('Read-only') && dmView.text.includes('Let me edit'));
  assert.ok(/<fieldset[^>]*class="plainset"[^>]*disabled/.test(dmView.text), 'the sheet is disabled until the DM flips the switch');
  assert.equal((await page(`/c/${C.slug}/players?c=${ch.data.id}`, p2.session)).status, 404, 'players cannot open each other\'s sheets');
  assert.equal((await dm.client.from('characters').update({ data: { v: 2, name: 'Vessa Quill', level: 4, ab: { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 } } }).eq('id', ch.data.id).select('id')).data.length, 1, 'the DM may edit');
  assert.equal(((await p2.client.from('characters').select('id').eq('id', ch.data.id)).data ?? []).length, 0);
});

// ------------------------------------------------------------------ Phase 6

test('timeline: planned beats stay with the DM; players see what has happened, their own beats, and their personal ones', async () => {
  const planned = await entry(dm, { campaign_id: C.id, kind: 'beat', title: 'The mayor is unmasked', status: 'planned', live: false, vis: 'all', sort: 10, data: { key: true, target: 2 } });
  const personal = await entry(dm, { campaign_id: C.id, kind: 'beat', title: 'A letter from home', status: 'planned', live: false, vis: 'players', vis_players: [p1.id], sort: 20, data: { key: true } });
  const staged = await entry(dm, { campaign_id: C.id, kind: 'beat', title: 'The city falls', status: 'planned', live: false, vis: 'all', sort: 30, data: { stage: 'act2' } });
  const dropped = await entry(dm, { campaign_id: C.id, kind: 'beat', title: 'A dragon subplot', status: 'dropped', live: false, vis: 'all', sort: 40, data: {} });
  assert.ok(!planned.error && !personal.error && !staged.error && !dropped.error);
  for (const b of [planned, personal, staged, dropped]) assert.equal(await sees(p1, b.data.id), false, 'not before it happens');
  await dm.client.from('campaigns').update({ settings: { session: 3 } }).eq('id', C.id);
  const dmPg = await page(`/c/${C.slug}/tools/timeline`, dm.session);
  assert.ok(dmPg.text.includes('Key beats remaining (2)') && dmPg.text.includes('Overdue') && dmPg.text.includes('A dragon subplot'), 'the DM sees the whole plan, with the overdue key beat flagged');
  const none = await page(`/c/${C.slug}/tools/timeline`, p1.session);
  assert.ok(none.status === 200 && !none.text.includes('mayor') && !none.text.includes('letter from home') && !none.text.includes('dragon'));

  // one click: it happened
  assert.equal((await dm.client.from('entries').update({ status: 'hit', live: true, data: { key: true, target: 2, hitAt: '2026-10-04', hitSession: 3 } }).eq('id', planned.data.id)).error, null);
  await dm.client.from('entries').update({ status: 'hit', live: true }).eq('id', personal.data.id);
  assert.deepEqual([await sees(p1, planned.data.id), await sees(p2, planned.data.id), await sees(p1, personal.data.id), await sees(p2, personal.data.id)], [true, true, true, false]);
  const p1Pg = await page(`/c/${C.slug}/tools/timeline`, p1.session);
  assert.ok(p1Pg.text.includes('The mayor is unmasked') && p1Pg.text.includes('Session 3') && p1Pg.text.includes('A letter from home') && !p1Pg.text.includes('city falls'));
  assert.ok(!(await page(`/c/${C.slug}/tools/timeline`, p2.session)).text.includes('letter from home'), 'a personal beat reaches only its player');
  const banner = await page(`/c/${C.slug}/overview`, p2.session);
  assert.ok(banner.text.includes('Story so far') && banner.text.includes('The mayor is unmasked') && !banner.text.includes('city falls') && !banner.text.includes('letter from home'), 'the banner is on every campaign page');

  // a beat tied to a stage happens when the stage is reached
  await dm.client.from('campaigns').update({ phase: 'act2' }).eq('id', C.id);
  assert.equal(await sees(p2, staged.data.id), true);
  assert.equal((await admin.from('entries').select('status, data').eq('id', staged.data.id).single()).data.status, 'hit');
  await dm.client.from('campaigns').update({ phase: 'act1' }).eq('id', C.id);

  // players add their own beats and notes; they can make them private; they cannot plan or touch others'
  const mine = await entry(p2, { campaign_id: C.id, kind: 'beat', title: 'I adopted the goat', status: 'hit', live: true, vis: 'all', owner: p2.id, data: {} });
  const secret = await entry(p2, { campaign_id: C.id, kind: 'beat', title: 'I pocketed the ring', status: 'hit', live: true, vis: 'players', vis_players: [p2.id], owner: p2.id, data: {} });
  assert.ok(!mine.error && !secret.error);
  assert.deepEqual([await sees(p1, mine.data.id), await sees(p1, secret.data.id), await sees(dm, secret.data.id)], [true, false, true], 'table by default; private to the player and the DM');
  const note = await entry(p1, { campaign_id: C.id, kind: 'note', parent: planned.data.id, title: 'I knew it', live: true, vis: 'all', owner: p1.id });
  assert.equal(note.error, null);
  assert.ok((await entry(p1, { campaign_id: C.id, kind: 'note', parent: dropped.data.id, title: 'x', live: true, vis: 'all', owner: p1.id })).error, 'no notes on a beat they cannot see');
  assert.ok((await entry(p1, { campaign_id: C.id, kind: 'beat', title: 'Plan', status: 'planned', live: false, vis: 'all', owner: p1.id })).error, 'players cannot plan beats');
  assert.ok((await entry(p1, { campaign_id: C.id, kind: 'beat', title: 'For p2', status: 'hit', live: true, vis: 'players', vis_players: [p2.id], owner: p1.id })).error, 'or address a beat to someone else');
  assert.ok((await entry(p1, { campaign_id: C.id, kind: 'beat', title: 'Forged', status: 'hit', live: true, vis: 'all', owner: p2.id })).error, 'or add one under another name');
  assert.equal(((await p1.client.from('entries').update({ title: 'Edited' }).eq('id', mine.data.id).select('id')).data ?? []).length, 0, 'players edit only their own');
  assert.equal(((await p1.client.from('entries').delete().eq('id', planned.data.id).select('id')).data ?? []).length, 0);
  assert.equal((await p2.client.from('entries').update({ title: 'I adopted two goats' }).eq('id', mine.data.id).select('id')).data.length, 1);
  assert.equal((await dm.client.from('entries').delete().eq('id', mine.data.id).select('id')).data.length, 1, 'the DM can delete any beat');

  // the timeline is part of Pro
  assert.ok(/upgrade:timeline/.test((await entry(freeDm, { campaign_id: F.id, kind: 'beat', title: 'x', status: 'planned', live: false, vis: 'all' })).error?.message ?? ''));
  const upsell = await page(`/c/${F.slug}/tools/timeline`, freeDm.session);
  assert.ok(upsell.status === 200 && upsell.text.includes('part of Pro') && upsell.text.includes('/upgrade'));
  assert.ok((await page(`/c/${F.slug}/tools/timeline`, p1.session)).text.includes('Your DM can turn this on'));
});

// ------------------------------------------------------------------ Phase 7

test('maps: a hidden region is painted out on the server before a player receives the picture', async () => {
  const png = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const path = `${C.id}/maps/${crypto.randomUUID()}.png`;
  assert.equal((await dm.client.storage.from('campaign-files').upload(path, png, { contentType: 'image/png' })).error, null);
  assert.ok((await p1.client.storage.from('campaign-files').upload(`${C.id}/maps/x.png`, png, { contentType: 'image/png' })).error, 'players cannot upload');
  const map = await entry(dm, { campaign_id: C.id, kind: 'map', title: 'The Vale', vis: 'all', data: { file: path, w: 200, h: 100 } });
  const region = await entry(dm, { campaign_id: C.id, kind: 'region', parent: map.data.id, title: 'West', vis: 'dm', data: { pts: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]] } });
  assert.ok(!map.error && !region.error);
  assert.equal(await sees(p1, region.data.id), false, 'players do not even get the outline of a hidden region');
  assert.ok((await p1.client.storage.from('campaign-files').createSignedUrl(path, 60)).error, 'a player cannot fetch the original');
  assert.ok((await p1.client.storage.from('campaign-files').download(path)).error);

  const pixels = async (session, extra = '') => {
    const res = await fetch(`${SITE}/c/${C.slug}/map/${map.data.id}`, { headers: { cookie: cookieFor(session) + (extra ? '; ' + extra : '') }, redirect: 'follow' });
    assert.equal(res.status, 200);
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => data[(y * info.width + x) * info.channels];
    return { west: at(40, 50), east: at(160, 50) };
  };
  assert.ok((await pixels(p1.session)).west < 40 && (await pixels(p1.session)).east > 220, 'the player\'s picture has the west painted over');
  assert.ok((await pixels(dm.session)).west > 220, 'the DM gets the picture as uploaded');
  assert.ok((await pixels(dm.session, viewAs('1'))).west < 40, 'unless previewing as a player');
  assert.equal((await fetch(`${SITE}/c/${C.slug}/map/${map.data.id}`, { headers: { cookie: cookieFor(outsider.session) } })).status, 404);

  // reveal when a stage is reached
  await dm.client.from('entries').update({ vis: 'stage', vis_stage: 'act2' }).eq('id', region.data.id);
  assert.ok((await pixels(p1.session)).west < 40);
  await dm.client.from('campaigns').update({ phase: 'act2' }).eq('id', C.id);
  assert.ok((await pixels(p1.session)).west > 220, 'revealed when the stage is reached');
  await dm.client.from('campaigns').update({ phase: 'act1' }).eq('id', C.id);
  // reveal when a linked beat happens
  const beat = await entry(dm, { campaign_id: C.id, kind: 'beat', title: 'Cross the river', status: 'planned', live: false, vis: 'all', data: {} });
  await dm.client.from('entries').update({ vis: 'entry', vis_entry: beat.data.id, vis_stage: null }).eq('id', region.data.id);
  const pin = await entry(dm, { campaign_id: C.id, kind: 'pin', parent: map.data.id, title: 'The ford', vis: 'entry', vis_entry: beat.data.id, data: { x: 0.2, y: 0.5, beat: beat.data.id } });
  assert.equal(pin.error, null);
  assert.ok((await pixels(p1.session)).west < 40);
  assert.equal(await sees(p1, pin.data.id), false);
  await dm.client.from('entries').update({ status: 'hit', live: true }).eq('id', beat.data.id);
  assert.ok((await pixels(p1.session)).west > 220, 'revealed when the beat happens');
  assert.equal(await sees(p1, pin.data.id), true, 'and the pin for that beat appears by itself');
  // manual
  await dm.client.from('entries').update({ vis: 'dm', vis_entry: null }).eq('id', region.data.id);
  assert.ok((await pixels(p1.session)).west < 40);

  // pins: the DM's with visibility, players' own (table or private)
  const dmPin = await entry(dm, { campaign_id: C.id, kind: 'pin', parent: map.data.id, title: 'Ambush site', vis: 'dm', data: { x: 0.7, y: 0.3 } });
  const pPin = await entry(p1, { campaign_id: C.id, kind: 'pin', parent: map.data.id, title: 'Our camp', owner: p1.id, live: true, vis: 'all', data: { x: 0.8, y: 0.8 } });
  const pPriv = await entry(p1, { campaign_id: C.id, kind: 'pin', parent: map.data.id, title: 'My stash', owner: p1.id, live: true, vis: 'players', vis_players: [p1.id], data: { x: 0.9, y: 0.9 } });
  assert.ok(!dmPin.error && !pPin.error && !pPriv.error);
  assert.deepEqual([await sees(p2, dmPin.data.id), await sees(p2, pPin.data.id), await sees(p2, pPriv.data.id), await sees(dm, pPriv.data.id)], [false, true, false, true]);
  const pg = await page(`/c/${C.slug}/tools/maps`, p2.session);
  assert.ok(pg.status === 200 && pg.text.includes('The Vale') && pg.text.includes('Our camp') && !pg.text.includes('Ambush site') && !pg.text.includes('My stash') && !pg.text.includes('West'));

  // free plan: one map, the DM's own pins; no hidden regions, no second map, no player pins
  const fmap = await entry(freeDm, { campaign_id: F.id, kind: 'map', title: 'Free map', vis: 'all', data: { file: `${F.id}/maps/none.png`, w: 10, h: 10 } });
  assert.equal(fmap.error, null);
  assert.equal((await entry(freeDm, { campaign_id: F.id, kind: 'pin', parent: fmap.data.id, title: 'DM pin', vis: 'all', data: { x: 0.5, y: 0.5 } })).error, null);
  for (const row of [{ kind: 'map', title: 'Second', vis: 'all', data: {} }, { kind: 'region', parent: fmap.data.id, title: 'r', vis: 'dm', data: { pts: [] } }]) assert.ok(/upgrade:maps_plus/.test((await entry(freeDm, { campaign_id: F.id, ...row })).error?.message ?? ''), row.kind + ' needs Pro');
  assert.ok((await entry(p1, { campaign_id: F.id, kind: 'pin', parent: fmap.data.id, title: 'Mine', owner: p1.id, live: true, vis: 'all', data: {} })).error, 'player pins need Pro');
  assert.ok((await page(`/c/${F.slug}/tools/maps`, freeDm.session)).text.includes('part of Pro'));
});

// ------------------------------------------------------------------ Phase 8

test('world state: DM-only by default, revealable; clues stay with the DM; part of Pro', async () => {
  const con = await entry(dm, { campaign_id: C.id, kind: 'consequence', title: 'The party burned the granary', vis: 'dm', data: { session: 3, tags: ['Old Tam', 'Millers Guild'] } });
  const clock = await entry(dm, { campaign_id: C.id, kind: 'clock', title: 'The Cult', vis: 'dm', data: { goal: 'Open the gate', segments: '6', filled: 2 } });
  const secret = await entry(dm, { campaign_id: C.id, kind: 'secret', title: 'The mayor is a doppelganger', vis: 'dm', data: {} });
  const clue = await entry(dm, { campaign_id: C.id, kind: 'clue', parent: secret.data.id, title: 'A second set of clothes', vis: 'dm', data: { where: 'The mayor\'s cellar' } });
  assert.ok(!con.error && !clock.error && !secret.error && !clue.error);
  for (const e of [con, clock, secret, clue]) assert.equal(await sees(p1, e.data.id), false);
  const dmPg = await page(`/c/${C.slug}/tools/world`, dm.session);
  assert.ok(dmPg.text.includes('only 1 clue') && dmPg.text.includes('Aim for at least three') && dmPg.text.includes('burned the granary'));
  await dm.client.from('entries').update({ vis: 'all' }).eq('id', con.data.id);
  await dm.client.from('entries').update({ vis: 'all' }).eq('id', clock.data.id);
  const pg = await page(`/c/${C.slug}/tools/world`, p1.session);
  assert.ok(pg.text.includes('burned the granary') && pg.text.includes('The Cult') && !pg.text.includes('doppelganger') && !pg.text.includes('clothes'));
  const home = await page(`/c/${C.slug}/overview`, p1.session);
  assert.ok(home.text.includes('Since last session') && home.text.includes('burned the granary'), 'the summary is on the campaign home');
  const npcs = await page(`/c/${C.slug}/tools/npcs`, dm.session);
  assert.ok(npcs.text.includes('How the party has changed things for them'), 'a tagged NPC shows its history');
  for (const kind of ['consequence', 'clock', 'secret']) assert.ok(/upgrade:world/.test((await entry(freeDm, { campaign_id: F.id, kind, title: 'x', vis: 'dm' })).error?.message ?? ''));
});

// ------------------------------------------------------------------ Phase 9

test('session zero: the page is for the table; player input reaches the DM with nothing that says who sent it', async () => {
  assert.equal((await entry(freeDm, { campaign_id: F.id, kind: 'zero', title: 'Session zero', vis: 'all', data: { tone: 'Swashbuckling', lines: 'Harm to children' } })).error, null, 'on the free plan');
  assert.equal((await p1.client.rpc('submit_safety', { c: F.id, p_kind: 'veil', p_body: 'Spiders, please keep them off-screen' })).error, null);
  assert.equal((await p2.client.rpc('submit_safety', { c: F.id, p_kind: 'line', p_body: 'Torture' })).error, null);
  assert.ok((await outsider.client.rpc('submit_safety', { c: F.id, p_kind: 'line', p_body: 'x' })).error, 'only members');
  const got = await freeDm.client.from('safety_inputs').select('*').eq('campaign_id', F.id);
  assert.equal(got.data.length, 2);
  assert.deepEqual(Object.keys(got.data[0]).sort(), ['body', 'campaign_id', 'id', 'kind'], 'no account id and no time are stored with a line');
  assert.equal(((await p1.client.from('safety_inputs').select('*')).data ?? []).length, 0, 'players cannot read the list');
  assert.ok((await freeDm.client.from('safety_counts').select('*')).error || ((await freeDm.client.from('safety_counts').select('*')).data ?? []).length === 0, 'the DM cannot read who sent how many');
  const dmPg = await page(`/c/${F.slug}/tools/zero`, freeDm.session);
  assert.ok(dmPg.text.includes('Spiders') && dmPg.text.includes('Torture') && dmPg.text.includes('without their names'));
  const pg = await page(`/c/${F.slug}/tools/zero`, p1.session);
  assert.ok(pg.text.includes('Swashbuckling') && pg.text.includes('Harm to children') && pg.text.includes('without your name') && !pg.text.includes('Torture'));
});

// ------------------------------------------------------------------ Phase 10

test('video: only YouTube and Vimeo links embed, by id; nothing else gets through', async () => {
  assert.deepEqual(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { p: 'yt', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=10'), { p: 'yt', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseVideoUrl('https://vimeo.com/123456789'), { p: 'vm', id: '123456789' });
  for (const bad of ['javascript:alert(1)', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v="><script>', 'https://youtube.com.evil.example/embed/dQw4w9WgXcQ', '']) assert.equal(parseVideoUrl(bad), null, bad);
  assert.equal(videoSlot('https://evil.example/x'), '');
  assert.ok(embedVideos(videoSlot('https://vimeo.com/123456789')).includes('src="https://player.vimeo.com/video/123456789'));
  assert.ok(!embedVideos('<div class="video-slot" id="vid-yt-x&quot; onload=&quot;x"></div>').includes('<iframe'));

  const rows = await dm.client.from('content').insert([
    { campaign_id: C.id, section: 'overview', kind: 'video', key: 'trailer', sort: 50, title: 'Trailer', visibility: 'player', body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: 'The trailer' } },
    { campaign_id: C.id, section: 'overview', kind: 'video', key: 'later-video', sort: 60, title: 'Recap', visibility: 'player', from_stage: 'act2', body: { url: 'https://vimeo.com/987654321' } },
    { campaign_id: C.id, section: 'overview', kind: 'video', key: 'bad', sort: 70, title: 'Bad', visibility: 'player', body: { url: 'https://evil.example/embed/x' } },
    { campaign_id: C.id, section: 'overview', kind: 'html', key: 'raw', sort: 80, title: 'Raw', visibility: 'player', body: { html: '<p>Typed frame</p><iframe src="https://evil.example"></iframe>' } },
  ]);
  assert.equal(rows.error, null);
  await dm.client.from('campaigns').update({ settings: { session: 3, video: 'https://youtu.be/aaaaaaaaaaa' } }).eq('id', C.id);
  const pg = await page(`/c/${C.slug}/overview`, p1.session);
  assert.ok(pg.text.includes('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') && pg.text.includes('The trailer'));
  assert.ok(pg.text.includes('https://www.youtube-nocookie.com/embed/aaaaaaaaaaa'), 'the featured video is on the campaign home');
  assert.ok(!pg.text.includes('987654321'), 'a video held for a later stage is not sent');
  assert.ok(!pg.text.includes('evil.example') && pg.text.includes('Typed frame'), 'no other frame gets through');
  assert.equal((pg.text.match(/<iframe/g) ?? []).length, 2);
});

// ------------------------------------------------------------------ isolation and read-only

test('table tools never cross campaigns, and a read-only campaign cannot be changed', async () => {
  const other = await makeCampaign(dm, 'Other Realm');
  const there = await entry(dm, { campaign_id: other.id, kind: 'npc', title: 'Elsewhere', vis: 'all' });
  assert.equal(await sees(p1, there.data.id), false, 'a member of one campaign sees nothing of another');
  const all = await p1.client.from('entries').select('campaign_id');
  assert.ok(all.data.every((r) => r.campaign_id === C.id || r.campaign_id === F.id));
  assert.ok((await entry(dm, { campaign_id: C.id, kind: 'note', parent: there.data.id, title: 'x', vis: 'all' })).error, 'an entry cannot hang under another campaign\'s entry');
  assert.ok((await entry(freeDm, { campaign_id: C.id, kind: 'npc', title: 'Intruder', vis: 'all' })).error, 'another DM cannot write here');
  // downgrade: the DM's extra campaigns can be read but not changed
  await admin.from('profiles').update({ comp: false }).eq('id', dm.id);
  assert.ok((await entry(dm, { campaign_id: other.id, kind: 'npc', title: 'After downgrade', vis: 'all' })).error);
  assert.equal(await sees(dm, there.data.id), true, 'still readable');
  await admin.from('profiles').update({ comp: true }).eq('id', dm.id);
  const tools = await page(`/c/${C.slug}/tools`, p1.session);
  assert.ok(tools.status === 200 && ['NPCs', 'Initiative', 'Story timeline', 'Maps', 'Session zero', 'Compendium'].every((t) => tools.text.includes(t)));
});
