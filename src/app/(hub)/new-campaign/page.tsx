import { requireViewer } from '@/lib/auth';
import { NewCampaignForm } from '@/components/HubForms';

export const metadata = { title: 'New campaign' };

export default async function NewCampaign() {
  const { supabase } = await requireViewer();
  // campaigns you run or play in: the ones whose character rules you may copy
  const [{ data }, { data: faces }] = await Promise.all([
    supabase.from('campaigns').select('id, title').order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''),
  ]);
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f.title]));
  return (
    <>
      <h1>New campaign</h1>
      <div className="panel"><p className="dim">You will be the DM of this campaign. You add its pages (or paste them in below), invite your own players with a code, and decide what they can see.</p></div>
      <NewCampaignForm campaigns={(data ?? []).map((c) => ({ id: c.id, title: real.get(c.id) ?? c.title }))} />
    </>
  );
}
