import type { Metadata } from 'next';
import { getCampaign, themeStyle } from '@/lib/campaign';
import { safeFontHref } from '@/lib/fonts';
import { Starfield } from '@/components/Starfield';
import { CampaignChrome } from '@/components/CampaignChrome';

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
  return (
    <div className="campaign" style={themeStyle(campaign.theme)}>
      {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
      {campaign.theme?.starfield ? <Starfield /> : null}
      <CampaignChrome
        slug={campaign.slug}
        title={ctx.dmTitle}
        playerTitle={ctx.isDm && ctx.dmTitle !== campaign.title ? campaign.title : null}
        tabs={ctx.sections.map((s) => ({ slug: s.slug, title: s.title, kind: s.kind }))}
        isDm={ctx.isDm}
        realDm={ctx.realDm}
        asPlayer={ctx.asPlayer}
      />
      <div className="page">{children}</div>
    </div>
  );
}
