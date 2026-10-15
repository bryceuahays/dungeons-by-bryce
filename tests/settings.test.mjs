// Hub version 2, item 7 (issue 87): the Manage page as Campaign settings, and the campaign's
// visibility defaults.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { VIS_DEFAULTS, cleanVisDefaults, visDefaults } from '../src/features/hub/settings/defaults.ts';
import { admin, cleanup, makeUser, page } from './helpers.mjs';

test('visibility defaults: a campaign with none behaves as campaigns always have', () => {
  assert.deepEqual(VIS_DEFAULTS, { newVis: 'dm', npcReveal: 'all', named: true, discord: false });
  for (const s of [null, undefined, {}, { visibility: null }, { visibility: 'all' }, { visibility: [] }]) assert.deepEqual(visDefaults(s), VIS_DEFAULTS);
  assert.deepEqual(visDefaults({ visibility: { newVis: 'all', npcReveal: 'name', named: false } }), { newVis: 'all', npcReveal: 'name', named: false, discord: false });
  assert.deepEqual(visDefaults({ visibility: { newVis: 'everyone', npcReveal: 'face', named: 'no' } }), VIS_DEFAULTS, 'anything unknown falls back');
  assert.deepEqual(cleanVisDefaults({ newVis: 'all', npcReveal: 'portrait', named: false, discord: true, extra: 1 }), { newVis: 'all', npcReveal: 'portrait', named: false, discord: false }, 'Discord stays off until it exists');
});

let owner, plain, C, P;
const rnd = () => Math.random().toString(36).slice(2, 8);
async function makeCampaign(who, title) {
  const made = await who.client.from('campaigns').insert({ slug: 'set-' + rnd(), title }).select('id, slug').single();
  assert.equal(made.error, null, made.error?.message);
  assert.equal((await who.client.from('sections').insert({ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' })).error, null);
  return made.data;
}
before(async () => {
  await cleanup();
  // owner: a test account, so hub version 2 flags are on for it. plain: an ordinary DM.
  [owner, plain] = await Promise.all([makeUser('setowner'), makeUser('setplain', { unblocked: true })]);
  [C, P] = await Promise.all([makeCampaign(owner, 'Settings Realm'), makeCampaign(plain, 'Plain Settings')]);
});
after(cleanup);

// every part the Manage page had before Campaign settings, by its heading
const PARTS = ['Reveal stages', 'Preview', 'Invite codes', 'Members', 'Tabs', 'Paste pages', 'Rules', 'Table tools', 'Theme', 'Campaign home', 'Background picture', 'Campaign settings', 'Delete this campaign'];
const SECTIONS = [['general', 'General'], ['pages', 'Pages and features'], ['privacy', 'Visibility defaults'], ['dice', 'Dice'], ['people', 'People and permissions'], ['discord', 'Discord'], ['danger', 'Archive or delete']];

test('with the flag, Manage is Campaign settings: the seven sections, and every part it had before', async () => {
  const pg = await page(`/c/${C.slug}/manage`, owner.session);
  assert.equal(pg.status, 200);
  assert.ok(pg.text.includes('aria-label="Campaign settings"'), 'the list of sections');
  for (const [id, title] of SECTIONS) {
    assert.ok(pg.text.includes(`href="#set-${id}"`) && pg.text.includes(`id="set-${id}"`), title + ' is listed and is there');
    assert.ok(pg.text.includes(`id="set-h-${id}" class="set-h">${title}</h2>`), title + ' has its heading');
  }
  for (const part of PARTS) assert.ok(pg.text.includes(`>${part}</h2>`), 'kept: ' + part);
  // in the sections they belong to
  const at = (s) => pg.text.indexOf(`id="set-${s}"`);
  const where = (part) => pg.text.indexOf(`>${part}</h2>`);
  assert.ok(where('Invite codes') > at('people') && where('Members') > at('people') && where('Invite codes') < at('discord'), 'invites and members under People and permissions');
  assert.ok(where('Reveal stages') > at('privacy') && where('Reveal stages') < at('dice'), 'reveal stages under Visibility defaults');
  assert.ok(where('Delete this campaign') > at('danger'), 'delete under Archive or delete');
  assert.ok(where('Theme') > at('general') && where('Theme') < at('pages'), 'the theme under General');
  // the new parts
  for (const words of ['New content starts as', 'When an NPC is revealed, players see', 'Allow reveals to only some players', 'Post scheduled reveals to Discord', 'Save visibility defaults', 'Players can roll to the DM only', 'Save dice rules', 'Make someone a co-DM', 'Archiving keeps everything readable']) assert.ok(pg.text.includes(words), words);
  assert.equal((pg.text.match(/>Pages and features</g) ?? []).length, 2, 'the section heading and its link, and no second heading from the part inside it');
});

test('without the flag, Manage is laid out exactly as it was', async () => {
  const pg = await page(`/c/${P.slug}/manage`, plain.session);
  assert.equal(pg.status, 200);
  assert.ok(pg.text.includes('Manage Plain Settings</h2>'));
  for (const part of PARTS) assert.ok(pg.text.includes(`>${part}</h2>`), 'still there: ' + part);
  for (const words of ['set-nav', 'aria-label="Campaign settings"', 'Visibility defaults', 'New content starts as', 'Save dice rules', 'Archiving keeps']) assert.ok(!pg.text.includes(words), 'nothing new: ' + words);
  const order = PARTS.map((part) => pg.text.indexOf(`>${part}</h2>`));
  assert.deepEqual(order, [...order].sort((x, y) => x - y), 'in the same order as before');
});

test('the defaults are kept in the settings and handed to the tools; only a DM changes them', async () => {
  const before = (await admin.from('campaigns').select('settings').eq('id', C.id).single()).data.settings;
  const saved = await owner.client.from('campaigns').update({ settings: { ...before, visibility: cleanVisDefaults({ newVis: 'all', npcReveal: 'name', named: false }) } }).eq('id', C.id).select('settings').single();
  assert.equal(saved.error, null, saved.error?.message);
  assert.deepEqual(saved.data.settings.visibility, { newVis: 'all', npcReveal: 'name', named: false, discord: false });
  const tool = await page(`/c/${C.slug}/tools/npcs`, owner.session);
  assert.equal(tool.status, 200);
  assert.match(tool.text, /\\?"defaults\\?":\{\\?"newVis\\?":\\?"all\\?",\\?"npcReveal\\?":\\?"name\\?",\\?"named\\?":false/, 'the NPC tool is told');
  const manage = await page(`/c/${C.slug}/manage`, owner.session);
  assert.match(manage.text, /<option value="all" selected="">Visible to every player<\/option>|"newVis\\?":\\?"all/, 'and the form shows what is saved');
  // a player cannot change them
  const player = await makeUser('setplayer');
  assert.equal((await admin.from('memberships').insert({ user_id: player.id, campaign_id: C.id, role: 'player' })).error, null);
  const tried = await player.client.from('campaigns').update({ settings: { visibility: { newVis: 'dm' } } }).eq('id', C.id).select('id');
  assert.ok(tried.error || (tried.data ?? []).length === 0);
  assert.ok((await page(`/c/${C.slug}/manage`, player.session)).status >= 300, 'and never reaches the page');
});
