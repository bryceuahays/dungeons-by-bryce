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
  const { data } = await supabase.from('campaigns').select('*').order('created_at');
  const campaigns = (data ?? []) as Campaign[];
  const isDm = profile.role === 'dm';
  const fonts = Array.from(new Set(campaigns.map((c) => safeFontHref(c.theme?.fonts?.href)).filter(Boolean)));
  return (
    <>
      {fonts.map((href) => <link key={href} rel="stylesheet" href={href} precedence="default" />)}
      <h1>My campaigns</h1>
      {campaigns.length ? (
        <div className="cards">
          {campaigns.map((c) => (
            <Link key={c.id} className="ccard" href={'/c/' + c.slug} style={themeStyle(c.theme)}>
              <b>{c.title}</b>
              <span>{c.tagline}</span>
              {isDm ? <i>You run this campaign</i> : null}
            </Link>
          ))}
        </div>
      ) : (
        <p className="dim">{isDm ? 'No campaigns yet. Create one to get started.' : 'You are not in a campaign yet. Enter the invite code your DM gave you.'}</p>
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
