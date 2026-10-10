// Follow-up build: the full SRD in both versions, official and paid packs, two editions
// of a campaign product, what a bought campaign unlocks, and the commission workflow.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { admin, anonClient, campaign, cleanup, cookieFor, makeUser, page, SITE } from './helpers.mjs';
import { blankV2, derive, classTable } from '../src/lib/rules/engine.ts';

const rnd = () => Math.random().toString(36).slice(2, 8);
let head, pro, free, buyer;
const count = async (q) => (await q).count;
const srdCount = (v, type) => count(admin.from('entities').select('id', { count: 'exact', head: true }).eq('source', 'srd').eq('srd_version', v).eq('type', type));
const post = (path, session, fields) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) (Array.isArray(v) ? v : [v]).forEach((x) => body.append(k, String(x)));
  return fetch(SITE + path, { method: 'POST', redirect: 'manual', headers: { cookie: session ? cookieFor(session) : '', 'content-type': 'application/x-www-form-urlencoded' }, body });
};
async function makeCampaign(owner, title, extra = {}) {
  const slug = 'fu-' + rnd();
  const made = await owner.client.from('campaigns').insert({ slug, title, ...extra }).select('id, slug, settings').single();
  assert.equal(made.error, null, made.error?.message);
  await owner.client.from('sections').insert([{ campaign_id: made.data.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' }, { campaign_id: made.data.id, slug: 'sheet', title: 'My character', sort: 20, audience: 'player', kind: 'sheet' }, { campaign_id: made.data.id, slug: 'secrets', title: 'Secrets', sort: 30, audience: 'dm', kind: 'content' }]);
  return made.data;
}
async function join(owner, campaignId, user) {
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await owner.client.from('invites').insert({ campaign_id: campaignId, code });
  assert.equal((await user.client.rpc('join_campaign', { p_code: code })).error, null);
}
const webhook = (event) => {
  const body = JSON.stringify({ livemode: false, ...event });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${crypto.createHmac('sha256', process.env.TEST_WEBHOOK_SECRET || 'whsec_localtest').update(`${t}.${body}`).digest('hex')}`;
  return fetch(SITE + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sig }, body });
};

before(async () => {
  await cleanup();
  [head, pro, free, buyer] = await Promise.all([makeUser('fhead', { head: true }), makeUser('fpro'), makeUser('ffree', { free: true }), makeUser('fbuyer', { free: true })]);
});
after(cleanup);

// ------------------------------------------------------------------ Part 0: the full SRD

test('the full SRD is there in both versions, every category, marked with its version', async () => {
  const want = { '5.1': { race: 9, class: 12, subclass: 12, background: 1, feat: 1, spell: 319, monster: 334, condition: 15 }, '5.2': { race: 9, class: 12, subclass: 12, background: 4, feat: 17, spell: 339, monster: 341, condition: 15 } };
  for (const [v, kinds] of Object.entries(want)) for (const [type, n] of Object.entries(kinds)) assert.equal(await srdCount(v, type), n, `SRD ${v} ${type}`);
  assert.ok((await srdCount('5.1', 'item')) > 500 && (await srdCount('5.2', 'item')) > 400 && (await srdCount('5.1', 'rule')) > 100 && (await srdCount('5.2', 'rule')) > 50);
  assert.equal(await count(admin.from('entities').select('id', { count: 'exact', head: true }).eq('source', 'srd').is('srd_version', null)), 0, 'every SRD entry has a version');
  assert.equal(await count(admin.from('entities').select('id', { count: 'exact', head: true }).neq('source', 'srd').not('srd_version', 'is', null)), 0, 'and nothing else does');
  // the same name exists once per version, as separate entries
  const fire = (await free.client.from('entities').select('id, srd_version, data').eq('source', 'srd').eq('type', 'spell').eq('name', 'Fireball')).data;
  assert.deepEqual(fire.map((f) => f.srd_version).sort(), ['5.1', '5.2']);
  assert.ok(fire.every((f) => f.data.level === 3 && /8d6/.test(f.data.desc)));
  // free to everyone, signed in or not; nobody can change it or pass their own work off as SRD
  assert.equal((await anonClient().from('entities').select('id').eq('type', 'monster').eq('name', 'Goblin')).data.length, 1);
  assert.ok((await pro.client.from('entities').insert({ type: 'spell', slug: 'x-' + rnd(), name: 'Fake', source: 'homebrew', srd_version: '5.2' }).select()).error);
  assert.equal(((await pro.client.from('entities').update({ name: 'x' }).eq('source', 'srd').eq('name', 'Fireball').select('id')).data ?? []).length, 0);
  // homebrew is the nine kinds; conditions and rules text are SRD reference only
  assert.ok((await pro.client.from('entities').insert({ type: 'condition', slug: 'x-' + rnd(), name: 'Fake' }).select()).error);
});

test('the official entries work on a sheet, in the class table, and as stat blocks', async () => {
  const get = async (v, type, name) => (await admin.from('entities').select('id, type, name, source, srd_version, data').eq('source', 'srd').eq('srd_version', v).eq('type', type).eq('name', name).single()).data;
  // 2024 rules: a Dwarf Barbarian
  const [dwarf, barb, acolyte] = await Promise.all([get('5.2', 'race', 'Dwarf'), get('5.2', 'class', 'Barbarian'), get('5.2', 'background', 'Acolyte')]);
  const d = derive({ ...blankV2(), level: 6, raceId: dwarf.id, clsId: barb.id, bgId: acolyte.id, anyAb: ['wis', 'wis', 'int'], ab: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 } }, [dwarf, barb, acolyte]);
  assert.equal(d.senses.Darkvision, 120);
  assert.ok(d.resist.includes('poison'));
  assert.deepEqual(d.saves.filter((s) => s.proficient).map((s) => s.key), ['str', 'con']);
  assert.equal(d.resources.find((r) => r.name === 'Rage').max, 4, 'four rages at level 6');
  assert.equal(d.scores.wis, 12, 'the background\'s ability increases go where the player puts them');
  assert.ok(d.skills.find((s) => s.name === 'Insight').proficient && d.features.some((f) => f.name === 'Rage') && d.features.some((f) => f.name === 'Stonecunning'));
  assert.equal(d.hpMax, 12 + 2 + 5 * (7 + 2) + 6, 'd12, Constitution, and Dwarven Toughness');
  const table = classTable(barb);
  assert.ok(table.rows.length === 20 && table.headers.includes('Rage') && table.rows[0].features.includes('Rage'));
  // 2014 rules: a caster
  const [tief, wiz] = await Promise.all([get('5.1', 'race', 'Tiefling'), get('5.1', 'class', 'Wizard')]);
  const w = derive({ ...blankV2(), level: 5, raceId: tief.id, clsId: wiz.id, ab: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 } }, [tief, wiz]);
  assert.deepEqual(w.casting.slots, [4, 3, 2]);
  assert.ok(w.resist.includes('fire') && wiz.data.features.some((f) => f.name === 'Arcane Recovery' && f.text.length > 100), 'official wording, with the sheet mechanics kept');
  // stat blocks for the initiative tracker
  for (const v of ['5.1', '5.2']) {
    const m = await get(v, 'monster', v === '5.1' ? 'Goblin' : 'Goblin Warrior');
    assert.ok(m.data.acv > 10 && m.data.hpv > 0 && m.data.ab.dex >= 14 && m.data.actions.length && /to hit|Attack Roll/.test(m.data.actions[0].text) && m.data.cr);
  }
});

test('a campaign chooses its rules version; existing campaigns keep the 2014 rules', async () => {
  const demo = (await admin.from('campaigns').select('settings').eq('is_demo', true).single()).data;
  assert.equal(demo.settings.rules, '2014');
  const c = await makeCampaign(pro, 'Rules Realm', { settings: { rules: '2024' } });
  await join(pro, c.id, free);
  const made = await free.client.from('characters').insert({ owner: free.id, campaign_id: c.id, data: { ...blankV2(), name: 'Tester' } }).select('id').single();
  // the choices are offered in the character creator
  const sheet = async () => (await page(`/c/${c.slug}/create?c=${made.data.id}`, free.session)).text;
  let html = await sheet();
  assert.ok(html.includes('Goliath') && !html.includes('Half-Elf'), '2024: the 5.2 species');
  assert.ok(!html.includes('In both sets of rules'), '2024 only: nothing to choose between');
  await pro.client.from('campaigns').update({ settings: { rules: '2014' } }).eq('id', c.id);
  html = await sheet();
  assert.ok(html.includes('Half-Elf') && !html.includes('Goliath'), '2014: the 5.1 races');
  await pro.client.from('campaigns').update({ settings: { rules: 'both' } }).eq('id', c.id);
  html = await sheet();
  assert.ok(html.includes('Goliath') && html.includes('Half-Elf'), 'both: side by side');
  // something that is in both sets of rules is listed once, and asks which version when it is picked
  const cards = (name) => html.split(`<b>${name}</b>`).length - 1;
  assert.equal(cards('Fighter'), 1, 'both: one Fighter card, not two');
  assert.ok(html.includes('In both sets of rules. Tap to choose which.') && html.includes('2014 or 2024'), 'both: the card says there are two versions');
  // spells are listed without their long text; the text is fetched when a spell is opened
  assert.ok(html.includes('Fireball') && !html.includes('bright streak flashes'));
  const manage = await page(`/c/${c.slug}/manage`, pro.session);
  assert.ok(manage.text.includes('Rules version') && manage.text.includes('2024 rules (SRD 5.2)'));
  const browse = await page('/homebrew/srd?type=monster&v=5.2&q=dragon', free.session);
  assert.ok(browse.status === 200 && browse.text.includes('Adult Red Dragon') && browse.text.includes('2014 rules (SRD 5.1)'));
  const one = (await admin.from('entities').select('id').eq('source', 'srd').eq('srd_version', '5.2').eq('type', 'condition').eq('name', 'Blinded').single()).data;
  const entry = await page('/homebrew/' + one.id, free.session);
  assert.ok(entry.status === 200 && entry.text.includes('System Reference Document 5.2') && !entry.text.includes('Clone and tweak'), 'reference text can be read but is not a homebrew kind');
  const legal = await page('/legal', null);
  assert.ok(legal.text.includes('System Reference Document 5.1') && legal.text.includes('System Reference Document 5.2') && (legal.text.match(/Creative Commons Attribution 4\.0/g) ?? []).length >= 2, 'attribution for both versions');
});
