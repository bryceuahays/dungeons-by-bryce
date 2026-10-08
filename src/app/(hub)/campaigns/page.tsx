import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { themeStyle } from '@/lib/campaign';
import { safeFontHref } from '@/lib/fonts';
import { JoinForm } from '@/components/HubForms';
import type { Campaign } from '@/lib/types';
import { COMMISSION_TIERS, tierPrice } from '@/config/commissions';

export const metadata = { title: 'My campaigns' };

export default async function Campaigns() {
  const { supabase, user } = await requireViewer();
  // Row-level security returns the campaigns this account runs or has joined.
  // The campaigns row holds the title and tagline for the current phase, which is all a
  // player can read. A campaign's DM also gets its real ones (campaign_faces).
  const [{ data }, { data: faces }, { data: worlds }] = await Promise.all([
    supabase.from('campaigns').select('*').order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title, tagline').eq('phase', ''),
    supabase.from('worlds').select('id, name').eq('owner_id', user.id),
  ]);
  const worldName = new Map((worlds ?? []).map((w) => [w.id, w.name]));
  const campaigns = (data ?? []) as Campaign[];
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f]));
  const mine = campaigns.filter((c) => c.owner_id === user.id);
  const joined = campaigns.filter((c) => c.owner_id !== user.id);
  const fonts = Array.from(new Set(campaigns.map((c) => safeFontHref(c.theme?.fonts?.href)).filter(Boolean)));

  const card = (c: Campaign) => {
    const face = real.get(c.id);
    return (
      <Link key={c.id} className="ccard" href={'/c/' + c.slug} style={themeStyle(c.theme)}>
        <b>{face?.title ?? c.title}</b>
        <span>{face?.tagline ?? c.tagline}</span>
        {face ? <i>You run this campaign{face.title !== c.title ? `. Players see: ${c.title}` : ''}{(c as any).world_id && worldName.get((c as any).world_id) ? `. World: ${worldName.get((c as any).world_id)}` : ''}</i> : null}
      </Link>
    );
  };

  return (
    <>
      {fonts.map((href) => <link key={href} rel="stylesheet" href={href} precedence="default" />)}
      <h1>My campaigns</h1>

      <h2>Campaigns you run</h2>
      {mine.length ? <div className="cards">{mine.map(card)}</div>
        : <div className="panel narrow"><p className="dim">You are not running a campaign yet. Anyone can start one: you are its DM, and you invite your own players.</p></div>}
      <p><Link className="button quiet" href="/new-campaign">Create a new campaign</Link></p>
      <div className="cards">
        <Link className="ccard service" href="/custom"><b>Have Bryce build it</b><span>Send your notes and references and have your campaign set up for you, with a look made for it, then handed over to your account.</span><i>From {tierPrice(COMMISSION_TIERS[0])}</i></Link>
        <Link className="ccard service" href="/store"><b>Start from a ready-made campaign</b><span>Campaigns and homebrew packs in the store. A bought campaign does not use up your free plan&apos;s one campaign.</span><i>Store</i></Link>
      </div>

      <h2>Campaigns you play in</h2>
      {joined.length ? <div className="cards">{joined.map(card)}</div>
        : <div className="panel narrow"><p className="dim">You are not in a campaign yet. Enter the invite code your DM gave you.</p></div>}

      <h2>Join a campaign</h2>
      <div className="panel narrow"><JoinForm /></div>
    </>
  );
}
