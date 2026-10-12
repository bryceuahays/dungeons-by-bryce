// Game systems (supabase/migrations/20261014000001_game_systems.sql, src/features/systems).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { admin, cleanup, makeUser } from './helpers.mjs';
import { blankV2, derive } from '../src/lib/rules/engine.ts';
import { FIFTH, changesOf, engineSystem, renameText, resolve } from '../src/features/systems/model.ts';

const rnd = () => Math.random().toString(36).slice(2, 8);
let a, b, p;

before(async () => {
  await cleanup();
  [a, b, p] = await Promise.all([makeUser('sysa'), makeUser('sysb'), makeUser('sysp')]);
});
after(cleanup);

// ---------------------------------------------------------------- the rules engine

const wizard = { id: 'w', type: 'class', name: 'Wizard', source: 'srd', data: { hd: 6, casting: { kind: 'full', ability: 'int' }, effects: [{ t: 'prof', kind: 'save', v: 'int' }] } };
const hero = { ...blankV2(), level: 5, clsId: 'w', ab: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 }, skills: ['Arcana', 'Persuasion'] };

test('the ready-made system works a character out exactly as before', () => {
  const plain = derive(hero, [wizard]);
  const viaSystem = derive(hero, [wizard], engineSystem(FIFTH));
  for (const k of ['scores', 'mods', 'prof', 'saves', 'hpMax', 'ac', 'initiative', 'passive', 'casting']) assert.deepEqual(viaSystem[k], plain[k], k);
});

test('a system renames, removes and adds abilities, and the jobs move with it', () => {
  const sys = structuredClone(FIFTH);
  sys.abilities.list = sys.abilities.list.filter((x) => x.id !== 'cha').map((x) => (x.id === 'int' ? { ...x, name: 'Insanity' } : x));
  sys.abilities.list.push({ id: 'luck', abbr: 'LCK', name: 'Luck', desc: '', save: true });
  sys.abilities.jobs.agility = 'luck';
  const d = derive(hero, [wizard], engineSystem(sys));
  assert.equal(d.saves.find((s) => s.key === 'int').label, 'Insanity');
  assert.ok(!d.saves.some((s) => s.key === 'cha'), 'a removed ability has no save');
  assert.equal(d.scores.luck, 10, 'an ability the character has no score in yet counts as 10');
  assert.equal(d.initiative, 0, 'initiative follows the agility job (Luck 10)');
  assert.equal(d.ac, 10);
  sys.proficiency.on = false;
  assert.equal(derive(hero, [wizard], engineSystem(sys)).prof, 0, 'no proficiency bonus');
});

test('a saved system keeps only its changes, and written text follows a rename', () => {
  const sys = { ...structuredClone(FIFTH), name: 'Mine' };
  sys.details.alignment = false;
  sys.text.replace = [{ from: 'Intelligence', to: 'Insanity', types: ['spell'] }];
  const changes = changesOf(sys);
  assert.deepEqual(Object.keys(changes).sort(), ['details', 'text']);
  const back = resolve({ name: 'Mine', base: '2024', changes });
  assert.equal(back.details.alignment, false);
  assert.equal(back.abilities.list.length, 6, 'everything else comes from the base');
  assert.equal(renameText({ desc: 'an Intelligence saving throw (not Intelligences)' }, sys.text.replace).desc, 'an Insanity saving throw (not Intelligences)');
});

// ---------------------------------------------------------------- who can see and change a system

test('a system is its owner\'s alone, readable by players of a campaign that uses it', async () => {
  const sys = (await a.client.from('game_systems').insert({ name: 'Grim', base: '2024', changes: {} }).select('id').single());
  assert.equal(sys.error, null);
  const id = sys.data.id;
  assert.equal((await b.client.from('game_systems').select('id').eq('id', id)).data.length, 0, 'another account cannot see it');
  await b.client.from('game_systems').update({ name: 'Taken' }).eq('id', id);
  assert.equal((await admin.from('game_systems').select('name').eq('id', id).single()).data.name, 'Grim', 'or change it');

  const camp = await a.client.from('campaigns').insert({ slug: 'sys-' + rnd(), title: 'Grim Realm', settings: { rules: '2024', system: id } }).select('id').single();
  assert.equal(camp.error, null, 'its owner can play it');
  assert.equal((await p.client.from('game_systems').select('id').eq('id', id)).data.length, 0, 'not readable before joining');
  await admin.from('memberships').insert({ user_id: p.id, campaign_id: camp.data.id });
  assert.equal((await p.client.from('game_systems').select('id').eq('id', id)).data.length, 1, 'a player in the campaign can read it');
  await p.client.from('game_systems').update({ name: 'Mine now' }).eq('id', id);
  assert.equal((await admin.from('game_systems').select('name').eq('id', id).single()).data.name, 'Grim', 'but not change it');
});

test('a campaign only plays its DM\'s own system, on the rules it is built on', async () => {
  const theirs = (await a.client.from('game_systems').insert({ name: 'Theirs', base: '2024', changes: {} }).select('id').single()).data;
  const old = (await b.client.from('game_systems').insert({ name: 'Old rules', base: '2014', changes: {} }).select('id').single()).data;
  const camp = (await b.client.from('campaigns').insert({ slug: 'sysb-' + rnd(), title: 'B Realm', settings: { rules: '2024' } }).select('id').single()).data;
  assert.ok((await b.client.from('campaigns').update({ settings: { rules: '2024', system: theirs.id } }).eq('id', camp.id)).error, 'not someone else\'s');
  assert.ok((await b.client.from('campaigns').update({ settings: { rules: '2024', system: old.id } }).eq('id', camp.id)).error, 'not one built on other rules');
  assert.equal((await b.client.from('campaigns').update({ settings: { rules: '2014', system: old.id } }).eq('id', camp.id)).error, null);
});
