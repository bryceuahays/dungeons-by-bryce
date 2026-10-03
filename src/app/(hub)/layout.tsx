import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { signOut } from '../(auth)/actions';

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireViewer();
  return (
    <div className="hub">
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
