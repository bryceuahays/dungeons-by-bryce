// Deleting your own account (Bryce, 20 October 2026): a download of everything you made first,
// then the account and everything it owns go, its pictures included. Never the Head DM's account,
// never a store seller's while they sell, and never while a Pro subscription cannot be cancelled.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { exportAccountFiles } from '../src/features/campaign-export/model.ts';
import { ROOT, SITE, admin, cleanup, cookieFor, makeUser, page } from './helpers.mjs';

const rnd = () => Math.random().toString(36).slice(2, 8);
const pic = () => new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'image/webp' });

test('the account download: each campaign in its own folder, then everything else', () => {
  const campaign = { campaign: { title: 'The Vale' }, sections: [], content: [], characters: [], entries: [], secrets: [], sessions: [], attached: [], members: [], notes: [], faces: [], links: [{ zip: 'files/campaign-files/npc/a.webp', url: 'u1' }] };
  const b = exportAccountFiles({ profile: { name: 'Mira', email: 'm@x' }, campaigns: [campaign, { ...campaign, links: [] }], characters: [{ data: { name: 'Tobin' } }], homebrew: [{ name: 'Moonblade' }], systems: [], worlds: [], notes: [{ title: 'My note' }], files: [{ zip: 'files/hub-background/wide', url: 'u2' }] });
  assert.match(b.name, /^dungeons-by-bryce-mira-\d{4}-\d{2}-\d{2}\.zip$/);
  for (const f of ['README.txt', 'profile.json', 'campaigns/the-vale/README.txt', 'campaigns/the-vale-2/campaign.json', 'characters/c-tobin.json', 'homebrew.json', 'game-systems.json', 'worlds.json', 'my-notes.json']) assert.ok(b.text[f], f);
  assert.deepEqual(b.files.map((f) => f.zip).sort(), ['campaigns/the-vale/files/campaign-files/npc/a.webp', 'files/hub-background/wide']);
});

