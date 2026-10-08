import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { CreateWorldForm } from '@/components/WorldForms';

export const metadata = { title: 'My worlds' };

// The worlds you have made: each holds campaigns and the homebrew of its setting.
export default async function Worlds() {
  const { supabase, user } = await requireViewer();
  const [{ data: worlds }, { data: camps }] = await Promise.all([
    supabase.from('worlds').select('id, name, tagline').eq('owner_id', user.id).order('name'),
    supabase.from('campaigns').select('id, world_id').eq('owner_id', user.id).not('world_id', 'is', null),
  ]);
  const count = (id: string) => (camps ?? []).filter((c) => c.world_id === id).length;
  return (
    <>
      <h1>My worlds</h1>
      <div className="panel narrow"><p className="dim">A world is your setting: its lore, and the races, classes, items, monsters and other homebrew that belong to it. Campaigns you run can be set in a world, and each one gets the world&apos;s homebrew. Only you see your worlds.</p></div>
      {(worlds ?? []).length ? (
        <div className="cards">
          {(worlds ?? []).map((w) => (
            <Link key={w.id} className="ccard" href={'/worlds/' + w.id}>
              <b>{w.name}</b>
              <span>{w.tagline}</span>
              <i>{count(w.id) === 1 ? '1 campaign' : `${count(w.id)} campaigns`}</i>
            </Link>
          ))}
        </div>
      ) : null}
      <h2>Create a new world</h2>
      <CreateWorldForm />
    </>
  );
}
