import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile } from './types';

// The signed-in user and their profile, or null. Cached per request.
//
// getClaims() checks the session token's signature on this server (the project signs
// tokens with a public-key algorithm), so it does not cost a network trip to Supabase
// the way getUser() does. The profile query that follows still goes through row-level
// security with that token, so a forged or expired token gets nothing.
//
// Roles: an account is either the Head DM (the site owner) or an ordinary account.
// Being the DM of a campaign is not an account role: it comes from owning that campaign
// (see getCampaign), so the same person is a DM in one campaign and a player in another.
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const user = { id: String(claims.sub), email: typeof claims.email === 'string' ? claims.email : '' };
  const { data: profile } = await supabase.from('profiles').select('id, display_name, email, role, hub_bg').eq('id', user.id).maybeSingle();
  const p: Profile = profile ?? { id: user.id, display_name: '', email: user.email, role: 'player', hub_bg: {} };
  return { supabase, user, profile: p, isHead: p.role === 'head' };
});

export async function requireViewer() {
  const v = await getViewer();
  if (!v) redirect('/sign-in');
  return v;
}

export async function requireHead() {
  const v = await requireViewer();
  if (!v.isHead) redirect('/campaigns');
  return v;
}
