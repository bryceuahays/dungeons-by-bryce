// Hub version 2, item 6 (issue 62): co-DMs and what each may do.
// The list of permissions is tested as plain code. Everything else is proved as real
// accounts against the database's own rules: what a co-DM can read (API, page, Realtime) and
// what they are refused when they try to change it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { ALL_PERMS, NEEDS_HIDDEN, NOT_YET, NO_PERMS, PERMS, PERM_IDS, PRESETS, cleanPerms, coDmCan, permSet, presetOf } from '../src/config/co-dm.ts';
import { ANON, ROOT, SITE, URL_, admin, cleanup, cookieFor, makeUser, page, wait } from './helpers.mjs';

// ------------------------------------------------------------------ the list

test('the permissions are the ten in the mockup, with its words', () => {
  const src = fs.readFileSync(path.join(ROOT, 'docs/design/mockups/source/SettingsPeople.dc.html'), 'utf8');
  const drawn = [...src.matchAll(/P\('([^']+)', '([^']*)', (?:true|false)\)/g)].map((m) => ({ name: m[1], what: m[2].replace(/’/g, "'") }));
  assert.equal(drawn.length, 10);
  assert.deepEqual(PERMS.map((p) => ({ name: p.name, what: p.what })), drawn);
  assert.deepEqual(PERM_IDS, ['see_hidden', 'edit', 'reveal', 'combat', 'handouts', 'private_rolls', 'messages', 'recaps', 'players', 'settings']);
  // the database knows the same ten
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261018000001_co_dm_permissions.sql'), 'utf8');
  const known = /known text\[\] := array\[([^\]]+)\]/.exec(sql)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(known, PERM_IDS);
  assert.match(sql, /"edit": false, "reveal": false, "settings": false/, 'and the same three need "See hidden content"');
  assert.deepEqual(NEEDS_HIDDEN, ['edit', 'reveal', 'settings']);
});

test('nothing stored means everything; a shorter list means exactly that list', () => {
  for (const id of PERM_IDS) { assert.equal(coDmCan(null, id), true); assert.equal(coDmCan(undefined, id), true); assert.equal(coDmCan({}, id), false); }
  assert.equal(coDmCan({ combat: true }, 'combat'), true);
  for (const junk of ['true', 1, 'yes', {}, null]) assert.equal(coDmCan({ combat: junk }, 'combat'), false, 'only a plain yes counts');
  assert.equal(coDmCan(['combat'], 'combat'), false);
  assert.equal(coDmCan('everything', 'combat'), false);
  assert.deepEqual(permSet(null), ALL_PERMS);
  assert.deepEqual(permSet({}), NO_PERMS);
  // making a choice safe to store
  assert.equal(cleanPerms(null), null, 'everything stays everything');
  assert.deepEqual(cleanPerms({ combat: true, made_up: true, players: 'yes' }), { ...NO_PERMS, combat: true });
  assert.deepEqual(cleanPerms({ edit: true, reveal: true, settings: true, combat: true }), { ...NO_PERMS, combat: true }, 'edit, reveal and settings go without "See hidden content"');
  assert.deepEqual(cleanPerms({ see_hidden: true, edit: true }), { ...NO_PERMS, see_hidden: true, edit: true });
  assert.deepEqual(cleanPerms('nonsense'), NO_PERMS);
  // presets
  assert.deepEqual(PRESETS.map((p) => p.name), ['Full co-DM', 'Combat helper', 'Lore editor']);
  assert.equal(PRESETS[0].perms, null, 'Full co-DM stores nothing, so it is what every co-DM had before');
  assert.equal(presetOf(null), 'full');
  assert.equal(presetOf(PRESETS[1].perms), 'combat');
  assert.equal(presetOf(PRESETS[2].perms), 'lore');
  assert.equal(presetOf({ ...PRESETS[1].perms, players: true }), 'custom');
  assert.deepEqual([PRESETS[1].perms.see_hidden, PRESETS[1].perms.combat, PRESETS[1].perms.private_rolls, PRESETS[1].perms.edit], [false, true, true, false]);
  for (const p of PRESETS.filter((x) => x.perms)) assert.deepEqual(cleanPerms(p.perms), p.perms, p.name + ' is a choice that can be stored as it is');
  assert.deepEqual(NOT_YET, ['handouts', 'messages', 'recaps']);
});

