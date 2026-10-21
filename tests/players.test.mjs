// Hub version 2, item 13 (issue 92): the Players page, and players' private messages to the DM with
// the Reveals inbox (issue 120). A character's sheet is its player's (and the DM's) alone; other
// players get only what that player shares. Messages are read only by their author or recipient,
// the owner, and co-DMs allowed to "Read player messages".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ago, cardLine, cleanShared, sharesAnything } from '../src/features/hub/players/model.ts';
import { ROOT, SITE, admin, cleanup, cookieFor, makeUser, page } from './helpers.mjs';

const rnd = () => Math.random().toString(36).slice(2, 8);

test('what is shared, tidied; the card line; when, in words', () => {
  assert.deepEqual(cleanShared({ about: '  A sailor  ', carry: 'x'.repeat(3000), extra: 'never kept', connections: 7 }), { about: 'A sailor', carry: 'x'.repeat(2000), connections: '' });
  assert.equal(sharesAnything({}), false);
  assert.equal(sharesAnything({ carry: 'A lute' }), true);
  assert.equal(cardLine({ race: 'Elf', cls: 'Wizard', level: 3, background: 'Sage' }), 'Elf Wizard · Level 3 · Sage');
  assert.equal(cardLine({ cls: 'Fighter', level: 1 }), 'Fighter · Level 1');
  const now = Date.parse('2026-10-21T12:00:00Z');
  assert.equal(ago('2026-10-21T11:59:30Z', now), 'Just now');
  assert.equal(ago('2026-10-21T09:00:00Z', now), '3 hours ago');
  assert.equal(ago('2026-10-20T10:00:00Z', now), 'Yesterday');
  assert.equal(ago('2026-10-17T12:00:00Z', now), '4 days ago');
});

// ------------------------------------------------------------------ as each person (needs the players migration)

