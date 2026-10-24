// Hub version 2, item 5 (issue 86): dice rolled on the server, public and private.
// The notation parser and the privacy rules are tested as plain code. Everything about who
// sees a roll is then proved as real accounts: through the roll route the page uses, the
// database API, the page HTML and the Realtime feed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { MAX_DICE, MAX_SIDES, checkNotation, formatResult, formatTerms, parseNotation, resultNote, rollTerms } from '../src/features/dice/notation.ts';
import { DICE_DEFAULTS, cleanDiceRules, decidePrivacy, diceRules, playerChoices, rollOpen, seenBy } from '../src/features/dice/model.ts';
import { blankV2 } from '../src/lib/rules/engine.ts';
import { ANON, ROOT, SITE, URL_, admin, cleanup, cookieFor, makeUser, page, wait } from './helpers.mjs';

// ------------------------------------------------------------------ the notation

const loaded = (...values) => { let i = 0; return () => values[i++]; };
const terms = (text) => { const p = parseNotation(text); assert.equal(p.ok, true, text + ': ' + p.error); return p.terms; };

test('notation: what can be written, and how it is read back', () => {
  for (const [text, clean] of [['2d6+3', '2d6+3'], ['1d8+1d6+2', '1d8+1d6+2'], ['2d20kh1', '2d20kh1'], ['2d20kl1+5', '2d20kl1+5'], ['d20', '1d20'], ['D20 + 4', '1d20+4'], ['d%', '1d100'], ['4d6kh3', '4d6kh3'], ['1d20-1', '1d20-1'], ['-1d4+10', '-1d4+10'], ['3+2d4', '3+2d4']]) {
    const p = parseNotation(text);
    assert.equal(p.ok, true, text + ': ' + p.error);
    assert.equal(p.text, clean);
    assert.equal(formatTerms(p.terms), clean);
  }
  for (const junk of ['', '   ', 'hello', '2d', 'd', '2x6', '1d20+', '++1d6', '1d20kh', '1d20kh0', '1d20kh2', '0d6', '1d1', '5', '2+3', '1d6;drop', '1d6+1d', '1d6kx1', null, undefined, 7, {}]) assert.equal(parseNotation(junk).ok, false, JSON.stringify(junk) + ' is refused');
  assert.equal(parseNotation('1d6' + '+1'.repeat(80)).ok, false, 'too long, or too many parts');
});

test('notation: at most 100 dice and 1000 sides in one roll', () => {
  assert.equal(MAX_DICE, 100);
  assert.equal(MAX_SIDES, 1000);
  assert.equal(parseNotation('100d6').ok, true);
  assert.equal(parseNotation('101d6').ok, false);
  assert.equal(parseNotation('50d6+50d8').ok, true);
  assert.equal(parseNotation('50d6+51d8').ok, false, 'the limit is on the whole roll, not each part');
  assert.equal(parseNotation('1d1000').ok, true);
  assert.equal(parseNotation('1d1001').ok, false);
  assert.match(parseNotation('101d6').error, /100 dice/);
  assert.match(parseNotation('1d1001').error, /1000 sides/);
});

test('rolling: totals, modifiers, several parts, and keeping the highest or lowest', () => {
  assert.deepEqual(rollTerms(terms('2d6+3'), loaded(4, 5)), { dice: [{ sides: 6, sign: 1, rolls: [4, 5], kept: [true, true] }], modifier: 3, total: 12 });
  assert.equal(rollTerms(terms('1d8+1d6+2'), loaded(8, 1)).total, 11);
  assert.equal(rollTerms(terms('1d20-1'), loaded(1)).total, 0);
  assert.equal(rollTerms(terms('10-1d4'), loaded(3)).total, 7);
  const adv = rollTerms(terms('2d20kh1+5'), loaded(7, 15));
  assert.equal(adv.total, 20);
  assert.deepEqual(adv.dice[0].kept, [false, true], 'advantage keeps the higher die');
  const dis = rollTerms(terms('2d20kl1+5'), loaded(7, 15));
  assert.equal(dis.total, 12);
  assert.deepEqual(dis.dice[0].kept, [true, false], 'disadvantage keeps the lower');
  assert.equal(rollTerms(terms('4d6kh3'), loaded(1, 6, 3, 5)).total, 14, 'the lowest of four is dropped');
  assert.deepEqual(rollTerms(terms('2d20kh1'), loaded(9, 9)).dice[0].kept, [true, false], 'a tie keeps one, not both');
  // every die is asked for with the right number of sides, and an answer out of range is an error, not a result
  const asked = [];
  rollTerms(terms('2d6+1d20'), (sides) => { asked.push(sides); return 1; });
  assert.deepEqual(asked, [6, 6, 20]);
  for (const bad of [0, 7, 2.5, NaN, '3']) assert.throws(() => rollTerms(terms('1d6'), () => bad));
  assert.equal(formatResult(rollTerms(terms('1d20+2'), loaded(15))), '15 + 2');
  assert.equal(formatResult(rollTerms(terms('2d20kh1+5'), loaded(7, 15))), '15 (dropped 7) + 5');
  assert.equal(formatResult(rollTerms(terms('1d8+1d6-1'), loaded(3, 4))), '3 + 4 - 1');
  // a saved roll read back in a shape it was never written in is left out, never a crash (it took down every page once)
  for (const junk of [[15], null, 'x', {}, [{ rolls: 'no' }], [null, { sides: 20, sign: 1, rolls: [12], kept: [true] }]]) assert.doesNotThrow(() => formatResult({ dice: junk, modifier: 3 }));
  assert.equal(formatResult({ dice: [15], modifier: 7 }), '');
  assert.equal(formatResult({ dice: [null, { sides: 20, sign: 1, rolls: [12], kept: [true] }], modifier: 'x' }), '12', 'the readable part, and no modifier that is not a number');
  assert.equal(resultNote({ dice: [15], modifier: 7 }), '');
  assert.equal(resultNote({ dice: [{ sides: 20, sign: 1, rolls: [15], kept: [true] }], modifier: 2 }), ' (15 + 2)');
  assert.equal(resultNote({}), '');
  assert.equal(checkNotation(5), '1d20+5');
  assert.equal(checkNotation(-1, 'adv'), '2d20kh1-1');
  assert.equal(checkNotation(0, 'dis'), '2d20kl1');
});

