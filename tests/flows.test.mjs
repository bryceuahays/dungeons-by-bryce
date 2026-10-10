// The world page, the two-step new campaign form, the tools a campaign's hub has, moving
// characters between campaigns, and the switch that turns plan limits off.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { admin, cleanup, invite, makeUser, page } from './helpers.mjs';
import { ENFORCE_PLANS, FREE_LIMITS } from '../src/config/plans.ts';
import { SYSTEMS } from '../src/config/systems.ts';
import { GENRES } from '../src/config/genres.ts';
import { TOOLS } from '../src/config/tools.ts';
import { blankV2 } from '../src/lib/rules/engine.ts';

const rnd = () => Math.random().toString(36).slice(2, 8);
let dm, player;

async function makeCampaign(owner, title, settings) {
  const made = await owner.client.from('campaigns').insert({ slug: 'flow-' + rnd(), title, settings }).select('id, slug').single();
  assert.equal(made.error, null);
  await owner.client.from('sections').insert([
    { campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' },
    { campaign_id: made.data.id, slug: 'sheet', title: 'My character', sort: 20, audience: 'player', kind: 'sheet' },
  ]);
  return made.data;
}
const join = async (campaignId, user) => assert.equal((await user.client.rpc('join_campaign', { p_code: await invite(campaignId) })).error, null);

before(async () => {
  await cleanup();
  [dm, player] = await Promise.all([makeUser('flowdm'), makeUser('flowplayer')]);
});
after(cleanup);

test('world page: lore with an Edit lore button, its campaigns, a New campaign button, and no rules setting', async () => {
  const w = (await dm.client.from('worlds').insert({ name: 'Glass Coast', data: { desc: 'A coast of fused sand.\n\nNobody remembers the fire.' } }).select('id').single()).data;
  const inside = await makeCampaign(dm, 'Tide Runners', { rules: '2024' });
  assert.equal((await dm.client.from('campaigns').update({ world_id: w.id }).eq('id', inside.id)).error, null);
  const res = await page('/worlds/' + w.id, dm.session);
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('A coast of fused sand.') && res.text.includes('Nobody remembers the fire.') && res.text.includes('Edit lore'), 'the lore is shown, with a button to edit it');
  assert.ok(res.text.includes('Tide Runners'), 'its campaigns are listed');
  assert.ok(res.text.includes(`href="/new-campaign?world=${w.id}"`) && res.text.includes('New campaign'), 'New campaign starts the flow with this world');
  assert.ok(!res.text.includes('play by these rules') && !/<label>Rules</.test(res.text), 'the rules setting is gone');
  assert.ok(res.text.includes('Homebrew in this world'), 'the rest of the page is still there');
  // a campaign keeps its own system when it is put in a world
  assert.equal((await admin.from('campaigns').select('settings').eq('id', inside.id).single()).data.settings.rules, '2024');
});

test('new campaign: two steps, a world to choose, system and genre choices, and the tools to start with', async () => {
  const w = (await dm.client.from('worlds').insert({ name: 'Ember Reach' }).select('id').single()).data;
  const res = await page('/new-campaign?world=' + w.id, dm.session);
  assert.equal(res.status, 200);
  for (const t of ['Step 1 of 2: Details', 'Step 2 of 2: Hub and tools', 'Description', 'Web address', 'Choose a world…', 'Ember Reach', 'Tools the hub starts with', 'Paste your campaign (optional)', 'Look']) assert.ok(res.text.includes(t), 'the form has: ' + t);
  assert.ok(new RegExp(`<option value="${w.id}" selected`).test(res.text) || res.text.includes(`"world":"${w.id}"`) || res.text.includes(`value="${w.id}"`), 'the world the flow started from is offered');
  for (const s of SYSTEMS) assert.ok(res.text.includes(s.name) && res.text.includes(`name="system" value="${s.id}"`), 'system choice: ' + s.name);
  assert.ok(!/<select name="system"/.test(res.text), 'systems are choices, not a dropdown');
  for (const g of GENRES) assert.ok(res.text.includes(`name="genre" value="${g}"`), 'genre: ' + g);
  for (const t of TOOLS) assert.ok(res.text.includes(`name="tool" value="${t.id}"`), 'tool: ' + t.name);
});

