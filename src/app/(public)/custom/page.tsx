/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { COMMISSIONS, COMMISSION_TIERS, TIER_ROWS, revisionsText, tierPrice } from '@/config/commissions';
import { CommissionForm } from '@/components/CommissionForm';

export const metadata = { title: 'Have Bryce build it', description: 'Send your notes, your world and your references, and have your campaign built for you on Dungeons by Bryce: a theme made for it, your lore and NPCs entered, maps with hidden regions, and it is handed over to your account.', robots: { index: true, follow: true } };

const SHOTS: [string, string][] = [['custom/example-1.webp', 'A campaign\'s overview page, in its own theme'], ['custom/example-2.webp', 'A lore page with cards for each people'], ['custom/example-3.webp', 'The same campaign on a phone']];

export default async function Custom({ searchParams }: { searchParams: Promise<{ tier?: string; paid?: string }> }) {
  const { tier = '', paid } = await searchParams;
  const shots = SHOTS.filter(([f]) => fs.existsSync(path.join(process.cwd(), 'public', f)));
  return (
    <>
      <h1>Have Bryce build it</h1>
      <div className="panel">
        <p>You bring the campaign: your notes, your world, your references. I build it here, with a look made for it, and hand it over to your account. You are its DM and you own it.</p>
        {COMMISSIONS.waitTime ? <p><b>{COMMISSIONS.waitTime}</b></p> : null}
        {COMMISSIONS.open ? null : <p className="bad" role="status"><b>Not taking requests right now.</b> Check back soon.</p>}
        {paid ? <p className="good" role="status">Thank you. Your payment is in, and work on your campaign starts now.</p> : null}
      </div>

      <div className="tiers">
        {COMMISSION_TIERS.map((t) => (
          <section key={t.id} className="panel plan tier" aria-label={t.name}>
            <h2>{t.name}</h2>
            <p className="price">{tierPrice(t)}</p>
            <p>{t.summary}</p>
            <ul className="plain">
              {TIER_ROWS.map(([k, label]) => (t[k] ? <li key={k}><b>{label}.</b> {String(t[k])}.</li> : <li key={k} className="dim none"><b>{label}.</b> Not in this tier.</li>))}
              <li><b>Revisions.</b> {revisionsText(t.revisions)}.</li>
              <li className={t.proMonths ? '' : 'dim none'}><b>Pro.</b> {t.proMonths ? `Includes ${t.proMonths} months of Pro, starting when your campaign is delivered.` : 'Not included. Your campaign works on the free plan.'}</li>
            </ul>
            {COMMISSIONS.open ? <p><Link className="button" href={`/custom?tier=${t.id}#request`}>Request this</Link></p> : null}
          </section>
        ))}
      </div>

      {shots.length ? (
        <>
          <h2>What a finished campaign looks like</h2>
          <p className="dim">From one of my own campaigns, as its players see it.</p>
          <div className="shots">{shots.map(([f, alt]) => <img key={f} src={'/' + f} alt={alt} loading="lazy" />)}</div>
        </>
      ) : null}

      <h2 id="request">Tell me about your campaign</h2>
      <div className="panel">
        {COMMISSIONS.open ? <CommissionForm key={tier} tier={tier} /> : <p className="dim">The request form is closed for now.</p>}
      </div>
    </>
  );
}
