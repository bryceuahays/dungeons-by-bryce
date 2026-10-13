import Link from 'next/link';
import { requireHead } from '@/lib/auth';
import { Samples } from '@/features/hub/ui/Samples';

export const metadata = { title: 'Design samples' };

// Only the Head DM reaches this page. Nothing on it is real campaign content.
export default async function Design() {
  await requireHead();
  return (
    <>
      <p><Link href="/admin">Back to Head DM</Link></p>
      <h1>Design samples</h1>
      <div className="panel">
        <p>The shared looks the new hub pages are built from, drawn once in each of the seven campaign themes. The words are made up.</p>
        <p className="dim">The dashed box and the small labels are how anything hidden from players is shown to a DM. It is purple, except in Abyssal, where the theme&apos;s own accent is already purple. A player&apos;s page never contains hidden things at all.</p>
      </div>
      <Samples />
    </>
  );
}
