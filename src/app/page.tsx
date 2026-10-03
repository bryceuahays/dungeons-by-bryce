import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';

export default async function Landing() {
  if (await getViewer()) redirect('/campaigns');
  return (
    <main className="hub landing">
      <div className="box">
        <h1>Dungeons by Bryce</h1>
        <p className="dim" style={{ margin: '0 auto' }}>
          The home for Bryce&apos;s campaigns. Sign in to see the campaigns you are in and the characters you have made.
        </p>
        <div className="actions">
          <Link className="button" href="/sign-in">Sign in</Link>
          <Link className="button quiet" href="/sign-up">Create an account</Link>
        </div>
      </div>
    </main>
  );
}
