// Loads seed/to-be-a-god.json (written by scripts/extract.mjs) into Supabase and
// uploads the race portraits and videos to the private bucket.
//
//   node scripts/seed.mjs            first-time seed; refuses to touch an existing campaign
//   node scripts/seed.mjs --reset    replace the campaign's tabs, content, rules and media
//                                    with the source again. Kept: memberships, invites,
//                                    characters, the current phase, and each session's
//                                    live tracker state. Lost: edits made in the content
//                                    editor and the run-sheet editor.

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

// The campaign is found by any of its addresses, whichever phase it is in.
const { faces, ...campaignRow } = seed.campaign;
const known = must(await db.from('campaign_faces').select('campaign_id').in('slug', faces.map((f) => f.slug)).limit(1), 'find campaign');
let existing = known.length ? must(await db.from('campaigns').select('id, phase').eq('id', known[0].campaign_id).single(), 'load campaign') : null;
if (existing && !reset) {
  console.log(`Campaign "${seed.campaign.slug}" already exists. Nothing changed. Use --reset to replace its content from source/.`);
  process.exit(0);
}
if (existing) {
  must(await db.from('campaigns').update({ status: campaignRow.status, phases: campaignRow.phases, theme: campaignRow.theme }).eq('id', existing.id), 'update campaign');
} else {
  existing = must(await db.from('campaigns').insert(campaignRow).select('id, phase').single(), 'create campaign');
}
const campaign_id = existing.id;

// title, address and tagline for each phase; the database keeps campaigns in step
must(await db.from('campaign_faces').upsert(faces.map((f) => ({ ...f, campaign_id })), { onConflict: 'campaign_id,phase' }), 'faces');

// sessions: keep each session's live tracker state
const oldSessions = must(await db.from('sessions').select('number, state').eq('campaign_id', campaign_id), 'old sessions');
const stateOf = new Map(oldSessions.map((s) => [s.number, s.state]));
const oldMedia = must(await db.from('media').select('path').eq('campaign_id', campaign_id), 'old media');

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
await put('sessions', seed.sessions.map((s) => ({ ...s, state: stateOf.get(s.number) ?? {} })));
// Objects live under the campaign's id, so no storage path or signed URL names the campaign.
const media = seed.media.map(({ file, ...m }) => ({ ...m, path: campaign_id + '/' + m.path, file }));
await put('media', media.map(({ file, ...m }) => m));

let up = 0;
for (const m of media) {
  const body = fs.readFileSync(path.join(ROOT, m.file));
  const { error } = await db.storage.from(BUCKET).upload(m.path, body, { contentType: m.content_type, upsert: true, cacheControl: '3600' });
  if (error) throw new Error('upload ' + m.path + ': ' + error.message);
  up++;
}
console.log(`uploaded ${up} media files to the private bucket`);
const stale = oldMedia.map((m) => m.path).filter((p) => !media.some((m) => m.path === p));
if (stale.length) {
  for (const part of chunks(stale, 100)) must(await db.storage.from(BUCKET).remove(part), 'remove old media');
  console.log(`removed ${stale.length} old media files`);
}

// Existing sheets: lift the private fields (see rules kind "sheet-private") out of the
// sheet into character_private, keeping whatever values they hold.
const priv = seed.rules.find((r) => r.kind === 'sheet-private')?.data.v ?? [];
if (priv.length) {
  const chars = must(await db.from('characters').select('id, data').eq('campaign_id', campaign_id), 'characters');
  let moved = 0;
  for (const ch of chars) {
    const data = { ...(ch.data || {}) }, lifted = {};
    priv.forEach((k) => { if (k in data) { lifted[k] = data[k]; delete data[k]; } });
    if (!Object.keys(lifted).length) continue;
    const old = must(await db.from('character_private').select('data').eq('character_id', ch.id).maybeSingle(), 'private');
    must(await db.from('character_private').upsert({ character_id: ch.id, data: { ...lifted, ...(old?.data ?? {}) } }), 'store private');
    must(await db.from('characters').update({ data }).eq('id', ch.id), 'strip private');
    moved++;
  }
  console.log(`private sheet fields moved out of ${moved} of ${chars.length} character sheets`);
}
