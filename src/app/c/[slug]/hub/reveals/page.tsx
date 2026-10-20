import { Reveals } from '@/features/hub/reveals/Reveals';
import { requireFlag } from '@/lib/flags';

export const metadata = { title: 'Reveals' };

// Everything hidden across the hub, and when it comes out (hub version 2, item 14). DM only.
// Behind the hub_v2_reveals flag.
export default async function RevealsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireFlag('hub_v2_reveals');
  return <Reveals slug={slug} />;
}