const manifest = path.join(ROOT, '.next/server/server-reference-manifest.json');
const idOf = (name, where) => {
  if (!fs.existsSync(manifest)) return null;
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  return Object.entries(m.node ?? {}).find(([, v]) => v.exportedName === name && JSON.stringify(v).includes(where))?.[0] ?? null;
};
const call = async (name, where, url, session, args) => {
  const res = await fetch(SITE + url, { method: 'POST', headers: { 'Next-Action': idOf(name, where), 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', cookie: cookieFor(session) }, body: JSON.stringify(args), redirect: 'manual' });
  return res.text();
};
const skip = !idOf('sendToDm', 'hub/players/page') && 'no local build to call the actions through';

let dm, p1, p2, codmNo, codmYes, plain, C, mira, tobin;
before(async () => {
  await cleanup();
  [dm, p1, p2] = await Promise.all([makeUser('pldm'), makeUser('plp1', { free: true }), makeUser('plp2', { free: true })]);
  plain = await makeUser('plplain', { unblocked: true, free: true });
  C = (await dm.client.from('campaigns').insert({ slug: 'ply-' + rnd(), title: 'Players Realm', phases: [], phase: '' }).select('id, slug').single()).data;
  await dm.client.from('sections').insert({ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' });
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await dm.client.from('invites').insert({ campaign_id: C.id, code });
  for (const u of [p1, p2, plain]) assert.equal((await u.client.rpc('join_campaign', { p_code: code })).error, null);
  mira = (await admin.from('characters').insert({ campaign_id: C.id, owner: p1.id, data: { name: 'Mira Vale', v: 2, race: 'Elf', cls: 'Rogue', level: 3, backstory: 'Fled the Salt Court after stealing its crown', gear: 'Thieves tools, a silver dagger' }, shared: { about: 'A quiet elf who knows the docks' } }).select('id').single()).data.id;
  tobin = (await admin.from('characters').insert({ campaign_id: C.id, owner: p2.id, data: { name: 'Tobin Reed', v: 2, cls: 'Fighter', level: 3, backstory: 'Once a city guard' } }).select('id').single()).data.id;
  // co-DMs: one may read player messages, one may not
  codmYes = await makeUser('plcy', { dmOf: C.id });
  codmNo = await makeUser('plcn', { dmOf: C.id });
  await admin.from('memberships').update({ perms: { see_hidden: true, edit: true, reveal: true, messages: false } }).eq('campaign_id', C.id).eq('user_id', codmNo.id);
});
after(cleanup);

test('another player gets only what is shared, never the sheet: page, database and function', async () => {
  const pg = await page(`/c/${C.slug}/hub/players`, p2.session);
  assert.equal(pg.status, 200);
  for (const words of ['Mira Vale', 'Tobin Reed (you)', 'Once a city guard', 'Private note to the DM', 'My notes']) assert.ok(pg.text.includes(words), words);
  // the page starts on their own character; Mira's card data (shared only) is in it for when they pick her
  for (const secret of ['Salt Court', 'silver dagger']) assert.ok(!pg.text.includes(secret), 'not sent: ' + secret);
  assert.equal(((await p2.client.from('characters').select('id').eq('id', mira)).data ?? []).length, 0, 'the row itself is not readable');
  const party = (await p2.client.rpc('party_shared', { c: C.id })).data ?? [];
  const m = party.find((x) => x.id === mira);
  assert.deepEqual(m.shared, { about: 'A quiet elf who knows the docks' });
  assert.ok(!JSON.stringify(party).includes('Salt Court'), 'the function hands over the card and what is shared, nothing else');
  assert.equal(((await plain.client.rpc('party_shared', { c: '00000000-0000-0000-0000-000000000000' })).data ?? []).length, 0, 'and nothing of a campaign you are not in');
});

test('the DM gets every character in full', async () => {
  const pg = await page(`/c/${C.slug}/hub/players`, dm.session);
  assert.equal(pg.status, 200);
  assert.ok(pg.text.includes('Mira Vale') && pg.text.includes('Salt Court') && pg.text.includes('silver dagger') && pg.text.includes('Open the full sheet'));
  assert.ok(!pg.text.includes('Private note to the DM'), 'no note box for the DM');
  assert.ok(pg.text.includes(`href="/c/${C.slug}/hub/players"`), 'the tab row links to it');
});

test('a message to the DM: only the DMs who may read messages see it; the reply only its player', { skip }, async () => {
  const sent = await call('sendToDm', 'hub/players/page', `/c/${C.slug}/hub/players`, p1.session, [C.slug, 'I want my sister to turn up as a villain']);
  assert.ok(sent.includes('Only the DM sees it'), 'sent');
  const read = async (u) => ((await u.client.from('player_notes').select('body').eq('campaign_id', C.id).eq('kind', 'to_dm')).data ?? []).map((n) => n.body);
  assert.deepEqual(await read(p1), ['I want my sister to turn up as a villain'], 'its author');
  assert.deepEqual(await read(dm), ['I want my sister to turn up as a villain'], 'the owner');
  assert.deepEqual(await read(codmYes), ['I want my sister to turn up as a villain'], 'a co-DM who may read messages');
  assert.deepEqual(await read(codmNo), [], 'not a co-DM who may not');
  assert.deepEqual(await read(p2), [], 'not another player');
  assert.ok((await p2.client.from('player_notes').insert({ campaign_id: C.id, user_id: p1.id, kind: 'to_dm', body: 'forged' })).error, 'nobody writes as someone else');
  assert.ok((await p2.client.from('player_notes').insert({ campaign_id: C.id, user_id: p2.id, kind: 'from_dm', body: 'fake reply' })).error, 'a player cannot write a DM reply');

  // the inbox
  const rv = await page(`/c/${C.slug}/hub/reveals`, dm.session);
  for (const words of ['From your players', 'Mira Vale', 'I want my sister to turn up as a villain', '1 new', 'Reply', 'Save as secret']) assert.ok(rv.text.includes(words), words);
  assert.ok((await admin.from('player_notes').select('read_at').eq('campaign_id', C.id).eq('kind', 'to_dm').single()).data.read_at, 'opening it marks it seen');
  assert.ok(!(await page(`/c/${C.slug}/hub/reveals`, codmNo.session)).text.includes('I want my sister'), 'a co-DM who may not read messages has no inbox');

  // the reply
  const replied = await call('replyToPlayer', 'hub/reveals/page', `/c/${C.slug}/hub/reveals`, dm.session, [C.slug, p1.id, 'Done. Watch for her in session 5.']);
  assert.ok(replied.includes('Only they see it'), 'replied');
  assert.deepEqual(((await p1.client.from('player_notes').select('body').eq('campaign_id', C.id).eq('kind', 'from_dm')).data ?? []).map((n) => n.body), ['Done. Watch for her in session 5.']);
  assert.equal(((await p2.client.from('player_notes').select('id').eq('campaign_id', C.id).eq('kind', 'from_dm')).data ?? []).length, 0, 'not another player');
  assert.ok((await page(`/c/${C.slug}/hub/players`, p1.session)).text.includes('Watch for her in session 5.'), 'Mira\'s player sees it on the Players page');

  // keep it as a plot secret
  const msgId = (await admin.from('player_notes').select('id').eq('campaign_id', C.id).eq('kind', 'to_dm').single()).data.id;
  assert.ok((await call('saveMessageAsSecret', 'hub/reveals/page', `/c/${C.slug}/hub/reveals`, dm.session, [C.slug, msgId])).includes('Saved as a plot secret'));
  const secret = (await admin.from('entries').select('id, vis, title').eq('campaign_id', C.id).eq('kind', 'secret').single()).data;
  assert.equal(secret.vis, 'dm'); assert.match(secret.title, /^From Mira Vale: I want my sister/);
});

test('sharing and notes: each player only their own', { skip }, async () => {
  assert.ok((await call('saveShared', 'hub/players/page', `/c/${C.slug}/hub/players`, p2.session, [C.slug, tobin, { carry: 'A battered shield' }])).includes('The party sees this'));
  assert.deepEqual((await p1.client.rpc('party_shared', { c: C.id })).data.find((x) => x.id === tobin).shared.carry, 'A battered shield');
  assert.ok((await call('saveShared', 'hub/players/page', `/c/${C.slug}/hub/players`, p2.session, [C.slug, mira, { about: 'hacked' }])).includes('That did not save'), 'not someone else\'s character');
  assert.equal((await admin.from('characters').select('shared').eq('id', mira).single()).data.shared.about, 'A quiet elf who knows the docks');
  await call('saveMyNotes', 'hub/players/page', `/c/${C.slug}/hub/players`, p1.session, [C.slug, 'The ferryman lied']);
  assert.equal(((await p1.client.from('player_notes').select('body').eq('campaign_id', C.id).eq('kind', 'note')).data ?? [])[0]?.body, 'The ferryman lied');
  assert.equal(((await dm.client.from('player_notes').select('id').eq('campaign_id', C.id).eq('kind', 'note')).data ?? []).length, 0, 'not even the DM reads a player\'s notes');
});

test('a DM previewing as a player gets that player\'s view; behind its flag', async () => {
  const pg = await page(`/c/${C.slug}/hub/players`, dm.session, 'dbb-view-as-player=' + encodeURIComponent(JSON.stringify({ p: p2.id, s: '' })));
  assert.equal(pg.status, 200);
  assert.ok(pg.text.includes('Once a city guard') && !pg.text.includes('Salt Court'));
  const off = await page(`/c/${C.slug}/hub/players`, plain.session);
  if (off.status !== 200) assert.equal(off.status, 404);
});
