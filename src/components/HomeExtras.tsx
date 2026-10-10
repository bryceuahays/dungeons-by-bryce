import type { CampaignCtx } from '@/lib/campaign';
import { campaignCan } from '@/lib/entitlements';
import { hasTool } from '@/config/tools';
import { getEntries } from '@/lib/entries';
import { parseVideoUrl, videoFrame } from '@/lib/video';

// Shown above the first tab of a campaign: the featured video (a trailer or a recap),
// and what the party changed in the latest session. Each part is left out when empty.
export async function HomeExtras({ ctx }: { ctx: CampaignCtx }) {
  const video = parseVideoUrl(ctx.campaign.settings?.video);
  const cons = campaignCan(ctx.access, 'world') && hasTool(ctx.campaign.settings, 'world') ? await getEntries(ctx, ['consequence']) : [];
  const latest = Math.max(0, ...cons.map((c) => Number(c.data.session) || 0));
  const since = cons.filter((c) => (Number(c.data.session) || 0) === latest);
  const hero = Number(ctx.campaign.theme?.hero) > 0 && campaignCan(ctx.access, 'themes');
  if (!video && !since.length && !hero) return null;
  return (
    <div className="wrap home-extras">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {hero ? <img className="hero-img" src={`/c/${ctx.campaign.slug}/bg/hero?v=${ctx.campaign.theme!.hero}`} alt="" /> : null}
      {video ? <div dangerouslySetInnerHTML={{ __html: videoFrame(video, 'Featured video') }} /> : null}
      {since.length ? (
        <div className="plate">
          <h3>Since last session{latest ? ` (session ${latest})` : ''}</h3>
          <ul>{since.map((c) => <li key={c.id}>{c.title}{ctx.isDm && c.vis === 'dm' ? <span className="pillb dm">DM only</span> : null}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
