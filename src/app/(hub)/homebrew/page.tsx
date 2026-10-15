import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { getPlan, remaining } from '@/lib/entitlements';
import { TYPES } from '@/config/homebrew';
import { FREE_LIMITS } from '@/config/plans';
import { UpgradeHint } from '@/components/UpgradeHint';
import { AttachPackForm, DeleteEntryButton, ImportPackForm, NewPackForm } from '@/components/BrewForms';
import { BrewSystemPicker } from '@/features/systems/BrewSystemPicker';
import { brewSystem, systemOfEntry } from '@/features/systems/brew';
import { loadSystem, mySystems } from '@/features/systems/data';
import { presetOf } from '@/features/systems/model';

export const metadata = { title: 'Homebrew' };

export default async function Homebrew() {
  const { supabase, user } = await requireViewer();
  const [plan, { data: mine }, { data: packs }, { data: usable }, { data: myCampaigns }, { data: faces }] = await Promise.all([
    getPlan(),
    supabase.from('entities').select('id, type, name, status, depth, source, version, updated_at, origin, system:data->>system').eq('owner_id', user.id).order('type').order('name'),
    supabase.from('packs').select('id, name, description').eq('owner_id', user.id).order('created_at'),
    supabase.from('packs').select('id, name, description, free, owner_id').eq('official', true).neq('owner_id', user.id).order('created_at'),
    supabase.from('campaigns').select('id, title').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''),
  ]);
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f.title]));
  const campaigns = (myCampaigns ?? []).map((c) => ({ id: c.id as string, title: (real.get(c.id) ?? c.title) as string }));
  const left = remaining(plan, 'homebrew');
  // entries that came with something bought are listed, but never counted toward the free limit
  const own = (mine ?? []).filter((e) => e.origin !== 'product');
  // the game system the page shows (a dropdown at the top): its kinds of homebrew, their names, and
  // the entries made for it. One of your own systems also lists the homebrew of the rules it is built on.
  const chosen = await brewSystem();
  const [systems, custom] = await Promise.all([mySystems(supabase, user.id), loadSystem(supabase, chosen)]);
  const sys = custom && custom.ownerId === user.id ? custom : presetOf(chosen);
  const shown = custom && custom.ownerId === user.id ? chosen : sys.base;
  const NAME: Record<string, string> = { race: sys.names.species, class: sys.names.class, subclass: sys.names.subclass, background: sys.names.background, feat: sys.names.feat, spell: sys.names.spell };
  const on = (type: string) => (type === 'spell' && !sys.magic.on ? false : sys.names.kinds[type === 'race' ? 'species' : type] !== false);
  const label = (type: string) => NAME[type] ?? TYPES[type]?.label ?? type;
  const entries = (mine ?? []).filter((e) => { const t = systemOfEntry({ system: e.system }); return t === shown || t === sys.base; });
  const kinds = Object.keys(TYPES).filter(on).map((t) => label(t).toLowerCase());
  return (
    <>
      <div className="brew-head"><h1>Homebrew</h1><BrewSystemPicker value={shown} mine={systems.map(({ id, name }) => ({ id, name }))} /></div>
      <div className="panel">
        <p>Make your own {kinds.slice(0, -1).join(', ')} and {kinds.at(-1)} for <b>{sys.name}</b>. Start from nothing, or clone an official entry and change it. Attach an entry to a campaign and it shows up on your players&apos; sheets.</p>
        <p className="dim">{plan.pro ? 'You have the full builder.' : `Free plan: ${own.length} of ${FREE_LIMITS.homebrew} entries of your own used, in Quick mode. Entries from packs and from bought campaigns do not count.`}</p>
        <p className="inline"><Link className="button" href="/homebrew/import">Import homebrew <span className="beta-tag">Beta</span></Link></p>
      </div>
      {left <= 0 ? <UpgradeHint feature="homebrew" /> : null}

      <h2>Make something new</h2>
      <div className="cards brewtypes">
        {Object.entries(TYPES).filter(([id]) => on(id)).map(([id, t]) => (
          <Link key={id} className="ccard" href={id === 'class' ? '/homebrew/classes' : id === 'subclass' ? '/homebrew/subclasses' : id === 'race' ? '/homebrew/races' : id === 'background' ? '/homebrew/backgrounds' : id === 'item' ? '/homebrew/items' : id === 'spell' ? '/homebrew/spells' : id === 'feat' ? '/homebrew/feats' : id === 'monster' ? '/homebrew/monsters' : '/homebrew/new?type=' + id}><b>{label(id)}</b><span>{t.blurb}</span></Link>
        ))}
      </div>

      <h2>Your entries for {sys.name}</h2>
      <div className="panel">
        {entries.length ? (
          <ul className="list">
            {entries.map((e) => (
              <li key={e.id}>
                <span><Link href={'/homebrew/' + e.id}><b>{e.name}</b></Link> <span className="dim">{label(e.type)} · {e.status}{shown !== sys.base && systemOfEntry({ system: e.system }) === sys.base ? ' · from Fifth Edition (' + sys.base + ')' : ''}{e.version > 1 ? ' · version ' + e.version : ''}{e.source === 'private' ? ' · private' : ''}{e.origin === 'product' ? ' · came with a purchase' : ''}</span></span>
                <span className="inline"><Link href={'/homebrew/' + e.id}>Edit</Link><DeleteEntryButton id={e.id} name={e.name} /></span>
              </li>
            ))}
          </ul>
        ) : <p className="dim">Nothing yet. Pick a kind above, or clone something from the SRD.</p>}
      </div>

      <h2>Packs you can use</h2>
      <div className="panel">
        <p className="dim">Official packs, free or bought. Add one to a campaign you run and its entries appear on your players&apos; sheets. They never count toward the free plan&apos;s limit. More in the <Link href="/store">store</Link>.</p>
        {(usable ?? []).length ? (usable ?? []).map((p) => (
          <div key={p.id} className="attach" style={{ display: 'block' }}>
            <p><Link href={'/homebrew/packs/' + p.id}><b>{p.name}</b></Link> <span className="dim">{p.free ? 'free' : 'bought'}. {p.description}</span></p>
            {campaigns.length ? <AttachPackForm packId={p.id} campaigns={campaigns} /> : <p className="dim">Create a campaign to add it to.</p>}
          </div>
        )) : <p className="dim">None yet.</p>}
      </div>

      <h2>Your packs</h2>
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
