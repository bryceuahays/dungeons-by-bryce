import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { getPlan, remaining } from '@/lib/entitlements';
import { TYPES } from '@/config/homebrew';
import { FREE_LIMITS } from '@/config/plans';
import { UpgradeHint } from '@/components/UpgradeHint';
import { ImportPackForm, NewPackForm } from '@/components/BrewForms';

export const metadata = { title: 'Homebrew' };

export default async function Homebrew() {
  const { supabase, user } = await requireViewer();
  const [plan, { data: mine }, { data: packs }] = await Promise.all([
    getPlan(),
    supabase.from('entities').select('id, type, name, status, depth, source, version, updated_at').eq('owner_id', user.id).order('type').order('name'),
    supabase.from('packs').select('id, name, description').eq('owner_id', user.id).order('created_at'),
  ]);
  const left = remaining(plan, 'homebrew');
  const entries = mine ?? [];
  return (
    <>
      <h1>Homebrew</h1>
      <div className="panel">
        <p>Make your own races, classes, subclasses, backgrounds, feats, spells, items, monsters, and resources. Start from nothing, or clone anything in the SRD and change it. Attach an entry to a campaign and it shows up on your players&apos; sheets.</p>
        <p className="dim">{plan.pro ? 'You have the full builder.' : `Free plan: ${entries.length} of ${FREE_LIMITS.homebrew} entries used, in Quick mode.`}</p>
        <p className="inline"><Link className="button quiet" href="/homebrew/srd">Browse the SRD (2014 and 2024 rules)</Link> <Link className="button quiet" href="/homebrew/convert">Convert from an older edition</Link></p>
      </div>
      {left <= 0 ? <UpgradeHint feature="homebrew" /> : null}

      <h2>Make something new</h2>
      <div className="cards brewtypes">
        {Object.entries(TYPES).map(([id, t]) => (
          <Link key={id} className="ccard" href={'/homebrew/new?type=' + id}><b>{t.label}</b><span>{t.blurb}</span></Link>
        ))}
      </div>

      <h2>Your entries</h2>
      <div className="panel">
        {entries.length ? (
          <ul className="list">
            {entries.map((e) => (
              <li key={e.id}>
                <span><Link href={'/homebrew/' + e.id}><b>{e.name}</b></Link> <span className="dim">{TYPES[e.type]?.label ?? e.type} · {e.status}{e.version > 1 ? ' · version ' + e.version : ''}{e.source === 'private' ? ' · private' : ''}</span></span>
                <Link href={'/homebrew/' + e.id}>Edit</Link>
              </li>
            ))}
          </ul>
        ) : <p className="dim">Nothing yet. Pick a kind above, or clone something from the SRD.</p>}
      </div>

      <h2>Packs</h2>
      {plan.pro ? (
        <div className="panel">
          <p className="dim">A pack is a group of entries. Attach a whole pack to a campaign in one go, or export it as a file to keep or pass on.</p>
          {(packs ?? []).length ? <ul className="list">{packs!.map((p) => <li key={p.id}><Link href={'/homebrew/packs/' + p.id}><b>{p.name}</b></Link><Link href={'/homebrew/packs/' + p.id}>Open</Link></li>)}</ul> : null}
          <NewPackForm />
          <ImportPackForm />
        </div>
      ) : <UpgradeHint feature="homebrew_full" />}
    </>
  );
}
