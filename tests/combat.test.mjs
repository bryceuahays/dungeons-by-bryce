// Hub version 2, item 12 (issue 91): the Combat page. Players see enemy health only as Healthy,
// Wounded, Bloodied or Down, worked out on the server; never the numbers, never a hidden creature.
// NPC initiative is rolled as a hidden DM roll. The player whose turn it is picks a target and an
// action, which is rolled on the server and posted to the party's roll log.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cleanState, health, publicView, step, withLine } from '../src/features/hub/combat/model.ts';
import { ROOT, SITE, admin, cleanup, cookieFor, makeUser, page } from './helpers.mjs';

const rnd = () => Math.random().toString(36).slice(2, 8);

// ------------------------------------------------------------------ the sums

test('health, in words', () => {
  assert.equal(health(7, 7), 'Healthy');
  assert.equal(health(6, 7), 'Wounded');
  assert.equal(health(4, 8), 'Bloodied', 'half or less');
  assert.equal(health(1, 15), 'Bloodied');
  assert.equal(health(0, 15), 'Down');
  assert.equal(health(-3, 15), 'Down');
});

const fight = () => cleanState({
  round: 1, turn: 'pcone', name: 'Ambush',
  list: [
    { id: 'pcone', name: 'Mira', kind: 'pc', init: 18, dex: 2, hp: 24, hpMax: 31, ref: 'c:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    { id: 'gobone', name: 'Goblin', kind: 'monster', init: 15, dex: 2, hp: 3, hpMax: 7, conditions: ['Prone'] },
    { id: 'assassin', name: 'Assassin', kind: 'npc', init: 12, dex: 3, hp: 40, hpMax: 40, hidden: true },
    { id: 'ally', name: 'Captain Ysolde', kind: 'npc', side: 'ally', init: 9, dex: 0, hp: 10, hpMax: 10, showHp: true },
  ],
});

test('what players see: no hidden creature, no enemy numbers', () => {
  const p = publicView(fight());
  assert.deepEqual(p.order.map((c) => c.name), ['Mira', 'Goblin', 'Captain Ysolde']);
  const gob = p.order.find((c) => c.name === 'Goblin');
  assert.equal(gob.health, 'Bloodied');
  assert.equal(gob.hp, undefined); assert.equal(gob.hpMax, undefined);
  assert.equal(p.order.find((c) => c.name === 'Mira').hp, 24, 'the party sees its own hit points');
  assert.equal(p.order.find((c) => c.name === 'Captain Ysolde').hpMax, 10, 'and what the DM chose to show');
  assert.ok(!JSON.stringify(p).includes('Assassin') && !JSON.stringify(p).includes('40'), 'nothing of the hidden one');
  assert.equal(p.next, 'Goblin');
  const hiddenTurn = publicView({ ...fight(), turn: 'assassin' });
  assert.equal(hiddenTurn.turn, 'hidden');
  assert.equal(hiddenTurn.next, 'Captain Ysolde', 'and who is next is never the hidden one');
  const off = publicView(fight(), { health: false, conditions: false, map: false });
  assert.equal(off.order.find((c) => c.name === 'Goblin').health, undefined, 'health switched off: nothing');
  assert.equal(off.order.find((c) => c.name === 'Goblin').conditions, undefined);
});

test('turns go round; the fight cleans what it is sent; the log keeps the last 20', () => {
  let s = fight();
  s = step(s); assert.equal(s.turn, 'gobone');
  s = step(step(step(s))); assert.equal(s.turn, 'pcone'); assert.equal(s.round, 2, 'a new round');
  const dirty = cleanState({ list: [{ id: '<x>', name: '<b>x</b>'.repeat(30), kind: 'dragon', hp: 'lots', hidden: true }], turn: 'nobody', map: 'not-a-uuid' });
  assert.equal(dirty.list[0].kind, 'npc'); assert.equal(dirty.list[0].hp, 0); assert.equal(dirty.list[0].name.length, 60); assert.equal(dirty.turn, null); assert.equal(dirty.map, null);
  assert.ok(/^[a-z0-9]+$/.test(dirty.list[0].id));
  const pc = cleanState({ list: [{ name: 'Tobin', kind: 'pc', hidden: true, showHp: false }] }).list[0];
  assert.ok(!pc.hidden && pc.showHp, 'a player character is never hidden, and its hit points are always shown');
  let l = fight();
  for (let i = 0; i < 25; i++) l = withLine(l, 'Mira', 'dashes ' + i);
  assert.equal(l.log.length, 20); assert.equal(l.log.at(-1).text, 'dashes 24');
});

// ------------------------------------------------------------------ the page, as each person

const manifest = path.join(ROOT, '.next/server/server-reference-manifest.json');
const idOf = (name) => {
  if (!fs.existsSync(manifest)) return null;
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  return Object.entries(m.node ?? {}).find(([, v]) => v.exportedName === name && JSON.stringify(v).includes('hub/combat/page'))?.[0] ?? null;
};
const call = async (name, session, args) => {
  const res = await fetch(`${SITE}/c/${C.slug}/hub/combat`, { method: 'POST', headers: { 'Next-Action': idOf(name), 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', cookie: cookieFor(session) }, body: JSON.stringify([C.slug, ...args]), redirect: 'manual' });
  return res.text();
};
const skip = !idOf('saveFight') && 'no local build to call the actions through';
const publicRow = async (who) => (await who.client.from('entries').select('data').eq('campaign_id', C.id).eq('kind', 'encounter').maybeSingle()).data?.data;

let dm, p1, p2, plain, C, mira, tobin;
before(async () => {
  await cleanup();
  [dm, p1, p2] = await Promise.all([makeUser('cbdm'), makeUser('cbp1', { free: true }), makeUser('cbp2', { free: true })]);
  plain = await makeUser('cbplain', { unblocked: true, free: true });
  C = (await dm.client.from('campaigns').insert({ slug: 'cmb-' + rnd(), title: 'Combat Realm', phases: [], phase: '' }).select('id, slug').single()).data;
  await dm.client.from('sections').insert({ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' });
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await dm.client.from('invites').insert({ campaign_id: C.id, code });
  for (const u of [p1, p2, plain]) assert.equal((await u.client.rpc('join_campaign', { p_code: code })).error, null);
  mira = (await admin.from('characters').insert({ campaign_id: C.id, owner: p1.id, data: { name: 'Mira', v: 2, ab: { str: 10, dex: 16 } } }).select('id').single()).data.id;
  tobin = (await admin.from('characters').insert({ campaign_id: C.id, owner: p2.id, data: { name: 'Tobin', v: 2 } }).select('id').single()).data.id;
});
after(cleanup);

const start = () => ({
  round: 1, turn: null, name: 'Ambush at the ford',
  list: [
    { id: 'pcmira', name: 'Mira', kind: 'pc', init: 18, dex: 3, hp: 24, hpMax: 31, ref: 'c:' + mira },
    { id: 'pctobin', name: 'Tobin', kind: 'pc', init: 13, dex: 0, hp: 19, hpMax: 19, ref: 'c:' + tobin },
    { id: 'goblin', name: 'Goblin', kind: 'monster', side: 'enemy', init: 0, dex: 2, hp: 7, hpMax: 7, roll: true },
    { id: 'assassin', name: 'The Grey Assassin', kind: 'npc', side: 'enemy', init: 0, dex: 4, hp: 40, hpMax: 40, hidden: true, roll: true },
  ],
});

test('the DM starts a fight: creatures roll initiative as hidden DM rolls', { skip }, async () => {
  const r = await call('saveFight', dm.session, [start(), {}]);
  assert.ok(r.includes('Ambush at the ford') && !r.includes('"error"'), 'saved');
  const rolls = (await admin.from('rolls').select('label, privacy, by_dm').eq('campaign_id', C.id)).data ?? [];
  assert.deepEqual(rolls.map((x) => x.label).sort(), ['Initiative: Goblin', 'Initiative: The Grey Assassin']);
  assert.ok(rolls.every((x) => x.privacy === 'dm' && x.by_dm), 'only DMs see them');
  assert.equal(((await p1.client.from('rolls').select('id').eq('campaign_id', C.id)).data ?? []).length, 0, 'a player cannot read them');
});

test('players get statuses, never numbers or hidden creatures: database, page and secrets', { skip }, async () => {
  const pub = await publicRow(p1);
  assert.ok(pub, 'players can read the fight');
  const gob = pub.order.find((c) => c.name === 'Goblin');
  assert.equal(gob.health, 'Healthy'); assert.equal(gob.hp, undefined);
  assert.ok(!JSON.stringify(pub).includes('Grey Assassin'), 'no hidden creature');
  assert.equal(((await p1.client.from('entry_secrets').select('entry_id').eq('campaign_id', C.id)).data ?? []).length, 0, 'the full fight is the DM\'s alone');
  const pg = await page(`/c/${C.slug}/hub/combat`, p1.session);
  assert.equal(pg.status, 200);
  assert.ok(pg.text.includes('Goblin') && pg.text.includes('Healthy') && pg.text.includes('Enemy health shows as a status.'));
  assert.ok(!pg.text.includes('Grey Assassin') && !pg.text.includes('7 / 7') && !pg.text.includes('40 / 40'), 'not in the page either');
  const dmPage = await page(`/c/${C.slug}/hub/combat`, dm.session);
  assert.ok(dmPage.text.includes('The Grey Assassin') && dmPage.text.includes('7 / 7') && dmPage.text.includes('Next turn'), 'the DM sees it all');
});

test('the DM hurts the goblin: players see Bloodied', { skip }, async () => {
  const s = (await admin.from('entry_secrets').select('data').eq('campaign_id', C.id).single()).data.data;
  s.list = s.list.map((c) => (c.name === 'Goblin' ? { ...c, hp: 3 } : c));
  s.turn = 'pcmira';
  await call('saveFight', dm.session, [s, {}]);
  assert.equal((await publicRow(p2)).order.find((c) => c.name === 'Goblin').health, 'Bloodied');
});

test('on Mira\'s turn: only her player acts; the attack is rolled on the server and logged', { skip }, async () => {
  assert.ok((await call('playerAct', p2.session, [{ act: 'attack', target: 'goblin' }])).includes('It is not your turn.'), 'not Tobin');
  assert.ok((await call('playerAct', p1.session, [{ act: 'attack', target: 'assassin' }])).includes('Choose a target you can see.'), 'not a hidden creature');
  const r = await call('playerAct', p1.session, [{ act: 'attack', target: 'goblin' }]);
  assert.ok(r.includes('Attack vs Goblin'), 'rolled');
  const roll = (await admin.from('rolls').select('id, label, privacy, character_id, total').eq('campaign_id', C.id).eq('label', 'Attack vs Goblin').single()).data;
  const detail = (await admin.from('roll_details').select('notation, dice').eq('roll_id', roll.id).single()).data;
  assert.ok(Array.isArray(detail.dice?.[0]?.rolls) && detail.notation === '1d20+5', 'stored the way the dice system stores rolls, so the roll log can show it: ' + JSON.stringify(detail));
  assert.equal(roll.privacy, 'all'); assert.equal(roll.character_id, mira);
  assert.ok(roll.total >= 1 + 3 + 2 && roll.total <= 20 + 3 + 2, 'd20 + Dexterity (+3) + proficiency (+2): ' + roll.total);
  assert.ok((await publicRow(p2)).log.some((l) => l.who === 'Mira' && l.text.startsWith('attacks Goblin: ')), 'everyone sees it in the fight\'s log');
  await call('playerAct', p1.session, [{ act: 'dash' }]);
  assert.ok((await publicRow(p2)).log.some((l) => l.text === 'takes the Dash action'));
  await call('playerAct', p1.session, [{ act: 'end' }]);
  const after = await publicRow(p2);
  assert.notEqual(after.turn, 'pcmira', 'her turn is over');
  assert.ok(after.log.some((l) => l.text === 'ends their turn'));
  assert.ok((await call('saveFight', p1.session, [start(), {}])).includes('That is not available yet.'), 'a player cannot change the fight');
});

test('behind its flag, and no link for those without it', async () => {
  const off = await page(`/c/${C.slug}/hub/combat`, plain.session);
  if (off.status !== 200) {
    assert.equal(off.status, 404);
    assert.ok(!(await page(`/c/${C.slug}/overview`, plain.session)).text.includes('/hub/combat'));
  }
  assert.ok((await page(`/c/${C.slug}/overview`, dm.session)).text.includes(`/c/${C.slug}/hub/combat`), 'the DM has the tab');
});
