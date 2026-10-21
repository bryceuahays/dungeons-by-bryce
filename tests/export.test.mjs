// Download a campaign before deleting it (Bryce, 20 October 2026). The owner gets everything in the
// campaign, laid out as files; nobody else gets anything. Deleting still works afterwards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { exportFiles, safeName } from '../src/features/campaign-export/model.ts';
import { ROOT, SITE, admin, cleanup, cookieFor, makeUser, page } from './helpers.mjs';

const rnd = () => Math.random().toString(36).slice(2, 8);

// ------------------------------------------------------------------ the layout

test('the download is laid out for a person first', () => {
  const b = exportFiles({
    campaign: { id: 'c1', title: 'The Hollow <Crown>', owner_id: 'secret-owner', settings: {} },
    sections: [{ slug: 'overview', title: 'Overview' }, { slug: 'overview-2', title: 'Overview' }],
    content: [{ section: 'overview', kind: 'html', title: 'Intro', visibility: 'player', body: { html: '<p>Welcome</p>' } }, { section: 'overview', kind: 'secret', visibility: 'dm', body: { html: '<p>The truth</p>' } }],
    characters: [{ id: 'k1', data: { name: 'Mira Vale' } }, { id: 'k2', data: { name: 'Mira Vale' } }],
    entries: [{ id: 'e1', kind: 'npc', title: 'Grim' }, { id: 'e2', kind: 'lore', title: 'The Vale' }],
    secrets: [{ entry_id: 'e1', data: { notes: 'Serves the cult' } }],
    sessions: [{ number: 1, title: 'The road' }], attached: [], members: [{ user_id: 'u1', display_name: 'Tobin' }],
    notes: [{ user_id: 'u1', kind: 'secret', title: 'Your dream' }], faces: [], links: [{ zip: 'files/campaign-files/npc/a.webp', url: 'https://x/y' }],
  });
  assert.match(b.name, /^the-hollow-crown-\d{4}-\d{2}-\d{2}\.zip$/);
  assert.deepEqual(Object.keys(b.text).sort(), ['README.txt', 'campaign.json', 'characters/c-mira-vale-2.json', 'characters/c-mira-vale.json', 'entries/lore.json', 'entries/npc.json', 'homebrew.json', 'pages.json', 'pages/overview-2.html', 'pages/overview.html', 'players.json', 'secrets.json', 'sessions.json']);
  assert.ok(!b.text['campaign.json'].includes('secret-owner'), 'no account ids of the owner');
  assert.ok(b.text['pages/overview.html'].includes('<p>Welcome</p>') && b.text['pages/overview.html'].includes('DM only'), 'DM-only blocks are kept, and marked');
  assert.ok(b.text['pages/overview.html'].includes('<title>Overview</title>'));
  assert.equal(JSON.parse(b.text['entries/npc.json'])[0].secret.notes, 'Serves the cult', 'the DM notes go with each entry');
  assert.equal(JSON.parse(b.text['secrets.json'])[0].for, 'Tobin');
  assert.deepEqual(b.files, [{ zip: 'files/campaign-files/npc/a.webp', url: 'https://x/y' }]);
  assert.equal(safeName('  Ünïcode Ünder  /Hill '), 'unicode-under-hill');
  assert.equal(safeName(''), 'untitled');
});

// ------------------------------------------------------------------ who gets it

// Call the server action the way the page's button does, as a given person.
const actionId = (() => {
  const file = path.join(ROOT, '.next/server/server-reference-manifest.json');
  if (!fs.existsSync(file)) return null;
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.entries(m.node ?? {}).find(([, v]) => v.exportedName === 'exportCampaign' && JSON.stringify(v).includes('manage/page'))?.[0] ?? null;
})();
async function download(slug, session) {
  const res = await fetch(`${SITE}/c/${slug}/manage`, { method: 'POST', headers: { 'Next-Action': actionId, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', cookie: cookieFor(session) }, body: JSON.stringify([slug]), redirect: 'manual' });
  return { status: res.status, text: await res.text() };
}

let owner, codm, player, C;
before(async () => {
  await cleanup();
  [owner, player] = await Promise.all([makeUser('exown'), makeUser('explr', { free: true })]);
  const slug = 'exp-' + rnd();
  C = (await owner.client.from('campaigns').insert({ slug, title: 'Export Realm', phases: [], phase: '' }).select('id, slug').single()).data;
  await owner.client.from('sections').insert({ campaign_id: C.id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' });
  await owner.client.from('content').insert({ campaign_id: C.id, section: 'overview', kind: 'html', key: 'k', sort: 10, title: 'Intro', visibility: 'player', hidden: false, body: { html: '<p>The vale awaits</p>' } });
  const code = 'TEST' + rnd().toUpperCase() + rnd().toUpperCase();
  await owner.client.from('invites').insert({ campaign_id: C.id, code });
  assert.equal((await player.client.rpc('join_campaign', { p_code: code })).error, null);
  const npc = await owner.client.from('entries').insert({ campaign_id: C.id, kind: 'npc', title: 'Grim Veyl', status: 'alive', vis: 'dm', vis_players: [], live: true, data: {} }).select('id').single();
  await owner.client.from('entry_secrets').upsert({ entry_id: npc.data.id, campaign_id: C.id, data: { notes: 'Serves the Hollow Choir' } });
  await owner.client.from('player_notes').insert({ campaign_id: C.id, user_id: player.id, kind: 'note', title: 'My own note', body: 'Do not trust Grim' }).select();
  // a picture, as the NPC tool stores one
  assert.equal((await admin.storage.from('campaign-files').upload(`${C.id}/npc/test.webp`, new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'image/webp' }), { contentType: 'image/webp' })).error, null);
  codm = await makeUser('excodm', { dmOf: C.id });
});
after(async () => {
  if (C) await admin.storage.from('campaign-files').remove([`${C.id}/npc/test.webp`]);
  await cleanup();
});

test('the owner gets everything in the campaign', { skip: !actionId && 'no local build to call the action through' }, async () => {
  const r = await download(C.slug, owner.session);
  assert.equal(r.status, 200);
  for (const words of ['README.txt', 'pages/overview.html', 'The vale awaits', 'Grim Veyl', 'Serves the Hollow Choir', 'files/campaign-files/npc/test.webp', 'export-realm-']) assert.ok(r.text.includes(words), words);
  assert.ok(!r.text.includes('Do not trust Grim'), 'a player\'s own private note is not in it');
  const url = r.text.match(/https:\/\/[^"]+npc\/test\.webp[^"]*/)?.[0]?.replace(/\\u0026/g, '&');
  assert.ok(url, 'with a link to the picture');
  const pic = await fetch(url);
  assert.equal(pic.status, 200, 'that works');
});

test('nobody else gets it: not a co-DM, not a player', { skip: !actionId && 'no local build to call the action through' }, async () => {
  for (const who of [codm, player]) {
    const r = await download(C.slug, who.session);
    assert.ok(r.text.includes('Only the person who created this campaign can download it.'), 'refused');
    assert.ok(!r.text.includes('Serves the Hollow Choir') && !r.text.includes('test.webp'), 'and given nothing');
  }
});

test('the owner is offered the download where the campaign is deleted', async () => {
  const pg = await page(`/c/${C.slug}/manage`, owner.session);
  assert.ok(pg.text.includes('Delete this campaign…') && pg.text.includes('Download a copy (.zip)'));
  const co = await page(`/c/${C.slug}/manage`, codm.session);
  assert.ok(!co.text.includes('Download a copy (.zip)'), 'a co-DM has no delete section and no download');
});
