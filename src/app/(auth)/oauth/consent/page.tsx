import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { ConsentForm } from '@/features/connector/ConsentForm';

export const metadata = { title: 'Connect your AI' };

// Connect your AI: an AI app (Claude, ChatGPT...) asks to work on this account. Supabase Auth's
// OAuth 2.1 server sends the DM here with an authorization_id; they sign in if needed and decide.
export default async function Consent({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: id = '' } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=' + encodeURIComponent('/oauth/consent?authorization_id=' + encodeURIComponent(id)));
  const { data, error } = id ? await supabase.auth.oauth.getAuthorizationDetails(id) : { data: null, error: true };
  // already allowed before: straight back to the AI app
  if (data && 'redirect_url' in data && !('authorization_id' in data)) redirect(data.redirect_url);
  const details = data && 'client' in data ? (data as OAuthAuthorizationDetails) : null;
  return (
    <main className="hub center">
      <div className="box" style={{ textAlign: 'left', width: '100%', maxWidth: 480 }}>
        <p><Link className="hub-name" href="/">Dungeons by Bryce</Link></p>
        <h1 style={{ fontSize: '1.5rem' }}>Connect your AI</h1>
        {error || !details ? (
          <div className="panel"><p>This request has expired or is not valid. Start connecting again from your AI app.</p></div>
        ) : (
          <div className="panel">
            <p><b>{details.client.name || 'An AI app'}</b> wants to work in your Dungeons by Bryce account ({user.email}).</p>
            <p>It will be able to:</p>
            <ul>
              <li>look at your game systems, the official fifth edition rules, and your homebrew</li>
              <li>create <b>draft</b> homebrew for you (species, classes, spells, items, monsters and more)</li>
            </ul>
            <p>It will <b>not</b> be able to change or delete anything, touch your campaigns, or show anything to your players. Drafts wait for you: open one, check it, and save it to finish it.</p>
            <p className="dim">You can disconnect it at any time on your Account page.</p>
            <ConsentForm authorizationId={details.authorization_id} />
          </div>
        )}
        <p className="dim"><Link href="/help/connect-your-ai">How connecting your AI works</Link></p>
      </div>
    </main>
  );
}
