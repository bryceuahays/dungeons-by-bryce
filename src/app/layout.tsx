import type { Metadata, Viewport } from 'next';
import { Cinzel, Inter } from 'next/font/google';
import './globals.css';
import '@/styles/campaign.css';
import '@/styles/guide.css';
import '@/styles/builder.css';
import '@/styles/runsheet.css';
import '@/styles/tools.css';
import { NavProgress } from '@/components/NavProgress';

// The hub's own fonts. Campaign pages use the fonts in their own theme instead.
const title = Cinzel({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-title', display: 'swap' });
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000')).replace(/\/$/, '');

// Signed-in pages and campaigns are never indexed. The public pages (landing, demo,
// pricing, store, custom sites, legal) turn indexing on for themselves.
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Dungeons by Bryce', template: '%s · Dungeons by Bryce' },
  description: 'A home for your tabletop campaign: secrets and reveals, a story timeline, maps, and a homebrew builder. Fifth edition compatible.',
  robots: { index: false, follow: false },
  openGraph: { siteName: 'Dungeons by Bryce', type: 'website', locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#010508' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${title.variable} ${body.variable}`}>
      <body>
        <NavProgress />
        {children}
      </body>
    </html>
  );
}
