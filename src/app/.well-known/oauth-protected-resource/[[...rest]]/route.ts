// Connect your AI: where an AI app learns how to sign in to the connector (RFC 9728). The sign-in
// itself is Supabase Auth's OAuth 2.1 server; the consent screen is /oauth/consent.
import { authServer, resourceOf } from '@/features/connector/server';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json({
    resource: resourceOf(origin),
    authorization_servers: [authServer()],
    scopes_supported: ['openid', 'email', 'profile'],
    bearer_methods_supported: ['header'],
    resource_name: 'Dungeons by Bryce',
    resource_documentation: origin + '/help/connect-your-ai',
  }, { headers: { 'access-control-allow-origin': '*' } });
}