// call a server action the way the Account page does, as a given person
const manifest = path.join(ROOT, '.next/server/server-reference-manifest.json');
const idOf = (name) => {
  if (!fs.existsSync(manifest)) return null;
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  return Object.entries(m.node ?? {}).find(([, v]) => v.exportedName === name && JSON.stringify(v).includes('account/page'))?.[0] ?? null;
};
const call = async (name, session, args) => {
  const res = await fetch(`${SITE}/account`, { method: 'POST', headers: { 'Next-Action': idOf(name), 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', cookie: cookieFor(session) }, body: JSON.stringify(args), redirect: 'manual' });
  return { status: res.status, text: await res.text(), redirect: res.headers.get('x-action-redirect') };
};
const exists = async (u) => !!(await admin.auth.admin.getUserById(u.id)).data?.user;
const skip = !idOf('deleteMyAccount') && 'no local build to call the action through';

let leaver, other, head, seller, payer, C, O;
before(async () => {
  await cleanup();
  [leaver, other, seller, payer] = await Promise.all([makeUser('adleave'), makeUser('adother', { free: true }), makeUser('adsell'), makeUser('adpay')]);
  head = await makeUser('adhead', { head: true });
  // the leaver's campaign, with a player, a picture and a banner; and a character in someone else's
  C = (await leaver.client.from('campaigns').insert({ slug: 'adl-' + rnd(), title: 'Leaving Realm', phases: [], phase: '' }).select('id, slug').single()).data;
  await leaver.client.from('sections').insert({ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' });
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await leaver.client.from('invites').insert({ campaign_id: C.id, code });
  assert.equal((await other.client.rpc('join_campaign', { p_code: code })).error, null);
  await other.client.from('player_notes').insert({ campaign_id: C.id, user_id: other.id, kind: 'note', title: 'Theirs', body: 'Not for the DM' });
  assert.equal((await admin.storage.from('campaign-files').upload(`${C.id}/npc/p.webp`, pic())).error, null);
  assert.equal((await admin.storage.from('backgrounds').upload(`campaign/${C.id}/hero`, pic())).error, null);
  assert.equal((await admin.storage.from('backgrounds').upload(`user/${leaver.id}/banners/b1`, pic())).error, null);
  O = (await other.client.from('campaigns').insert({ slug: 'ado-' + rnd(), title: 'Other Realm', phases: [], phase: '' }).select('id').single()).data;
  const code2 = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await other.client.from('invites').insert({ campaign_id: O.id, code: code2 });
  assert.equal((await leaver.client.rpc('join_campaign', { p_code: code2 })).error, null);
  await admin.from('characters').insert({ campaign_id: O.id, owner: leaver.id, data: { name: 'Wandering Wren' } });
  await admin.from('player_notes').insert({ campaign_id: O.id, user_id: leaver.id, kind: 'note', title: 'Mine', body: 'My own note' });
  // a seller, and someone whose subscription cannot be cancelled
  await admin.from('products').insert({ slug: 'ad-sell-' + rnd(), seller_id: seller.id, title: 'A listing', status: 'draft' });
  await admin.from('subscriptions').upsert({ user_id: payer.id, stripe_subscription: 'sub_test_does_not_exist', plan: 'pro_monthly', status: 'active' });
});
after(async () => {
  await admin.from('products').delete().eq('seller_id', seller.id);
  await admin.storage.from('backgrounds').remove([`user/${leaver.id}/banners/b1`, `campaign/${C.id}/hero`]);
  await admin.storage.from('campaign-files').remove([`${C.id}/npc/p.webp`]);
  await cleanup();
});

test('the Account page offers it, with what would go', async () => {
  const pg = await page('/account', leaver.session);
  for (const words of ['Delete your account', 'Leaving Realm (1 player, whose characters in it go too)', '1 character you made', 'Delete my account…', 'Download everything (.zip)']) assert.ok(pg.text.includes(words), words);
  assert.ok((await page('/account', head.session)).text.includes('The Head DM account cannot be deleted from here.'));
  assert.ok((await page('/account', seller.session)).text.includes('You sell campaigns in the store.'));
});

test('the download has everything the account made, and nobody else\'s notes', { skip }, async () => {
  const r = await call('exportAccount', leaver.session, []);
  for (const words of ['campaigns/leaving-realm/README.txt', 'Wandering Wren', 'My own note', 'campaigns/leaving-realm/files/campaign-files/npc/p.webp', 'campaigns/leaving-realm/files/backgrounds/hero', 'files/homebrew-banners/b1']) assert.ok(r.text.includes(words), words);
  assert.ok(!r.text.includes('Not for the DM'), 'a player\'s private note in their campaign is not in it');
});

test('refused: without DELETE, the Head DM, a seller, a subscription that cannot be cancelled', { skip }, async () => {
  assert.ok((await call('deleteMyAccount', leaver.session, ['delete'])).text.includes('Type DELETE in capital letters'));
  assert.ok((await call('deleteMyAccount', head.session, ['DELETE'])).text.includes('The Head DM account cannot be deleted'));
  assert.ok((await call('deleteMyAccount', seller.session, ['DELETE'])).text.includes('You sell campaigns in the store'));
  assert.ok((await call('deleteMyAccount', payer.session, ['DELETE'])).text.includes('could not be cancelled'));
  for (const u of [leaver, head, seller, payer]) assert.equal(await exists(u), true, 'still there');
});

test('deleting: the account, its campaigns and every picture go; others are untouched', { skip }, async () => {
  const r = await call('deleteMyAccount', leaver.session, ['DELETE']);
  assert.ok(r.redirect?.startsWith('/?deleted=1') || r.status === 303 || r.text.includes('deleted=1'), 'sent to the front page');
  assert.equal(await exists(leaver), false, 'the account is gone');
  assert.equal((await admin.from('campaigns').select('id').eq('id', C.id).maybeSingle()).data, null, 'and its campaign');
  assert.equal(((await admin.from('characters').select('id').eq('owner', leaver.id)).data ?? []).length, 0, 'and its characters, in other campaigns too');
  assert.ok(!((await admin.storage.from('campaign-files').list(`${C.id}/npc`)).data ?? []).some((o) => o.id), 'the campaign\'s pictures are gone');
  assert.ok(!((await admin.storage.from('backgrounds').list(`campaign/${C.id}`)).data ?? []).some((o) => o.name === 'hero'), 'and its banner');
  assert.ok(!((await admin.storage.from('backgrounds').list(`user/${leaver.id}/banners`)).data ?? []).some((o) => o.id), 'and the account\'s own pictures');
  assert.equal(await exists(other), true, 'the player in it is untouched');
  assert.ok((await admin.from('campaigns').select('id').eq('id', O.id).maybeSingle()).data, 'and so is their campaign');
});
