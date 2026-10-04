import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';

export const metadata = { title: 'Join a campaign' };

// An invite link. Signed in: join and land on the campaign. Not signed in: create an
// account (or sign in) first, then come straight back here.
export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-up?next=' + encodeURIComponent('/join/' + clean));
  const { data: slug, error } = await viewer.supabase.rpc('join_campaign', { p_code: clean });
  if (slug && !error) redirect('/c/' + slug);
  const full = /full/i.test(error?.message || '');
  return (
    <main className="hub center">
      <div className="box" style={{ textAlign: 'left', maxWidth: 440 }}>
        <p><Link className="hub-name" href="/campaigns">Dungeons by Bryce</Link></p>
        <h1 style={{ fontSize: '1.5rem' }}>{full ? 'This campaign is full' : 'That invite did not work'}</h1>
        <div className="panel">
          <p>{full ? 'The campaign already has as many players as its plan allows. Ask your DM to make room or upgrade.' : 'The link may have expired, been used up, or been switched off. Ask your DM for a new one.'}</p>
          <p><Link className="button" href="/campaigns">Go to my campaigns</Link></p>
        </div>
      </div>
    </main>
  );
}
