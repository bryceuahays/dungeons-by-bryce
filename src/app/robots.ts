import type { MetadataRoute } from 'next';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000')).replace(/\/$/, '');

// Search engines may read the public pages and nothing else.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/$', '/demo', '/pricing', '/store', '/custom', '/legal'], disallow: ['/c/', '/campaigns', '/characters', '/account', '/admin', '/homebrew', '/upgrade', '/feedback', '/new-campaign', '/join/', '/api/'] }],
    sitemap: SITE + '/sitemap.xml',
  };
}
