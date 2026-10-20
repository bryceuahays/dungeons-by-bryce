import { Npcs } from '@/features/hub/npcs/Npcs';
import { requireFlag } from '@/lib/flags';

export const metadata = { title: 'NPCs' };

// Everyone the party has met (hub version 2, item 10). Behind the hub_v2_npcs flag.
export default async function NpcsRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireFlag('hub_v2_npcs');
  return <Npcs slug={slug} />;
}
