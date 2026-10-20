'use server';
// Connect your AI: the DM's answer on the consent screen, and taking access away again.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s) || /^[A-Za-z0-9_-]{8,128}$/.test(s);

// Allow or Deny: Supabase answers with where to send the browser back to the AI app
export async function decide(authorizationId: string, allow: boolean): Promise<{ error?: string }> {
  if (!isId(authorizationId)) return { error: 'That request is not valid. Start connecting again from your AI app.' };
  const supabase = await createClient();
  const res = allow
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (res.error || !res.data?.redirect_url) return { error: 'That did not work. The request may have expired: start connecting again from your AI app.' };
  redirect(res.data.redirect_url);
}

// Disconnect an AI app: its access ends at once
export async function disconnect(clientId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) return { error: 'It could not be disconnected. Try again in a moment.' };
  revalidatePath('/account');
  return {};
}
