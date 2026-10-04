import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { signOut } from '../(auth)/actions';

// The signed-in hub. The background sits here, in the shared layout, so every hub tab
// gets it and it stays put (no reload, no flicker) when moving between tabs. It is the
// hall artwork unless this person has uploaded their own pair of pictures.
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const { profile, isHead } = await requireViewer();
  const own = profile.hub_bg?.wide && profile.hub_bg?.tall;
  const wide = own ? `/bg/me/wide?v=${profile.hub_bg.v ?? 1}` : '/hub/hall-wide.webp';
  const tall = own ? `/bg/me/tall?v=${profile.hub_bg.v ?? 1}` : '/hub/hall-tall.webp';
  return (
    <div className="hub hall">
      {/* only the image that matches the screen's shape is fetched */}
      <link rel="preload" as="image" href={wide} media="(orientation: landscape)" fetchPriority="high" />
      <link rel="preload" as="image" href={tall} media="(orientation: portrait)" fetchPriority="high" />
      <div className="hall-bg" aria-hidden="true">
        <picture>
          <source media="(orientation: portrait)" srcSet={tall} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wide} alt="" fetchPriority="high" draggable={false} />
        </picture>
      </div>
      <header className="hub-bar">
        <div className="in">
          <Link className="hub-name" href="/campaigns">Dungeons by Bryce</Link>
          <nav aria-label="Hub">
            <Link href="/campaigns">My campaigns</Link>
            <Link href="/characters">My characters</Link>
            <Link href="/new-campaign">New campaign</Link>
            <Link href="/feedback">Feedback</Link>
            {isHead ? <Link href="/admin">Head DM</Link> : null}
            <Link href="/account">{profile.display_name || 'Account'}</Link>
          </nav>
          <form action={signOut}><button className="quiet" type="submit">Sign out</button></form>
        </div>
      </header>
      <main className="hub-main">{children}</main>
      <footer className="hub-foot">Dungeons by Bryce</footer>
    </div>
  );
}
