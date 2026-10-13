// Feature flags (src/config/flags.ts): who a flag is on for, and that the list is in order.
// These need no database and no running site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FLAGS, FLAG_NAMES, flagOn, flagsFor } from '../src/config/flags.ts';
import { ROOT, admin, cleanup, makeUser } from './helpers.mjs';

const ordinary = { role: 'player', test: false };
const head = { role: 'head' };
const tester = { role: 'player', test: true };
const off = { example: { what: 'An unfinished page', issue: 1, on: false } };
const released = { example: { what: 'A finished page', issue: 1, on: true, released: '2026-10-13' } };

test('a flag that is off is hidden from ordinary accounts and signed-out visitors', () => {
  for (const viewer of [ordinary, null, undefined, {}, { role: 'player' }, { role: null, test: null }]) assert.equal(flagOn('example', viewer, off), false);
  // a DM of a campaign is an ordinary account: being a DM is not an account role
  assert.equal(flagOn('example', { role: 'dm' }, off), false);
  // only a real true counts as the tests' mark
  for (const test of ['true', 1, 'yes', {}]) assert.equal(flagOn('example', { role: 'player', test }, off), false);
});

test('a flag that is off is on for the site owner and for the tests\' own accounts', () => {
  assert.equal(flagOn('example', head, off), true);
  assert.equal(flagOn('example', tester, off), true);
});

test('a released flag is on for everyone, and an unknown flag is off for everyone', () => {
  for (const viewer of [ordinary, head, tester, null]) assert.equal(flagOn('example', viewer, released), true);
  for (const viewer of [ordinary, head, tester, null]) assert.equal(flagOn('not_a_flag', viewer, off), false);
  assert.equal(flagOn('not_a_flag', head), false, 'in the real list too');
});

test('flagsFor gives every flag as plain true or false', () => {
  assert.deepEqual(flagsFor(ordinary, off), { example: false });
  assert.deepEqual(flagsFor(head, off), { example: true });
  const mine = flagsFor(ordinary);
  assert.deepEqual(Object.keys(mine).sort(), [...FLAG_NAMES].sort());
  assert.ok(Object.values(mine).every((v) => v === true || v === false));
});

test('the list: one flag per hub version 2 item, named hub_v2_<page>, each with its issue', () => {
  assert.equal(FLAG_NAMES.length, 21, 'items 3 to 23 of the build plan (flags themselves and design tokens have none)');
  const issues = new Set();
  for (const name of FLAG_NAMES) {
    const def = FLAGS[name];
    assert.match(name, /^hub_v2_[a-z]+$/, name);
    assert.ok(def.what && Number.isInteger(def.issue) && def.issue > 0, name + ' says what it is and which issue it belongs to');
    assert.ok(!issues.has(def.issue), name + ' has an issue of its own');
    issues.add(def.issue);
    assert.equal(typeof def.on, 'boolean');
  }
});

test('nothing is switched on by accident: a flag that is on carries the date it was released', () => {
  for (const name of FLAG_NAMES) {
    const def = FLAGS[name];
    if (def.on) assert.match(String(def.released ?? ''), /^\d{4}-\d{2}-\d{2}$/, `${name} is on for everyone, so it must say when it was released`);
    else assert.equal(def.released, undefined, `${name} is off, so it has no release date`);
  }
});

test('the tests\' mark is on test accounts, and nobody can give it to themselves', async (t) => {
  await cleanup();
  t.after(cleanup);
  const [marked, plain] = await Promise.all([makeUser('flagged'), makeUser('unflagged', { unblocked: true })]);
  const markOf = async (u) => (await admin.from('profiles').select('always_enforce').eq('id', u.id).single()).data.always_enforce;
  assert.equal(await markOf(marked), true, 'the helpers mark an ordinary test account');
  assert.equal(await markOf(plain), false, 'and leave one alone when asked, so it stands in for a real person');
  // an account reads its own mark (the server asks as the account) but cannot set it
  assert.equal((await plain.client.from('profiles').select('always_enforce').eq('id', plain.id).single()).data.always_enforce, false);
  const tried = await plain.client.from('profiles').update({ always_enforce: true }).eq('id', plain.id).select('id');
  assert.ok(tried.error || (tried.data ?? []).length === 0, 'the database refuses');
  assert.equal(await markOf(plain), false);
  // signing up with an address that looks like a test account's earns nothing
  assert.ok(plain.email.endsWith('@test.dungeons.invalid') && (await markOf(plain)) === false);
});

test('flags are decided on the server: no client component reads the flag rule', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const offenders = walk(path.join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) => {
    const text = fs.readFileSync(f, 'utf8');
    return /^\s*['"]use client['"]/.test(text) && /from ['"]@\/(config|lib)\/flags['"]/.test(text) && /\bflagOn\b|\bflagsFor\b|\brequireFlag\b|\bmyFlags\b|import \{[^}]*\bflag\b/.test(text);
  });
  assert.deepEqual(offenders.map((f) => path.relative(ROOT, f)), [], 'pass a client component the plain true/false values instead');
});
