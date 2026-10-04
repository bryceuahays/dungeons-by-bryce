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
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const user = { id: String(claims.sub), email: typeof claims.email === 'string' ? claims.email : '' };
  const { data: profile } = await supabase.from('profiles').select('id, display_name, email, role').eq('id', user.id).maybeSingle();
  const p: Profile = profile ?? { id: user.id, display_name: '', email: user.email, role: 'player' };
  return { supabase, user, profile: p };
});

export async function requireViewer() {
  const v = await getViewer();
  if (!v) redirect('/sign-in');
  return v;
}

export async function requireDm() {
  const v = await requireViewer();
  if (v.profile.role !== 'dm') redirect('/campaigns');
  return v;
}
