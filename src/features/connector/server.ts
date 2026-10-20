import 'server-only';
// Connect your AI: who is calling. A DM's own AI app (Claude, ChatGPT...) signs in through Supabase
// Auth's OAuth 2.1 server and sends the access token it got. That token is an ordinary Supabase
// token for the DM, so a client made with it reads and writes exactly what the DM could, under
// the same row-level security; nothing here uses the service role.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Caller = { supabase: SupabaseClient; userId: string; clientId: string; origin: string };

const URL_ = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
// the address the AI app is sent to for signing in (Supabase serves its discovery document)
export const authServer = () => URL_().replace(/\/$/, '') + '/auth/v1';
export const resourceOf = (origin: string) => origin + '/api/mcp';
export const metadataOf = (origin: string) => origin + '/.well-known/oauth-protected-resource';

// the token's client_id: which AI app this is (the token itself was checked by getUser)
// the address the AI app used: behind a proxy or tunnel the request says it in the forwarded headers
export const originOf = (req: Request) => {
  const host = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return host ? `${proto || 'https'}://${host}` : new URL(req.url).origin;
};

const clientOf = (token: string) => {
  try { return String(JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()).client_id ?? ''); } catch { return ''; }
};

export async function callerOf(req: Request): Promise<Caller | null> {
  const token = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const supabase = createClient(URL_(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase, userId: data.user.id, clientId: clientOf(token), origin: originOf(req) };
}

// what an AI app gets without a valid token: where to sign in (RFC 9728)
export function unauthorized(req: Request) {
  const origin = originOf(req);
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'Sign in to Dungeons by Bryce to connect your AI.' }), {
    status: 401,
    headers: { 'content-type': 'application/json', 'WWW-Authenticate': `Bearer resource_metadata="${metadataOf(origin)}"` },
  });
}
