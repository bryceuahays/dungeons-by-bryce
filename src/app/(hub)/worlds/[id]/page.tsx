/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { TYPES } from '@/config/homebrew';
import { RULES, type RulesChoice } from '@/config/rules';
import { WorldEditor } from '@/components/WorldForms';
import { copyWorld } from '../actions';

export const metadata = { title: 'World' };

export default async function WorldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireViewer();
  const { data: world } = await supabase.from('worlds').select('id, name, tagline, data, owner_id, official, rules').eq('id', id).maybeSingle();
  if (!world || (!world.official && world.owner_id !== user.id)) notFound();
  const [{ data: camps }, { data: faces }, { data: worlds }] = await Promise.all([
    supabase.from('campaigns').select('id, slug, title, tagline, world_id').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title, tagline').eq('phase', ''),
    supabase.from('worlds').select('id, name'),
  ]);
  // a DM sees their campaign's real title, not what players see this stage
  const face = new Map((faces ?? []).map((f) => [f.campaign_id, f]));
  const named = (c: any) => ({ id: c.id, slug: c.slug, title: face.get(c.id)?.title ?? c.title, tagline: face.get(c.id)?.tagline ?? c.tagline ?? '' });
  const worldName = new Map((worlds ?? []).map((w) => [w.id, w.name]));
  const all = camps ?? [];
  const inHere = all.filter((c) => c.world_id === id).map(named);

  if (world.official) return <ReadyMade world={world} campaigns={inHere} />;

  const [{ data: links }, { data: mine }] = await Promise.all([
    supabase.from('world_entities').select('entity_id, entities(id, name, type)').eq('world_id', id),
    supabase.from('entities').select('id, name, type').eq('owner_id', user.id).neq('source', 'srd').order('name'),
  ]);
  return (
    <>
      <p><Link className="button quiet" href="/worlds">All my worlds</Link></p>
      <WorldEditor
        world={{ id: world.id, name: world.name, tagline: world.tagline, rules: world.rules, data: world.data ?? {} }}
        campaigns={inHere}
        others={all.filter((c) => c.world_id !== id).map((c) => ({ ...named(c), world: c.world_id ? worldName.get(c.world_id) : undefined }))}
        entries={(links ?? []).map((l: any) => l.entities).filter(Boolean).sort((a: any, b: any) => a.name.localeCompare(b.name))}
        mine={(mine ?? []) as any[]}
      />
    </>
  );
}

// A ready-made world (the standard SRD one): what is in it, your campaigns in it, and the ways to use it.
async function ReadyMade({ world, campaigns }: { world: any; campaigns: { id: string; slug: string; title: string; tagline: string }[] }) {
  const { supabase } = await requireViewer();
  const rules = (world.rules ?? '2024') as RulesChoice;
  const types = ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'item', 'monster'];
  const counts = await Promise.all(types.map((t) => supabase.from('entities').select('id', { count: 'exact', head: true }).eq('source', 'srd').in('srd_version', [...RULES[rules].versions]).eq('type', t)));
  const browse: Record<string, string> = { race: '/homebrew/races', class: '/homebrew/classes', subclass: '/homebrew/subclasses', background: '/homebrew/backgrounds', feat: '/homebrew/feats', spell: '/homebrew/spells', item: '/homebrew/items', monster: '/homebrew/monsters' };
  return (
    <>
      <p><Link className="button quiet" href="/worlds">All my worlds</Link></p>
      <h1>{world.name}</h1>
      <div className="panel">
        <p><b>{world.tagline}</b></p>
        <p className="kv"><b>Game:</b> 5th edition (SRD)</p>
        <p className="kv"><b>Rules:</b> {RULES[rules].label}</p>
        {String(world.data?.desc ?? '').split(/\n{2,}/).filter(Boolean).map((p: string, i: number) => <p key={i} className="dim">{p}</p>)}
        <p className="inline">
          <Link className="button" href={'/new-campaign?world=' + world.id}>Start a campaign in this world</Link>
          <form action={copyWorld.bind(null, world.id)} style={{ display: 'inline' }}><button type="submit" className="quiet">Make my own copy to add homebrew</button></form>
        </p>
        <p className="dim">This world is ready-made and the same for everyone, so it can&apos;t be changed. Your own copy starts with the same rules, and you can add your homebrew to it.</p>
      </div>
      <h2>What&apos;s in it</h2>
      <div className="cards">
        {types.map((t, i) => (
          <Link key={t} className="ccard" href={browse[t]}><b>{TYPES[t].plural}</b><span>{counts[i].count ?? 0} from the SRD</span></Link>
        ))}
      </div>
      <h2>Your campaigns in this world</h2>
      <div className="panel">
        {campaigns.length ? (
          <ul className="list srd-list item-list">{campaigns.map((c) => <li key={c.id}><Link href={'/c/' + c.slug}><b>{c.title}</b></Link><span className="dim">{c.tagline}</span></li>)}</ul>
        ) : <p className="dim">None yet.</p>}
      </div>
    </>
  );
}
