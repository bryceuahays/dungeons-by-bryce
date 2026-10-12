import Link from 'next/link';

// Under the heading of each Homebrew picker: which system it is showing.
export function BrewSystemNote({ name }: { name: string }) {
  return <p className="dim">For <b>{name}</b>. Change the system at the top of the <Link href="/homebrew">Homebrew page</Link>.</p>;
}
