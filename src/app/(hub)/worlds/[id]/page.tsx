/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { WorldEditor } from '@/components/WorldForms';

export const metadata = { title: 'World' };

export default async function WorldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireViewer();
  const { data: world } = await supabase.from('worlds').select('id, name, tagline, data, owner_id').eq('id', id).maybeSingle();
  if (!world || world.owner_id !== user.id) notFound();
  const [{ data: camps }, { data: faces }, { data: worlds }, { data: links }, { data: mine }] = await Promise.all([
    supabase.from('campaigns').select('id, slug, title, tagline, world_id').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title, tagline').eq('phase', ''),
    supabase.from('worlds').select('id, name').eq('owner_id', user.id),
    supabase.from('world_entities').select('entity_id, entities(id, name, type)').eq('world_id', id),
    supabase.from('entities').select('id, name, type').eq('owner_id', user.id).neq('source', 'srd').order('name'),
  ]);
  // a DM sees their campaign's real title, not what players see this stage
  const face = new Map((faces ?? []).map((f) => [f.campaign_id, f]));
  const named = (c: any) => ({ id: c.id, slug: c.slug, title: face.get(c.id)?.title ?? c.title, tagline: face.get(c.id)?.tagline ?? c.tagline ?? '' });
  const worldName = new Map((worlds ?? []).map((w) => [w.id, w.name]));
  const all = camps ?? [];
  return (
    <>
      <p><Link className="button quiet" href="/worlds">All my worlds</Link></p>
      <WorldEditor
        world={{ id: world.id, name: world.name, tagline: world.tagline, data: world.data ?? {} }}
        campaigns={all.filter((c) => c.world_id === id).map(named)}
        others={all.filter((c) => c.world_id !== id).map((c) => ({ ...named(c), world: c.world_id ? worldName.get(c.world_id) : undefined }))}
        entries={(links ?? []).map((l: any) => l.entities).filter(Boolean).sort((a: any, b: any) => a.name.localeCompare(b.name))}
        mine={(mine ?? []) as any[]}
      />
    </>
  );
}