// ------------------------------------------------------------------ the privacy rules, in code

test('who may read a roll: the rule in code', () => {
  const A = 'a', B = 'b', DM = 'dm';
  const r = (privacy, extra = {}) => ({ user_id: A, privacy, shown_to: [], blind: false, ...extra });
  const player = (id) => ({ id, dmSide: false }), dm = { id: DM, dmSide: true };
  assert.deepEqual([rollOpen(r('all'), player(B)), rollOpen(r('all'), dm), rollOpen(r('all'), player(null))], [true, true, true]);
  assert.deepEqual([rollOpen(r('dm'), player(A)), rollOpen(r('dm'), player(B)), rollOpen(r('dm'), dm)], [true, false, true], 'DM only: the roller and the DM');
  assert.deepEqual([rollOpen(r('self'), player(A)), rollOpen(r('self'), player(B)), rollOpen(r('self'), dm)], [true, false, false], 'just me: not even the DM');
  assert.deepEqual([rollOpen(r('dm', { blind: true }), player(A)), rollOpen(r('dm', { blind: true }), dm)], [false, true], 'a blind roll: the roller does not see it');
  const named = r('players', { user_id: DM, shown_to: [A] });
  assert.deepEqual([rollOpen(named, player(A)), rollOpen(named, player(B)), rollOpen(named, dm), rollOpen(named, player(null))], [true, false, true, false], 'a DM roll for one player');
  assert.equal(rollOpen(r('everyone'), player(B)), false, 'a privacy that does not exist is closed');
  // the database rule names the same four kinds
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261017000001_dice.sql'), 'utf8');
  assert.match(sql, /privacy in \('all', 'dm', 'self', 'players'\)/);
  const policy = sql.slice(sql.indexOf('create policy rolls_select'), sql.indexOf('drop policy if exists roll_details_select'));
  for (const piece of ["privacy = 'self' then user_id = auth.uid()", 'user_id = auth.uid() and not blind', "privacy = 'all'", "privacy = 'players' and auth.uid() = any(shown_to)", 'public.rolls_dm_reader(campaign_id)']) assert.ok(policy.includes(piece), piece);
  assert.match(sql, /revoke all on public\.rolls, public\.roll_details, public\.roll_requests from anon, authenticated;\s+grant select on/, 'a browser may read, and write nothing');
});

