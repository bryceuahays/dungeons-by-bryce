import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { PackTools } from '@/components/BrewForms';

export const metadata = { title: 'Pack' };

export default async function PackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imported?: string }> }) {
  const { id } = await params;
  const { imported } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireViewer();
  const [{ data: pack }, { data: items }, { data: mine }, { data: campaigns }, { data: faces }] = await Promise.all([
    supabase.from('packs').select('id, name, description').eq('id', id).maybeSingle(),
    supabase.from('pack_entities').select('entity_id').eq('pack_id', id),
    supabase.from('entities').select('id, type, name, depth, source, data').eq('owner_id', user.id).order('type').order('name'),
    supabase.from('campaigns').select('id, title').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''),
  ]);
  if (!pack) notFound();
  const ids = new Set((items ?? []).map((i) => i.entity_id));
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f.title]));
  return (
    <>
      <h1>Pack: {pack.name}</h1>
      <p><Link className="button quiet" href="/homebrew">All my homebrew</Link></p>
      {imported ? <div className="panel"><p className="good" role="status">{imported} entr{imported === '1' ? 'y was' : 'ies were'} imported as drafts.</p></div> : null}
      <PackTools pack={pack} entries={(mine ?? []).filter((e) => ids.has(e.id))} mine={(mine ?? []).map((e) => ({ id: e.id, name: e.name, type: e.type }))} campaigns={(campaigns ?? []).map((c) => ({ id: c.id, title: real.get(c.id) ?? c.title }))} />
    </>
  );
}
