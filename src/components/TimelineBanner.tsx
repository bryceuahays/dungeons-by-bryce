import Link from 'next/link';
import type { CampaignCtx } from '@/lib/campaign';
import { getEntries } from '@/lib/entries';

// The collapsible strip at the top of every campaign page. Players get the beats that
// have happened and that they may see. The DM also gets what is planned and a count of
// key beats still to hit. It is left out entirely while there is nothing to show, so a
// campaign that does not use the timeline looks exactly as it did.
export async function TimelineBanner({ ctx, base }: { ctx: CampaignCtx; base?: string }) {
  const beats = (await getEntries(ctx, ['beat'])).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  if (!beats.length) return null;
  const session = Number(ctx.campaign.settings?.session) || 0;
  const hit = beats.filter((b) => b.status === 'hit');
  const keyLeft = ctx.isDm ? beats.filter((b) => b.status === 'planned' && b.data.key) : [];
  const overdue = keyLeft.filter((b) => Number(b.data.target) > 0 && session > Number(b.data.target));
  const shown = ctx.isDm ? beats.filter((b) => b.status !== 'dropped') : hit;
  if (!shown.length) return null;
  const last = hit.at(-1);
  return (
    <details className="tl-banner">
      <summary>
        <b>Story so far</b>
        <span>{hit.length} beat{hit.length === 1 ? '' : 's'}{last ? `. Latest: ${last.title}` : ''}</span>
        {keyLeft.length ? <span className="pillb">{keyLeft.length} key beat{keyLeft.length === 1 ? '' : 's'} to go</span> : null}
        {overdue.length ? <span className="pillb dm">{overdue.length} overdue</span> : null}
      </summary>
      <ol>
        {shown.map((b) => (
          <li key={b.id} className={b.status + (b.data.key ? ' key' : '')}>
            {b.data.hitSession ? <small>Session {b.data.hitSession}</small> : b.status === 'planned' ? <small>Planned{b.data.target ? ', session ' + b.data.target : ''}</small> : null}
            <b>{b.title}</b>
            {b.vis === 'players' ? <small>personal</small> : null}
          </li>
        ))}
      </ol>
      <p><Link href={`${base ?? '/c/' + ctx.campaign.slug}/tools/timeline`}>Open the timeline</Link></p>
    </details>
  );
}
