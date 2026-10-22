'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { setViewAsPlayer } from '@/app/c/[slug]/actions';
import { headReveal } from '@/app/(hub)/actions';
import { Sidebar } from './Sidebar';
import './shell.css';

type Tab = { slug: string; title: string; kind: string; dmOnly: boolean };

// The hub version 2 frame around every campaign page (HubTop.png, Sidebar.png, Mobile.png):
// the header, the page tabs, the character sidebar beside the page, and on a phone a bottom
// bar (Home, two pages the DM picks, Character, More) with the sidebar as a drawer.
// Behind the hub_v2_shell flag; without it the campaign keeps CampaignChrome.
export function ShellFrame(p: {
  slug: string; campaignId: string; title: string; playerTitle: string | null; session: number; tabs: Tab[]; extras: { href: string; title: string }[];
  lead?: { href: string; title: string }[];   // hub version 2 pages (Welcome first), before the campaign's own tabs
  isDm: boolean; realDm: boolean; asPlayer: boolean; headView: string | null; readOnly: boolean; previewNote: string; bar: string[];
  sidebar: boolean; banner: ReactNode; children: ReactNode;
  foot?: ReactNode;   // the timeline strip (hub version 2, item 15), below every page but the Timeline tool's, which leads with it
}) {
  const path = usePathname();
  const base = '/c/' + p.slug;
  const rest = path.slice(base.length).split('/').filter(Boolean);
  const current = rest[0] === 'edit' ? rest[1] : rest[0] === 'session' ? 'sessions' : rest[0] || p.tabs[0]?.slug;
  const onContent = p.tabs.find((t) => t.slug === rest[0])?.kind === 'content';
  const editing = rest[0] === 'edit';
  // The header stays at the top of the screen, with the tabs pinned just under it. Its height
  // changes (the buttons wrap on narrower screens), so it is measured, for the tabs and sidebar.
  const top = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = top.current, frame = el?.closest<HTMLElement>('.campaign');
    if (!el || !frame || typeof ResizeObserver === 'undefined') return;
    const set = () => frame.style.setProperty('--hs-top-h', el.offsetHeight + 'px');
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [drawer, setDrawer] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { setDrawer(false); setMore(false); }, [path]);
  useEffect(() => {
    if (!drawer && !more) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawer(false); setMore(false); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [drawer, more]);

  // "Hide DM secrets": blurs secret blocks while players can see the DM's screen
  const [veiled, setVeiled] = useState(false);
  useEffect(() => { try { setVeiled(localStorage.getItem('dbb-veil') === '1'); } catch {} }, []);
  useEffect(() => { document.querySelectorAll('.campaign .cs-guide').forEach((el) => el.classList.toggle('veiled', p.isDm && veiled)); }, [veiled, p.isDm, path]);
  const toggleVeil = () => { const v = !veiled; setVeiled(v); try { localStorage.setItem('dbb-veil', v ? '1' : '0'); } catch {} };

  const tabHref = (slug: string) => `${base}/${slug}`;
  const home = p.tabs[0];
  const barTabs = p.bar.map((s) => p.tabs.find((t) => t.slug === s)).filter(Boolean) as Tab[];
  const lead = p.lead ?? [];
  const welcomeLink = lead.find((x) => x.href.endsWith('/hub/welcome'));
  const leadHere = lead.find((x) => path === x.href || path.startsWith(x.href + '/'))?.href ?? '';
  const extraHere = [...p.extras].sort((a, b) => b.href.length - a.href.length).find((x) => path === x.href || path.startsWith(x.href + '/'))?.href ?? '';
  const here = lead.find((x) => x.href === leadHere)?.title ?? (leadHere || extraHere ? '' : p.tabs.find((t) => t.slug === current)?.title) ?? p.extras.find((x) => x.href === extraHere)?.title ?? '';
  const onTab = (slug: string) => !leadHere && !extraHere && current === slug;

  return (
    <>
      {p.asPlayer ? (
        <div className="preview" role="status">
          You are viewing this campaign exactly as a player receives it{p.previewNote ? ` (${p.previewNote})` : ''}.
          <form action={setViewAsPlayer.bind(null, p.slug, false)} style={{ display: 'inline' }}><button type="submit">Back to the DM view</button></form>
        </div>
      ) : null}
      {p.headView ? (
        <div className="preview" role="status">
          You unhid this campaign as Head DM. You are reading what its DM sees, secrets included, and you cannot change anything.
          <form action={headReveal.bind(null, p.headView, false)} style={{ display: 'inline' }}><button type="submit">Hide it from me again</button></form>
        </div>
      ) : null}
      {p.readOnly ? (
        <div className="preview" role="status">
          This campaign is read-only: the free plan runs one campaign. Nothing has been deleted, and everyone can still open and read it. <Link href="/upgrade">Pro unlocks it again</Link>.
        </div>
      ) : null}

      <header className="hs-top" ref={top}>
        <Link href="/campaigns" className="hs-mark" aria-label="Back to Dungeons by Bryce"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z" /><path d="M12 2.5v19M3.5 7 12 12l8.5-5" /></svg></Link>
        <div className="hs-name">
          <b>{p.title}{p.playerTitle ? <> <span className="phase-note">players see: {p.playerTitle}</span></> : null}</b>
          <small><span className="hs-here">{here}</span><span className="hs-session">{p.session ? `Session ${p.session}` : ''}</span></small>
        </div>
        <div className="hs-acts">
          {p.isDm ? <button type="button" className="hs-btn quiet" aria-pressed={veiled} onClick={toggleVeil}>{veiled ? 'Show DM secrets' : 'Hide DM secrets'}</button> : null}
          {p.isDm && p.realDm ? <Link className="hs-btn icon" href={`${base}/manage`} aria-label="Manage" title="Manage"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg><span className="hs-sr">Manage</span></Link> : null}
          {p.isDm && p.realDm ? (
            <span className="hs-seg">
              {editing ? <Link className="on" href={`${base}/${rest[1]}`}>Done editing</Link> : onContent ? <Link href={`${base}/edit/${rest[0]}`}>Edit this page</Link> : null}
              <form action={setViewAsPlayer.bind(null, p.slug, true)}><button type="submit">View as player</button></form>
            </span>
          ) : null}
          {p.realDm && p.asPlayer ? <form action={setViewAsPlayer.bind(null, p.slug, false)}><button type="submit" className="hs-btn">View as DM</button></form> : null}
          {!p.realDm ? <Link className="hs-btn quiet hs-wide-only" href="/account">Account</Link> : null}
        </div>
      </header>
      <nav className="hs-tabs" aria-label="Sections">
        <div className="hs-tabrow">
          {lead.map((x) => <Link key={x.href} href={x.href} aria-current={x.href === leadHere ? 'page' : undefined}>{x.title}</Link>)}
          {p.tabs.map((t) => (
            <Link key={t.slug} href={tabHref(t.slug)} aria-current={onTab(t.slug) ? 'page' : undefined}>{t.title}{t.dmOnly ? <span className="hs-dm">DM only</span> : null}</Link>
          ))}
          {p.extras.map((x) => <Link key={x.href} href={x.href} aria-current={x.href === extraHere ? 'page' : undefined}>{x.title}</Link>)}
        </div>
      </nav>
      {editing ? <div className="hs-editing" role="status">Editing. Dashed purple items are hidden from players.</div> : null}
      {p.banner}

      <div className={'hs-body' + (p.sidebar ? '' : ' solo')}>
        {p.sidebar ? (
          <aside id="hs-side" className={'hs-side' + (drawer ? ' open' : '')} aria-label="Character">
            <button type="button" className="hs-grip" onClick={() => setDrawer(false)} aria-label="Close the character drawer"><span /></button>
            <Sidebar slug={p.slug} campaignId={p.campaignId} />
          </aside>
        ) : null}
        <div className="page">{p.children}</div>
      </div>
      {p.foot && !path.endsWith('/tools/timeline') ? p.foot : null}
      {drawer || more ? <button type="button" className="hs-veil" aria-label="Close" onClick={() => { setDrawer(false); setMore(false); }} /> : null}

      {more ? (
        <div className="hs-more" id="hs-more" role="dialog" aria-label="More">
          {lead.map((x) => <Link key={x.href} href={x.href} aria-current={x.href === leadHere ? 'page' : undefined}>{x.title}</Link>)}
          {p.tabs.map((t) => <Link key={t.slug} href={tabHref(t.slug)} aria-current={onTab(t.slug) ? 'page' : undefined}>{t.title}{t.dmOnly ? <span className="hs-dm">DM only</span> : null}</Link>)}
          {p.extras.map((x) => <Link key={x.href} href={x.href}>{x.title}</Link>)}
          {p.isDm && p.realDm ? <Link href={`${base}/manage`}>Manage</Link> : null}
          {!p.realDm ? <Link href="/account">Account</Link> : null}
          <Link href="/campaigns">All campaigns</Link>
        </div>
      ) : null}
      <nav className="hs-bar" aria-label="Quick links">
        {/* Home is the Welcome page when it is on, otherwise the campaign's first tab */}
        {welcomeLink ? <Link href={welcomeLink.href} aria-current={welcomeLink.href === leadHere ? 'page' : undefined}><span>Home</span></Link>
          : home ? <Link href={tabHref(home.slug)} aria-current={onTab(home.slug) ? 'page' : undefined}><span>Home</span></Link> : null}
        {barTabs.map((t) => <Link key={t.slug} href={tabHref(t.slug)} aria-current={onTab(t.slug) ? 'page' : undefined}><span>{t.title}</span></Link>)}
        {p.sidebar ? <button type="button" aria-expanded={drawer} aria-controls="hs-side" onClick={() => { setMore(false); setDrawer(!drawer); }}><span>Character</span></button> : null}
        <button type="button" aria-expanded={more} aria-controls="hs-more" onClick={() => { setDrawer(false); setMore(!more); }}><span>More</span></button>
      </nav>
    </>
  );
}
