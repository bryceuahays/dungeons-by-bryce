import { Lore } from '@/features/hub/lore/Lore';
import { requireFlag } from '@/lib/flags';

export const metadata = { title: 'Lore' };

// The world, by category (hub version 2, item 11). Behind the hub_v2_lore flag.
export default async function LoreRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireFlag('hub_v2_lore');
  return <Lore slug={slug} />;
}
