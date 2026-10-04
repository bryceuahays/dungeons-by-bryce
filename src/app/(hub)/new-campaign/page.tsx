import { requireViewer } from '@/lib/auth';
import { NewCampaignForm } from '@/components/HubForms';
import { getPlan, remaining } from '@/lib/entitlements';
import { UpgradeHint } from '@/components/UpgradeHint';

export const metadata = { title: 'New campaign' };

export default async function NewCampaign() {
  const { supabase, user } = await requireViewer();
  const plan = await getPlan();
  // campaigns you run or play in: the ones whose character rules you may copy
  const [{ data }, { data: faces }] = await Promise.all([
    supabase.from('campaigns').select('id, title').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''),
  ]);
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f.title]));
  return (
    <>
      <h1>New campaign</h1>
      <div className="panel"><p className="dim">You will be the DM of this campaign. You add its pages (or paste them in below), invite your own players with a code, and decide what they can see. Only you and your players can open it. The person who runs this site (the Head DM) can also look inside a campaign when they need to, for example to help with a problem or check a report.</p></div>
      {remaining(plan, 'campaigns') <= 0 ? <UpgradeHint feature="campaigns" /> : null}
      <NewCampaignForm pro={plan.pro} campaigns={(data ?? []).map((c) => ({ id: c.id, title: real.get(c.id) ?? c.title }))} />
    </>
  );
}
