import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { TYPES } from '@/config/homebrew';
import { EntityCard } from '@/components/EntityCard';
import { CloneButton } from '@/components/BrewForms';

export const metadata = { title: 'SRD' };

export default async function Srd({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type = 'race' } = await searchParams;
  const { supabase } = await requireViewer();
  const { data } = await supabase.from('entities').select('id, type, name, source, data').eq('source', 'srd').eq('type', TYPES[type] ? type : 'race').order('name').limit(500);
  return (
    <>
      <h1>The SRD</h1>
      <div className="panel">
        <p>The fifth edition rules content that comes with every account. Open an entry to read it, or clone it and change the copy. <Link href="/legal">Licence</Link>.</p>
        <p className="inline">{Object.entries(TYPES).filter(([id]) => id !== 'resource').map(([id, t]) => <Link key={id} className={'button' + (id === type ? '' : ' quiet')} href={'/homebrew/srd?type=' + id}>{t.plural}</Link>)}</p>
      </div>
      {(data ?? []).map((e) => (
        <details key={e.id} className="panel srd-entry">
          <summary><b>{e.name}</b></summary>
          <EntityCard type={e.type} name={e.name} source="srd" data={e.data} />
          <CloneButton id={e.id} />
        </details>
      ))}
      {(data ?? []).length ? null : <div className="panel"><p className="dim">Nothing of this kind in the SRD set.</p></div>}
    </>
  );
}
