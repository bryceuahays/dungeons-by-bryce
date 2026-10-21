import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { originOf, safeNext } from '@/features/sign-in-with/providers';

// Back from Google, Discord and the like (src/features/sign-in-with): turn the one-time code into a session,
// then go where the person was going (a campaign invite, say).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = originOf(request.headers);
  const next = safeNext(url.searchParams.get('next'));
  const back = (message: string) => NextResponse.redirect(`${origin}/sign-in?next=${encodeURIComponent(next)}&error=${encodeURIComponent(message)}`);
  const code = url.searchParams.get('code');
  // they pressed Cancel at the provider, or the provider refused
  if (!code) return back(url.searchParams.get('error') === 'access_denied' ? 'Signing in was cancelled.' : 'Signing in did not finish. Try again, or use your email.');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return back('Signing in did not finish. Try again, or use your email.');

  // A new account's name: the sign-up form fills in display_name, a provider gives its own (Google's full
  // name, Discord's display name), so the account would otherwise be named after its email. Only for an
  // account made just now, so a name someone chose is never overwritten.
  const u = data.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = [meta.display_name, meta.full_name, meta.name, meta.global_name, meta.user_name, meta.preferred_username]
    .map((v) => String(v ?? '').trim()).find(Boolean);
  if (name && Date.now() - new Date(u.created_at).getTime() < 5 * 60_000) {
    const { data: p } = await supabase.from('profiles').select('display_name').eq('id', u.id).maybeSingle();
    if (p && p.display_name === (u.email ?? '').split('@')[0]) await supabase.from('profiles').update({ display_name: name.slice(0, 60) }).eq('id', u.id);
  }
  return NextResponse.redirect(origin + next);
}