test('a campaign\'s hub has the tools chosen for it; one made before the choice keeps them all', async () => {
  const some = await makeCampaign(dm, 'Few Tools', { rules: '2024', tools: ['npcs', 'maps'] });
  const all = await makeCampaign(dm, 'Every Tool', { rules: '2024' });
  await join(some.id, player);
  const list = await page(`/c/${some.slug}/tools`, dm.session);
  assert.ok(list.status === 200 && list.text.includes('NPCs') && list.text.includes('Maps') && !list.text.includes('Session zero') && !list.text.includes('Initiative'));
  assert.equal((await page(`/c/${some.slug}/tools/npcs`, dm.session)).status, 200);
  for (const who of [dm, player]) assert.equal((await page(`/c/${some.slug}/tools/initiative`, who.session)).status, 404, 'a tool that is switched off is not there');
  const full = await page(`/c/${all.slug}/tools`, dm.session);
  for (const t of TOOLS) assert.ok(full.text.includes(t.name), 'every tool by default: ' + t.name);
  assert.equal((await page(`/c/${all.slug}/tools/initiative`, dm.session)).status, 200);
  // the DM changes the choice on Manage; a player cannot
  const manage = await page(`/c/${some.slug}/manage`, dm.session);
  assert.ok(manage.status === 200 && manage.text.includes('id="tools"') && manage.text.includes('Table tools'));
  assert.equal(((await player.client.from('campaigns').update({ settings: { tools: [] } }).eq('id', some.id).select('id')).data ?? []).length, 0);
  // switching a tool off deletes nothing
  await dm.client.from('entries').insert({ campaign_id: all.id, kind: 'npc', title: 'Kept Safe', vis: 'all', data: {} });
  await dm.client.from('campaigns').update({ settings: { rules: '2024', tools: [] } }).eq('id', all.id);
  assert.equal((await page(`/c/${all.slug}/tools/npcs`, dm.session)).status, 404);
  await dm.client.from('campaigns').update({ settings: { rules: '2024' } }).eq('id', all.id);
  assert.ok((await page(`/c/${all.slug}/tools/npcs`, dm.session)).text.includes('Kept Safe'));
});

test('characters: each shows its system and campaign; moving is to a campaign on the same system that you are in', async () => {
  const a = await makeCampaign(dm, 'Alpha Table', { rules: '2024' });
  const b = await makeCampaign(dm, 'Beta Table', { rules: '2024' });
  const old = await makeCampaign(dm, 'Old Rules Table', { rules: '2014' });
  const closed = await makeCampaign(dm, 'Closed Table', { rules: '2024' });
  for (const c of [a, b, old]) await join(c.id, player);
  const ch = (await player.client.from('characters').insert({ owner: player.id, campaign_id: a.id, data: { ...blankV2(), name: 'Wanderer', level: 2 } }).select('id, system').single()).data;
  assert.equal(ch.system, '2024', 'a character takes the system of its campaign');

  let list = await page('/characters', player.session);
  assert.ok(list.status === 200 && list.text.includes('Wanderer') && list.text.includes(SYSTEMS.find((s) => s.id === '2024').name) && list.text.includes('Alpha Table'));
  assert.ok(list.text.includes('>Beta Table</option>') && !list.text.includes('>Old Rules Table</option>') && !list.text.includes('Closed Table'), 'only campaigns on the same system, that you are in, are offered');

  // the database holds the same line
  assert.ok((await player.client.from('characters').update({ campaign_id: old.id }).eq('id', ch.id).select('id')).error, 'not into a campaign on another system');
  const shut = await player.client.from('characters').update({ campaign_id: closed.id }).eq('id', ch.id).select('id');
  assert.ok(shut.error || (shut.data ?? []).length === 0, 'not into a campaign you have not joined');
  assert.equal((await admin.from('characters').select('campaign_id').eq('id', ch.id).single()).data.campaign_id, a.id);

  const moved = await player.client.from('characters').update({ campaign_id: b.id }).eq('id', ch.id).select('id');
  assert.ok(!moved.error && moved.data.length === 1, 'moved to another campaign on the same system');
  assert.ok((await page('/characters', player.session)).text.includes('Beta Table'));
  assert.equal(((await dm.client.from('characters').select('id').eq('campaign_id', b.id)).data ?? []).length, 1, 'its new DM can see it');

  // out of every campaign: it keeps its system, and can be added to one again
  const out = await player.client.from('characters').update({ campaign_id: null }).eq('id', ch.id).select('id, system').single();
  assert.equal(out.error, null);
  assert.equal(out.data.system, '2024');
  list = await page('/characters', player.session);
  assert.ok(list.text.includes('Not in a campaign') && list.text.includes('Add to a campaign…') && list.text.includes('>Alpha Table</option>') && !list.text.includes('>Old Rules Table</option>'));
  assert.ok((await player.client.from('characters').update({ campaign_id: old.id }).eq('id', ch.id).select('id')).error, 'still only its own system');
  assert.equal((await player.client.from('characters').update({ campaign_id: a.id }).eq('id', ch.id).select('id')).data.length, 1);
  // nobody else can move it
  assert.equal(((await dm.client.from('characters').update({ campaign_id: null }).eq('id', ch.id).select('id')).data ?? []).length, 0);

  // the filter
  const other = (await player.client.from('characters').insert({ owner: player.id, campaign_id: old.id, data: { ...blankV2(), name: 'Old Hand' } }).select('id, system').single()).data;
  assert.equal(other.system, '2014');
  const only2014 = await page('/characters?system=2014', player.session);
  assert.ok(only2014.text.includes('Old Hand') && !only2014.text.includes('Wanderer') && only2014.text.includes('All systems'));
  // a campaign that changes its rules takes its characters with it
  await dm.client.from('campaigns').update({ settings: { rules: 'both' } }).eq('id', old.id);
  assert.equal((await admin.from('characters').select('system').eq('id', other.id).single()).data.system, 'both');
});

