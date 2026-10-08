import { requireViewer } from '@/lib/auth';
import { NewCampaignForm } from '@/components/HubForms';
import { getPlan, remaining } from '@/lib/entitlements';
import { UpgradeHint } from '@/components/UpgradeHint';
import Link from 'next/link';
import { COMMISSION_TIERS, tierPrice } from '@/config/commissions';

export const metadata = { title: 'New campaign' };

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ world?: string }> }) {
  const { world = '' } = await searchParams;
  const { supabase, user } = await requireViewer();
  const plan = await getPlan();
  // campaigns you run or play in: the ones whose character rules you may copy
  const [{ data }, { data: faces }, { data: packs }, { data: worlds }] = await Promise.all([
    supabase.from('campaigns').select('id, title').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''),
    supabase.from('packs').select('id, name, description, free').eq('official', true).order('created_at'),
    supabase.from('worlds').select('id, name, official').order('official', { ascending: false }).order('name'),
  ]);
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f.title]));
  return (
    <>
      <h1>New campaign</h1>
      <div className="cards choose">
        <a className="ccard" href="#build" aria-current="true"><b>Build it myself</b><span>Fill in the form below. It takes a couple of minutes, and you can paste in what you have already written.</span><i>Free</i></a>
        <Link className="ccard service" href="/custom"><b>Have Bryce build it</b><span>Send your notes and references. I set the campaign up for you, with a look made for it, and hand it over.</span><i>From {tierPrice(COMMISSION_TIERS[0])}</i></Link>
      </div>
      <span id="build" />
      <div className="panel"><p className="dim">You will be the DM of this campaign. You add its pages (or paste them in below), invite your own players with a code, and decide what they can see. Only you and your players can open it. The person who runs this site (the Head DM) can also look inside a campaign when they need to, for example to help with a problem or check a report.</p></div>
      {remaining(plan, 'campaigns') <= 0 ? <UpgradeHint feature="campaigns" /> : null}
      <NewCampaignForm pro={plan.pro} worlds={(worlds ?? []).map((w) => ({ id: w.id, name: w.official ? w.name + ' (ready-made)' : w.name }))} world={world} packs={packs ?? []} campaigns={(data ?? []).map((c) => ({ id: c.id, title: real.get(c.id) ?? c.title }))} />
    </>
  );
}
