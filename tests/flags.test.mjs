// Feature flags: who a flag is on for and that the list is in order (src/config/flags.ts, no
// database needed), then the Head DM's switches in the database and his screen for them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FLAGS, FLAG_NAMES, flagOn, flagsFor, withSwitches } from '../src/config/flags.ts';
import { ROOT, SITE, admin, anonClient, cleanup, makeUser, page } from './helpers.mjs';

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

test('a flag the Head DM has switched on is on for everyone, and a name that is not on the list is ignored', () => {
  const table = withSwitches(['example', 'not_a_flag'], off);
  for (const viewer of [ordinary, null, head, tester]) assert.equal(flagOn('example', viewer, table), true);
  assert.deepEqual(Object.keys(table), ['example']);
  assert.equal(flagOn('not_a_flag', ordinary, table), false);
  assert.equal(flagOn('example', ordinary, withSwitches([], off)), false, 'no switch, still hidden');
  assert.equal(off.example.on, false, 'the list itself is not changed');
  // the real list: switching one flag on leaves the rest hidden
  const real = withSwitches([FLAG_NAMES[0]]);
  assert.equal(flagOn(FLAG_NAMES[0], ordinary, real), true);
  assert.equal(flagOn(FLAG_NAMES[1], ordinary, real), false);
  assert.deepEqual(flagsFor(null, real), { ...flagsFor(null), [FLAG_NAMES[0]]: true });
});

// The rows these tests add are named zz_test_…, which is not on the site's list, so they switch
// nothing on the live site. The real flags' switches are never touched.
const wipeSwitches = () => admin.from('feature_flags').delete().like('name', 'zz_test_%');
const gone = (r) => !!r.error || (r.data ?? []).length === 0;

test('the switches in the database: only the Head DM changes them, and nobody else reads one that is off', async (t) => {
  await cleanup();
  t.after(async () => { await wipeSwitches(); await cleanup(); });
  const [boss, plain, marked] = await Promise.all([makeUser('flaghead', { head: true }), makeUser('flagplain', { unblocked: true }), makeUser('flagtester')]);
  const anon = anonClient();
  const tag = 'zz_test_' + crypto.randomBytes(4).toString('hex');
  const shown = tag + '_on', hidden = tag + '_off';
  const seen = async (c) => ((await c.from('feature_flags').select('name').like('name', tag + '%')).data ?? []).map((r) => r.name).sort();

  const made = await boss.client.from('feature_flags').insert([{ name: shown, is_on: true }, { name: hidden, is_on: false }]).select('name');
  assert.equal(made.error, null, 'the Head DM adds switches');
  assert.deepEqual(await seen(boss.client), [hidden, shown], 'and reads them all');
  // everyone else, signed in or not, reads only what is on (a test account included: the mark does not open the table)
  for (const c of [plain.client, marked.client, anon]) assert.deepEqual(await seen(c), [shown]);
  assert.equal(((await plain.client.from('feature_flags').select('name').eq('name', hidden)).data ?? []).length, 0, 'asking for the hidden one by name finds nothing');

  // and changes nothing
  for (const c of [plain.client, marked.client, anon]) {
    assert.ok(gone(await c.from('feature_flags').insert({ name: tag + '_mine', is_on: true }).select('name')), 'cannot add a switch');
    assert.ok(gone(await c.from('feature_flags').update({ is_on: true }).eq('name', hidden).select('name')), 'cannot turn one on');
    assert.ok(gone(await c.from('feature_flags').update({ is_on: false }).eq('name', shown).select('name')), 'cannot turn one off');
    assert.ok(gone(await c.from('feature_flags').upsert({ name: hidden, is_on: true }).select('name')), 'cannot turn one on by saving over it');
    assert.ok(gone(await c.from('feature_flags').delete().eq('name', shown).select('name')), 'cannot remove one');
  }
  const kept = (await admin.from('feature_flags').select('name, is_on').like('name', tag + '%').order('name')).data;
  assert.deepEqual(kept, [{ name: hidden, is_on: false }, { name: shown, is_on: true }], 'the rows are as the Head DM left them');

  // the Head DM flips them, and everyone's view follows at once
  assert.equal((await boss.client.from('feature_flags').upsert({ name: hidden, is_on: true }).select('name')).error, null);
  assert.deepEqual(await seen(anon), [hidden, shown]);
  assert.equal((await boss.client.from('feature_flags').upsert({ name: shown, is_on: false }).select('name')).error, null);
  assert.deepEqual(await seen(plain.client), [hidden]);
  assert.ok((await boss.client.from('feature_flags').insert({ name: 'Not A Flag!' }).select('name')).error, 'a name that is not a plain flag name is refused');
});

test('the Head DM\'s flags screen lists every flag, and nobody else reaches it', async (t) => {
  await cleanup();
  t.after(cleanup);
  const [boss, plain] = await Promise.all([makeUser('flagscreen', { head: true }), makeUser('flagvisitor', { unblocked: true })]);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  const screen = await page('/admin/flags', boss.session);
  assert.equal(screen.status, 200);
  for (const name of FLAG_NAMES) {
    assert.ok(screen.text.includes(esc(FLAGS[name].what)), name + ' is listed');
    assert.ok(screen.text.includes('/issues/' + FLAGS[name].issue + '"'), name + ' links to its issue');
  }
  assert.ok(!screen.text.includes('cannot be saved yet'), 'the table behind the screen is there');
  assert.ok((await page('/admin', boss.session)).text.includes('href="/admin/flags"'), 'the Head DM page links to it');
  // an ordinary account and a signed-out visitor are sent away, with none of it in the answer
  for (const session of [plain.session, null]) {
    const r = await page('/admin/flags', session);
    assert.ok(r.status >= 300 && r.status < 400, 'sent away');
    // (a signed-out visitor goes to /sign-in?next=/admin/flags, so look at the page, not the whole address)
    assert.equal(new URL(r.location ?? '', SITE).pathname, session ? '/campaigns' : '/sign-in', 'not to another Head DM page');
    assert.equal(r.text, '');
  }
});
