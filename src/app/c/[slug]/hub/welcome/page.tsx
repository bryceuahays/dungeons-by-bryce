import { Welcome } from '@/features/hub/welcome/Welcome';
import { requireFlag } from '@/lib/flags';

export const metadata = { title: 'Welcome' };

// The hub's home page (hub version 2, item 9). Behind the hub_v2_welcome flag.
export default async function WelcomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireFlag('hub_v2_welcome');
  return <Welcome slug={slug} />;
}
