import Link from 'next/link';
import { getCampaign } from '@/lib/campaign';
import { getMembers } from '@/lib/entries';
import { requireFlag } from '@/lib/flags';
import { hasFeature } from '@/config/hub-features';
import { DicePanel } from '@/features/dice/DicePanel';
import { DM_CHOICES, diceRules, playerChoices } from '@/features/dice/model';
import { checkNames, loadDice, myChecks } from '@/features/dice/server';

export const metadata = { title: 'Dice' };

// Dice for a campaign: roll, tap a check, answer a roll the DM asked for, and the log of
// rolls this viewer may see. Behind the hub_v2_dice flag. The header and sidebar of hub
// version 2 (item 8) will show these same pieces on every page; until then they live here.
export default async function DicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireFlag('hub_v2_dice');
  const ctx = await getCampaign(slug);
  const settings = ctx.campaign.settings;
  const rules = diceRules(settings);
  const dm = ctx.realDm && !ctx.asPlayer;
  const canRoll = ctx.access.writable && !ctx.asPlayer && !(ctx.headView && !ctx.realDm);
  // the three dice features a DM can switch off for the campaign (Manage, Pages and features)
  const log = hasFeature(settings, 'sidebar.log'), tap = hasFeature(settings, 'sidebar.tap'), privateOn = hasFeature(settings, 'sidebar.private');
  const [data, characters, members, names] = await Promise.all([
    log ? loadDice(ctx) : loadDice(ctx).then((d) => ({ ...d, rolls: [] })),   // with the log off, no rolls are sent at all
    tap && canRoll ? myChecks(ctx) : [],
    dm ? getMembers(ctx) : [],
    dm ? checkNames(ctx) : [],
  ]);
  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>Dice</h2>
        <p className="lede">{dm ? 'Roll where the table can see it, or keep it hidden. Every roll is made on the server, never in the browser.' : 'Roll where the table can see it, to your DM only, or just for yourself.'}</p>
        <DicePanel slug={ctx.campaign.slug} campaignId={ctx.campaign.id} me={data.me} dm={dm} dmSide={data.dmSide} canRoll={canRoll}
          rules={rules} choices={dm ? DM_CHOICES : playerChoices(rules, privateOn)} log={log} rolls={data.rolls} requests={data.requests}
          characters={characters} members={members.filter((m) => m.user_id !== ctx.user.id)} checkNames={names} />
        <p className="row" style={{ marginTop: 16 }}><Link className="act sm" href={`/c/${ctx.campaign.slug}/tools`}>All table tools</Link></p>
      </div>
    </div>
  );
}
