import type { Metadata, Viewport } from 'next';
import { Cinzel, Inter } from 'next/font/google';
import './globals.css';
import '@/styles/campaign.css';
import '@/styles/guide.css';
import '@/styles/builder.css';
import '@/styles/runsheet.css';
import { NavProgress } from '@/components/NavProgress';

// The hub's own fonts. Campaign pages use the fonts in their own theme instead.
const title = Cinzel({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-title', display: 'swap' });
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Dungeons by Bryce', template: '%s · Dungeons by Bryce' },
  description: 'Every campaign. Every character. One door.',
  robots: { index: false, follow: false },
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
