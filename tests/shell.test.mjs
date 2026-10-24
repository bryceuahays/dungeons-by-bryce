// Hub version 2, item 8 (issue 88): the header, page tabs, character sidebar and phone layout.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { barPages, cleanShell, shellOf } from '../src/features/hub/shell/model.ts';
import { blankV2 } from '../src/lib/rules/engine.ts';
import { SITE, admin, cleanup, cookieFor, makeUser, onForEveryone, page } from './helpers.mjs';

test('the phone bar: two pages the DM picks, filled up from the next tabs', () => {
  const tabs = ['overview', 'lore', 'npcs', 'secrets', 'sheet'];
  assert.deepEqual(barPages({}, tabs), ['lore', 'npcs'], 'nothing chosen: the second and third tabs');
  assert.deepEqual(barPages({ shell: { bar: ['sheet', 'secrets'] } }, tabs), ['sheet', 'secrets']);
  assert.deepEqual(barPages({ shell: { bar: ['sheet'] } }, tabs), ['sheet', 'lore'], 'one chosen: the next tab fills the other');
  assert.deepEqual(barPages({ shell: { bar: ['gone', 'overview'] } }, tabs), ['lore', 'npcs'], 'a tab the viewer does not have, and Home, are skipped');
  assert.deepEqual(barPages({}, ['overview']), [], 'a campaign with one tab has none');
  assert.deepEqual(shellOf({ shell: { bar: ['a', 'a', 'B!', 7, 'b', 'c'] } }), { bar: ['a', 'b'] });
  assert.deepEqual(cleanShell({ bar: ['overview', 'npcs', 'made-up'] }, tabs), { bar: ['npcs'] }, 'only real tabs, and not Home');
  for (const junk of [null, 'x', [], { bar: 'lore' }]) assert.deepEqual(shellOf({ shell: junk }), { bar: [] });
});

