import { Quests } from '@/features/hub/quests/Quests';
import { requireFlag } from '@/lib/flags';

export const metadata = { title: 'Quest log' };

// Quests, their objectives and rewards (hub version 2, item 17). Behind the hub_v2_quests flag.
export default async function QuestsRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireFlag('hub_v2_quests');
  return <Quests slug={slug} />;
}