test('plan limits are switched off: a free account is not held back, and the wording still says free', async (t) => {
  if (ENFORCE_PLANS) return t.skip('plan limits are switched on');
  const open = await makeUser('open', { free: true, unblocked: true });
  const plan = (await open.client.rpc('my_plan')).data;
  assert.ok(plan.pro === true && plan.paid === false, 'nothing is held back, and the account is still really on the free plan');
  // more campaigns than the free limit
  for (let i = 0; i <= FREE_LIMITS.campaigns; i++) assert.equal((await open.client.from('campaigns').insert({ slug: 'open-' + rnd(), title: 'Open ' + i }).select('id').single()).error, null, 'campaign ' + (i + 1));
  // more homebrew than the free limit, in the full editor
  for (let i = 0; i <= FREE_LIMITS.homebrew; i++) assert.equal((await open.client.from('entities').insert({ type: 'feat', slug: 'open-' + rnd(), name: 'Open feat ' + i, depth: 'advanced' }).select('id').single()).error, null, 'homebrew ' + (i + 1));
  // a tool that is on the Pro list
  const camp = (await open.client.from('campaigns').select('id, slug').eq('owner_id', open.id).limit(1).single()).data;
  assert.equal((await open.client.from('entries').insert({ campaign_id: camp.id, kind: 'beat', title: 'A planned beat', vis: 'dm', data: {} }).select('id').single()).error, null, 'the timeline');
  const access = (await open.client.rpc('campaign_access', { p_slug: camp.slug })).data;
  assert.ok(access.pro && access.creator && access.writable && access.paid === false);
  // the pages: no upgrade prompt in the way, and the Plans page still describes the free plan
  const fresh = await page('/new-campaign', open.session);
  assert.ok(fresh.status === 200 && !fresh.text.includes('The free plan runs one campaign'));
  const plans = await page('/upgrade', open.session);
  assert.ok(plans.status === 200 && plans.text.includes('You are on the free plan') && plans.text.includes('$7 a month'), 'plan wording is unchanged');
  // the same account with limits applied is refused, so the limits themselves still work
  await admin.from('profiles').update({ always_enforce: true }).eq('id', open.id);
  const refused = await open.client.from('campaigns').insert({ slug: 'open-' + rnd(), title: 'One too many' }).select('id').single();
  assert.ok(/upgrade:/.test(refused.error?.message ?? ''), 'limits apply again when they are enforced');
});