test('who may make which kind of roll: the campaign\'s dice rules', () => {
  assert.deepEqual(diceRules(null), DICE_DEFAULTS);
  assert.deepEqual(diceRules({ dice: 'yes' }), DICE_DEFAULTS);
  assert.deepEqual(diceRules({ dice: { dmOnly: false, showDice: 'no', alwaysPrivate: ['Insight', 7, 'Insight'] } }), { ...DICE_DEFAULTS, dmOnly: false, alwaysPrivate: ['Insight'] });
  assert.deepEqual(cleanDiceRules({ self: false, alwaysPrivate: ['Insight', 'Made up'], extra: 1 }, ['Insight', 'Perception']), { ...DICE_DEFAULTS, self: false, alwaysPrivate: ['Insight'] });
  assert.deepEqual(playerChoices(DICE_DEFAULTS, true), ['all', 'dm', 'self']);
  assert.deepEqual(playerChoices({ ...DICE_DEFAULTS, dmOnly: false }, true), ['all', 'self']);
  assert.deepEqual(playerChoices({ ...DICE_DEFAULTS, self: false }, true), ['all', 'dm']);
  assert.deepEqual(playerChoices(DICE_DEFAULTS, false), ['all'], 'with the Private rolls feature switched off, players roll in the open');
  const ask = (a) => decidePrivacy({ dm: false, wanted: 'all', players: [], label: '', rules: DICE_DEFAULTS, privateOn: true, memberIds: ['a', 'b'], ...a });
  assert.deepEqual(ask({ wanted: 'dm' }), { ok: true, privacy: 'dm', shown_to: [], blind: false });
  assert.deepEqual(ask({ wanted: 'self' }), { ok: true, privacy: 'self', shown_to: [], blind: false });
  assert.equal(ask({ wanted: undefined }).privacy, 'all');
  assert.equal(ask({ wanted: 'players', players: ['b'] }).ok, false, 'a player cannot address a roll to another player');
  assert.equal(ask({ wanted: 'dm', rules: { ...DICE_DEFAULTS, dmOnly: false } }).ok, false);
  assert.equal(ask({ wanted: 'self', privateOn: false }).ok, false);
  assert.equal(ask({ wanted: 'all', label: 'insight', rules: { ...DICE_DEFAULTS, alwaysPrivate: ['Insight'] } }).privacy, 'dm', 'an always-private check goes to the DM whatever was picked');
  assert.equal(ask({ wanted: 'self', label: 'Insight', rules: { ...DICE_DEFAULTS, alwaysPrivate: ['Insight'] } }).privacy, 'dm');
  // the DM
  assert.equal(ask({ dm: true, wanted: undefined }).privacy, 'all');
  assert.equal(ask({ dm: true, wanted: undefined, rules: { ...DICE_DEFAULTS, dmHidden: true } }).privacy, 'dm', 'DM rolls hidden by default');
  assert.equal(ask({ dm: true, wanted: 'all', rules: { ...DICE_DEFAULTS, dmHidden: true } }).privacy, 'all', 'unless the DM says otherwise');
  assert.deepEqual(ask({ dm: true, wanted: 'players', players: ['a', 'nobody', 'a'] }), { ok: true, privacy: 'players', shown_to: ['a'], blind: false });
  assert.equal(ask({ dm: true, wanted: 'players', players: ['nobody'] }).ok, false);
  assert.equal(ask({ dm: true, wanted: 'self' }).privacy, 'all', 'the DM\'s choices are everyone, DMs only and named players');
  // a roll the DM asked for has the privacy the DM chose, whatever the player sends
  assert.deepEqual(ask({ wanted: 'all', request: { privacy: 'dm', blind: true } }), { ok: true, privacy: 'dm', shown_to: [], blind: true });
  assert.equal(ask({ wanted: 'self', request: { privacy: 'all', blind: false } }).privacy, 'all');
  // the words next to a private roll
  const row = (x) => ({ user_id: 'a', by_dm: false, privacy: 'dm', shown_to: [], blind: false, ...x });
  assert.equal(seenBy(row({ privacy: 'all' }), 'b', false), '');
  assert.equal(seenBy(row({}), 'a', false), 'only the DM sees this');
  assert.equal(seenBy(row({}), 'dm', true), 'rolled to the DM only');
  assert.equal(seenBy(row({ user_id: 'dm', by_dm: true }), 'dm', true), 'hidden from players');
  assert.equal(seenBy(row({ privacy: 'self' }), 'a', false), 'only you see this');
  assert.equal(seenBy(row({ user_id: 'dm', by_dm: true, privacy: 'players', shown_to: ['a'] }), 'a', false), 'only you and the DM see this');
  assert.equal(seenBy(row({ user_id: 'dm', by_dm: true, privacy: 'players', shown_to: ['a'] }), 'dm', true, { a: 'Mira' }), 'only Mira and the DM see this');
});

// ------------------------------------------------------------------ real accounts

