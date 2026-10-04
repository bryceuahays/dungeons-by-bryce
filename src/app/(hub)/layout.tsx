import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { signOut } from '../(auth)/actions';

// The signed-in hub. The hall artwork sits here, in the shared layout, so every hub tab
// gets it and it stays put (no reload, no flicker) when moving between tabs.
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireViewer();
  return (
    <div className="hub hall">
      {/* only the image that matches the screen's shape is fetched */}
      <link rel="preload" as="image" type="image/webp" href="/hub/hall-wide.webp" media="(orientation: landscape)" fetchPriority="high" />
      <link rel="preload" as="image" type="image/webp" href="/hub/hall-tall.webp" media="(orientation: portrait)" fetchPriority="high" />
      <div className="hall-bg" aria-hidden="true">
        <picture>
          <source media="(orientation: portrait)" srcSet="/hub/hall-tall.webp" type="image/webp" width={941} height={1672} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hub/hall-wide.webp" alt="" width={1672} height={941} fetchPriority="high" draggable={false} />
        </picture>
      </div>
      <header className="hub-bar">
        <div className="in">
          <Link className="hub-name" href="/campaigns">Dungeons by Bryce</Link>
          <nav aria-label="Hub">
            <Link href="/campaigns">My campaigns</Link>
            <Link href="/characters">My characters</Link>
            {profile.role === 'dm' ? <Link href="/new-campaign">New campaign</Link> : null}
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
