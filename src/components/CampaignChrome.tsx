'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { setViewAsPlayer } from '@/app/c/[slug]/actions';
import { headReveal } from '@/app/(hub)/actions';

type Tab = { slug: string; title: string; kind: string };

export function CampaignChrome({ slug, title, playerTitle, tabs, isDm, realDm, asPlayer, headView, readOnly, previewNote }: { slug: string; title: string; playerTitle: string | null; tabs: Tab[]; isDm: boolean; realDm: boolean; asPlayer: boolean; headView: string | null; readOnly?: boolean; previewNote?: string }) {
  const path = usePathname();
  const base = '/c/' + slug;
  const rest = path.slice(base.length).split('/').filter(Boolean);
  const current = rest[0] === 'tools' ? '' : rest[0] === 'edit' ? rest[1] : rest[0] === 'session' ? 'sessions' : rest[0] === 'builder' ? 'sheet' : rest[0] || tabs[0]?.slug;
  const onContent = tabs.find((t) => t.slug === rest[0])?.kind === 'content';

  // "Hide DM secrets": blurs secret blocks while players can see the DM's screen.
  const [veiled, setVeiled] = useState(false);
  useEffect(() => { try { setVeiled(localStorage.getItem('dbb-veil') === '1'); } catch {} }, []);
  useEffect(() => {
    document.querySelectorAll('.campaign .cs-guide').forEach((el) => el.classList.toggle('veiled', isDm && veiled));
  }, [veiled, isDm, path]);
  const toggleVeil = () => { const v = !veiled; setVeiled(v); try { localStorage.setItem('dbb-veil', v ? '1' : '0'); } catch {} };

  return (
    <>
      {asPlayer ? (
        <div className="preview" role="status">
          You are viewing this campaign exactly as a player receives it{previewNote ? ` (${previewNote})` : ''}.
          <form action={setViewAsPlayer.bind(null, slug, false)} style={{ display: 'inline' }}><button type="submit">Back to the DM view</button></form>
        </div>
      ) : null}
      {headView ? (
        <div className="preview" role="status">
          You unhid this campaign as Head DM. You are reading what its DM sees, secrets included, and you cannot change anything.
          <form action={headReveal.bind(null, headView, false)} style={{ display: 'inline' }}><button type="submit">Hide it from me again</button></form>
        </div>
      ) : null}
      {readOnly ? (
        <div className="preview" role="status">
          This campaign is read-only: the free plan runs one campaign. Nothing has been deleted, and everyone can still open and read it. <Link href="/upgrade">Pro unlocks it again</Link>.
        </div>
      ) : null}
      <div className="strip">
        <Link href="/campaigns">← Dungeons by Bryce</Link>
        <span className="tools">
          <span>{title}{playerTitle ? <> <span className="phase-note">players see: {playerTitle}</span></> : null}</span>
          {isDm && realDm ? (
            <>
              {onContent ? <Link href={`${base}/edit/${rest[0]}`}>Edit this page</Link> : null}
              {rest[0] === 'edit' ? <Link href={`${base}/${rest[1]}`}>Done editing</Link> : null}
              <Link href={`${base}/manage`}>Manage</Link>
              <form action={setViewAsPlayer.bind(null, slug, true)} style={{ display: 'inline' }}><button type="submit">View as player</button></form>
            </>
          ) : null}
          {realDm && asPlayer ? <form action={setViewAsPlayer.bind(null, slug, false)} style={{ display: 'inline' }}><button type="submit">View as DM</button></form> : null}
          <Link href={`${base}/tools`} aria-current={rest[0] === 'tools' ? 'page' : undefined}>Table tools</Link>
          {!realDm ? <Link href="/account">Account</Link> : null}
        </span>
      </div>
      <div className="cs-guide tabwrap">
        <nav className="tabs" aria-label="Sections">
          <div className="tabrow" role="tablist">
            {tabs.map((t) => (
              <Link key={t.slug} className="tab" role="tab" aria-selected={current === t.slug} href={`${base}/${t.slug}`}>{t.title}</Link>
            ))}
            {isDm ? (
              <>
                <span className="spacer" />
                <button className="btn" aria-pressed={veiled} onClick={toggleVeil}>{veiled ? 'Show DM secrets' : 'Hide DM secrets'}</button>
              </>
            ) : null}
          </div>
        </nav>
      </div>
    </>
  );
}