let dm, a, b, coFull, coLess, plain, outsider, spammer, C;
const rnd = () => Math.random().toString(36).slice(2, 8);
const post = async (who, kind, body, extra = '') => {
  const res = await fetch(`${SITE}/c/${C.slug}/tools/dice/${kind}`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', cookie: (who ? cookieFor(who.session) : '') + (extra ? '; ' + extra : '') }, body: JSON.stringify(body) });
  return { status: res.status, json: res.status < 300 || res.status >= 400 ? await res.json().catch(() => ({})) : {} };
};
const roll = (who, body, extra) => post(who, 'roll', body, extra);
const reads = async (who, id) => ((await who.client.from('rolls').select('id').eq('id', id)).data ?? []).length === 1;
const dice = async (who, id) => ((await who.client.from('roll_details').select('roll_id').eq('roll_id', id)).data ?? []).length === 1;
const dicePage = async (who, extra = '') => (await page(`/c/${C.slug}/tools/dice`, who.session, extra)).text;
const viewAs = (v) => 'dbb-view-as-player=' + encodeURIComponent(JSON.stringify(v));
const setRules = async (dice, features) => {
  const { data } = await admin.from('campaigns').select('settings').eq('id', C.id).single();
  const r = await dm.client.from('campaigns').update({ settings: { ...data.settings, dice, ...(features === undefined ? {} : { features }) } }).eq('id', C.id).select('id');
  assert.equal(r.error, null, r.error?.message);
};
const listen = async (who) => {
  const events = [];
  const live = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await live.auth.setSession({ access_token: who.session.access_token, refresh_token: who.session.refresh_token });
  await live.realtime.setAuth(who.session.access_token);
  await new Promise((resolve, reject) => {
    live.channel('dice-' + rnd()).on('postgres_changes', { event: '*', schema: 'public' }, (p) => events.push(p))
      .subscribe((s) => { if (s === 'SUBSCRIBED') resolve(); if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(s)); });
  });
  return { events, stop: () => live.removeAllChannels() };
};

