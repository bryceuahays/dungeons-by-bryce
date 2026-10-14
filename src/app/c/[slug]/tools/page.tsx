import Link from 'next/link';
import { getCampaign } from '@/lib/campaign';
import { campaignCan } from '@/lib/entitlements';
import { toolsOf } from '@/config/tools';
import { flag } from '@/lib/flags';

export const metadata = { title: 'Table tools' };

export default async function Tools({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCampaign(slug);
  const feed = !!ctx.campaign.settings?.feed;
  const dice = await flag('hub_v2_dice');   // hub version 2 dice: here until the sidebar (item 8) carries them
  const list = toolsOf(ctx.campaign.settings).filter((t) => ctx.isDm || t.id !== 'log' || feed);
  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>Table tools</h2>
        <p className="lede">{ctx.isDm ? 'Everything for running the game. Your players see their own side of each tool.' : 'Everything for playing the game.'}</p>
        {list.length ? null : <p className="who">{ctx.realDm ? <>No tools are switched on for this campaign. Choose them under <Link href={`/c/${ctx.campaign.slug}/manage#tools`}>Manage</Link>.</> : 'Your DM has not switched on any tools for this campaign.'}</p>}
        <div className="grid g2">
          {dice ? <Link className="plate link" href={`/c/${ctx.campaign.slug}/tools/dice`}><h3>Dice</h3><p>{ctx.isDm ? 'Roll in the open or hidden, ask a player for a roll, and set the dice rules.' : 'Roll for the table, to your DM only, or just for yourself.'}</p></Link> : null}
          {list.map((t) => {
            const locked = t.feature && !campaignCan(ctx.access, t.feature);
            return (
              <Link key={t.id} className="plate link" href={`/c/${ctx.campaign.slug}/tools/${t.id}`}>
                <h3>{!ctx.isDm && t.id === 'log' ? 'Newly revealed' : t.name}{locked ? <span className="pillb">Pro</span> : null}</h3>
                <p>{ctx.isDm ? t.what : t.players}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
