import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { Atmosphere } from '@/components/Atmosphere';
import { FREE_LIMITS, PRICES } from '@/config/plans';
import './landing.css';

export const metadata: Metadata = {
  title: 'Dungeons by Bryce: run the campaign your players never see coming',
  description: 'A home for your tabletop campaign, fifth edition compatible. Keep secrets on the server, reveal the story in stages, track every beat on a timeline, uncover maps as the party explores, and build your own homebrew. Free for players; free to run a campaign.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

// The public front door. It shows no campaign names, campaign content, or player names.
export default async function Landing() {
  if (await getViewer()) redirect('/campaigns');
  return (
    <main className="door">
      {/* only the image that matches the screen's shape is fetched */}
      <link rel="preload" as="image" type="image/webp" href="/landing/doorway-wide.webp" media="(orientation: landscape)" fetchPriority="high" />
      <link rel="preload" as="image" type="image/webp" href="/landing/doorway-tall.webp" media="(orientation: portrait)" fetchPriority="high" />

      <section className="hero">
        <picture>
          <source media="(orientation: portrait)" srcSet="/landing/doorway-tall.webp" type="image/webp" width={941} height={1672} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/doorway-wide.webp" alt="" width={1672} height={941} fetchPriority="high" draggable={false} />
        </picture>
        <div className="breath" aria-hidden="true" />
        <Atmosphere />
        <div className="fade" aria-hidden="true" />

        <header className="hero-top">
          <h1>Dungeons by Bryce</h1>
          <p className="tag">Run the campaign your players never see coming.</p>
        </header>
        <nav className="hero-bottom" aria-label="Get started">
          <Link className="stone-btn primary" href="/sign-up">Start free</Link>
          <Link className="stone-btn" href="/demo">See the demo</Link>
          <Link className="stone-btn" href="/sign-in">Sign in</Link>
        </nav>
      </section>

      <section className="below" aria-label="What it does">
        <article className="feature lead">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M24 5c3.200 3.600 4.800 6.300 4.800 8.800a4.800 4.800 0 0 1-9.600 0C19.200 11.300 20.800 8.600 24 5z" className="amber" />
            <path d="M24 18.600V22M17 22h14v17H17zM17 27c2.300 1.600 4.700 1.600 7 0s4.700-1.600 7 0M11 43h26M14 39h20v4H14z" />
          </svg>
          <div>
            <h2>Secrets that stay secret, and reveals that land</h2>
            <p>Your players open the same campaign you do and see a different one. What is hidden from them is held back on the server: it is never sent to their browser, so there is nothing to find by peeking.</p>
            <ul>
              <li><b>Reveal stages.</b> Name the turning points of your story. Advance one with a click and pages, tabs, even the campaign&apos;s title change for everyone at the table.</li>
              <li><b>Per-player secrets.</b> A note, an NPC or a whole block that only one player can see.</li>
              <li><b>View as.</b> Check exactly what any player sees, at any stage, before the session.</li>
            </ul>
          </div>
        </article>

        <div className="trio two">
          <article className="card">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 24h36M12 24v-8M22 24v8M32 24v-8M40 24v8" /><circle cx="12" cy="14" r="3" /><circle cx="22" cy="34" r="3" /><circle cx="32" cy="14" r="3" /><circle cx="40" cy="34" r="3" className="amber" /></svg>
            <h2>A timeline that remembers</h2>
            <p>Plan the beats of your story and flag the ones that must happen. Mark each as hit with one click. Your players see the story so far growing at the top of every page; you see what is left, and what is overdue.</p>
          </article>
          <article className="card">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 12l12-4 12 4 12-4v28l-12 4-12-4-12 4z" /><path d="M18 8v28M30 12v28" /><path d="M22.5 20.5l3 3M25.5 20.5l-3 3" /></svg>
            <h2>Maps that open as they explore</h2>
            <p>Upload a map from any tool. Cover what has not been found, and reveal it by hand, at a stage, or when a story beat happens. Covered regions are painted out before the picture ever leaves the server. Pins appear where things happened.</p>
          </article>
        </div>

        <article className="feature">
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l17.3 10v20L24 44 6.7 34V14z" /><path d="M24 4l-9.500 14h19zM14.500 18L6.700 34M33.500 18l7.800 16M14.500 18L24 34l9.500-16M6.700 34H41.300M24 34v10" /></svg>
          <div>
            <h2>Homebrew you can finish in five minutes</h2>
            <p>Races, classes, subclasses, backgrounds, feats, spells, items, monsters and your own resources. Start quick with a name and a description, or go step by step. Give an entry real effects and your players&apos; sheets apply them by themselves. Clone anything in the SRD and change it. Bring a stat block from an older edition you own and have the math converted.</p>
          </div>
        </article>

        <div className="trio">
          <article className="card"><h2>At the table</h2><p>An NPC tracker with what the players know and what they do not, and a live initiative tracker that keeps hidden enemies hidden. Built for phones.</p></article>
          <article className="card"><h2>Before the game</h2><p>A session zero page for tone, lines and veils, and table rules, with a way for players to speak up without their names attached.</p></article>
          <article className="card"><h2>Between sessions</h2><p>Log what the party changed, track the clues to every secret, and let the factions&apos; clocks tick.</p></article>
        </div>

        <article className="feature close">
          <div>
            <h2>Players are free. Running a campaign is free.</h2>
            <p>The free plan runs one campaign for up to {FREE_LIMITS.players} players with the full fifth edition SRD. Pro is {PRICES.pro_monthly.label} or {PRICES.pro_yearly.label} for the DM, and covers every campaign you run.</p>
            <p className="links"><Link className="stone-btn primary" href="/sign-up">Start free</Link><Link className="stone-btn" href="/pricing">Pricing</Link><Link className="stone-btn" href="/store">Ready-made campaigns</Link><Link className="stone-btn" href="/custom">Have yours built</Link></p>
          </div>
        </article>
      </section>

      <footer>
        Dungeons by Bryce
        <span className="fine">Fifth edition compatible. An independent product, not affiliated with Wizards of the Coast. <Link href="/legal">Legal and licences</Link></span>
      </footer>
    </main>
  );
}