before(async () => {
  await cleanup();
  [dm, a, b, plain, outsider, spammer] = await Promise.all([makeUser('dicedm'), makeUser('dicea'), makeUser('diceb'), makeUser('diceplain', { unblocked: true }), makeUser('diceout'), makeUser('dicespam')]);
  const made = await dm.client.from('campaigns').insert({ slug: 'dice-' + rnd(), title: 'Dice Realm' }).select('id, slug').single();
  assert.equal(made.error, null, made.error?.message);
  C = made.data;
  assert.equal((await dm.client.from('sections').insert({ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' })).error, null);
  [coFull, coLess] = await Promise.all([makeUser('dicecofull', { dmOf: C.id }), makeUser('dicecoless', { dmOf: C.id })]);
  assert.equal((await admin.from('memberships').update({ perms: { private_rolls: false } }).eq('campaign_id', C.id).eq('user_id', coLess.id)).error, null, 'the dice migration is applied');
  const joined = await admin.from('memberships').insert([a, b, plain, spammer].map((u) => ({ user_id: u.id, campaign_id: C.id, role: 'player' })));
  assert.equal(joined.error, null, joined.error?.message);
});
after(cleanup);

test('a roll is made on the server: the browser sends what to roll and gets back what fell', async () => {
  const r = await roll(a, { notation: '2d6+3', label: 'Greatsword', total: 999, dice: [{ sides: 6, sign: 1, rolls: [6, 6], kept: [true, true] }], modifier: 100, who: 'Somebody else', user_id: b.id });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const got = r.json.roll;
  assert.ok(got.total >= 5 && got.total <= 15, 'a total the dice can make, not the one the browser sent');
  assert.equal(got.modifier, 3);
  assert.equal(got.notation, '2d6+3');
  assert.equal(got.dice[0].rolls.length, 2);
  assert.ok(got.dice[0].rolls.every((v) => Number.isInteger(v) && v >= 1 && v <= 6));
  assert.equal(got.total, got.dice[0].rolls[0] + got.dice[0].rolls[1] + 3, 'the total is the dice plus the modifier');
  assert.equal(got.user_id, a.id, 'it is the caller\'s roll, whoever the browser named');
  assert.equal(got.privacy, 'all');
  const stored = (await admin.from('rolls').select('*').eq('id', got.id).single()).data;
  assert.equal(stored.total, got.total);
  assert.equal(stored.label, 'Greatsword');
  assert.equal(stored.by_dm, false);
  // many rolls do not all fall the same way
  const totals = new Set();
  for (let i = 0; i < 6; i++) totals.add((await roll(b, { notation: '1d1000' })).json.roll.total);
  assert.ok(totals.size > 1, 'the dice are random');
  // nonsense is refused, with words
  const bad = await roll(a, { notation: '101d6' });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /100 dice/);
  assert.equal((await roll(a, { notation: 'nonsense' })).status, 400);
  assert.equal((await roll(a, {})).status, 400);
});

test('the browser cannot store a roll, or change one, by any other road', async () => {
  const mine = (await roll(a, { notation: '1d20', label: 'Honest' })).json.roll;
  for (const who of [a, dm]) {
    assert.ok((await who.client.from('rolls').insert({ campaign_id: C.id, user_id: who.id, label: 'Forged', total: 20, privacy: 'all' }).select('id')).error, 'no inserting');
    assert.ok((await who.client.from('roll_details').insert({ roll_id: mine.id, campaign_id: C.id, user_id: who.id, notation: '1d20', dice: [], modifier: 0 }).select('roll_id')).error);
    const up = await who.client.from('rolls').update({ total: 20 }).eq('id', mine.id).select('id');
    assert.ok(up.error || (up.data ?? []).length === 0, 'no changing the total');
    const pv = await who.client.from('rolls').update({ privacy: 'self' }).eq('id', mine.id).select('id');
    assert.ok(pv.error || (pv.data ?? []).length === 0, 'no changing who sees it');
    const del = await who.client.from('rolls').delete().eq('id', mine.id).select('id');
    assert.ok(del.error || (del.data ?? []).length === 0, 'no deleting');
    assert.ok((await who.client.from('roll_requests').insert({ campaign_id: C.id, asked_by: who.id, to_user: b.id, label: 'Forged' }).select('id')).error);
  }
  const still = (await admin.from('rolls').select('total, privacy').eq('id', mine.id).single()).data;
  assert.deepEqual(still, { total: mine.total, privacy: 'all' });
  assert.equal(((await admin.from('rolls').select('id').eq('campaign_id', C.id).eq('label', 'Forged')).data ?? []).length, 0);
  // and a co-DM cannot give themselves a permission
  const self = await coLess.client.from('memberships').update({ perms: null }).eq('campaign_id', C.id).eq('user_id', coLess.id).select('user_id');
  assert.ok(self.error || (self.data ?? []).length === 0);
  // outside the campaign, or signed out, there is no rolling
  assert.equal((await roll(outsider, { notation: '1d20' })).status, 404);
  assert.ok((await roll(null, { notation: '1d20' })).status >= 300);
});

test('player A\'s "DM only" roll: player B cannot see it by API, page or Realtime; the DM can', async () => {
  const [spyB, spyDm] = await Promise.all([listen(b), listen(dm)]);
  await wait(4000);   // Realtime needs a moment after SUBSCRIBED before it delivers table changes
  const r = await roll(a, { notation: '1d20+1', label: 'Quillmoth secret', privacy: 'dm' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const id = r.json.roll.id;
  assert.equal(r.json.roll.privacy, 'dm');
  for (let i = 0; i < 60 && !spyDm.events.some((e) => e.new?.id === id); i++) await wait(250);
  await wait(1500);
  await Promise.all([spyB.stop(), spyDm.stop()]);
  // Realtime
  assert.ok(spyDm.events.some((e) => e.table === 'rolls' && e.new?.id === id), 'the DM hears it live');
  assert.ok(!JSON.stringify(spyB.events).includes(id) && !JSON.stringify(spyB.events).includes('Quillmoth'), 'player B hears nothing of it');
  // the database API
  assert.deepEqual([await reads(a, id), await reads(b, id), await reads(dm, id), await reads(outsider, id)], [true, false, true, false]);
  assert.deepEqual([await dice(a, id), await dice(b, id), await dice(dm, id)], [true, false, true]);
  assert.equal(((await b.client.from('rolls').select('id').eq('campaign_id', C.id).eq('privacy', 'dm')).data ?? []).length, 0, 'searching for private rolls finds none');
  // the page
  assert.ok(!(await dicePage(b)).includes('Quillmoth'), 'not in player B\'s page');
  const mine = await dicePage(a);
  assert.ok(mine.includes('Quillmoth secret') && mine.includes('only the DM sees this'));
  const dms = await dicePage(dm);
  assert.ok(dms.includes('Quillmoth secret') && dms.includes('rolled to the DM only'));
  // the DM previewing as player B gets player B's page, and cannot roll from inside the preview
  assert.ok(!(await dicePage(dm, viewAs({ p: b.id }))).includes('Quillmoth'));
  assert.ok((await dicePage(dm, viewAs({ p: a.id }))).includes('Quillmoth secret'));
  assert.equal((await roll(dm, { notation: '1d20' }, viewAs({ p: b.id }))).status, 403);
});

test('a "Just me" roll: nobody but the roller sees it, the DM included', async () => {
  const r = await roll(a, { notation: '1d20', label: 'Hushwick alone', privacy: 'self' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const id = r.json.roll.id;
  assert.deepEqual([await reads(a, id), await reads(b, id), await reads(dm, id), await reads(coFull, id)], [true, false, false, false]);
  assert.deepEqual([await dice(a, id), await dice(dm, id)], [true, false]);
  for (const who of [b, dm, coFull]) assert.ok(!(await dicePage(who)).includes('Hushwick'));
  assert.ok((await dicePage(a)).includes('Hushwick alone'));
});

test('a blind roll: the DM asks, the player rolls, and only the DM sees how it fell', async () => {
  const asked = await post(dm, 'ask', { to: [a.id], notation: '1d20+2', label: 'Blindmark watch', blind: true });
  assert.equal(asked.status, 200, JSON.stringify(asked.json));
  const req = asked.json.requests[0];
  assert.deepEqual([req.to_user, req.blind, req.privacy, req.status], [a.id, true, 'dm', 'open']);
  const sees = async (who) => ((await who.client.from('roll_requests').select('id').eq('id', req.id)).data ?? []).length === 1;
  assert.deepEqual([await sees(a), await sees(b), await sees(dm)], [true, false, true], 'the request is for that player alone');
  const waiting = await dicePage(a);
  assert.ok(waiting.includes('Blindmark watch') && waiting.includes('Blind roll: only your DM sees the result'));
  assert.ok(!(await dicePage(b)).includes('Blindmark'));
  assert.equal((await roll(b, { request: req.id })).status, 404, 'another player cannot answer it');

  const done = await roll(a, { request: req.id, privacy: 'all', notation: '1d1000+500' });
  assert.equal(done.status, 200, JSON.stringify(done.json));
  assert.deepEqual(done.json, { ok: true, blind: true, label: 'Blindmark watch' }, 'the roller is told it happened, and nothing about how it fell');
  const stored = (await admin.from('rolls').select('*').eq('request_id', req.id).single()).data;
  assert.deepEqual([stored.user_id, stored.privacy, stored.blind, stored.asked_by], [a.id, 'dm', true, dm.id]);
  assert.ok(stored.total >= 3 && stored.total <= 22, 'it rolled what the DM asked for, not what the player sent');
  assert.deepEqual([await reads(a, stored.id), await reads(b, stored.id), await reads(dm, stored.id)], [false, false, true], 'the roller cannot read their own blind roll');
  assert.deepEqual([await dice(a, stored.id), await dice(dm, stored.id)], [false, true]);
  assert.ok(!(await dicePage(a)).includes('Blindmark'), 'it is not in the roller\'s log, and the request is gone');
  assert.ok((await dicePage(dm)).includes('a blind roll: the player does not see the result'));
  assert.equal((await roll(a, { request: req.id })).status, 404, 'a request is answered once');
  // only the DM asks; a request can be taken back
  assert.equal((await post(a, 'ask', { to: [b.id], notation: '1d20' })).status, 403);
  const again = (await post(dm, 'ask', { to: [b.id, outsider.id], check: 'insight', privacy: 'dm' })).json.requests;
  assert.equal(again.length, 1, 'someone outside the campaign is not asked');
  assert.deepEqual([again[0].label, again[0].what.check, again[0].privacy, again[0].blind], ['Insight', 'Insight', 'dm', false]);
  assert.equal((await post(dm, 'ask', { cancel: again[0].id })).status, 200);
  assert.equal((await roll(b, { request: again[0].id })).status, 404);
  assert.equal((await post(dm, 'ask', { to: [b.id], check: 'Lockpicking with style' })).status, 400, 'a check the campaign does not have');
});

test('a DM roll for one named player: the other players cannot see it', async () => {
  const r = await roll(dm, { notation: '1d20+4', label: 'Vexlight omen', privacy: 'players', players: [a.id, outsider.id] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.roll.shown_to, [a.id], 'only people in the campaign can be named');
  assert.equal(r.json.roll.by_dm, true);
  const id = r.json.roll.id;
  assert.deepEqual([await reads(a, id), await reads(b, id), await reads(dm, id)], [true, false, true]);
  assert.ok((await dicePage(a)).includes('Vexlight omen') && (await dicePage(a)).includes('only you and the DM see this'));
  assert.ok(!(await dicePage(b)).includes('Vexlight'));
  assert.equal((await roll(dm, { notation: '1d20', privacy: 'players', players: [] })).status, 400);
  // a DM's hidden roll
  const hidden = (await roll(dm, { notation: '1d20+3', label: 'Murkfen stealth', privacy: 'dm' })).json.roll;
  assert.deepEqual([await reads(a, hidden.id), await reads(b, hidden.id), await reads(dm, hidden.id)], [false, false, true]);
  assert.ok((await dicePage(dm)).includes('hidden from players') && !(await dicePage(a)).includes('Murkfen'));
});

test('a co-DM without "See private rolls" cannot see private rolls; one with it can', async () => {
  const fromPlayer = (await roll(a, { notation: '1d20', label: 'Tarnwhisper', privacy: 'dm' })).json.roll;
  const fromDm = (await roll(dm, { notation: '1d20', label: 'Gloamhide', privacy: 'dm' })).json.roll;
  const forOne = (await roll(dm, { notation: '1d20', label: 'Wendlelure', privacy: 'players', players: [a.id] })).json.roll;
  const open = (await roll(a, { notation: '1d20', label: 'Openhand' })).json.roll;
  for (const r of [fromPlayer, fromDm, forOne]) {
    assert.equal(await reads(coLess, r.id), false, r.label + ' is kept from the co-DM without the permission');
    assert.equal(await dice(coLess, r.id), false);
    assert.equal(await reads(coFull, r.id), true, r.label + ' is read by the co-DM with it');
  }
  assert.deepEqual([await reads(coLess, open.id), await reads(coFull, open.id)], [true, true], 'both see what everyone sees');
  const less = await dicePage(coLess), full = await dicePage(coFull);
  for (const word of ['Tarnwhisper', 'Gloamhide', 'Wendlelure']) { assert.ok(!less.includes(word), word); assert.ok(full.includes(word), word); }
  assert.ok(less.includes('Openhand'));
  // their own hidden roll is still theirs
  const own = (await roll(coLess, { notation: '1d20', label: 'Cinderveil', privacy: 'dm' })).json.roll;
  assert.deepEqual([await reads(coLess, own.id), await reads(dm, own.id), await reads(a, own.id)], [true, true, false]);
});

test('the limit: the 31st roll in a minute is refused', async () => {
  const rows = Array.from({ length: 29 }, (_, i) => ({ campaign_id: C.id, user_id: spammer.id, who: 'Spam', label: 'Fast ' + i, total: 1, privacy: 'all' }));
  assert.equal((await admin.from('rolls').insert(rows)).error, null, 'twenty-nine in the minute');
  const thirtieth = await roll(spammer, { notation: '1d20' });
  assert.equal(thirtieth.status, 200, JSON.stringify(thirtieth.json));
  const next = await roll(spammer, { notation: '1d20' });
  assert.equal(next.status, 429);
  assert.match(next.json.error, /30 rolls in a minute/);
  assert.match((await admin.from('rolls').insert({ campaign_id: C.id, user_id: spammer.id, label: 'Server too', total: 1, privacy: 'all' })).error?.message ?? '', /rate:/, 'the database itself holds the limit');
  assert.equal(((await admin.from('rolls').select('id').eq('user_id', spammer.id)).data ?? []).length, 30);
  assert.equal((await roll(b, { notation: '1d20' })).status, 200, 'another person is not held up by it');
});

test('the campaign\'s dice rules are applied by the server, not by the page', async () => {
  // players may not roll to the DM only, or just for themselves
  await setRules(cleanDiceRules({ dmOnly: false, self: false }, []));
  assert.equal((await roll(a, { notation: '1d20', privacy: 'dm' })).status, 400);
  assert.equal((await roll(a, { notation: '1d20', privacy: 'self' })).status, 400);
  assert.equal((await roll(a, { notation: '1d20', privacy: 'all' })).status, 200);
  const closed = await dicePage(a);
  assert.ok(!closed.includes('>DM only<') && !closed.includes('>Just me<'), 'and the page does not offer them');
  // DM rolls hidden by default; a check that is always private
  await setRules(cleanDiceRules({ dmHidden: true, alwaysPrivate: ['Insight'] }, ['Insight', 'Perception']));
  assert.equal((await roll(dm, { notation: '1d20' })).json.roll.privacy, 'dm');
  assert.equal((await roll(dm, { notation: '1d20', privacy: 'all' })).json.roll.privacy, 'all');
  const forced = (await roll(a, { notation: '1d20+2', label: 'Insight', privacy: 'all' })).json.roll;
  assert.equal(forced.privacy, 'dm', 'an always-private check goes to the DM whatever the player picked');
  assert.deepEqual([await reads(b, forced.id), await reads(dm, forced.id)], [false, true]);
  // only the total: other people's dice and modifier are not theirs to read
  await setRules(cleanDiceRules({ showDice: false }, []));
  const shown = (await roll(a, { notation: '1d20+7', label: 'Plainsight' })).json.roll;
  assert.deepEqual([await reads(b, shown.id), await dice(b, shown.id)], [true, false], 'player B reads the total and not the dice');
  assert.deepEqual([await dice(a, shown.id), await dice(dm, shown.id), await dice(coLess, shown.id)], [true, true, false], 'the roller and the DM still do');
  const bPage = await dicePage(b);
  assert.ok(bPage.includes('Plainsight') && !/Plainsight \(\d+ \+ 7\)/.test(bPage), 'and the page shows the label and total alone');
  assert.match(await dicePage(a), /Plainsight \(\d+ \+ 7\)/);
  await setRules(cleanDiceRules({}, []));
  assert.equal(await dice(b, shown.id), true, 'switched back on, the dice are shown again');
  // the feature switches from Manage: private rolls off, then the roll log off
  await setRules(cleanDiceRules({}, []), { off: ['sidebar.private'] });
  assert.equal((await roll(a, { notation: '1d20', privacy: 'dm' })).status, 400);
  assert.equal((await roll(dm, { notation: '1d20', privacy: 'dm' })).status, 200, 'the DM can still roll hidden');
  await setRules(cleanDiceRules({}, []), { off: ['sidebar.log'] });
  const noLog = await dicePage(b);
  assert.ok(!noLog.includes('Party rolls') && !noLog.includes('Plainsight') && !noLog.includes('Openhand'), 'with the log off, no rolls are sent to the page');
  assert.equal((await roll(b, { notation: '1d20' })).status, 200, 'rolling still works');
  await setRules(cleanDiceRules({}, []), { off: [] });
  // only the DM changes the rules
  const tried = await a.client.from('campaigns').update({ settings: { dice: { showDice: false } } }).eq('id', C.id).select('id');
  assert.ok(tried.error || (tried.data ?? []).length === 0);
});

test('tap to roll: the modifier comes from the rules engine on the server, sealed', async () => {
  const sheet = { ...blankV2(), name: 'Brannoch Vale', level: 3, ab: { str: 8, dex: 16, con: 12, int: 10, wis: 14, cha: 10 }, skills: ['Perception'] };
  const made = await a.client.from('characters').insert({ owner: a.id, campaign_id: C.id, data: sheet }).select('id').single();
  assert.equal(made.error, null, made.error?.message);
  const html = await dicePage(a);
  assert.ok(html.includes('Tap to roll') && html.includes('Brannoch Vale') && html.includes('Perception') && html.includes('Dexterity save'));
  const checks = [...html.matchAll(/\\?"type\\?":\\?"(\w+)\\?",\\?"label\\?":\\?"([^"\\]+)\\?",\\?"bonus\\?":(-?\d+),\\?"token\\?":\\?"([A-Za-z0-9_.-]+)\\?"/g)].map((m) => ({ type: m[1], label: m[2], bonus: Number(m[3]), token: m[4] }));
  const find = (label) => { const c = checks.find((x) => x.label === label); assert.ok(c, label + ' is offered'); return c; };
  assert.equal(find('Dexterity check').bonus, 3);
  assert.equal(find('Strength check').bonus, -1);
  assert.equal(find('Perception').bonus, 4, 'Wisdom +2 and proficiency +2 at level 3');
  assert.equal(find('Insight').bonus, 2);
  assert.equal(find('Initiative').bonus, 3);

  const r = await roll(a, { check: find('Perception').token, notation: '1d20+99', label: 'Lies' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual([r.json.roll.label, r.json.roll.notation, r.json.roll.modifier, r.json.roll.who, r.json.roll.character_id], ['Perception', '1d20+4', 4, 'Brannoch Vale', made.data.id]);
  const adv = (await roll(a, { check: find('Strength check').token, mode: 'adv' })).json.roll;
  assert.deepEqual([adv.notation, adv.dice[0].rolls.length, adv.dice[0].kept.filter(Boolean).length], ['2d20kh1-1', 2, 1]);
  // a check cannot be altered, borrowed, or made up
  const [body, mac] = find('Perception').token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), b: 30 })).toString('base64url') + '.' + mac;
  assert.equal((await roll(a, { check: forged })).status, 400, 'a changed modifier is refused');
  assert.equal((await roll(b, { check: find('Perception').token })).status, 400, 'another player cannot use it');
  assert.equal((await roll(a, { check: 'made.up' })).status, 400);
  // a roll the DM asks for by name uses the player's own modifier for that check
  const req = (await post(dm, 'ask', { to: [a.id], check: 'Perception', privacy: 'all' })).json.requests[0];
  const answered = (await roll(a, { request: req.id, check: find('Perception').token })).json.roll;
  assert.deepEqual([answered.label, answered.notation, answered.asked_by], ['Perception', '1d20+4', dm.id]);
  // with "Tap to roll" switched off, the checks are not offered and not accepted
  await setRules(cleanDiceRules({}, []), { off: ['sidebar.tap'] });
  assert.ok(!(await dicePage(a)).includes('Tap to roll'));
  assert.equal((await roll(a, { check: find('Insight').token })).status, 403);
  await setRules(cleanDiceRules({}, []), { off: [] });
});

test('dice are behind their flag: without it there is no page, no link and no rolling', async () => {
  assert.equal((await page(`/c/${C.slug}/tools/dice`, plain.session)).status, 404);
  assert.equal((await roll(plain, { notation: '1d20' })).status, 404);
  assert.equal((await post(plain, 'ask', { to: [a.id], notation: '1d20' })).status, 404);
  assert.ok(!(await page(`/c/${C.slug}/tools`, plain.session)).text.includes('/tools/dice'), 'no link on Table tools');
  assert.ok((await page(`/c/${C.slug}/tools`, a.session)).text.includes(`/c/${C.slug}/tools/dice`), 'the link is there with the flag');
  // the read rules do not depend on the flag: an ordinary member still cannot read a private roll
  const hidden = (await roll(dm, { notation: '1d20', label: 'Flagless', privacy: 'dm' })).json.roll;
  assert.equal(await reads(plain, hidden.id), false);
  // a request from another website is refused
  const cross = await fetch(`${SITE}/c/${C.slug}/tools/dice/roll`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', cookie: cookieFor(a.session), origin: 'https://example.com' }, body: JSON.stringify({ notation: '1d20' }) });
  assert.equal(cross.status, 403);
});
