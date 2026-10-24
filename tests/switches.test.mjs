// Hub version 2, item 3 (issue 84): the list of hub pages and their features, what a campaign
// has switched off (settings.features), and the "Pages and features" part of the Manage page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { HUB_PAGES, HUB_SWITCHES, cleanFeatures, hasFeature, hasPage, hubPage, switchedOff } from '../src/config/hub-features.ts';
import * as tools from '../src/config/tools.ts';
import { FLAGS } from '../src/config/flags.ts';
import { ROOT, admin, cleanup, makeUser, onForEveryone, page } from './helpers.mjs';

const off = (...ids) => ({ features: { off: ids } });
const everyFeature = HUB_PAGES.flatMap((p) => p.features.map((f) => p.id + '.' + f.id));

// ------------------------------------------------------------------ the list

test('the list is the one in the mockup: the same pages, features, words and order', () => {
  const src = fs.readFileSync(path.join(ROOT, 'docs/design/mockups/source/FeatureToggles.dc.html'), 'utf8');
  const plain = (s) => s.replace(/’/g, "'");   // the mockup uses a curly apostrophe; the site uses a straight one
  const drawn = [...src.matchAll(/\{ id: '(\w+)', name: '([^']+)', desc: '([^']+)',([^\[]*)feats: \[(.*)\] \}/g)].map((m) => ({
    id: m[1], name: m[2], what: m[3], optional: /optional: true/.test(m[4]), startsOff: /on: false/.test(m[4]),
    features: [...m[5].matchAll(/F\('((?:[^'\\]|\\.)*)'(?:, '((?:[^'\\]|\\.)*)')?(, false)?\)/g)].map((f) => ({ name: plain(f[1]), what: plain(f[2] ?? ''), startsOff: !!f[3] })),
  }));
  assert.equal(drawn.length, 16, 'the mockup source lists sixteen pages');
  assert.equal(HUB_PAGES.length, 16);
  drawn.forEach((d, i) => {
    const p = HUB_PAGES[i];
    // the one renaming: the plan calls the "Secrets" page Reveals, because Secrets is already a table tool
    assert.equal(p.id, d.id === 'secrets' ? 'reveals' : d.id);
    assert.equal(p.name, d.name === 'Secrets' ? 'Reveals' : d.name);
    assert.equal(p.what, d.what, p.id);
    assert.equal(p.optional, d.optional, p.id);
    assert.equal(!!p.startsOff, d.startsOff, p.id + ' starts on or off as drawn');
    assert.deepEqual(p.features.map((f) => f.name), d.features.map((f) => f.name), p.id + ' has the same features in the same order');
    p.features.forEach((f, k) => {
      const shown = d.features[k];
      if (f.needs) assert.equal(shown.what, 'Needs ' + hubPage(f.needs).name, `${p.id}.${f.id} needs the page the mockup says`);
      else assert.equal(f.what ?? '', shown.what, `${p.id}.${f.id}`);
      assert.equal(!!f.startsOff, shown.startsOff, `${p.id}.${f.id} starts on or off as drawn`);
    });
  });
});

test('ten default pages and six optional ones, each with its own feature flag and ids of its own', () => {
  assert.deepEqual(HUB_PAGES.filter((p) => !p.optional).map((p) => p.name), ['Welcome', 'Character sidebar', 'NPCs', 'Lore', 'Combat', 'Players', 'Timeline', 'Reveals', 'Campaign settings', 'People and permissions']);
  assert.deepEqual(HUB_PAGES.filter((p) => p.optional).map((p) => p.name), ['Map', 'Quest log', 'Party loot', 'Relationship web', 'Hub-wide search', 'Live session screen']);
  assert.equal(new Set(HUB_PAGES.map((p) => p.id)).size, 16);
  assert.equal(new Set(HUB_PAGES.map((p) => p.flag)).size, 16, 'no two pages share a flag');
  for (const p of HUB_PAGES) {
    assert.ok(FLAGS[p.flag], p.id + ' names a real flag');
    assert.match(p.id, /^[a-z]+$/);
    assert.ok(p.features.length >= 2);
    assert.equal(new Set(p.features.map((f) => f.id)).size, p.features.length, p.id + ': feature ids are its own');
    for (const f of p.features) {
      assert.match(f.id, /^[a-z]+$/);
      if (f.needs) assert.ok(hubPage(f.needs)?.optional, `${p.id}.${f.id} needs an optional page`);
    }
  }
  assert.equal(HUB_SWITCHES.length, 6 + everyFeature.length, 'a switch for each optional page and each feature, and none for a default page');
  assert.ok(!HUB_SWITCHES.includes('welcome') && HUB_SWITCHES.includes('map') && HUB_SWITCHES.includes('combat.map'));
});

// ------------------------------------------------------------------ the rule

