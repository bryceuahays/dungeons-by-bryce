// Hub version 2, item 11 (issue 51): the Lore page and lore categories. Entries of kind 'lore' by
// category, each category laid out its own way; the DM's notes and a creature's unlearned facts
// stay with the DM-only secrets. Every privacy rule is proved as a player's own login.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { LORE_CATEGORIES, STARTING, categoryOf, loreSettingsOf } from '../src/config/lore-categories.ts';
import { cleanData, foundLine, groupPlaces, loreMatches, splitFacts } from '../src/features/hub/lore/model.ts';
import { cleanup, makeUser, page } from './helpers.mjs';

const rnd = () => Math.random().toString(36).slice(2, 8);
const CID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

// ------------------------------------------------------------------ the sums

test('the categories: five to start, ten to add, and the DM\'s own', () => {
  assert.deepEqual(STARTING, ['overview', 'history', 'places', 'factions', 'religions']);
  assert.deepEqual(LORE_CATEGORIES.filter((c) => !c.starting).map((c) => c.name), ['Peoples and cultures', 'Creatures and bestiary', 'Magic and the arcane', 'Items and artifacts', 'Languages and scripts', 'Calendar and holidays', 'Myths and legends', 'Rulers and politics', 'Trade and economy', 'Planes and cosmology'], 'the ten from the plan, in its order');
  assert.equal(new Set(LORE_CATEGORIES.map((c) => c.id)).size, LORE_CATEGORIES.length);
  assert.deepEqual(loreSettingsOf(null), { cats: STARTING, custom: [] }, 'nothing stored: the five');
  const s = loreSettingsOf({ lore: { cats: ['history', 'creatures', 'nonsense', 'history', 'c-house1'], custom: [{ id: 'c-house1', name: '  Noble   houses ' }, { id: 'bad id', name: 'x' }, { id: 'c-empty', name: '' }] } });
  assert.deepEqual(s, { cats: ['history', 'creatures', 'c-house1'], custom: [{ id: 'c-house1', name: 'Noble houses' }] });
  assert.equal(categoryOf('c-house1', s).name, 'Noble houses');
  assert.equal(categoryOf('c-house1', s).layout, 'cards');
  assert.equal(categoryOf('c-gone', s), null);
});

test('saving keeps only the category\'s own fields, tidied', () => {
  const places = LORE_CATEGORIES.find((c) => c.id === 'places');
  const d = cleanData(places, { type: 'city', region: 'not-a-uuid', summary: '  A market town  ', found: 'visited', session: '2', file: CID + '/lore/a.webp', npcs: [CID, 'x'], secret: 'never kept', cat: 'history' }, CID);
  assert.deepEqual(d, { cat: 'places', type: 'city', summary: 'A market town', file: CID + '/lore/a.webp', npcs: [CID], found: 'visited', session: 2 });
  assert.deepEqual(cleanData(places, { type: 'castle', file: 'someone-else/x.webp' }, CID), { cat: 'places' }, 'an unknown type and a picture from another campaign are dropped');
  const rel = LORE_CATEGORIES.find((c) => c.id === 'religions');
  assert.deepEqual(cleanData(rel, { domains: 'Death,  Tempest , ,Life' }, CID).domains, ['Death', 'Tempest', 'Life']);
});

test('a creature\'s facts: learned ones on the entry, the rest kept back', () => {
  assert.deepEqual(splitFacts([{ text: 'Hates iron', session: 2, learned: true }, { text: 'Weak to fire', learned: false }, { text: '  ', learned: true }, { text: 'Sleeps by day', learned: false }]),
    { learned: [{ text: 'Hates iron', session: 2 }], unlearned: [{ text: 'Weak to fire' }, { text: 'Sleeps by day' }], more: 2 });
});

test('places nest in their regions; found lines; search', () => {
  const vale = { id: 'r1', title: 'The Vale', data: { type: 'region' } };
  const mill = { id: 'p1', title: 'Millbrook', data: { type: 'city', region: 'r1', found: 'visited', session: 1 } };
  const crypt = { id: 'p2', title: 'The Crypt', data: { type: 'dungeon' } };
  const lost = { id: 'p3', title: 'Lost Tower', data: { type: 'landmark', region: 'gone' } };
  assert.deepEqual(groupPlaces([vale, mill, crypt, lost]).map((g) => [g.region?.title ?? null, g.places.map((x) => x.title)]), [['The Vale', ['Millbrook']], [null, ['The Crypt', 'Lost Tower']]]);
  assert.equal(foundLine(mill.data), 'Visited in Session 1');
  assert.equal(foundLine({ found: 'heard' }), 'Heard of');
  assert.equal(foundLine({}), '');
  assert.ok(loreMatches({ title: 'Tide Wardens', data: { leader: 'Captain Ysolde' } }, 'ysolde'));
  assert.ok(loreMatches({ title: 'Marsh Hag', data: { learned: [{ text: 'Hates iron' }] } }, 'iron'));
  assert.ok(!loreMatches({ title: 'Marsh Hag', data: {} }, 'fire'));
});

// ------------------------------------------------------------------ the page (needs the lore migration)

