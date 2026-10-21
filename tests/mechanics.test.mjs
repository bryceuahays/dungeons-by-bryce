// The newer Gives building blocks (src/lib/rules/engine.ts): a save a hit forces, an area, healing each turn,
// damage reduction and a size change, worked out for the sheet. No database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankV2, derive, effectPoints } from '../src/lib/rules/engine.ts';

const race = { id: 'r1', type: 'race', name: 'Test Folk', source: 'homebrew', data: { size: 'Medium', speed: 30 } };
const cls = (effects) => ({ id: 'c1', type: 'class', name: 'Test Class', source: 'homebrew', data: { hd: 10, features: [{ level: 1, name: 'Beast', text: '', effects }] } });
const sheet = (effects, level = 5) => derive({ ...blankV2(), level, raceId: 'r1', clsId: 'c1', ab: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } }, [race, cls(effects)]);

test('on a hit: the DC is 8 + proficiency + the chosen ability, and the condition and damage come along', () => {
  const d = sheet([{ t: 'onhit', with: 'your bite', once: true, save: 'str', dcAb: 'con', condition: 'Prone', damage: '1d6', type: 'poison' }]);
  assert.equal(d.onHits.length, 1);
  assert.deepEqual({ ...d.onHits[0], from: undefined }, { with: 'your bite', save: 'Strength', dc: 8 + 3 + 2, condition: 'Prone', duration: '', damage: '1d6', type: 'poison', once: true, when: '', from: undefined });
  // a set DC, and no save at all
  assert.equal(sheet([{ t: 'onhit', save: 'dex', dcN: 15, condition: 'Grappled' }]).onHits[0].dc, 15);
  assert.equal(sheet([{ t: 'onhit', condition: 'Grappled' }]).onHits[0].save, '');
});

test('an area: its damage can grow with level, with half on a success', () => {
  const area = { t: 'area', name: 'Screech', shape: 'cone', size: 15, save: 'con', dcAb: 'con', steps: [[1, '2d8'], [5, '3d8'], [11, '4d8']], damage: '2d8', type: 'thunder', half: true };
  assert.equal(sheet([area], 3).areas[0].damage, '2d8');
  assert.equal(sheet([area], 7).areas[0].damage, '3d8');
  assert.equal(sheet([area], 12).areas[0].dc, 8 + 4 + 2);
  assert.equal(sheet([area]).areas[0].half, true);
});

test('healing each turn and damage reduction work out their amounts', () => {
  const d = sheet([{ t: 'regen', amount: 'con', min1: true }, { t: 'reduce', amount: 'prof', types: 'bps', when: 'while transformed' }, { t: 'regen', amount: '1d6' }]);
  assert.deepEqual(d.regen.map((r) => r.amount), ['2', '1d6']);
  assert.deepEqual(d.reduce.map((r) => [r.amount, r.types, r.when]), [[3, 'bps', 'while transformed']]);
  // at least 1, even with a negative modifier
  const weak = derive({ ...blankV2(), level: 1, raceId: 'r1', clsId: 'c1', ab: { str: 10, dex: 10, con: 6, int: 10, wis: 10, cha: 10 } }, [race, cls([{ t: 'regen', amount: 'con', min1: true }])]);
  assert.equal(weak.regen[0].amount, '1');
});

test('size: a size change with no "when" is its size; one with a "when" is shown beside it', () => {
  assert.equal(sheet([]).size, 'Medium');
  assert.equal(sheet([{ t: 'size', to: 'larger' }]).size, 'Large');
  const d = sheet([{ t: 'size', to: 'larger', when: 'while transformed' }]);
  assert.equal(d.size, 'Medium');
  assert.deepEqual(d.sizes.map((s) => [s.to, s.when]), [['Large', 'while transformed']]);
});

test('the balance hint counts the new building blocks', () => {
  for (const t of ['onhit', 'area', 'regen', 'reduce', 'size']) assert.ok(effectPoints({ t }) > 0, t);
});
