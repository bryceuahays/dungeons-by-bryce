// Phase 3: the rules engine, the homebrew builder, packs, and the edition converter.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { admin, cleanup, makeUser, page } from './helpers.mjs';
import { balanceHint, blankV2, classTable, derive, evalMax, spellSlots } from '../src/lib/rules/engine.ts';
import { convertItem, convertMonster, convertSpell } from '../src/lib/rules/convert.ts';
import { TYPES, EFFECTS } from '../src/config/homebrew.ts';

const rnd = () => Math.random().toString(36).slice(2, 8);
let srd, pro, free, friend;
const byName = (type, name) => srd.find((e) => e.type === type && e.name === name);

before(async () => {
  await cleanup();
  // the 2014 rules (SRD 5.1), read in pages: there are more than a thousand entries
  srd = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('entities').select('id, type, name, source, srd_version, status, version, change_note, data').eq('source', 'srd').eq('srd_version', '5.1').in('type', ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'monster']).range(from, from + 999);
    srd.push(...data);
    if (data.length < 1000) break;
  }
  [pro, free, friend] = await Promise.all([makeUser('brewer'), makeUser('brewfree', { free: true }), makeUser('brewfriend', { free: true })]);
});
after(cleanup);

// ------------------------------------------------------------------ engine

test('structured effects apply to a character by themselves', () => {
  const c = { ...blankV2(), level: 5, raceId: byName('race', 'Dwarf').id, clsId: byName('class', 'Fighter').id, subId: byName('subclass', 'Champion').id, bgId: byName('background', 'Acolyte').id, ab: { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 8 } };
  const d = derive(c, srd);
  assert.equal(d.scores.con, 16, 'Dwarf: Constitution +2');
  assert.equal(d.scores.wis, 11, 'Hill dwarf: Wisdom +1');
  assert.equal(d.prof, 3);
  assert.equal(d.speed.walk, 25);
  assert.equal(d.senses.Darkvision, 60);
  assert.ok(d.resist.includes('poison'));
  assert.deepEqual(d.saves.filter((s) => s.proficient).map((s) => s.key), ['str', 'con'], 'Fighter saves');
  assert.equal(d.saves.find((s) => s.key === 'con').bonus, 3 + 3);
  assert.ok(d.skills.find((s) => s.name === 'Insight').proficient && d.skills.find((s) => s.name === 'Religion').proficient, 'Acolyte skills');
  // hit points: d10, +3 Constitution, +1 per level from Dwarven Toughness
  assert.equal(d.hpMax, 10 + 3 + 4 * (6 + 3) + 5);
  const res = Object.fromEntries(d.resources.map((r) => [r.name, r.max]));
  assert.deepEqual([res['Second Wind'], res['Action Surge'], res['Indomitable']], [1, 1, undefined], 'resources arrive at their level');
  assert.equal(d.scales.find((s) => s.name === 'Attacks per Attack action').value, '2');
  assert.ok(d.features.some((f) => f.name === 'Improved Critical') && !d.features.some((f) => f.name === 'Remarkable Athlete'), 'features up to the current level only');
  assert.equal(d.casting, null);
  // a full caster
  const w = derive({ ...blankV2(), level: 5, clsId: byName('class', 'Wizard').id, raceId: byName('race', 'Tiefling').id, ab: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 } }, srd);
  assert.deepEqual(w.casting.slots, [4, 3, 2]);
  assert.equal(w.casting.dc, 8 + 3 + 3);
  assert.deepEqual(w.granted.map((g) => g.name), ['Thaumaturgy', 'Hellish Rebuke', 'Darkness'], 'granted spells arrive at levels 1, 3 and 5');
  assert.deepEqual(spellSlots('pact', 5), [0, 0, 2]);
  assert.deepEqual(spellSlots('half', 1), []);
});

