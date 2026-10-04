import Link from 'next/link';
import { getViewer } from '@/lib/auth';

// Pages anyone can read without signing in: legal, pricing, the store, the custom-site page.
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <div className="hub pub">
      <header className="hub-bar">
        <div className="in">
          <Link className="hub-name" href="/">Dungeons by Bryce</Link>
          <nav aria-label="Site">
            <Link href="/demo">Demo</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/store">Store</Link>
            <Link href="/custom">Have Bryce build it</Link>
            {viewer ? <Link href="/campaigns">My campaigns</Link> : <Link href="/sign-in">Sign in</Link>}
          </nav>
        </div>
      </header>
      <main className="hub-main">{children}</main>
      <footer className="hub-foot"><Link href="/custom">Have Bryce build it</Link> · <Link href="/store">Store</Link> · <Link href="/pricing">Pricing</Link> · <Link href="/legal">Legal and licences</Link> · Dungeons by Bryce</footer>
    </div>
  );
}
