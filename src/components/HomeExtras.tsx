import type { CampaignCtx } from '@/lib/campaign';
import { campaignCan } from '@/lib/entitlements';
import { getEntries } from '@/lib/entries';
import { parseVideoUrl, videoFrame } from '@/lib/video';

// Shown above the first tab of a campaign: the featured video (a trailer or a recap),
// and what the party changed in the latest session. Each part is left out when empty.
export async function HomeExtras({ ctx }: { ctx: CampaignCtx }) {
  const video = parseVideoUrl(ctx.campaign.settings?.video);
  const cons = campaignCan(ctx.access, 'world') ? await getEntries(ctx, ['consequence']) : [];
  const latest = Math.max(0, ...cons.map((c) => Number(c.data.session) || 0));
  const since = cons.filter((c) => (Number(c.data.session) || 0) === latest);
  if (!video && !since.length) return null;
  return (
    <div className="wrap home-extras">
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
