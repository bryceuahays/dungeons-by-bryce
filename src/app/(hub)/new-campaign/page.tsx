import { requireDm } from '@/lib/auth';
import { NewCampaignForm } from '@/components/HubForms';

export const metadata = { title: 'New campaign' };

export default async function NewCampaign() {
  const { supabase } = await requireDm();
  const { data } = await supabase.from('campaigns').select('id, title').order('created_at');
  return (
    <>
      <h1>New campaign</h1>
      <p className="dim">This creates an empty campaign with its own look. You add its pages in the content editor, and invite players from Manage.</p>
      <NewCampaignForm campaigns={data ?? []} />
    </>
  );
}
