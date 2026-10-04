// Shared setup for the section 11 tests. The tests run against the real Supabase
// project with throwaway accounts (…@test.dungeons.invalid) that are deleted afterwards.
// They never use Bryce's own account.

import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

export const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const SITE = (process.env.TEST_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const SLUG = 'to-be-a-god';
export const BUCKET = 'campaign-media';
export const DOMAIN = '@test.dungeons.invalid';

export const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
export const anonClient = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

// A throwaway account, signed in with its own token (so RLS applies to it).
export async function makeUser(label, role = 'player') {
  const email = `${label}-${crypto.randomBytes(4).toString('hex')}${DOMAIN}`;
  const password = crypto.randomBytes(18).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Test ' + label } });
  if (error) throw error;
  if (role === 'dm') {
    const r = await admin.from('profiles').update({ role: 'dm' }).eq('id', data.user.id);
    if (r.error) throw r.error;
  }
  const client = anonClient();
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, email, password, client, session: s.data.session };
}

export async function cleanup() {
  for (let page = 1; ; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const mine = (data?.users ?? []).filter((u) => (u.email || '').endsWith(DOMAIN));
    for (const u of mine) await admin.auth.admin.deleteUser(u.id);
    if (!data || data.users.length < 200) break;
  }
  await admin.from('invites').delete().like('code', 'TEST%');
}

// The campaign, found by its real address. The row's own slug and title are the ones
// for the current phase (what a player is given).
export async function campaign() {
  const face = await admin.from('campaign_faces').select('campaign_id').eq('slug', SLUG).single();
  if (face.error) throw face.error;
  const { data, error } = await admin.from('campaigns').select('*').eq('id', face.data.campaign_id).single();
  if (error) throw error;
  return data;
}

export async function invite(campaignId, uses = 5) {
  const code = 'TEST' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const { error } = await admin.from('invites').insert({ campaign_id: campaignId, code, uses_left: uses });
  if (error) throw error;
  return code;
}

// The cookie the app's server reads, built from a real session, so the tests can fetch
// pages exactly as that signed-in browser would.
export function cookieFor(session) {
  const ref = new URL(URL_).hostname.split('.')[0];
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const name = `sb-${ref}-auth-token`;
  const parts = [];
  for (let i = 0, n = 0; i < value.length; i += 3180, n++) parts.push(`${name}.${n}=${value.slice(i, i + 3180)}`);
  return parts.length === 1 ? `${name}=${value}` : parts.join('; ');
}

export async function page(pathname, session, extraCookie = '') {
  const res = await fetch(SITE + pathname, { headers: { cookie: (session ? cookieFor(session) : '') + (extraCookie ? '; ' + extraCookie : '') }, redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location'), text: res.status < 300 ? await res.text() : '' };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
