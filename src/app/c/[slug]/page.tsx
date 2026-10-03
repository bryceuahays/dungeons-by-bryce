import { redirect } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';

export default async function CampaignHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCampaign(slug);
  const first = ctx.sections[0];
  if (first) redirect(`/c/${slug}/${first.slug}`);
  return (
    <div className="cs-guide"><div className="wrap"><h2>{ctx.campaign.title}</h2><p className="lede">This campaign has no pages yet.</p></div></div>
  );
}
