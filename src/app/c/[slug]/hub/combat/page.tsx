import { Combat } from '@/features/hub/combat/Combat';
import { requireFlag } from '@/lib/flags';

export const metadata = { title: 'Combat' };

// Fights at the table (hub version 2, item 12). Behind the hub_v2_combat flag.
export default async function CombatRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireFlag('hub_v2_combat');
  return <Combat slug={slug} />;
}