let dm, a, b, plain, outsider, C, P, mineA, mineB;
const rnd = () => Math.random().toString(36).slice(2, 8);
async function makeCampaign(who, title) {
  const made = await who.client.from('campaigns').insert({ slug: 'shell-' + rnd(), title, settings: { session: 4 } }).select('id, slug').single();
  assert.equal(made.error, null, made.error?.message);
  assert.equal((await who.client.from('sections').insert([
    { campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' },
    { campaign_id: made.data.id, slug: 'lore', title: 'Lore', sort: 20, audience: 'all', kind: 'content' },
    { campaign_id: made.data.id, slug: 'vault', title: 'Vault', sort: 30, audience: 'dm', kind: 'content' },
  ])).error, null);
  return made.data;
}
const side = async (who, slug, query = '', extra = '') => {
  const res = await fetch(`${SITE}/c/${slug}/sidebar${query}`, { headers: { cookie: (who ? cookieFor(who.session) : '') + (extra ? '; ' + extra : '') }, redirect: 'manual' });
  return { status: res.status, json: res.status === 200 ? await res.json() : null };
};
const viewAs = (v) => 'dbb-view-as-player=' + encodeURIComponent(JSON.stringify(v));
const sheetOf = (name, ab) => ({ ...blankV2(), name, level: 3, race: 'Human', cls: 'Rogue', ab, skills: ['Stealth'] });

before(async () => {
  await cleanup();
  // dm, a, b: test accounts, so hub version 2 flags are on for them. plain: an ordinary DM.
  [dm, a, b, plain, outsider] = await Promise.all([makeUser('shelldm'), makeUser('shella'), makeUser('shellb'), makeUser('shellplain', { unblocked: true }), makeUser('shellout')]);
  [C, P] = await Promise.all([makeCampaign(dm, 'Shell Realm'), makeCampaign(plain, 'Plain Shell')]);
  assert.equal((await admin.from('memberships').insert([{ user_id: a.id, campaign_id: C.id, role: 'player' }, { user_id: b.id, campaign_id: C.id, role: 'player' }])).error, null);
  mineA = (await a.client.from('characters').insert({ owner: a.id, campaign_id: C.id, data: sheetOf('Brannoch Vale', { str: 8, dex: 16, con: 12, int: 10, wis: 14, cha: 10 }) }).select('id').single()).data;
  mineB = (await b.client.from('characters').insert({ owner: b.id, campaign_id: C.id, data: sheetOf('Tamsin Reed', { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 }) }).select('id').single()).data;
  assert.ok(mineA && mineB);
});
after(cleanup);

test('with the flag, every campaign page wears the new frame; without it, the old one', async () => {
  const pg = await page(`/c/${C.slug}/overview`, dm.session);
  assert.equal(pg.status, 200);
  for (const part of ['class="hs-top"', 'class="hs-tabs"', 'id="hs-side"', 'class="hs-bar"', '>Session 4<', 'Table tools', '>Dice<', 'View as player', 'Edit this page', 'aria-label="Manage"']) assert.ok(pg.text.includes(part), part);
  assert.match(pg.text, /Vault<span class="hs-dm">DM only<\/span>/, 'a DM tab is marked');
  assert.ok(!pg.text.includes('class="strip"'), 'and the old strip is gone');
  // a player gets the frame without the DM's controls or the DM's tabs
  const theirs = await page(`/c/${C.slug}/overview`, a.session);
  assert.ok(theirs.text.includes('class="hs-top"') && theirs.text.includes('id="hs-side"'));
  for (const words of ['Vault', 'View as player', 'Edit this page', 'aria-label="Manage"', 'Hide DM secrets']) assert.ok(!theirs.text.includes(words), 'not for a player: ' + words);
  // without the flag
  if (await onForEveryone('hub_v2_shell')) return;
  const old = await page(`/c/${P.slug}/overview`, plain.session);
  assert.ok(old.text.includes('class="strip"') && old.text.includes('Hide DM secrets'));
  for (const part of ['hs-top', 'hs-side', 'hs-bar', '/sidebar']) assert.ok(!old.text.includes(part), 'nothing new: ' + part);
  assert.equal((await side(plain, P.slug)).status, 404, 'and no sidebar to fetch');
});

test('the sidebar holds the player\'s own character, from the rules engine, and nobody else\'s', async () => {
  const r = await side(a, C.slug);
  assert.equal(r.status, 200);
  const d = r.json;
  assert.deepEqual(d.characters.map((c) => c.name), ['Brannoch Vale'], 'only their own');
  assert.equal(d.dm, false);
  assert.equal(d.sheet.name, 'Brannoch Vale');
  assert.equal(d.sheet.line, 'Human · Rogue · Level 3');
  assert.deepEqual(d.sheet.abilities.map((x) => [x.abbr, x.score, x.mod]), [['STR', 8, -1], ['DEX', 16, 3], ['CON', 12, 1], ['INT', 10, 0], ['WIS', 14, 2], ['CHA', 10, 0]]);
  assert.equal(d.sheet.skills.find((s) => s.name === 'Stealth').bonus, 5, 'Dexterity +3 and proficiency +2');
  assert.equal(d.sheet.skills.find((s) => s.name === 'Stealth').proficient, true);
  assert.equal(d.sheet.prof, 2);
  assert.ok(d.sheet.abilities.every((x) => typeof x.token === 'string') && d.sheet.skills.every((x) => typeof x.token === 'string'), 'each can be tapped to roll');
  // asking for someone else's character gives their own back
  const sneaky = (await side(a, C.slug, '?c=' + mineB.id)).json;
  assert.equal(sneaky.sheet.name, 'Brannoch Vale');
  assert.ok(!JSON.stringify(sneaky).includes('Tamsin'));
  // a tapped check rolls with the modifier the server worked out
  const stealth = d.sheet.skills.find((s) => s.name === 'Stealth').token;
  const rolled = await fetch(`${SITE}/c/${C.slug}/tools/dice/roll`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieFor(a.session) }, body: JSON.stringify({ check: stealth, privacy: 'all' }) });
  const out = await rolled.json();
  assert.deepEqual([out.roll.label, out.roll.notation, out.roll.who], ['Stealth', '1d20+5', 'Brannoch Vale']);
  // outside the campaign there is nothing
  assert.equal((await side(outsider, C.slug)).status, 404);
  assert.ok((await side(null, C.slug)).status >= 300);
});

test('a DM picks whose sheet to see; a preview as a player gets that player\'s sidebar and cannot roll', async () => {
  const d = (await side(dm, C.slug)).json;
  assert.equal(d.dm, true);
  assert.deepEqual(d.characters.map((c) => c.name).sort(), ['Brannoch Vale', 'Tamsin Reed']);
  assert.deepEqual(d.characters.map((c) => c.player).sort(), ['Test shella', 'Test shellb']);
  const tamsin = (await side(dm, C.slug, '?c=' + mineB.id)).json;
  assert.equal(tamsin.sheet.name, 'Tamsin Reed');
  assert.equal(tamsin.sheet.abilities.find((x) => x.key === 'str').mod, 2);
  assert.ok(tamsin.choices.includes('dm') && !tamsin.choices.includes('self'), 'the DM\'s choices');
  const preview = (await side(dm, C.slug, '', viewAs({ p: b.id }))).json;
  assert.deepEqual(preview.characters.map((c) => c.name), ['Tamsin Reed'], 'previewing as player B: only B\'s');
  assert.equal(preview.dm, false);
  assert.equal(preview.canRoll, false);
  assert.ok(preview.sheet.abilities.every((x) => x.token === null), 'nothing to roll from inside a preview');
});

