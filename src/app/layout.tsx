import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/styles/campaign.css';
import '@/styles/guide.css';
import '@/styles/builder.css';
import '@/styles/runsheet.css';

export const metadata: Metadata = {
  title: { default: 'Dungeons by Bryce', template: '%s · Dungeons by Bryce' },
  description: 'Campaigns and characters for the table.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#121416' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
