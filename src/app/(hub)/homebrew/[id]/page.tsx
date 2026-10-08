/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { getPlan } from '@/lib/entitlements';
import { TYPES } from '@/config/homebrew';
import { EntityEditor } from '@/components/EntityEditor';
import { EntityCard } from '@/components/EntityCard';
import { CloneButton } from '@/components/BrewForms';
import { loadClassOptions, loadFeatOptions, loadItemNames, loadSpellOptions, loadSubclassOptions } from '@/lib/class-spells';

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
        {e.source === 'srd' ? <p className="dim">From the System Reference Document {e.srd_version} ({e.srd_version === '5.2' ? '2024' : '2014'} rules), CC-BY-4.0. <Link href="/legal">Licence</Link>.</p> : null}
        <div className="inline" style={{ marginBottom: 12 }}>{e.source !== 'private' && TYPES[e.type] ? <CloneButton id={e.id} /> : null}<Link className="button quiet" href={e.source === 'srd' ? `/homebrew/srd?type=${e.type}&v=${e.srd_version}` : '/homebrew'}>Back</Link></div>
      </>
    );
  }
  const [plan, { data: srd }, { data: versions }, { data: campaigns }, { data: attached }, spells, feats, subclasses, classes, items] = await Promise.all([
    getPlan(),
    supabase.from('entities').select('type, name, data').eq('source', 'srd').eq('type', e.type).order('srd_version').limit(700),
    supabase.from('entity_versions').select('version, note, name, data, created_at').eq('entity_id', id).order('version', { ascending: false }),
    supabase.from('campaigns').select('id, title, phases').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_entities').select('campaign_id, vis, vis_players, vis_stage').eq('entity_id', id),
    e.type === 'class' || e.type === 'subclass' || e.type === 'feat' || e.type === 'race' || e.type === 'background' || e.type === 'item' ? loadSpellOptions(supabase, user.id) : Promise.resolve(undefined),
    e.type === 'class' || e.type === 'subclass' || e.type === 'feat' || e.type === 'race' || e.type === 'background' || e.type === 'item' ? loadFeatOptions(supabase) : Promise.resolve(undefined),
    e.type === 'class' ? loadSubclassOptions(supabase, user.id) : Promise.resolve(undefined),
    e.type === 'subclass' ? loadClassOptions(supabase, user.id) : Promise.resolve(undefined),
    e.type === 'class' || e.type === 'background' || e.type === 'item' ? loadItemNames(supabase) : Promise.resolve(undefined),
  ]);
  const [faces, members] = await Promise.all([
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''),
    Promise.all((campaigns ?? []).map((c) => supabase.rpc('campaign_members', { c: c.id }))),
  ]);
  // a class saved before starting equipment and multiclassing existed: start them from its SRD class (2024, listed last)
  const base = e.type === 'class' && e.data?.baseClass ? [...(srd ?? [])].reverse().find((s) => s.name === e.data.baseClass)?.data : null;
  // and a choice the SRD now lists the options for (Metamagic, Eldritch Invocations) that is still empty
  const filled = (f: any) => {
    if (f.choice?.from !== 'custom' || f.choice.options?.length) return f;
    const srdF = (base?.features ?? []).find((x: any) => x.name === f.name && Number(x.level) === Number(f.level) && x.choice?.options?.length);
    return srdF ? { ...f, choice: { ...srdF.choice, count: f.choice.count ?? srdF.choice.count } } : f;
  };
  const data = base ? { ...e.data, startEquip: e.data.startEquip ?? base.startEquip, multiclass: e.data.multiclass ?? base.multiclass, features: (e.data.features ?? []).map(filled) } : e.data;
  const real = new Map((faces.data ?? []).map((f) => [f.campaign_id, f.title]));
  const links = (campaigns ?? []).map((c, i) => {
    const a = (attached ?? []).find((x) => x.campaign_id === c.id);
    return { id: c.id as string, title: (real.get(c.id) ?? c.title) as string, stages: (c.phases ?? []) as any[], members: ((members[i].data ?? []) as any[]).map((m) => ({ user_id: m.user_id, display_name: m.display_name })), attached: a ? { vis: a.vis, vis_players: a.vis_players ?? [], vis_stage: a.vis_stage } : null };
  });
  return (
    <>
      {e.type === 'class' || e.type === 'subclass' || e.type === 'spell' || e.type === 'feat' || e.type === 'race' || e.type === 'background' || e.type === 'item' || e.type === 'monster' ? null : <h1>{TYPES[e.type]?.label ?? 'Entry'}: {e.name}</h1>}
      <div className="inline" style={{ marginBottom: 12 }}>{e.type === 'class' || e.type === 'subclass' || e.type === 'spell' || e.type === 'feat' || e.type === 'race' || e.type === 'background' || e.type === 'item' || e.type === 'monster' ? null : <Link className="button quiet" href="/homebrew">All my homebrew</Link>}<CloneButton id={e.id} label="Make a copy" /></div>
      <EntityEditor key={e.updated_at} id={e.id} pro={plan.pro} srd={srd ?? []} versions={(versions ?? []) as any[]} campaigns={links} version={e.version} changeNote={e.change_note} clonedFrom={e.cloned_from} spells={spells} feats={feats} subclasses={subclasses} classes={classes} items={items}
        initial={{ type: e.type, name: e.name, status: e.status, depth: e.depth, source: e.source, data }} />
    </>
  );
}
