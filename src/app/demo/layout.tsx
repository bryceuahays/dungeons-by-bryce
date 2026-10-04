import Link from 'next/link';
import type { Metadata } from 'next';
import { getDemo } from '@/lib/demo';
import { themeStyle } from '@/lib/theme-style';
import { safeFontHref } from '@/lib/fonts';
import { Starfield } from '@/components/Starfield';
import { TimelineBanner } from '@/components/TimelineBanner';
import { DemoTabs } from '@/components/DemoTabs';

export const metadata: Metadata = { title: 'Demo campaign', description: 'Browse a campaign on Dungeons by Bryce exactly as a player sees it. No account needed.', robots: { index: true, follow: true } };
export const revalidate = 120;

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getDemo();
  if (!ctx) {
    return (
      <main className="hub center"><div className="box" style={{ maxWidth: 440, textAlign: 'left' }}>
        <p><Link className="hub-name" href="/">Dungeons by Bryce</Link></p>
        <h1 style={{ fontSize: '1.5rem' }}>The demo is being set up</h1>
        <div className="panel"><p>Come back soon, or <Link href="/sign-up">start free</Link> and run your own.</p></div>
      </div></main>
    );
  }
  const { campaign } = ctx;
  const fonts = safeFontHref(campaign.theme?.fonts?.href);
  return (
    <div className="campaign" style={themeStyle(campaign.theme)}>
      {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
      {campaign.theme?.starfield ? <Starfield /> : null}
      <div className="preview" role="status">
        This is a demo. You are seeing it exactly as a player would: the DM&apos;s secrets, hidden map regions and planned story beats are not sent to your browser at all.{' '}
        <Link href="/sign-up">Start free</Link> · <Link href="/pricing">Pricing</Link>
      </div>
      <div className="strip">
        <Link href="/">← Dungeons by Bryce</Link>
        <span className="tools"><span>{campaign.title}</span></span>
      </div>
      <DemoTabs tabs={ctx.sections.map((s) => ({ slug: s.slug, title: s.title }))} />
      <TimelineBanner ctx={ctx} base="/demo" />
      <div className="page">{children}</div>
      <footer className="made">Made with <Link href="/">Dungeons by Bryce</Link></footer>
    </div>
  );
}
