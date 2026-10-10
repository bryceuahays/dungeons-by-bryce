// Worlds: a setting above campaigns (supabase/migrations/20261012000001_worlds.sql and 20261012000002_worlds_official.sql).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { admin, cleanup, makeUser, page } from './helpers.mjs';

const rnd = () => Math.random().toString(36).slice(2, 8);
let a, b, official;

before(async () => {
  await cleanup();
  [a, b] = await Promise.all([makeUser('worlda'), makeUser('worldb')]);
  // a ready-made world, as scripts/seed-worlds.mjs makes it (removed again after)
  official = (await admin.from('worlds').insert({ name: 'Test Ready World ' + rnd(), official: true, owner_id: null, key: 'test-' + rnd() }).select('id').single()).data;
});
after(async () => {
  if (official) await admin.from('worlds').delete().eq('id', official.id);
  await cleanup();
});

test('a world is its owner\'s alone; a ready-made one is readable by everyone and changeable by no one', async () => {
  const mine = await a.client.from('worlds').insert({ name: 'Shattered Realms' }).select('id').single();
  assert.equal(mine.error, null);
  assert.equal((await b.client.from('worlds').select('id').eq('id', mine.data.id)).data.length, 0, 'another account cannot see it');
  await b.client.from('worlds').update({ name: 'Taken' }).eq('id', mine.data.id);
  assert.equal((await admin.from('worlds').select('name').eq('id', mine.data.id).single()).data.name, 'Shattered Realms', 'or change it');
  assert.equal((await b.client.from('worlds').select('id').eq('id', official.id)).data.length, 1, 'everyone sees a ready-made world');
  await b.client.from('worlds').update({ name: 'Mine now' }).eq('id', official.id);
  assert.notEqual((await admin.from('worlds').select('name').eq('id', official.id).single()).data.name, 'Mine now', 'nobody changes a ready-made world');
  assert.ok((await b.client.from('worlds').insert({ name: 'Fake', official: true })).error, 'nobody makes one');
});

test('only a world\'s owner adds homebrew to it, and only their own or SRD entries', async () => {
  const w = (await a.client.from('worlds').insert({ name: 'Brew World' }).select('id').single()).data;
  const theirs = (await b.client.from('entities').insert({ type: 'feat', slug: 'f-' + rnd(), name: 'Not Yours' }).select('id').single()).data;
  const own = (await a.client.from('entities').insert({ type: 'feat', slug: 'f-' + rnd(), name: 'Yours' }).select('id').single()).data;
  assert.equal((await a.client.from('world_entities').insert({ world_id: w.id, entity_id: own.id })).error, null);
  assert.ok((await a.client.from('world_entities').insert({ world_id: w.id, entity_id: theirs.id })).error, 'not someone else\'s entry');
  assert.ok((await b.client.from('world_entities').insert({ world_id: w.id, entity_id: theirs.id })).error, 'not into someone else\'s world');
  assert.equal((await b.client.from('world_entities').select('entity_id').eq('world_id', w.id)).data.length, 0, 'and cannot read what is in it');
});

test('a campaign goes in its DM\'s own world or a ready-made one, never someone else\'s', async () => {
  const w = (await a.client.from('worlds').insert({ name: 'Home World' }).select('id').single()).data;
  const campA = (await a.client.from('campaigns').insert({ slug: 'wa-' + rnd(), title: 'A Realm' }).select('id').single()).data;
  const campB = (await b.client.from('campaigns').insert({ slug: 'wb-' + rnd(), title: 'B Realm' }).select('id').single()).data;
  assert.equal((await a.client.from('campaigns').update({ world_id: w.id }).eq('id', campA.id)).error, null);
  assert.ok((await b.client.from('campaigns').update({ world_id: w.id }).eq('id', campB.id)).error, 'not into someone else\'s world');
  assert.equal((await b.client.from('campaigns').update({ world_id: official.id }).eq('id', campB.id)).error, null, 'a ready-made world is open to all');
  // the pages: a world is a 404 to anyone but its owner
  assert.equal((await page('/worlds/' + w.id, a.session)).status, 200);
  assert.equal((await page('/worlds/' + w.id, b.session)).status, 404);
});
