import Link from 'next/link';
import { getViewer } from '@/lib/auth';
import { createPublicClient } from '@/lib/supabase/public';
import { PlanCards } from '@/components/PlanCards';
import { FEATURES } from '@/config/plans';
import { COMMISSION_TIERS, tierPrice } from '@/config/commissions';

export const metadata = { title: 'Pricing', description: 'Players are always free. Running a campaign is free. Pro adds the full homebrew builder, the story timeline, hidden map regions, reveal stages and per-player secrets.', robots: { index: true, follow: true } };

export default async function Pricing() {
  const [viewer, { data: seats }] = await Promise.all([getViewer(), createPublicClient().rpc('founder_seats_left')]);
  return (
    <>
      <h1>Pricing</h1>
      <div className="panel"><p>Players are always free. Creating and running a campaign is free. A plan is for the DM, and it covers every campaign that DM runs.</p></div>
      {viewer ? <p><Link className="button" href="/upgrade">Choose a plan</Link></p> : null}
      <PlanCards signedIn={false} seatsLeft={Number(seats ?? 0)} />
      <h2>Rather not build it yourself?</h2>
      <div className="panel">
        <p>The plans above are for building your own campaign. If you would rather hand it over, I build it for you: your lore, NPCs, maps and a look made for your world, delivered to your account. {COMMISSION_TIERS.map((t) => `${t.name} ${tierPrice(t)}`).join(', ')}. The two larger tiers include months of Pro.</p>
        <p><Link className="button" href="/custom">Have Bryce build it</Link></p>
      </div>

      <h2>What Pro adds</h2>
      <div className="panel"><ul className="plain">{Object.values(FEATURES).map((f) => <li key={f.name}><b>{f.name}.</b> {f.what}</li>)}</ul></div>
      <div className="panel"><p className="dim">If you stop paying, nothing is deleted. Campaigns beyond your first can still be opened and read by you and your players, and they unlock again on Pro.</p></div>
    </>
  );
}
