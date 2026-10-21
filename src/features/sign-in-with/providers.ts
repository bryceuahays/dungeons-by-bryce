import 'server-only';
// Sign in with Google, Discord and the like (Supabase Auth's own providers). Which ones show is whatever is
// switched on in the Supabase dashboard (Authentication -> Sign In / Providers): Supabase reports that, so a
// button never appears for a provider that would fail, and turning one on needs no code change.

// the providers offered, in this order, with the name on the button
export const PROVIDERS = [
  ['google', 'Google'], ['discord', 'Discord'], ['apple', 'Apple'], ['azure', 'Microsoft'], ['github', 'GitHub'], ['twitch', 'Twitch'], ['facebook', 'Facebook'],
] as const;
export type Provider = (typeof PROVIDERS)[number][0];

export async function enabledProviders(): Promise<Provider[]> {
  try {
    const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/settings', {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      next: { revalidate: 60 }, // a provider switched on shows within a minute
    });
    if (!res.ok) return [];
    const external = ((await res.json()) as { external?: Record<string, boolean> }).external ?? {};
    return PROVIDERS.map(([p]) => p).filter((p) => external[p]);
  } catch {
    return []; // Supabase unreachable: the email form still works
  }
}

// where to come back to after the provider: this site's own address as the browser sees it (a preview
// deploy comes back to itself). Supabase only accepts addresses on its Redirect URLs list.
export function originOf(h: Headers) {
  const host = h.get('x-forwarded-host')?.split(',')[0]?.trim() || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const safeNext = (v: unknown) => {
  const s = String(v || '');
  return s.startsWith('/') && !s.startsWith('//') ? s : '/campaigns';
};