test('resource formulas, custom resources and "what changed" notices', () => {
  const mods = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 3 };
  assert.equal(evalMax('level*5', { level: 4, mods }), 20);
  assert.equal(evalMax('cha+1', { level: 4, mods }), 4);
  assert.equal(evalMax('step:1=2,3=3,6=4', { level: 5, mods }), 3);
  assert.equal(evalMax('half', { level: 5, mods }), 3);
  assert.equal(evalMax('7', { level: 1, mods }), 7);
  // a campaign's custom resource is a pool on every sheet; a homebrew race with effects applies them
  const pool = { id: 'r1', type: 'resource', name: 'Divinity', source: 'homebrew', data: { max: 'prof', recharge: 'long' } };
  const race = { id: 'h1', type: 'race', name: 'Mothfolk', source: 'homebrew', version: 3, change_note: 'Flight now starts at level 5', data: { speed: 30, effects: [{ t: 'ability', ab: 'dex', n: 2 }, { t: 'ability', ab: 'any', n: 1 }, { t: 'speed', mode: 'fly', n: 30, at: 5 }, { t: 'resource', name: 'Dust Cloud', max: 'prof', recharge: 'short' }] } };
  const at3 = derive({ ...blankV2(), level: 3, raceId: 'h1', anyAb: ['wis'], seen: { h1: 2 } }, [pool, race]);
  assert.equal(at3.scores.dex, 12);
  assert.equal(at3.scores.wis, 11, 'a +1 "of your choice" goes where the player put it');
  assert.equal(at3.speed.fly, undefined, 'not before its level');
  assert.deepEqual(at3.resources.map((r) => [r.name, r.max]), [['Dust Cloud', 2], ['Divinity', 2]]);
  assert.deepEqual(at3.changed, [{ id: 'h1', name: 'Mothfolk', version: 3, note: 'Flight now starts at level 5' }], 'the player is told what changed');
  const at5 = derive({ ...blankV2(), level: 5, raceId: 'h1', seen: { h1: 3 } }, [pool, race]);
  assert.equal(at5.speed.fly, 30);
  assert.equal(at5.changed.length, 0, 'and not told again once seen');
});

test('a class gets a level 1 to 20 table by itself', () => {
  const t = classTable(byName('class', 'Rogue'));
  assert.equal(t.rows.length, 20);
  assert.ok(t.headers.includes('Sneak Attack'));
  assert.equal(t.rows[4].cols[t.headers.indexOf('Sneak Attack')], '3d6');
  assert.ok(t.rows[0].features.includes('Expertise') && t.rows[19].features.includes('Stroke of Luck'));
  assert.equal(t.rows[16].prof, 6);
  const wiz = classTable(byName('class', 'Wizard'));
  assert.equal(wiz.maxSlot, 9);
  assert.deepEqual(wiz.rows[19].slots, [4, 3, 3, 3, 3, 2, 2, 1, 1]);
  // a homebrew class with nothing but a hit die still gets twenty rows
  assert.equal(classTable({ data: { hd: 8 } }).rows.length, 20);
});

test('balance hints: below, in line, or above the SRD, with the reason', () => {
  const elf = byName('race', 'Elf');
  assert.equal(balanceHint('race', elf.data, srd).verdict, 'in line');
  const strong = { ...elf.data, effects: [...elf.data.effects, { t: 'ability', ab: 'str', n: 4 }, { t: 'speed', mode: 'fly', n: 50 }, { t: 'resist', v: 'fire' }, { t: 'resist', v: 'cold' }] };
  const hint = balanceHint('race', strong, srd);
  assert.equal(hint.verdict, 'above');
  assert.ok(hint.reasons.some((r) => /flying speed/i.test(r)) && hint.reasons.some((r) => /ability scores/i.test(r)), 'it says why');
  assert.equal(balanceHint('race', { effects: [] }, srd).verdict, 'below');
  const ogre = byName('monster', 'Ogre');
  assert.equal(balanceHint('monster', ogre.data, srd).verdict, 'in line');
  assert.equal(balanceHint('monster', { ...ogre.data, hpv: 240, acv: 19 }, srd).verdict, 'above');
  assert.equal(balanceHint('spell', { level: 3, desc: 'Creatures take 14d6 fire damage.' }, srd).verdict, 'above');
  assert.equal(balanceHint('spell', { level: 3, desc: 'Creatures take 8d6 cold damage.' }, srd).verdict, 'in line');
  assert.equal(balanceHint('item', { rarity: 'Common', desc: 'You gain a +3 bonus to attack rolls.' }, srd).verdict, 'above');
  assert.equal(balanceHint('class', { hd: 12, casting: { kind: 'full', ability: 'int' }, saves: ['str', 'con', 'wis'], features: [] }, srd).verdict, 'above');
  assert.equal(balanceHint('resource', {}, srd).verdict, 'no baseline');
});