test('a campaign with no list keeps everything on, whatever shape its settings are in', () => {
  for (const settings of [null, undefined, {}, { tools: ['npcs'] }, { features: null }, { features: 'map' }, { features: ['map', 'combat.map'] }, { features: {} }, { features: { off: 'map' } }, { features: { off: null } }, { features: { on: [] } }]) {
    for (const p of HUB_PAGES) assert.equal(hasPage(settings, p.id), true, p.id + ' with ' + JSON.stringify(settings));
    for (const id of everyFeature) assert.equal(hasFeature(settings, id), true, id + ' with ' + JSON.stringify(settings));
    assert.equal(switchedOff(settings).size, 0);
  }
  // even what the mockups draw switched off in a new campaign: that is for new campaign setup, not for existing campaigns
  assert.equal(hasFeature({}, 'combat.map'), true);
  assert.equal(hasPage({}, 'live'), true);
});

test('an optional page can be switched off, and takes its features with it; a default page cannot', () => {
  const s = off('map', 'welcome', 'combat');
  assert.equal(hasPage(s, 'map'), false);
  for (const f of hubPage('map').features) assert.equal(hasFeature(s, 'map.' + f.id), false);
  for (const id of ['welcome', 'combat', 'reveals', 'settings', 'people', 'sidebar']) assert.equal(hasPage(s, id), true, id + ' is a default page');
  for (const f of hubPage('combat').features) assert.equal(hasFeature(s, 'combat.' + f.id), true, 'and naming a default page switches none of its features off');
  for (const id of ['quests', 'loot', 'relations', 'search', 'live']) assert.equal(hasPage(s, id), true, id + ' was not switched off');
  assert.deepEqual(cleanFeatures(s.features), { off: ['map'] }, 'a default page is not kept in the list');
});

test('a feature can be switched off on its own, on a default page or an optional one', () => {
  const s = off('combat.map', 'loot.coins');
  assert.equal(hasFeature(s, 'combat.map'), false);
  assert.equal(hasFeature(s, 'combat.initiative'), true);
  assert.equal(hasPage(s, 'combat'), true);
  assert.equal(hasFeature(s, 'loot.coins'), false);
  assert.equal(hasFeature(s, 'loot.claim'), true);
  assert.equal(hasPage(s, 'loot'), true);
  // two pages have a feature with the same short id; switching one leaves the other
  assert.equal(hasFeature(off('quests.hidden'), 'relations.hidden'), true);
  assert.equal(hasFeature(off('sidebar.conditions'), 'combat.conditions'), true);
});

test('a feature that shows something from another page goes with that page', () => {
  assert.equal(hasFeature(off('quests'), 'welcome.quests'), false, 'no Quest log, so no active quests on Welcome');
  assert.equal(hasFeature(off('quests'), 'welcome.recap'), true);
  assert.equal(hasFeature(off('relations'), 'npcs.connections'), false);
  assert.equal(hasFeature(off('quests.track'), 'welcome.quests'), true, 'switching off a feature of that page is not switching off the page');
  assert.equal(hasFeature({}, 'welcome.quests'), true);
});

test('something that is not on the list is off, and only real switches are stored', () => {
  for (const id of ['nope', 'nope.thing', 'combat.nope', 'combat', '', 'map.pins.extra']) assert.equal(hasFeature({}, id), false, id || '(empty)');
  assert.equal(hasPage({}, 'nope'), false);
  assert.equal(hasPage({}, 'combat.map'), false);
  assert.deepEqual(cleanFeatures(['loot.coins', 'map', 'nope', 'welcome', 'map', 7, null, 'combat.map', '<b>', 'combat.nope']), { off: ['combat.map', 'map', 'loot.coins'] }, 'known switches, once each, in the listed order');
  assert.deepEqual(cleanFeatures({ off: ['live', 'live'] }), { off: ['live'] }, 'the stored shape is accepted too');
  for (const junk of [null, undefined, 'map', 7, {}, { off: 'map' }]) assert.deepEqual(cleanFeatures(junk), { off: [] });
  assert.deepEqual(cleanFeatures(HUB_SWITCHES).off, HUB_SWITCHES, 'everything can be switched off at once');
});

test('the helper sits next to hasTool, and the tool switches work as before', () => {
  assert.equal(tools.hasFeature, hasFeature);
  assert.equal(tools.hasPage, hasPage);
  assert.equal(tools.hasTool({ features: { off: ['map'] } }, 'maps'), true, 'a page switch does not switch a table tool');
  assert.equal(tools.hasTool({ tools: ['npcs'] }, 'maps'), false);
  assert.equal(hasPage({ tools: [] }, 'map'), true, 'and a tool switch does not switch a page');
});

// ------------------------------------------------------------------ the Manage page

