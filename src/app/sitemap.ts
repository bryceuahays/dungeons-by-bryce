import type { MetadataRoute } from 'next';
import { createPublicClient } from '@/lib/supabase/public';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000')).replace(/\/$/, '');
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await createPublicClient().from('products').select('slug, updated_at').eq('status', 'live');
  return [
    ...['', '/demo', '/pricing', '/store', '/custom', '/legal'].map((p) => ({ url: SITE + p, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.7 })),
    ...(data ?? []).map((p) => ({ url: `${SITE}/store/${p.slug}`, lastModified: p.updated_at, changeFrequency: 'weekly' as const, priority: 0.6 })),
  ];
}