let dm, p1, p2, plain, C;
before(async () => {
  await cleanup();
  [dm, p1, p2] = await Promise.all([makeUser('lrdm'), makeUser('lrp1', { free: true }), makeUser('lrp2', { free: true })]);
  plain = await makeUser('lrplain', { unblocked: true, free: true });
  const slug = 'lore-' + rnd();
  C = (await dm.client.from('campaigns').insert({ slug, title: 'Lore Realm', phases: [], phase: '', settings: { lore: { cats: ['overview', 'history', 'places', 'factions', 'religions', 'creatures'], custom: [] } } }).select('id, slug').single()).data;
  await dm.client.from('sections').insert({ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' });
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await dm.client.from('invites').insert({ campaign_id: C.id, code });
  for (const u of [p1, p2, plain]) assert.equal((await u.client.rpc('join_campaign', { p_code: code })).error, null);
  const add = async (row, secret) => {
    const r = await dm.client.from('entries').insert({ campaign_id: C.id, kind: 'lore', live: true, status: '', vis: 'all', vis_players: [], ...row }).select('id').single();
    assert.equal(r.error, null, row.title + ': ' + r.error?.message);
    if (secret) assert.equal((await dm.client.from('entry_secrets').upsert({ entry_id: r.data.id, campaign_id: C.id, data: secret })).error, null);
    return r.data.id;
  };
  await add({ title: 'The Shattered Coast', data: { cat: 'overview', summary: 'A drowned land of reeds and ruin.' } });
  await add({ title: 'The Age of Bells', data: { cat: 'history', when: 'Years 0 to 400', summary: 'Every village rang a bell.' } });
  await add({ title: 'The Sundering', vis: 'dm', data: { cat: 'history', when: 'Year 401', summary: 'The bells fell silent.' } });
  const vale = await add({ title: 'The Reedwater Vale', data: { cat: 'places', type: 'region', summary: 'Marsh and mist' } });
  await add({ title: 'Millbrook', data: { cat: 'places', type: 'city', region: vale, summary: 'A market town on stilts', found: 'visited', session: 1 } });
  await add({ title: 'The Drowned Crypt', vis: 'when', vis_stage: 'session:3:started', data: { cat: 'places', type: 'dungeon', region: vale, summary: 'Beneath the old chapel' } });
  await add({ title: 'The Tide Wardens', data: { cat: 'factions', leader: 'Captain Ysolde', standing: 'friendly', goals: 'Keep the sea walls standing' } }, { notes: 'They are secretly smugglers' });
  await add({ title: 'The Drowned God', vis: 'players', vis_players: [p1.id], data: { cat: 'religions', domains: ['Tempest', 'Death'], followers: 'fisherfolk' } });
  await add({ title: 'Marsh Hag', data: { cat: 'creatures', type: 'Fey', habitat: 'Bogs', learned: [{ text: 'Hates cold iron', session: 2 }], more: 1 } }, { unlearned: [{ text: 'Weak to fire' }] });
});
after(cleanup);

test('a player gets what has been revealed to them, and nothing more', async () => {
  const pg = await page(`/c/${C.slug}/hub/lore`, p2.session);
  assert.equal(pg.status, 200);
  for (const words of ['The Shattered Coast', 'The Age of Bells', 'Years 0 to 400', 'The Reedwater Vale', 'Millbrook', 'A market town on stilts', 'Visited in Session 1', 'The Tide Wardens', 'Led by Captain Ysolde', 'Friendly',
    'Marsh Hag', 'Hates cold iron', '??? Not learned yet', '1 more', 'More of this world is waiting to be discovered.']) assert.ok(pg.text.includes(words), words);
  for (const secret of ['The Sundering', 'bells fell silent', 'The Drowned Crypt', 'old chapel', 'smugglers', 'Weak to fire', 'The Drowned God', 'fisherfolk', 'Add a category', '+ Add', 'Remove category']) assert.ok(!pg.text.includes(secret), 'not sent: ' + secret);
  const rows = (await p2.client.from('entries').select('title').eq('campaign_id', C.id).eq('kind', 'lore')).data ?? [];
  assert.equal(rows.length, 6, 'the database hands over the six revealed to them');
  assert.equal(((await p2.client.from('entry_secrets').select('entry_id').eq('campaign_id', C.id)).data ?? []).length, 0, 'and none of the DM\'s notes');
  const mine = await page(`/c/${C.slug}/hub/lore`, p1.session);
  assert.ok(mine.text.includes('The Drowned God') && mine.text.includes('Tempest'), 'the named player gets theirs');
});

test('the DM gets everything, marked, and can add categories', async () => {
  const pg = await page(`/c/${C.slug}/hub/lore`, dm.session);
  assert.equal(pg.status, 200);
  for (const words of ['The Sundering', 'The Drowned Crypt', 'Reveals when Session 3 starts', 'The Drowned God', 'Only Test lrp1', 'Weak to fire', 'Not learned yet', 'Add a category', '+ Items and artifacts', 'Make your own category', 'Edit']) assert.ok(pg.text.includes(words), words);
  assert.ok(!pg.text.includes('More of this world is waiting'), 'that line is for players');
  assert.ok(pg.text.includes(`href="/c/${C.slug}/hub/lore"`), 'the tab row links to it');
  const rv = await page(`/c/${C.slug}/hub/reveals`, dm.session);
  assert.ok(rv.text.includes('The Drowned Crypt') && rv.text.includes('Lore · Places') && rv.text.includes('The Sundering'), 'hidden lore is on the Reveals page');
});

test('a DM previewing as a player gets what players get; it is behind its flag', async () => {
  const pg = await page(`/c/${C.slug}/hub/lore`, dm.session, 'dbb-view-as-player=1');
  assert.equal(pg.status, 200);
  assert.ok(pg.text.includes('Millbrook') && !pg.text.includes('The Sundering') && !pg.text.includes('Weak to fire') && !pg.text.includes('smugglers') && !pg.text.includes('Add a category'));
  assert.notEqual((await page(`/c/${C.slug}/hub/lore`, null)).status, 200);
  const off = await page(`/c/${C.slug}/hub/lore`, plain.session);
  if (off.status !== 200) assert.equal(off.status, 404, 'an ordinary player, while the flag is off for everyone');
});
