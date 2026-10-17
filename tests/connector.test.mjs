// Connect your AI (src/features/connector): the connector an AI app calls. Level 1: it may look and
// create drafts, as the signed-in DM, and nothing else.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { admin, cleanup, makeUser, SITE } from './helpers.mjs';

let a, b;
before(async () => {
  await cleanup();
  [a, b] = await Promise.all([makeUser('aia'), makeUser('aib')]);
});
after(cleanup);

// one MCP call, the way an AI app makes it (stateless JSON-RPC over HTTP)
let n = 0;
async function call(user, method, params = {}) {
  const res = await fetch(SITE + '/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(user ? { authorization: 'Bearer ' + user.session.access_token } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }),
  });
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  return { status: res.status, body, auth: res.headers.get('www-authenticate') };
}
const tool = async (user, name, args = {}) => {
  const r = await call(user, 'tools/call', { name, arguments: args });
  const out = r.body?.result;
  const textOut = out?.content?.[0]?.text ?? '';
  let json = null; try { json = JSON.parse(textOut); } catch { /* plain text */ }
  return { error: !!out?.isError, text: textOut, json };
};

test('without signing in, an AI app is told where to sign in', async () => {
  const r = await call(null, 'tools/list');
  assert.equal(r.status, 401);
  assert.match(r.auth ?? '', /resource_metadata=".*\/\.well-known\/oauth-protected-resource"/);
  const meta = await (await fetch(SITE + '/.well-known/oauth-protected-resource')).json();
  assert.ok(meta.authorization_servers?.[0]?.endsWith('/auth/v1'), 'the sign-in server is Supabase Auth');
});

test('signed in, it lists only the tools for looking and creating drafts', async () => {
  const r = await call(a, 'tools/list');
  assert.equal(r.status, 200);
  const names = r.body.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['create_draft', 'get_entry', 'get_format', 'get_system', 'list_my_homebrew', 'list_my_systems', 'search_official', 'update_draft']);
});

test('it reads systems, the official rules and the format for a kind', async () => {
  const sys = await tool(a, 'get_system', { system: '2024' });
  assert.equal(sys.json.abilities.length, 6);
  const found = await tool(a, 'search_official', { kind: 'class', name: 'wiz' });
  assert.ok(found.json.results.some((x) => x.name === 'Wizard'));
  const wiz = await tool(a, 'get_entry', { id: found.json.results.find((x) => x.name === 'Wizard').id });
  assert.equal(wiz.json.kind, 'class');
  assert.ok((await tool(a, 'get_format', { kind: 'race' })).text.length > 200);
});

test('a draft it creates is the DM\'s own, a draft, made for its system, and nobody else\'s to see', async () => {
  // one of the DM's own systems, with Intelligence renamed
  const s = (await a.client.from('game_systems').insert({ name: 'AI Test System', base: '2024', changes: { abilities: { list: [{ id: 'str', abbr: 'STR', name: 'Strength', desc: '', save: true }, { id: 'dex', abbr: 'DEX', name: 'Dexterity', desc: '', save: true }, { id: 'int', abbr: 'INS', name: 'Insanity', desc: '', save: true }] } } }).select('id').single()).data;
  const made = await tool(a, 'create_draft', { kind: 'race', system: s.id, entry: { type: 'race', name: 'Cave Bat Folk', size: 'Small', speed: 25, traits: [{ name: 'Night Wings', description: 'You have a flying speed of 30 feet.' }] } });
  assert.equal(made.error, false, made.text);
  assert.equal(made.json.status, 'draft');
  const id = made.json.link.split('/').pop();
  const row = (await admin.from('entities').select('owner_id, status, source, data').eq('id', id).single()).data;
  assert.equal(row.owner_id, a.id);
  assert.equal(row.status, 'draft');
  assert.equal(row.data.system, s.id);
  assert.equal(row.data.madeWith, 'ai');
  assert.equal((await b.client.from('entities').select('id').eq('id', id)).data.length, 0, 'another account cannot see it');
  // and another account's connector cannot read it either
  assert.equal((await tool(b, 'get_entry', { id })).error, true);
  // it is in the DM's list
  assert.ok((await tool(a, 'list_my_homebrew', { kind: 'race' })).json.some((x) => x.id === id));
});

