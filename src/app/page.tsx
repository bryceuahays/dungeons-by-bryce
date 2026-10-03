import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { Atmosphere } from '@/components/Atmosphere';
import './landing.css';

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
          <p className="tag">Every campaign. Every character. One door.</p>
        </header>
        <nav className="hero-bottom" aria-label="Get started">
          <Link className="stone-btn primary" href="/sign-in">Enter</Link>
          <Link className="stone-btn" href="/sign-up">Join a campaign</Link>
        </nav>
      </section>

      <section className="below" aria-label="What is inside">
        <div className="trio">
          <article className="card">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path d="M6 12l12-4 12 4 12-4v28l-12 4-12-4-12 4z" />
              <path d="M18 8v28M30 12v28" />
              <path d="M22.5 20.5l3 3M25.5 20.5l-3 3" />
              <path d="M10 30c3-2 4 1 6-1M33 18c2 1 3-1 5 0" />
            </svg>
            <h2>Your campaigns</h2>
            <p>Step through to any campaign you have been invited to, each with its own world, lore, and look.</p>
          </article>
          <article className="card">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path d="M24 4l17.3 10v20L24 44 6.7 34V14z" />
              <path d="M24 4l-9.5 14h19zM14.500 18L6.7 34M33.5 18l7.800 16M14.500 18L24 34l9.500-16M6.7 34H41.300M24 34v10M6.7 14l7.800 4M41.300 14l-7.800 4" />
            </svg>
            <h2>Your characters</h2>
            <p>Build a character one step at a time, and keep the finished sheet with you wherever you play.</p>
          </article>
          <article className="card">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path className="amber" d="M24 5c3.200 3.600 4.800 6.300 4.800 8.800a4.800 4.800 0 0 1-9.600 0C19.200 11.300 20.800 8.600 24 5z" />
              <path d="M24 18.600V22" />
              <path d="M17 22h14v17H17z" />
              <path d="M17 27c2.300 1.600 4.700 1.600 7 0s4.700-1.600 7 0" />
              <path d="M11 43h26M14 39h20v4H14z" />
            </svg>
            <h2>Your table</h2>
            <p>Track hit points, actions, and spells from your phone while the dice are still rolling.</p>
          </article>
        </div>
      </section>

      <footer>Dungeons by Bryce</footer>
    </main>
  );
}
