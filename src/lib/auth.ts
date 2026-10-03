import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile } from './types';

// The signed-in user and their profile, or null. Cached per request.
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('id, display_name, email, role').eq('id', user.id).maybeSingle();
  const p: Profile = profile ?? { id: user.id, display_name: '', email: user.email ?? '', role: 'player' };
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
