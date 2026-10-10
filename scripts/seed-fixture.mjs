// Loads the dummy campaign the automated tests run against (tests/fixtures/dummy-campaign.mjs)
// into the database, owned by the Head DM, and uploads its small generated pictures.
//
//   node scripts/seed-fixture.mjs
//
// Safe to run again: the campaign is found by its address and its tabs, blocks, sessions
// and pictures are replaced with the fixture. Memberships and characters are left alone
// (the tests clean up their own). It always goes back to the first stage.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { DUMMY } from '../tests/fixtures/dummy-campaign.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');

const db = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = 'campaign-media';
const must = ({ data, error }, what) => { if (error) throw new Error(what + ': ' + error.message); return data; };

const { faces, ...campaignRow } = DUMMY.campaign;
const head = must(await db.from('profiles').select('id').eq('role', 'head').order('created_at').limit(1), 'head dm');
if (!head.length) throw new Error('There is no Head DM account yet. Sign up as the site owner first.');

// found by any of its addresses, whichever stage it was left in
const known = must(await db.from('campaign_faces').select('campaign_id').in('slug', faces.map((f) => f.slug)).limit(1), 'find campaign');
let id = known[0]?.campaign_id;
if (id) must(await db.from('campaigns').update({ status: campaignRow.status, phases: campaignRow.phases, phase: campaignRow.phase }).eq('id', id), 'update campaign');
else id = must(await db.from('campaigns').insert({ ...campaignRow, owner_id: head[0].id }).select('id').single(), 'create campaign').id;
must(await db.from('campaign_faces').upsert(faces.map((f) => ({ ...f, campaign_id: id })), { onConflict: 'campaign_id,phase' }), 'titles per stage');

const oldMedia = must(await db.from('media').select('path').eq('campaign_id', id), 'old pictures');
for (const table of ['sections', 'content', 'sessions', 'media']) must(await db.from(table).delete().eq('campaign_id', id), 'clear ' + table);
const put = async (table, rows) => { must(await db.from(table).insert(rows.map((r) => ({ ...r, campaign_id: id }))), 'insert ' + table); console.log(`${table}: ${rows.length}`); };
await put('sections', DUMMY.sections);
await put('content', DUMMY.content);
await put('sessions', DUMMY.sessions.map((s) => ({ ...s, state: {} })));

// Pictures live under the campaign's id, so no storage path names the campaign.
const media = DUMMY.media.map(({ color, ...m }) => ({ ...m, path: id + '/' + m.path, color }));
await put('media', media.map(({ color, ...m }) => m));
for (const m of media) {
  const body = await sharp({ create: { width: 64, height: 64, channels: 3, background: m.color } }).jpeg({ quality: 60 }).toBuffer();
  const { error } = await db.storage.from(BUCKET).upload(m.path, body, { contentType: m.content_type, upsert: true, cacheControl: '3600' });
  if (error) throw new Error('upload ' + m.path + ': ' + error.message);
}
const stale = oldMedia.map((m) => m.path).filter((p) => !media.some((m) => m.path === p));
if (stale.length) must(await db.storage.from(BUCKET).remove(stale), 'remove old pictures');
console.log(`pictures: ${media.length} uploaded`);
console.log(`Dummy campaign ready: "${faces.find((f) => f.phase === 'before').title}" now, "${campaignRow.title}" after its reveal.`);
