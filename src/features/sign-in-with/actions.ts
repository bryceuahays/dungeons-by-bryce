'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { enabledProviders, originOf, safeNext, type Provider } from './providers';

// "Continue with Google": off to the provider, which sends the person back to /auth/callback. A first visit
// makes the account there and then; a later one signs in to it (an existing account with the same email is
// the same account: Supabase links them).
export async function continueWith(provider: Provider, next: string): Promise<{ error: string }> {
  if (!(await enabledProviders()).includes(provider)) return { error: 'That way of signing in is not switched on.' };
  const supabase = await createClient();
  const back = `${originOf(await headers())}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: back } });
  if (error || !data.url) return { error: 'Could not start signing in. Try again, or use your email.' };
  redirect(data.url);
}
