import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { themeStyle } from '@/lib/campaign';
import { safeFontHref } from '@/lib/fonts';
import { JoinForm } from '@/components/HubForms';
import type { Campaign } from '@/lib/types';

export const metadata = { title: 'My campaigns' };

export default async function Campaigns() {
  const { supabase, profile } = await requireViewer();
  // RLS returns only campaigns this account belongs to (or all of them for the DM).
  const isDm = profile.role === 'dm';
  // The campaigns row holds the title and tagline for the current phase, which is all a
  // player can read. The DM also gets the real ones (campaign_faces is DM-only).
  const [{ data }, { data: faces }] = await Promise.all([
    supabase.from('campaigns').select('*').order('created_at'),
    isDm ? supabase.from('campaign_faces').select('campaign_id, title, tagline').eq('phase', '') : Promise.resolve({ data: [] as { campaign_id: string; title: string; tagline: string }[] }),
  ]);
  const campaigns = (data ?? []) as Campaign[];
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f]));
  const fonts = Array.from(new Set(campaigns.map((c) => safeFontHref(c.theme?.fonts?.href)).filter(Boolean)));
  return (
    <>
      {fonts.map((href) => <link key={href} rel="stylesheet" href={href} precedence="default" />)}
      <h1>My campaigns</h1>
      {campaigns.length ? (
        <div className="cards">
          {campaigns.map((c) => (
            <Link key={c.id} className="ccard" href={'/c/' + c.slug} style={themeStyle(c.theme)}>
              <b>{real.get(c.id)?.title ?? c.title}</b>
              <span>{real.get(c.id)?.tagline ?? c.tagline}</span>
              {isDm ? <i>You run this campaign{real.get(c.id) && real.get(c.id)!.title !== c.title ? `. Players see: ${c.title}` : ''}</i> : null}
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel narrow"><p className="dim">{isDm ? 'No campaigns yet. Create one to get started.' : 'You are not in a campaign yet. Enter the invite code your DM gave you.'}</p></div>
      )}
      {isDm ? (
        <p><Link className="button quiet" href="/new-campaign">Create a new campaign</Link></p>
      ) : (
        <>
          <h2>Join a campaign</h2>
          <div className="panel narrow"><JoinForm /></div>
        </>
      )}
    </>
  );
}
