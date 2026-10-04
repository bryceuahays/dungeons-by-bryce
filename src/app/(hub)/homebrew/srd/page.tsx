import Link from 'next/link';
import { requireViewer } from '@/lib/auth';

export const metadata = { title: 'SRD' };

const KINDS: [string, string][] = [['race', 'Races and species'], ['class', 'Classes'], ['subclass', 'Subclasses'], ['background', 'Backgrounds'], ['feat', 'Feats'], ['spell', 'Spells'], ['item', 'Equipment and magic items'], ['monster', 'Monsters'], ['condition', 'Conditions'], ['rule', 'Rules reference']];

// The open rules content that comes with every account: SRD 5.1 (2014 rules) and SRD 5.2
// (2024 rules). Free to read, and free to clone into the homebrew builder.
export default async function Srd({ searchParams }: { searchParams: Promise<{ type?: string; v?: string; q?: string }> }) {
  const sp = await searchParams;
  const type = KINDS.some(([k]) => k === sp.type) ? sp.type! : 'race';
  const v = sp.v === '5.1' ? '5.1' : '5.2';
  const q = String(sp.q ?? '').trim().slice(0, 60);
  const { supabase } = await requireViewer();
  let query = supabase.from('entities').select('id, name, kind:data->kind, level:data->level, cr:data->cr, section:data->section, parent:data->parent, rarity:data->rarity', { count: 'exact' }).eq('source', 'srd').eq('srd_version', v).eq('type', type).order('name').limit(400);
  if (q) query = query.ilike('name', '%' + q.replace(/[%_]/g, '') + '%');
  const { data, count } = await query;
  const href = (p: Record<string, string>) => '/homebrew/srd?' + new URLSearchParams({ type, v, ...(q ? { q } : {}), ...p }).toString();
  const note = (e: any) => (type === 'spell' ? (Number(e.level) ? 'level ' + e.level : 'cantrip') : type === 'monster' ? 'CR ' + (e.cr ?? '?') : type === 'item' ? [e.kind, e.rarity && e.rarity !== 'Standard' ? String(e.rarity).toLowerCase() : ''].filter(Boolean).join(', ') : type === 'rule' ? e.section : type === 'subclass' ? e.parent : ''); // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <>
      <h1>The SRD</h1>
      <div className="panel">
        <p>The open fifth edition rules that come free with every account. Open an entry to read it, or clone it into the homebrew builder and change the copy. <Link href="/legal">Licence</Link>.</p>
        <p className="inline"><Link className={'button' + (v === '5.2' ? '' : ' quiet')} href={href({ v: '5.2' })}>2024 rules (SRD 5.2)</Link><Link className={'button' + (v === '5.1' ? '' : ' quiet')} href={href({ v: '5.1' })}>2014 rules (SRD 5.1)</Link></p>
        <p className="inline">{KINDS.map(([id, label]) => <Link key={id} className={'button small-btn' + (id === type ? '' : ' quiet')} href={href({ type: id, q: '' })}>{label}</Link>)}</p>
        <form method="get" action="/homebrew/srd" className="inline">
          <input type="hidden" name="type" value={type} /><input type="hidden" name="v" value={v} />
          <label>Search by name<input name="q" defaultValue={q} maxLength={60} /></label>
          <button type="submit" className="quiet">Search</button>
        </form>
      </div>
      <div className="panel">
        <p className="dim">{count ?? 0} entr{count === 1 ? 'y' : 'ies'}{(count ?? 0) > 400 ? ', showing the first 400. Search to narrow it down.' : '.'}</p>
        <ul className="list srd-list">
          {(data ?? []).map((e) => <li key={e.id}><Link href={'/homebrew/' + e.id}><b>{e.name}</b></Link><span className="dim">{note(e)}</span></li>)}
        </ul>
        {(data ?? []).length ? null : <p className="dim">Nothing by that name here.</p>}
      </div>
    </>
  );
}
