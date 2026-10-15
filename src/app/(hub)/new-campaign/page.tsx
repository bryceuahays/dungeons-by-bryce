import { requireViewer } from '@/lib/auth';
import { NewCampaignForm } from '@/components/HubForms';
import { mySystems } from '@/features/systems/data';
import { getPlan, remaining } from '@/lib/entitlements';
import { UpgradeHint } from '@/components/UpgradeHint';

export const metadata = { title: 'New campaign' };

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ world?: string }> }) {
  const { world = '' } = await searchParams;
  const { supabase, user } = await requireViewer();
  const plan = await getPlan();
  const [{ data: packs }, { data: worlds }] = await Promise.all([
    supabase.from('packs').select('id, name, description, free').eq('official', true).order('created_at'),
    supabase.from('worlds').select('id, name, official').order('official', { ascending: false }).order('name'),
  ]);
  return (
    <>
      <h1>New campaign</h1>
      <div className="panel"><p className="dim">You will be the DM of this campaign. You add its pages (or paste them in below), invite your own players with a code, and decide what they can see. Only you and your players can open it. The person who runs this site (the Head DM) can also look inside a campaign when they need to, for example to help with a problem or check a report.</p></div>
      {remaining(plan, 'campaigns') <= 0 ? <UpgradeHint feature="campaigns" /> : null}
      <NewCampaignForm pro={plan.pro} worlds={(worlds ?? []).map((w) => ({ id: w.id, name: w.official ? w.name + ' (ready-made)' : w.name }))} world={world} packs={packs ?? []} systems={await mySystems(supabase, user.id)} />
    </>
  );
}