test('an AI can give natural weapons and drawbacks as real entries, not notes', async () => {
  const made = await tool(a, 'create_draft', { kind: 'race', entry: { type: 'race', name: 'Fanged Folk', sizes: ['Medium'], speed: 30, traits: [{ name: 'Fangs', description: 'A bite.', gives: [
    { type: 'naturalWeapon', name: 'Bite', damage: '1d6', damageType: 'piercing', ability: 'str' },
    { type: 'vulnerability', damage: 'radiant' },
    { type: 'disadvantage', on: 'attack', when: 'while in direct sunlight' },
    { type: 'damageTaken', amount: '1d4', damageType: 'radiant', every: 'minute', when: 'while in direct sunlight' },
    { type: 'abilityIncrease', ability: 'cha', amount: -2 },
  ] }] } });
  assert.equal(made.error, false, made.text);
  const row = (await admin.from('entities').select('data').eq('id', made.json.link.split('/').pop()).single()).data;
  const kinds = row.data.features.flatMap((f) => f.effects ?? []).map((e) => e.t + (e.vuln ? ':vuln' : '') + (e.t === 'ability' ? ':' + e.n : ''));
  assert.deepEqual(kinds.sort(), ['ability:-2', 'dis', 'hazard', 'resist:vuln', 'weapon']);
});

test('a natural weapon whose dice grow keeps them on the weapon, where the editor shows them', async () => {
  const made = await tool(a, 'create_draft', { kind: 'feat', entry: { type: 'feat', name: 'Growing Claws', category: 'General', benefits: [{ name: 'Claws', description: 'Claws.', gives: [
    { type: 'naturalWeapon', name: 'Claws', damage: '1d6', damageByLevel: [[11, '1d10'], [1, '1d6'], [5, '1d8']], damageType: 'slashing', ability: 'finesse' },
  ] }] } });
  assert.equal(made.error, false, made.text);
  const row = (await admin.from('entities').select('data').eq('id', made.json.id).single()).data;
  const w = JSON.stringify(row.data).match(/\{[^{}]*"t":"weapon"[^{}]*\}|\{"t":"weapon".*?\]\]\}/)?.[0] ?? '';
  assert.match(w, /"steps":\[\[1,"1d6"\],\[5,"1d8"\],\[11,"1d10"\]\]/);
  assert.doesNotMatch(JSON.stringify(row.data), /grows:/);
});

test('an attack of its own can be ranged, like a summoned spear of light', async () => {
  const made = await tool(a, 'create_draft', { kind: 'feat', entry: { type: 'feat', name: 'Spear of Light', category: 'General', benefits: [{ name: 'Divine Arsenal', description: 'You summon a spear.', gives: [
    { type: 'naturalWeapon', name: 'Radiant Spear', damage: '1d8', damageType: 'radiant', ability: 'cha', range: 30, longRange: 120, when: 'while the spear is summoned' },
  ] }] } });
  assert.equal(made.error, false, made.text);
  const row = (await admin.from('entities').select('data').eq('id', made.json.id).single()).data;
  let w = null;
  JSON.stringify(row.data, (k, v) => { if (v && v.t === 'weapon') w = v; return v; });
  assert.equal(w.ab, 'cha');
  assert.deepEqual(w.range, { normal: 30, long: 120 });
  assert.equal(w.reach, undefined);
});