test('the builder covers all nine kinds of entry and every effect building block', () => {
  assert.deepEqual(Object.keys(TYPES), ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'item', 'monster', 'resource']);
  assert.deepEqual(EFFECTS.map((e) => e.t), ['ability', 'prof', 'resist', 'speed', 'sense', 'resource', 'spell', 'scale', 'hp', 'ac', 'text']);
  for (const t of Object.values(TYPES)) assert.ok(t.fields.some((f) => f.guided), t.label + ' has guided steps with defaults');
});

// ------------------------------------------------------------------ converter

test('edition converter: older numbers become fifth edition math, and every change is listed', () => {
  const old = convertMonster({ name: 'Cave Stalker', edition: 'advanced', size: 'Large', power: '6', ac: '4', hp: '27', attack: '15', speed: '12', attacks: 'Bite | 2d6\nClaw | 1d8+3 slashing', special: 'Pounce: Leaps 30 feet and attacks.' });
  assert.equal(old.type, 'monster');
  assert.equal(old.data.acv, 16, 'descending AC 4 becomes 16 (20 minus 4)');
  assert.equal(old.data.cr, '3');
  assert.equal(old.data.mspeed, '30 ft.');
  assert.match(old.data.hdv, /^6d10/);
  assert.ok(old.data.hpv > 27, 'hit points are rebuilt from hit dice');
  assert.ok(old.data.actions[0].text.includes('+4 to hit') && old.data.actions[0].text.includes('2d6+2'), 'attack bonus is proficiency plus ability; dice are kept');
  for (const needle of ['Descending armor class 4 becomes 16', 'THAC0 15', 'challenge rating 3', 'DC 12']) assert.ok(old.changes.some((c) => c.includes(needle)), 'lists: ' + needle);
  const third = convertMonster({ name: 'Iron Drake', edition: 'third', power: '10', ac: '29', hp: '150', attack: '18', speed: '40', str: '24', dex: '10', con: '20', fort: '12', ref: '5', will: '9' });
  assert.equal(third.data.acv, 20, 'a third edition AC of 29 is brought down');
  assert.equal(third.data.msaves, 'Con +9, Wis +4', 'good Fortitude and Will become Constitution and Wisdom save proficiency');
  const fourth = convertMonster({ name: 'Ash Wraith', edition: 'fourth', power: '9', role: 'elite', ac: '23', hp: '180', speed: '6' });
  assert.deepEqual([fourth.data.cr, fourth.data.mspeed, fourth.data.hpv], ['9', '30 ft.', 153]);
  const basic = convertMonster({ name: 'Bog Thing', edition: 'basic', power: '3', ac: '6', speed: '120' });
  assert.deepEqual([basic.data.acv, basic.data.mspeed], [13, '30 ft.']);

  const spell = convertSpell({ name: 'Ember Lance', edition: 'advanced', level: '3', range: '10', duration: '3 turns', damage: '1d6 per level, max 10d6', save: 'save vs. spells' });
  assert.deepEqual([spell.data.level, spell.data.range, spell.data.duration, spell.data.damage], [3, '100 feet', '30 minutes', '5d6']);
  assert.ok(spell.data.desc.includes('Wisdom saving throw') && spell.data.higher.includes('1d6'));
  assert.equal(convertSpell({ name: 'Burst', edition: 'fourth', level: '17', range: '10' }).data.level, 6);
  const item = convertItem({ name: 'Old Blade', edition: 'advanced', kind: 'Weapon', bonus: '5', charges: '50' });
  assert.ok(item.data.desc.includes('+3 bonus') && item.data.rarity === 'Very rare' && item.changes.some((c) => c.includes('capped at +3')));
  assert.equal(convertItem({ name: 'Mail', edition: 'basic', kind: 'Armor', ac: '5' }).data.ac, '14');
});

