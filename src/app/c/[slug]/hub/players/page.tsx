import { Players } from '@/features/hub/players/Players';
import { requireFlag } from '@/lib/flags';

export const metadata = { title: 'Players' };

// Each character in full for its own player (hub version 2, item 13). Behind the hub_v2_players flag.
export default async function PlayersRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireFlag('hub_v2_players');
  return <Players slug={slug} />;
}
