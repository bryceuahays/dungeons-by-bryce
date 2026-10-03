// Loads seed/to-be-a-god.json (written by scripts/extract.mjs) into Supabase and
// uploads the race portraits and videos to the private bucket.
//
//   node scripts/seed.mjs            first-time seed; refuses to touch an existing campaign
//   node scripts/seed.mjs --reset    replace the campaign's content, rules, sessions and media
//                                    with the source again (memberships and characters are kept;
//                                    edits made in the content editor are lost)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, DM_EMAIL } = process.env;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');

const db = createClient(url, key, { auth: { persistSession: false } });
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'to-be-a-god.json'), 'utf8'));
const reset = process.argv.includes('--reset');
const BUCKET = 'campaign-media';
const must = ({ data, error }, what) => { if (error) throw new Error(what + ': ' + error.message); return data; };
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

if (DM_EMAIL) {
  must(await db.from('app_config').upsert({ key: 'dm_email', value: DM_EMAIL.trim().toLowerCase() }), 'dm email');
  // if the DM signed up before this ran, fix their role
  must(await db.from('profiles').update({ role: 'dm' }).ilike('email', DM_EMAIL.trim()), 'dm role');
}

let existing = must(await db.from('campaigns').select('id, phase').eq('slug', seed.campaign.slug).maybeSingle(), 'find campaign');
if (existing && !reset) {
  console.log(`Campaign "${seed.campaign.slug}" already exists. Nothing changed. Use --reset to replace its content from source/.`);
  process.exit(0);
}
if (existing) {
  must(await db.from('campaigns').update({ ...seed.campaign, phase: existing.phase }).eq('id', existing.id), 'update campaign');
} else {
  existing = must(await db.from('campaigns').insert(seed.campaign).select('id, phase').single(), 'create campaign');
}
const campaign_id = existing.id;

for (const table of ['sections', 'content', 'rules', 'sessions', 'media']) {
  must(await db.from(table).delete().eq('campaign_id', campaign_id), 'clear ' + table);
}
const put = async (table, rows) => {
  for (const part of chunks(rows.map((r) => ({ ...r, campaign_id })), 200)) must(await db.from(table).insert(part), 'insert ' + table);
  console.log(`${table}: ${rows.length}`);
};
await put('sections', seed.sections);
await put('content', seed.content);
await put('rules', seed.rules);
await put('sessions', seed.sessions.map((s) => ({ ...s, state: {} })));
await put('media', seed.media.map(({ file, ...m }) => m));

let up = 0;
for (const m of seed.media) {
  const body = fs.readFileSync(path.join(ROOT, m.file));
  const { error } = await db.storage.from(BUCKET).upload(m.path, body, { contentType: m.content_type, upsert: true, cacheControl: '3600' });
  if (error) throw new Error('upload ' + m.path + ': ' + error.message);
  up++;
}
console.log(`uploaded ${up} media files to the private bucket`);