// ------------------------------------------------------------------ database: versions, packs

test('versions keep the history; packs and their contents belong to their maker', async () => {
  const e = await pro.client.from('entities').insert({ type: 'feat', slug: 'keen-' + rnd(), name: 'Keen Eye', depth: 'advanced', status: 'live', data: { desc: 'v1' } }).select('id, version').single();
  assert.equal(e.error, null);
  assert.equal((await pro.client.from('entity_versions').insert({ entity_id: e.data.id, version: 1, note: '', name: 'Keen Eye', data: { desc: 'v1' } })).error, null);
  assert.equal((await pro.client.from('entities').update({ version: 2, change_note: 'Range doubled', data: { desc: 'v2' } }).eq('id', e.data.id)).error, null);
  assert.ok((await friend.client.from('entity_versions').insert({ entity_id: e.data.id, version: 9, data: {} }).select()).error, 'nobody else writes its history');
  assert.equal(((await friend.client.from('entity_versions').select('*').eq('entity_id', e.data.id)).data ?? []).length, 0, 'or reads it');
  assert.equal((await pro.client.from('entity_versions').select('version').eq('entity_id', e.data.id)).data.length, 1);

  const pack = await pro.client.from('packs').insert({ name: 'Test pack' }).select('id').single();
  assert.equal(pack.error, null);
  assert.equal((await pro.client.from('pack_entities').insert({ pack_id: pack.data.id, entity_id: e.data.id })).error, null);
  assert.equal(((await friend.client.from('packs').select('id').eq('id', pack.data.id)).data ?? []).length, 0);
  assert.ok((await friend.client.from('pack_entities').insert({ pack_id: pack.data.id, entity_id: e.data.id }).select()).error);
  const theirs = await friend.client.from('packs').insert({ name: 'Mine' }).select('id').single();
  assert.ok((await friend.client.from('pack_entities').insert({ pack_id: theirs.data.id, entity_id: e.data.id }).select()).error, 'someone else\'s entry cannot be put in your pack');
});

// ------------------------------------------------------------------ pages

test('builder pages: three depths, clone from the SRD, upgrade prompts at the free limits', async () => {
  const home = await page('/homebrew', pro.session);
  assert.ok(home.status === 200 && home.text.includes('Race or species') && home.text.includes('Custom resource') && home.text.includes('Packs'));
  const fresh = await page('/homebrew/new?type=race', pro.session);
  // Pro: the full editor (Advanced; Quick is marked as coming later)
  assert.ok(fresh.status === 200 && ['Quick', 'Advanced', 'Race or species name', 'What your players see', 'Balance hint'].every((t) => fresh.text.includes(t)));
  const srdPage = await page('/homebrew/srd?type=spell', free.session);
  assert.ok(srdPage.status === 200 && srdPage.text.includes('Fireball') && srdPage.text.includes('2014 rules (SRD 5.1)'));
  const fb = /href="(\/homebrew\/[0-9a-f-]{36})"[^>]*><b>Fireball/.exec(srdPage.text);
  assert.ok(fb && (await page(fb[1], free.session)).text.includes('Clone and tweak'), 'an SRD entry opens on its own page, where it can be cloned');
  const conv = await page('/homebrew/convert', pro.session);
  assert.ok(conv.status === 200 && conv.text.includes('Every change that was made') && conv.text.includes('4th edition'));
  // free plan
  assert.ok((await page('/homebrew/convert', free.session)).text.includes('part of Pro'));
  const freeNew = await page('/homebrew/new?type=item', free.session);
  assert.ok(freeNew.text.includes('Guided (Pro)') && freeNew.text.includes('Advanced (Pro)'), 'Guided and Advanced are marked as Pro');
  for (let i = 0; i < 3; i++) await free.client.from('entities').insert({ type: 'item', slug: 'f-' + i + rnd(), name: 'Free ' + i });
  const full = await page('/homebrew/new?type=item', free.session);
  assert.ok(full.status === 200 && full.text.includes('part of Pro') && !full.text.includes('What your players see'), 'a fourth entry shows what Pro adds instead of the form');
  const list = await page('/homebrew', free.session);
  assert.ok(list.text.includes('3 of 3') && list.text.includes('Free 0'), 'the three they made are all still there');
  // an entry opened by someone it is not shared with does not exist
  const mine = await pro.client.from('entities').insert({ type: 'spell', slug: 'sp-' + rnd(), name: 'Secret Spell' }).select('id').single();
  assert.equal((await page('/homebrew/' + mine.data.id, friend.session)).status, 404);
  assert.equal((await page('/homebrew/' + mine.data.id, pro.session)).status, 200);
});