test('the sidebar\'s roll log holds only what the viewer may read', async () => {
  const post = (who, body) => fetch(`${SITE}/c/${C.slug}/tools/dice/roll`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieFor(who.session) }, body: JSON.stringify(body) }).then((r) => r.json());
  await post(b, { notation: '1d20', label: 'Wrenmoss secret', privacy: 'dm' });
  await post(dm, { notation: '1d20', label: 'Quellfire ambush', privacy: 'dm' });
  await post(b, { notation: '1d20', label: 'Openfield cheer', privacy: 'all' });
  const forA = JSON.stringify((await side(a, C.slug)).json.log);
  assert.ok(forA.includes('Openfield cheer'));
  assert.ok(!forA.includes('Wrenmoss') && !forA.includes('Quellfire'), 'another player\'s private roll and the DM\'s hidden roll are not there');
  const forDm = JSON.stringify((await side(dm, C.slug)).json.log);
  assert.ok(forDm.includes('Wrenmoss secret') && forDm.includes('Quellfire ambush'));
  const forB = JSON.stringify((await side(b, C.slug)).json.log);
  assert.ok(forB.includes('Wrenmoss secret') && !forB.includes('Quellfire'));
});

test('the Character sidebar\'s switches leave out what is switched off, and the phone bar is the DM\'s choice', async () => {
  const set = async (settings) => { const { data } = await admin.from('campaigns').select('settings').eq('id', C.id).single(); assert.equal((await dm.client.from('campaigns').update({ settings: { ...data.settings, ...settings } }).eq('id', C.id)).error, null); };
  await set({ features: { off: ['sidebar.skills', 'sidebar.tap', 'sidebar.log'] } });
  const d = (await side(a, C.slug)).json;
  assert.equal(d.sheet.skills, null, 'skills switched off: not sent');
  assert.equal(d.log, null, 'roll log switched off: not sent');
  assert.ok(d.sheet.abilities.every((x) => x.token === null) && d.sheet.initToken === null, 'tap to roll switched off');
  await set({ features: { off: ['sidebar.attributes', 'sidebar.private'] } });
  const e = (await side(a, C.slug)).json;
  assert.equal(e.sheet.abilities, null);
  assert.deepEqual(e.choices, ['all'], 'private rolls switched off: players roll in the open');
  await set({ features: { off: [] }, shell: { bar: ['vault'] } });
  // the phone bar: the DM chose the Vault; a player, who has no Vault, gets the next tabs.
  // (Welcome is Home here, since the test accounts have its flag, so the campaign's own first tab can be on the bar.)
  const dmPage = (await page(`/c/${C.slug}/overview`, dm.session)).text;
  const bar = (t) => (t.match(/<nav class="hs-bar"[\s\S]*?<\/nav>/) ?? [''])[0];
  assert.ok(bar(dmPage).includes(`/c/${C.slug}/vault`) && bar(dmPage).includes(`/c/${C.slug}/overview`) && bar(dmPage).includes(`/c/${C.slug}/hub/welcome`));
  const playerBar = bar((await page(`/c/${C.slug}/overview`, a.session)).text);
  assert.ok(!playerBar.includes('vault') && playerBar.includes(`/c/${C.slug}/overview`) && playerBar.includes(`/c/${C.slug}/lore`) && playerBar.includes('>Home<') && playerBar.includes('>Character<') && playerBar.includes('>More<'));
  // only the DM changes it
  const tried = await a.client.from('campaigns').update({ settings: { shell: { bar: ['lore'] } } }).eq('id', C.id).select('id');
  assert.ok(tried.error || (tried.data ?? []).length === 0);
  // the choice is on Manage
  assert.ok((await page(`/c/${C.slug}/manage`, dm.session)).text.includes('Save the phone bar'));
  if (!(await onForEveryone('hub_v2_shell'))) assert.ok(!(await page(`/c/${P.slug}/manage`, plain.session)).text.includes('Save the phone bar'));
});
