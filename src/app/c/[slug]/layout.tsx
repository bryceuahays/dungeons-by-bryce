import type { Metadata } from 'next';
import { getCampaign, themeStyle } from '@/lib/campaign';
import { safeFontHref } from '@/lib/fonts';
import { Starfield } from '@/components/Starfield';
import { CampaignChrome } from '@/components/CampaignChrome';
import Link from 'next/link';
import { TimelineBanner } from '@/components/TimelineBanner';
import { campaignCan } from '@/lib/entitlements';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getCampaign(slug);
  return { title: ctx.dmTitle };
}

// Everything inside a campaign wears that campaign's theme: the tokens stored in
// campaigns.theme become CSS variables on this wrapper.
export default async function CampaignLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCampaign(slug);
  const { campaign } = ctx;
  const fonts = safeFontHref(campaign.theme?.fonts?.href);
  const bg = campaign.background?.wide && campaign.background?.tall ? `?v=${campaign.background.v ?? 1}` : null;
  return (
    <div className={'campaign' + (bg ? ' has-bg' : '')} style={themeStyle(campaign.theme)} data-radius={campaign.theme?.layout?.radius ? '' : undefined} data-wrap={campaign.theme?.layout?.wrap ? '' : undefined}>
      {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
      {bg ? (
        <div className="camp-bg" aria-hidden="true">
          <picture>
            <source media="(orientation: portrait)" srcSet={`/c/${campaign.slug}/bg/tall${bg}`} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/c/${campaign.slug}/bg/wide${bg}`} alt="" draggable={false} />
          </picture>
        </div>
      ) : null}
      {campaign.theme?.starfield ? <Starfield /> : null}
      <CampaignChrome
        slug={campaign.slug}
        title={ctx.dmTitle}
        playerTitle={ctx.isDm && ctx.dmTitle !== campaign.title ? campaign.title : null}
        tabs={ctx.sections.map((s) => ({ slug: s.slug, title: s.title, kind: s.kind }))}
        isDm={ctx.isDm}
        realDm={ctx.realDm}
        asPlayer={ctx.asPlayer}
        previewNote={ctx.asPlayer ? [ctx.viewAs.player ? 'one named player' : 'any player', ctx.viewAs.stage ? `at "${campaign.phases.find((p) => p.id === ctx.viewAs.stage)?.label ?? ctx.viewAs.stage}"` : ''].filter(Boolean).join(', ') : ''}
        headView={ctx.headView ? campaign.id : null}
        readOnly={ctx.realDm && !ctx.access.writable}
      />
      {campaignCan(ctx.access, 'timeline') ? <TimelineBanner ctx={ctx} /> : null}
      <div className="page">{children}</div>
      {campaignCan(ctx.access, 'no_footer') ? null : <footer className="made">Made with <Link href="/">Dungeons by Bryce</Link></footer>}
    </div>
  );
}
