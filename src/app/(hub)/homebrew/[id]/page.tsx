/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { getPlan } from '@/lib/entitlements';
import { TYPES } from '@/config/homebrew';
import { EntityEditor } from '@/components/EntityEditor';
import { EntityCard } from '@/components/EntityCard';
import { CloneButton } from '@/components/BrewForms';

export const metadata = { title: 'Homebrew entry' };

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireViewer();
  const { data: e } = await supabase.from('entities').select('*').eq('id', id).maybeSingle();
  if (!e) notFound();
  // an SRD entry, or one shared with you through a campaign: read it, clone it (unless it is private)
  if (e.owner_id !== user.id) {
    return (
      <>
        <h1>{e.name}</h1>
        <div className="panel"><EntityCard type={e.type} name={e.name} source={e.source} status={e.status} data={e.data} /></div>
        <p className="inline">{e.source !== 'private' ? <CloneButton id={e.id} /> : null}<Link className="button quiet" href="/homebrew">Back</Link></p>
      </>
    );
  }
  const [plan, { data: srd }, { data: versions }, { data: campaigns }, { data: attached }] = await Promise.all([
    getPlan(),
    supabase.from('entities').select('type, name, data').eq('source', 'srd').eq('type', e.type).limit(400),
    supabase.from('entity_versions').select('version, note, name, data, created_at').eq('entity_id', id).order('version', { ascending: false }),
    supabase.from('campaigns').select('id, title, phases').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_entities').select('campaign_id, vis, vis_players, vis_stage').eq('entity_id', id),
  ]);
  const [faces, members] = await Promise.all([
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''),
    Promise.all((campaigns ?? []).map((c) => supabase.rpc('campaign_members', { c: c.id }))),
  ]);
  const real = new Map((faces.data ?? []).map((f) => [f.campaign_id, f.title]));
  const links = (campaigns ?? []).map((c, i) => {
    const a = (attached ?? []).find((x) => x.campaign_id === c.id);
    return { id: c.id as string, title: (real.get(c.id) ?? c.title) as string, stages: (c.phases ?? []) as any[], members: ((members[i].data ?? []) as any[]).map((m) => ({ user_id: m.user_id, display_name: m.display_name })), attached: a ? { vis: a.vis, vis_players: a.vis_players ?? [], vis_stage: a.vis_stage } : null };
  });
  return (
    <>
      <h1>{TYPES[e.type]?.label ?? 'Entry'}: {e.name}</h1>
      <p className="inline"><Link className="button quiet" href="/homebrew">All my homebrew</Link><CloneButton id={e.id} label="Make a copy" /></p>
      <EntityEditor key={e.updated_at} id={e.id} pro={plan.pro} srd={srd ?? []} versions={(versions ?? []) as any[]} campaigns={links} version={e.version} changeNote={e.change_note} clonedFrom={e.cloned_from}
        initial={{ type: e.type, name: e.name, status: e.status, depth: e.depth, source: e.source, data: e.data }} />
    </>
  );
}