test('rules left as words only are pointed out, so the AI can make them mechanics', async () => {
  const words = await tool(a, 'create_draft', { kind: 'feat', entry: { type: 'feat', name: 'Wordy Feat', category: 'General', benefits: [{ name: 'Keen', description: 'You have Advantage on Perception checks, Darkvision out to 60 feet, and you can attack twice when you take the Attack action.' }] } });
  assert.equal(words.error, false, words.text);
  assert.deepEqual(words.json.mechanicsLeftAsText.map((m) => m.use).sort(), ['advantage', 'extraAttacks', 'sense']);
  assert.match(words.json.doThisNext, /update_draft/);
  // the same rules given as mechanics: nothing to point out
  const fixed = await tool(a, 'update_draft', { id: words.json.id, entry: { type: 'feat', name: 'Wordy Feat', category: 'General', benefits: [{ name: 'Keen', description: 'You have Advantage on Perception checks, Darkvision out to 60 feet, and you can attack twice when you take the Attack action.', gives: [
    { type: 'advantage', on: 'check', when: 'Perception' }, { type: 'sense', sense: 'Darkvision', feet: 60 }, { type: 'extraAttacks', attacks: 2 },
    { type: 'spell', name: 'Misty Step', cast: 'perRest', times: 'proficiency', recharge: 'long' },
  ] }] } });
  assert.equal(fixed.error, false, fixed.text);
  assert.equal(fixed.json.mechanicsLeftAsText, undefined);
  const row = (await admin.from('entities').select('data').eq('id', words.json.id).single()).data;
  const fx = row.data.benefits[0].effects;
  assert.deepEqual(fx.find((x) => x.t === 'attacks'), { t: 'attacks', n: 2 });
  assert.deepEqual(fx.find((x) => x.t === 'spell'), { t: 'spell', name: 'Misty Step', cast: 'perRest', n: 'prof', recharge: 'long' });
});

test('it will not make a second entry of the same name: it is pointed to update_draft instead', async () => {
  const entry = { type: 'feat', name: 'Twice Made', category: 'General', benefits: [{ name: 'Benefit', description: 'Something.' }] };
  assert.equal((await tool(a, 'create_draft', { kind: 'feat', entry })).error, false);
  const again = await tool(a, 'create_draft', { kind: 'feat', entry });
  assert.equal(again.error, true);
  assert.match(again.text, /already has a draft feat called "Twice Made".*update_draft/);
});

test('update_draft changes a draft in place: same entry, no copy', async () => {
  const made = await tool(a, 'create_draft', { kind: 'feat', entry: { type: 'feat', name: 'Change Me', category: 'General', benefits: [{ name: 'Old', description: 'Before.' }] } });
  const id = made.json.id;
  const before = (await admin.from('entities').select('id', { count: 'exact', head: true }).eq('owner_id', a.id)).count;
  const up = await tool(a, 'update_draft', { id, entry: { type: 'feat', name: 'Changed', category: 'General', benefits: [{ name: 'New', description: 'After.' }] } });
  assert.equal(up.error, false, up.text);
  assert.equal(up.json.id, id);
  const after = (await admin.from('entities').select('id', { count: 'exact', head: true }).eq('owner_id', a.id)).count;
  assert.equal(after, before, 'no new entry');
  const row = (await admin.from('entities').select('name, status, data').eq('id', id).single()).data;
  assert.equal(row.name, 'Changed');
  assert.equal(row.status, 'draft');
  assert.match(JSON.stringify(row.data), /After\./);
  assert.doesNotMatch(JSON.stringify(row.data), /Before\./);
});

test('update_draft will not touch a finished entry or someone else\'s', async () => {
  const made = await tool(a, 'create_draft', { kind: 'feat', entry: { type: 'feat', name: 'Finished One', category: 'General', benefits: [{ name: 'B', description: 'Kept.' }] } });
  const id = made.json.id;
  // another account's AI cannot change it
  const theirs = await tool(b, 'update_draft', { id, entry: { type: 'feat', name: 'Stolen', category: 'General', benefits: [] } });
  assert.equal(theirs.error, true);
  // once the DM sets it live, it is theirs to change
  await admin.from('entities').update({ status: 'live' }).eq('id', id);
  const live = await tool(a, 'update_draft', { id, entry: { type: 'feat', name: 'Finished One', category: 'General', benefits: [{ name: 'B', description: 'Changed.' }] } });
  assert.equal(live.error, true);
  assert.match(live.text, /not a draft/);
  const row = (await admin.from('entities').select('name, data').eq('id', id).single()).data;
  assert.equal(row.name, 'Finished One');
  assert.match(JSON.stringify(row.data), /Kept\./);
});

test('a broken entry gets a clear error, not a crash', async () => {
  const bad = await tool(a, 'create_draft', { kind: 'spell', entry: 'this is not json' });
  assert.equal(bad.error, true);
  assert.ok(bad.text.length > 10);
});
