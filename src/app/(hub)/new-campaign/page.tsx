import { requireViewer } from '@/lib/auth';
import { NewCampaignForm } from '@/components/HubForms';
import { getPlan, remaining } from '@/lib/entitlements';
import { UpgradeHint } from '@/components/UpgradeHint';
import Link from 'next/link';
import { COMMISSION_TIERS, tierPrice } from '@/config/commissions';

export const metadata = { title: 'New campaign' };

export default async function NewCampaign() {
  const { supabase } = await requireViewer();
  const plan = await getPlan();
  const { data: packs } = await supabase.from('packs').select('id, name, description, free').eq('official', true).order('created_at');
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
      <NewCampaignForm pro={plan.pro} packs={packs ?? []} />
    </>
  );
}
