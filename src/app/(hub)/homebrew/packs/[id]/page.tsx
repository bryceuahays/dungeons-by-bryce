import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { AttachPackForm, PackTools } from '@/components/BrewForms';
import { EntityCard } from '@/components/EntityCard';

export const metadata = { title: 'Pack' };

export default async function PackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imported?: string; added?: string }> }) {
  const { id } = await params;
  const { imported, added } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireViewer();
  const [{ data: pack }, { data: items }, { data: mine }, { data: campaigns }, { data: faces }] = await Promise.all([
    supabase.from('packs').select('id, name, description, owner_id, official, free').eq('id', id).maybeSingle(),
    supabase.from('pack_entities').select('entity_id').eq('pack_id', id),
    supabase.from('entities').select('id, type, name, depth, source, data').eq('owner_id', user.id).order('type').order('name'),
    supabase.from('campaigns').select('id, title').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''),
  ]);
  if (!pack) notFound();
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f.title]));
  const ids = new Set((items ?? []).map((i) => i.entity_id));
  if (pack.owner_id !== user.id) {
    // an official pack (free, or one this account bought): its entries, and a one-click way into a campaign
    const { data: inside } = await supabase.from('entities').select('id, type, name, source, status, data').in('id', [...ids].length ? [...ids] : ['00000000-0000-0000-0000-000000000000']).order('type').order('name');
    return (
      <>
        <h1>{pack.name}</h1>
        <p><Link className="button quiet" href="/homebrew">All my homebrew</Link></p>
        {added ? <div className="panel"><p className="good" role="status">This pack is now in your account.</p></div> : null}
        <div className="panel">
          <p>{pack.description}</p>
          <p className="dim">{pack.free ? 'An official free pack.' : 'An official pack you own.'} Its entries do not count toward the free plan&apos;s homebrew limit. If you clone one to change it, the copy is yours and does count.</p>
          {(campaigns ?? []).length ? <AttachPackForm packId={pack.id} campaigns={(campaigns ?? []).map((c) => ({ id: c.id, title: real.get(c.id) ?? c.title }))} /> : <p className="dim">Create a campaign, then add this pack to it with one click.</p>}
        </div>
        {(inside ?? []).map((e) => <details key={e.id} className="panel srd-entry"><summary><b>{e.name}</b> <span className="dim">{e.type}</span></summary><EntityCard type={e.type} name={e.name} status={e.status} data={e.data} /></details>)}
      </>
    );
  }
  return (
    <>
      <h1>Pack: {pack.name}</h1>
      <p><Link className="button quiet" href="/homebrew">All my homebrew</Link></p>
      {imported ? <div className="panel"><p className="good" role="status">{imported} entr{imported === '1' ? 'y was' : 'ies were'} imported as drafts.</p></div> : null}
      <PackTools pack={pack} entries={(mine ?? []).filter((e) => ids.has(e.id))} mine={(mine ?? []).map((e) => ({ id: e.id, name: e.name, type: e.type }))} campaigns={(campaigns ?? []).map((c) => ({ id: c.id, title: real.get(c.id) ?? c.title }))} />
    </>
  );
}