// ------------------------------------------------------------------ real accounts

let owner, co, co2, a, b, plainOwner, C, P, npc, block, dmBlock, pin, map, hiddenRoll;
const rnd = () => Math.random().toString(36).slice(2, 8);
const WORDS = ['Morwenna Thrice', 'Ashfall prophecy', 'Sunken reliquary', 'Gloomwick stealth'];
const leaks = (text) => WORDS.filter((w) => String(text).includes(w));
const give = async (who, perms) => { const r = await owner.client.rpc('set_co_dm', { c: C.id, u: who.id, make: true, p_perms: perms }); assert.equal(r.error, null, r.error?.message); };
const only = (...on) => Object.fromEntries(PERM_IDS.map((id) => [id, on.includes(id)]));
const sees = async (who, table, id) => ((await who.client.from(table).select('id').eq('id', id)).data ?? []).length === 1;
const refused = (r) => !!r.error || (r.data ?? []).length === 0;
const viewAs = (v) => 'dbb-view-as-player=' + encodeURIComponent(JSON.stringify(v));
const listen = async (who) => {
  const events = [];
  const live = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await live.auth.setSession({ access_token: who.session.access_token, refresh_token: who.session.refresh_token });
  await live.realtime.setAuth(who.session.access_token);
  await new Promise((resolve, reject) => {
    live.channel('codm-' + rnd()).on('postgres_changes', { event: '*', schema: 'public' }, (p) => events.push(p))
      .subscribe((s) => { if (s === 'SUBSCRIBED') resolve(); if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(s)); });
  });
  await wait(4000);
  return { events, stop: () => live.removeAllChannels() };
};
async function makeCampaign(who, title) {
  const made = await who.client.from('campaigns').insert({ slug: 'codm-' + rnd(), title, phases: [{ id: 's1', label: 'Act one' }, { id: 's2', label: 'Act two' }], phase: 's1' }).select('id, slug').single();
  assert.equal(made.error, null, made.error?.message);
  assert.equal((await who.client.from('sections').insert([{ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' }, { campaign_id: made.data.id, slug: 'vault', title: 'Vault of secrets', sort: 20, audience: 'dm', kind: 'content' }])).error, null);
  return made.data;
}

before(async () => {
  await cleanup();
  // owner: a test account, so hub version 2 flags are on for it. plainOwner: an ordinary DM.
  [owner, a, b, plainOwner] = await Promise.all([makeUser('codmowner'), makeUser('codma'), makeUser('codmb'), makeUser('codmplain', { unblocked: true })]);
  [C, P] = await Promise.all([makeCampaign(owner, 'Crown Realm'), makeCampaign(plainOwner, 'Plain Crown')]);
  [co, co2] = await Promise.all([makeUser('codmco', { dmOf: C.id }), makeUser('codmco2', { dmOf: C.id })]);
  assert.equal((await admin.from('memberships').insert([{ user_id: a.id, campaign_id: C.id, role: 'player' }, { user_id: b.id, campaign_id: C.id, role: 'player' }])).error, null);
  // things a DM hides: an NPC, a DM-only block of lore, a pin on a map, and a roll
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const file = `${C.id}/maps/${crypto.randomUUID()}.png`;
  assert.equal((await owner.client.storage.from('campaign-files').upload(file, png, { contentType: 'image/png' })).error, null);
  const ins = (row) => owner.client.from('entries').insert({ campaign_id: C.id, ...row }).select('*').single();
  npc = (await ins({ kind: 'npc', title: 'Morwenna Thrice', status: 'alive', live: true, vis: 'dm', data: { known: 'Nothing yet.' } })).data;
  map = (await ins({ kind: 'map', title: 'The Vale', live: true, vis: 'all', data: { file, w: 40, h: 40 } })).data;
  pin = (await ins({ kind: 'pin', parent: map.id, title: 'Sunken reliquary', live: true, vis: 'dm', data: { x: 0.5, y: 0.5, note: '' } })).data;
  block = (await owner.client.from('content').insert({ campaign_id: C.id, section: 'overview', kind: 'html', key: 'open', title: 'Welcome', visibility: 'player', body: { html: '<p>Lanternlight welcome</p>' } }).select('*').single()).data;
  dmBlock = (await owner.client.from('content').insert({ campaign_id: C.id, section: 'overview', kind: 'html', key: 'lore', title: 'Lore', visibility: 'dm', body: { html: '<p>Ashfall prophecy</p>' } }).select('*').single()).data;
  assert.ok(npc && map && pin && block && dmBlock, 'the hidden things were made');
  const rolled = await fetch(`${SITE}/c/${C.slug}/tools/dice/roll`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieFor(owner.session) }, body: JSON.stringify({ notation: '1d20', label: 'Gloomwick stealth', privacy: 'dm' }) });
  hiddenRoll = (await rolled.json()).roll;
  assert.ok(hiddenRoll?.id, 'a hidden roll was made');
});
after(cleanup);

test('a full co-DM is what a co-DM always was: reads and edits everything, but does not own the campaign', async () => {
  assert.deepEqual([await sees(co, 'entries', npc.id), await sees(co, 'entries', pin.id), await sees(co, 'content', dmBlock.id), await sees(co, 'rolls', hiddenRoll.id)], [true, true, true, true]);
  assert.equal((await co.client.from('content').update({ title: 'Lore, edited' }).eq('id', dmBlock.id).select('id')).data.length, 1);
  assert.equal((await co.client.from('entries').update({ title: 'Morwenna Thrice', vis: 'dm' }).eq('id', npc.id).select('id')).data.length, 1);
  assert.equal((await co.client.from('campaigns').update({ tagline: 'A co-DM was here' }).eq('id', C.id).select('id')).data.length, 1);
  const pg = await page(`/c/${C.slug}/overview`, co.session);
  assert.ok(pg.text.includes('Ashfall prophecy') && pg.text.includes('Vault of secrets'));
  // what was never a co-DM's, and one thing that was by mistake
  assert.ok(refused(await co.client.from('campaigns').delete().eq('id', C.id).select('id')), 'cannot delete the campaign');
  assert.ok(refused(await co.client.from('campaigns').update({ owner_id: co.id }).eq('id', C.id).select('id')), 'cannot make themselves the owner');
  assert.equal((await admin.from('campaigns').select('owner_id').eq('id', C.id).single()).data.owner_id, owner.id);
  assert.ok((await co.client.rpc('set_co_dm', { c: C.id, u: a.id, make: true, p_perms: null })).error, 'cannot choose co-DMs');
  assert.ok((await co.client.rpc('set_co_dm', { c: C.id, u: co.id, make: true, p_perms: null })).error, 'or change their own permissions');
  assert.ok(refused(await co.client.from('memberships').update({ perms: null }).eq('campaign_id', C.id).eq('user_id', co.id).select('user_id')));
  assert.ok(refused(await co.client.from('memberships').delete().eq('campaign_id', C.id).eq('user_id', co2.id).select('user_id')), 'cannot remove another co-DM');
  assert.equal(((await co.client.rpc('co_dm_list', { c: C.id })).data ?? []).length, 0, 'and cannot read the list of permissions');
});

test('a co-DM without "See hidden content" reads the campaign as a player does: NPCs, lore, pins and rolls', async () => {
  await give(co, only('players'));
  const spy = await listen(co);
  // the database API
  assert.deepEqual([await sees(co, 'entries', npc.id), await sees(co, 'entries', pin.id), await sees(co, 'content', dmBlock.id), await sees(co, 'rolls', hiddenRoll.id)], [false, false, false, false]);
  assert.equal(((await co.client.from('entry_secrets').select('entry_id').eq('campaign_id', C.id)).data ?? []).length, 0);
  assert.equal(((await co.client.from('sections').select('slug').eq('campaign_id', C.id).eq('slug', 'vault')).data ?? []).length, 0, 'the DM-only tab does not exist for them');
  assert.equal(((await co.client.from('campaign_faces').select('phase').eq('campaign_id', C.id).eq('phase', '')).data ?? []).length, 0, 'nor the campaign\'s real title');
  assert.equal(((await co.client.from('sessions').select('id').eq('campaign_id', C.id)).data ?? []).length, 0);
  assert.deepEqual([await sees(co, 'content', block.id), await sees(co, 'entries', map.id)], [true, true], 'what players see, they see');
  assert.ok((await co.client.storage.from('campaign-files').download(map.data.file)).error, 'the map as uploaded is not theirs to fetch');
  // the pages
  for (const path_ of ['overview', 'tools/npcs', 'tools/maps', 'tools/dice', 'tools']) assert.deepEqual(leaks((await page(`/c/${C.slug}/${path_}`, co.session)).text), [], path_);
  const home = await page(`/c/${C.slug}/overview`, co.session);
  assert.ok(home.text.includes('Lanternlight welcome') && !home.text.includes('Vault of secrets') && !home.text.includes('Edit this page'));
  assert.ok((await page(`/c/${C.slug}/vault`, co.session)).status !== 200 || !(await page(`/c/${C.slug}/vault`, co.session)).text.includes('Vault of secrets'));
  assert.ok((await page(`/c/${C.slug}/edit/overview`, co.session)).status >= 300, 'the page editor sends them away');
  // Realtime: the hidden NPC changes, and they hear nothing
  assert.equal((await owner.client.from('entries').update({ data: { known: 'Morwenna Thrice knows the Ashfall prophecy.' } }).eq('id', npc.id)).error, null);
  await wait(4000);
  await spy.stop();
  assert.deepEqual(leaks(JSON.stringify(spy.events)), []);
  assert.ok(!JSON.stringify(spy.events).includes(npc.id));
  // and they cannot change what they cannot see, or anything else a DM changes
  assert.ok(refused(await co.client.from('entries').update({ vis: 'all' }).eq('id', npc.id).select('id')));
  assert.ok(refused(await co.client.from('content').update({ title: 'x' }).eq('id', block.id).select('id')));
  assert.ok(refused(await co.client.from('campaigns').update({ tagline: 'x' }).eq('id', C.id).select('id')));
  assert.ok(refused(await co.client.from('entries').insert({ campaign_id: C.id, kind: 'npc', title: 'Forged', vis: 'dm' }).select('id')));
  // they were given "manage players": invites and removing a player, and nothing else
  assert.equal((await co.client.from('invites').insert({ campaign_id: C.id, code: 'CODM' + rnd().toUpperCase() }).select('id')).error, null);
  assert.ok(((await co.client.rpc('campaign_members', { c: C.id })).data ?? []).length >= 4, 'they get the list of who is in the campaign');
  const manage = await page(`/c/${C.slug}/manage`, co.session);
  assert.equal(manage.status, 200);
  assert.ok(manage.text.includes('You are a co-DM of this campaign') && manage.text.includes('manage players and invites') && !manage.text.includes('People and permissions'));
  assert.deepEqual(leaks(manage.text), []);
});

test('a co-DM without "Edit pages and content" is refused when saving', async () => {
  await give(co, only('see_hidden'));
  assert.deepEqual([await sees(co, 'entries', npc.id), await sees(co, 'content', dmBlock.id), await sees(co, 'entries', pin.id)], [true, true, true], 'they see everything');
  assert.ok((await page(`/c/${C.slug}/overview`, co.session)).text.includes('Ashfall prophecy'));
  // and can change none of it
  assert.ok(refused(await co.client.from('content').update({ title: 'Changed' }).eq('id', block.id).select('id')), 'a block');
  assert.ok(refused(await co.client.from('content').insert({ campaign_id: C.id, section: 'overview', kind: 'html', key: 'x', title: 'x', visibility: 'player', body: {} }).select('id')), 'a new block');
  assert.ok(refused(await co.client.from('content').delete().eq('id', block.id).select('id')));
  assert.ok(refused(await co.client.from('sections').update({ title: 'Changed' }).eq('campaign_id', C.id).eq('slug', 'overview').select('slug')), 'a tab');
  assert.ok(refused(await co.client.from('entries').update({ title: 'Changed' }).eq('id', npc.id).select('id')), 'an NPC');
  assert.ok(refused(await co.client.from('entries').update({ vis: 'all' }).eq('id', npc.id).select('id')), 'who sees an NPC');
  assert.ok(refused(await co.client.from('entries').insert({ campaign_id: C.id, kind: 'npc', title: 'Added', vis: 'dm' }).select('id')), 'a new NPC');
  assert.ok(refused(await co.client.from('entries').delete().eq('id', pin.id).select('id')));
  assert.ok(refused(await co.client.from('entry_secrets').upsert({ entry_id: npc.id, campaign_id: C.id, data: { wants: 'x' } }).select('entry_id')), 'DM notes');
  assert.ok(refused(await co.client.from('campaigns').update({ settings: { feed: true } }).eq('id', C.id).select('id')), 'settings');
  assert.ok(refused(await co.client.from('campaigns').update({ phase: 's2' }).eq('id', C.id).select('id')), 'the stage');
  assert.ok(refused(await co.client.from('invites').insert({ campaign_id: C.id, code: 'NOPE' + rnd().toUpperCase() }).select('id')), 'invites');
  assert.ok(refused(await co.client.from('memberships').delete().eq('campaign_id', C.id).eq('user_id', b.id).select('user_id')), 'removing a player');
  assert.ok((await page(`/c/${C.slug}/edit/overview`, co.session)).status >= 300, 'and the page editor is not theirs');
  const still = (await admin.from('content').select('title').eq('id', block.id).single()).data;
  assert.equal(still.title, 'Welcome');
  // with it, the same saves go through
  await give(co, only('see_hidden', 'edit'));
  assert.equal((await co.client.from('content').update({ title: 'Welcome' }).eq('id', block.id).select('id')).data.length, 1);
  assert.equal((await co.client.from('entries').update({ title: 'Morwenna Thrice' }).eq('id', npc.id).select('id')).data.length, 1);
  assert.equal((await page(`/c/${C.slug}/edit/overview`, co.session)).status, 200);
});

test('editing and revealing are separate: each can be given without the other', async () => {
  // edit without reveal: the words, not who sees them, and not the stage
  await give(co, only('see_hidden', 'edit'));
  assert.equal((await co.client.from('entries').update({ title: 'Morwenna Thrice', data: { known: 'Edited.' } }).eq('id', npc.id).select('id')).data.length, 1);
  assert.ok(refused(await co.client.from('entries').update({ vis: 'all' }).eq('id', npc.id).select('id')), 'cannot reveal');
  assert.ok(refused(await co.client.from('entries').update({ vis: 'players', vis_players: [a.id] }).eq('id', npc.id).select('id')), 'not even to one player');
  assert.ok(refused(await co.client.from('campaigns').update({ phase: 's2' }).eq('id', C.id).select('id')), 'cannot change the stage');
  assert.equal((await admin.from('entries').select('vis').eq('id', npc.id).single()).data.vis, 'dm');
  // reveal without edit: who sees it and the stage, not the words
  await give(co, only('see_hidden', 'reveal'));
  assert.ok(refused(await co.client.from('entries').update({ title: 'Renamed' }).eq('id', npc.id).select('id')), 'cannot edit');
  assert.ok(refused(await co.client.from('entries').update({ vis: 'all', title: 'Renamed' }).eq('id', npc.id).select('id')), 'not even alongside a reveal');
  assert.equal((await co.client.from('entries').update({ vis: 'players', vis_players: [a.id] }).eq('id', npc.id).select('id')).data.length, 1, 'reveals to one player');
  assert.deepEqual([await sees(a, 'entries', npc.id), await sees(b, 'entries', npc.id)], [true, false]);
  assert.equal((await co.client.from('campaigns').update({ phase: 's2' }).eq('id', C.id).select('id')).data.length, 1, 'changes the stage');
  assert.equal((await admin.from('campaigns').select('phase').eq('id', C.id).single()).data.phase, 's2');
  assert.ok(refused(await co.client.from('campaigns').update({ tagline: 'x' }).eq('id', C.id).select('id')), 'but not the campaign\'s settings');
  assert.ok(refused(await co.client.from('campaigns').update({ phase: 's1', tagline: 'x' }).eq('id', C.id).select('id')));
  assert.ok(refused(await co.client.from('content').update({ title: 'x' }).eq('id', block.id).select('id')));
  // settings without reveal
  await give(co, only('see_hidden', 'settings'));
  assert.equal((await co.client.from('campaigns').update({ tagline: 'Set by a co-DM' }).eq('id', C.id).select('id')).data.length, 1);
  assert.ok(refused(await co.client.from('campaigns').update({ phase: 's1' }).eq('id', C.id).select('id')));
  assert.ok(refused(await co.client.from('campaigns').update({ owner_id: co.id }).eq('id', C.id).select('id')), 'settings is not ownership');
  // back as it was
  await owner.client.from('campaigns').update({ phase: 's1' }).eq('id', C.id);
  await owner.client.from('entries').update({ vis: 'dm', vis_players: [] }).eq('id', npc.id);
});

test('a combat helper runs the fight, including its hidden half, and sees nothing else that is hidden', async () => {
  await give(co, PRESETS.find((p) => p.id === 'combat').perms);
  // the DM's half of a fight, as the Initiative tool keeps it: a hidden creature and its hit points
  const dmHalf = { round: 1, turn: null, list: [{ id: 't1', name: 'Cave troll', kind: 'monster', init: 12, dex: 1, hp: 84, hpMax: 84, ac: 15, conditions: [], conc: false, hidden: true, showHp: false }] };
  const fight = await co.client.from('entries').insert({ campaign_id: C.id, kind: 'encounter', title: 'Encounter', vis: 'all', live: true, data: { round: 1, turn: null, order: [] } }).select('id').single();
  assert.equal(fight.error, null, fight.error?.message);
  assert.equal((await co.client.from('entry_secrets').upsert({ entry_id: fight.data.id, campaign_id: C.id, data: dmHalf })).error, null);
  assert.equal((await co.client.from('entries').update({ data: { round: 2, turn: null, order: [] } }).eq('id', fight.data.id).select('id')).data.length, 1);
  assert.deepEqual((await co.client.from('entry_secrets').select('data').eq('entry_id', fight.data.id).single()).data.data, dmHalf);
  assert.equal(((await a.client.from('entry_secrets').select('entry_id').eq('entry_id', fight.data.id)).data ?? []).length, 0, 'a player still does not get the hidden half');
  // the Initiative tool gives them the DM's side
  const tool = await page(`/c/${C.slug}/tools/initiative`, co.session);
  assert.equal(tool.status, 200);
  assert.ok(tool.text.includes('Cave troll'));
  assert.ok(!(await page(`/c/${C.slug}/tools/initiative`, a.session)).text.includes('Cave troll'));
  // nothing else
  assert.deepEqual([await sees(co, 'entries', npc.id), await sees(co, 'content', dmBlock.id), await sees(co, 'entries', pin.id)], [false, false, false]);
  assert.equal(((await co.client.from('entry_secrets').select('entry_id').eq('entry_id', npc.id)).data ?? []).length, 0);
  assert.ok(refused(await co.client.from('entry_secrets').upsert({ entry_id: npc.id, campaign_id: C.id, data: { wants: 'x' } }).select('entry_id')), 'the hidden half of an NPC is not the fight');
  assert.ok(refused(await co.client.from('entries').insert({ campaign_id: C.id, kind: 'npc', title: 'Added', vis: 'dm' }).select('id')));
  assert.equal(await sees(co, 'rolls', hiddenRoll.id), true, 'a combat helper sees private rolls');
  // without combat, the fight is not theirs
  await give(co, only('private_rolls'));
  assert.ok(refused(await co.client.from('entries').update({ data: { round: 3 } }).eq('id', fight.data.id).select('id')));
  assert.equal(((await co.client.from('entry_secrets').select('entry_id').eq('entry_id', fight.data.id)).data ?? []).length, 0);
  await owner.client.from('entries').delete().eq('id', fight.data.id);
});

test('only the owner chooses co-DMs, and what is stored is cleaned', async () => {
  for (const who of [a, co2, plainOwner]) assert.ok((await who.client.rpc('set_co_dm', { c: C.id, u: b.id, make: true, p_perms: null })).error, 'not the owner');
  assert.ok((await owner.client.rpc('set_co_dm', { c: C.id, u: plainOwner.id, make: true, p_perms: null })).error, 'someone who is not in the campaign cannot be made a co-DM');
  assert.ok((await owner.client.rpc('set_co_dm', { c: C.id, u: owner.id, make: true, p_perms: {} })).error, 'the owner is not a co-DM of their own campaign');
  assert.ok((await owner.client.rpc('set_co_dm', { c: C.id, u: b.id, make: true, p_perms: ['edit'] })).error, 'permissions must be yes-and-no');
  // a player is made a co-DM, with a list that needs cleaning
  assert.equal((await owner.client.rpc('set_co_dm', { c: C.id, u: b.id, make: true, p_perms: { edit: true, reveal: true, combat: true, made_up: true, players: 'yes' } })).error, null);
  const list = new Map(((await owner.client.rpc('co_dm_list', { c: C.id })).data ?? []).map((r) => [r.user_id, r.perms]));
  assert.deepEqual(list.get(b.id), { ...NO_PERMS, combat: true }, 'unknown names dropped, only a plain yes kept, and edit and reveal dropped without "See hidden content"');
  assert.equal(list.get(co2.id), null, 'a co-DM from before permissions has nothing stored, which is everything');
  assert.equal((await admin.from('memberships').select('role').eq('campaign_id', C.id).eq('user_id', b.id).single()).data.role, 'dm');
  // and back to a player
  assert.equal((await owner.client.rpc('set_co_dm', { c: C.id, u: b.id, make: false, p_perms: null })).error, null);
  assert.deepEqual((await admin.from('memberships').select('role, perms').eq('campaign_id', C.id).eq('user_id', b.id).single()).data, { role: 'player', perms: null });
});

test('removing a co-DM removes their access at once', async () => {
  await give(co, null);
  const spy = await listen(co);
  assert.deepEqual([await sees(co, 'entries', npc.id), await sees(co, 'content', dmBlock.id), await sees(co, 'rolls', hiddenRoll.id)], [true, true, true], 'a full co-DM, before');
  assert.equal((await owner.client.rpc('set_co_dm', { c: C.id, u: co.id, make: false, p_perms: null })).error, null);
  // the very next read, with the same signed-in session
  assert.deepEqual([await sees(co, 'entries', npc.id), await sees(co, 'entries', pin.id), await sees(co, 'content', dmBlock.id), await sees(co, 'rolls', hiddenRoll.id)], [false, false, false, false]);
  assert.ok(refused(await co.client.from('content').update({ title: 'x' }).eq('id', block.id).select('id')));
  assert.ok(refused(await co.client.from('entries').update({ title: 'x' }).eq('id', npc.id).select('id')));
  assert.deepEqual(leaks((await page(`/c/${C.slug}/overview`, co.session)).text), []);
  assert.ok((await page(`/c/${C.slug}/manage`, co.session)).status >= 300, 'Manage sends them away');
  // and Realtime stops carrying hidden things to the connection they already had open
  assert.equal((await owner.client.from('entries').update({ data: { known: 'Morwenna Thrice, after the removal.' } }).eq('id', npc.id)).error, null);
  await wait(4000);
  await spy.stop();
  assert.ok(!spy.events.some((e) => e.new?.id === npc.id && String(e.new?.data?.known ?? '').includes('after the removal')));
  // they are still in the campaign, as a player
  assert.equal(await sees(co, 'content', block.id), true);
  // removed from the campaign altogether
  assert.equal((await owner.client.from('memberships').delete().eq('campaign_id', C.id).eq('user_id', co.id).select('user_id')).data.length, 1);
  assert.equal(await sees(co, 'content', block.id), false);
  assert.equal((await page(`/c/${C.slug}/overview`, co.session)).status, 404);
});

test('the People screen is the owner\'s, behind its flag', async () => {
  const mine = await page(`/c/${C.slug}/manage`, owner.session);
  assert.equal(mine.status, 200);
  assert.ok(mine.text.includes('id="people"') && mine.text.includes('People and permissions') && mine.text.includes('Make co-DM') && mine.text.includes('Co-DM</span>'));
  assert.ok(mine.text.includes('Test codmco2') && mine.text.includes('Everything you can do, except choosing co-DMs and deleting the campaign.'));
  // a full co-DM reaches Manage as before, without the screen
  const theirs = await page(`/c/${C.slug}/manage`, co2.session);
  assert.equal(theirs.status, 200);
  assert.ok(theirs.text.includes('You are a co-DM of this campaign') && theirs.text.includes('The owner has given you every permission') && !theirs.text.includes('id="people"') && !theirs.text.includes('Make co-DM'));
  // an owner without the flag: Manage as it was, and none of the screen's words
  const plain = await page(`/c/${P.slug}/manage`, plainOwner.session);
  assert.equal(plain.status, 200);
  assert.ok(plain.text.includes('Only you see this page') && !plain.text.includes('People and permissions') && !plain.text.includes('Make co-DM') && !plain.text.includes('ppl-row'));
  // players never reach it, and the owner previewing as a player gets a player's page
  assert.ok((await page(`/c/${C.slug}/manage`, a.session)).status >= 300);
  assert.deepEqual(leaks((await page(`/c/${C.slug}/overview`, owner.session, viewAs({ p: a.id }))).text), []);
});