let dm, plainDm, boss, player, mine, plains, bosss;
const rnd = () => Math.random().toString(36).slice(2, 8);
async function makeCampaign(owner, title, settings = {}) {
  const made = await owner.client.from('campaigns').insert({ slug: 'sw-' + rnd(), title, settings }).select('id, slug, settings').single();
  assert.equal(made.error, null, made.error?.message);
  const s = await owner.client.from('sections').insert({ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' });
  assert.equal(s.error, null, s.error?.message);
  return made.data;
}
before(async () => {
  await cleanup();
  // dm: a test account, so the flag is on for it. plainDm: an ordinary DM, for whom it is off.
  [dm, plainDm, boss, player] = await Promise.all([makeUser('swdm'), makeUser('swplain', { unblocked: true }), makeUser('swhead', { head: true }), makeUser('swplayer')]);
  [mine, plains, bosss] = await Promise.all([makeCampaign(dm, 'Switch Realm', { rules: '2024', tools: ['npcs', 'maps'], video: 'https://youtu.be/abc' }), makeCampaign(plainDm, 'Plain Realm'), makeCampaign(boss, 'Head Realm')]);
  const joined = await admin.from('memberships').insert({ user_id: player.id, campaign_id: mine.id, role: 'player' });
  assert.equal(joined.error, null, joined.error?.message);
});
after(cleanup);

const sum = (text, name) => new RegExp('<b>' + name + '</b>[\\s\\S]{0,400}?class="sw-sum">([^<]*)<').exec(text)?.[1];

test('Manage shows "Pages and features" behind its flag: every page, default pages locked, everything on', async () => {
  const pg = await page(`/c/${mine.slug}/manage`, dm.session);
  assert.equal(pg.status, 200);
  assert.ok(pg.text.includes('id="pages"') && pg.text.includes('Pages and features'));
  for (const p of HUB_PAGES) {
    assert.equal(sum(pg.text, p.name), `${p.features.length} of ${p.features.length} features on`, p.name);
    assert.equal(pg.text.includes(`id="sw-${p.id}"`), p.optional, p.name + (p.optional ? ' has a switch' : ' has no switch of its own'));
  }
  assert.equal(pg.text.split('title="Always on"').length - 1, 10, 'the ten default pages carry the lock');
  assert.ok(pg.text.includes('Table tools'), 'the table tools section is still there');
  assert.ok(!pg.text.includes('because you are the Head DM'));
  assert.ok((await page(`/c/${bosss.slug}/manage`, boss.session)).text.includes('because you are the Head DM'), 'the Head DM is told why he sees every page');
});

test('for a DM without the flag there is no such section, and none of its words are sent', async () => {
  if (await onForEveryone('hub_v2_switches')) return;
  const pg = await page(`/c/${plains.slug}/manage`, plainDm.session);
  assert.equal(pg.status, 200);
  assert.ok(pg.text.includes('Table tools'), 'the Manage page itself is as before');
  for (const words of ['Pages and features', 'id="pages"', 'sw-page', 'Relationship web', 'Live session screen', 'Hub-wide search', 'features on', 'Optional pages']) assert.ok(!pg.text.includes(words), words);
});

test('what a campaign has switched off is kept in its settings and shown; nothing else in the settings changes', async () => {
  const before = (await admin.from('campaigns').select('settings').eq('id', mine.id).single()).data.settings;
  const saved = await dm.client.from('campaigns').update({ settings: { ...before, features: cleanFeatures(['relations', 'combat.map', 'quests', 'junk']) } }).eq('id', mine.id).select('settings').single();
  assert.equal(saved.error, null, saved.error?.message);
  assert.deepEqual(saved.data.settings, { ...before, features: { off: ['combat.map', 'quests', 'relations'] } }, 'rules, tools and the video are untouched');
  const pg = await page(`/c/${mine.slug}/manage`, dm.session);
  assert.equal(sum(pg.text, 'Relationship web'), 'Page off');
  assert.equal(sum(pg.text, 'Quest log'), 'Page off');
  assert.equal(sum(pg.text, 'Combat'), '5 of 6 features on');
  assert.equal(sum(pg.text, 'Welcome'), '5 of 6 features on', 'Active quests goes with the Quest log');
  assert.equal(sum(pg.text, 'NPCs'), '4 of 5 features on', 'Connections goes with the Relationship web');
  assert.equal(sum(pg.text, 'Map'), '3 of 3 features on');
  // switching back on is only removing it from the list
  const back = await dm.client.from('campaigns').update({ settings: { ...before, features: cleanFeatures([]) } }).eq('id', mine.id).select('settings').single();
  assert.deepEqual(back.data.settings.features, { off: [] });
  assert.equal(sum((await page(`/c/${mine.slug}/manage`, dm.session)).text, 'Relationship web'), '2 of 2 features on');
});

test('only the campaign\'s DM changes its switches, and a player never reaches the page', async () => {
  const tried = await player.client.from('campaigns').update({ settings: { features: { off: ['map'] } } }).eq('id', mine.id).select('id');
  assert.ok(tried.error || (tried.data ?? []).length === 0, 'the database refuses a player');
  const other = await plainDm.client.from('campaigns').update({ settings: { features: { off: ['map'] } } }).eq('id', mine.id).select('id');
  assert.ok(other.error || (other.data ?? []).length === 0, 'and another DM');
  assert.deepEqual((await admin.from('campaigns').select('settings').eq('id', mine.id).single()).data.settings.features, { off: [] });
  const pg = await page(`/c/${mine.slug}/manage`, player.session);
  assert.ok(pg.status >= 300 && pg.status < 400 && pg.text === '', 'Manage sends a player away');
});