test('a new campaign gets the standard sheet, with SRD and attached homebrew, and no private rules', async () => {
  const slug = 'sheet-' + rnd();
  const camp = await pro.client.from('campaigns').insert({ slug, title: 'Sheet Realm' }).select('id').single();
  await pro.client.from('sections').insert([{ campaign_id: camp.data.id, slug: 'sheet', title: 'My character', sort: 10, audience: 'player', kind: 'sheet' }, { campaign_id: camp.data.id, slug: 'combat', title: 'Combat', sort: 20, audience: 'player', kind: 'combat' }]);
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await pro.client.from('invites').insert({ campaign_id: camp.data.id, code });
  await friend.client.rpc('join_campaign', { p_code: code });
  const race = await pro.client.from('entities').insert({ type: 'race', slug: 'glass-' + rnd(), name: 'Glassborn', status: 'live', depth: 'advanced', data: { speed: 35, effects: [{ t: 'ability', ab: 'int', n: 2 }] } }).select('id').single();
  const draft = await pro.client.from('entities').insert({ type: 'race', slug: 'unfinished-' + rnd(), name: 'Unfinished Folk', status: 'draft' }).select('id').single();
  await pro.client.from('campaign_entities').insert([{ campaign_id: camp.data.id, entity_id: race.data.id }, { campaign_id: camp.data.id, entity_id: draft.data.id }]);

  const empty = await page(`/c/${slug}/sheet`, friend.session);
  assert.ok(empty.status === 200 && empty.text.includes('Create new character'));
  const ch = await friend.client.from('characters').insert({ owner: friend.id, campaign_id: camp.data.id, data: { ...blankV2(), name: 'Vessa', raceId: race.data.id, race: 'Glassborn', level: 2 } }).select('id').single();
  assert.equal(ch.error, null);
  const sheet = await page(`/c/${slug}/sheet`, friend.session);
  assert.ok(sheet.status === 200 && sheet.text.includes('Vessa') && sheet.text.includes('Glassborn') && sheet.text.includes('Short rest'));
  assert.ok(!sheet.text.includes('Unfinished Folk'), 'a draft entry is not sent to players');
  // the choices are made in the character creator: the SRD and the attached homebrew, never a draft
  const creator = await page(`/c/${slug}/create?c=${ch.data.id}`, friend.session);
  assert.ok(creator.status === 200 && creator.text.includes('Dragonborn') && creator.text.includes('Glassborn'));
  assert.ok(!creator.text.includes('Unfinished Folk'), 'a draft entry is not offered in the creator');
  for (const word of ['Swordmage', 'Warlord', 'Avenger', 'Aarakocra']) assert.ok(!sheet.text.includes(word), 'no private content from another campaign: ' + word);
  assert.equal((await page(`/c/${slug}/combat`, friend.session)).status, 200);
  const builder = await page(`/c/${slug}/builder`, friend.session);
  assert.ok(builder.status >= 300 && builder.status < 400 && builder.location.endsWith(`/c/${slug}/sheet`), 'the old builder address leads to the sheet');
});
