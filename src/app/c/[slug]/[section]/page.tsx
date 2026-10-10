/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign, getContent, getLore, getSheetEntities, phaseLabel, type CampaignCtx } from '@/lib/campaign';
import { Sheet5e } from '@/components/Sheet5e';
import { renderSection, esc } from '@/lib/render';
import { cleanContent } from '@/lib/sanitize';
import { embedVideos } from '@/lib/video';
import { HomeExtras } from '@/components/HomeExtras';
import { SheetAccess } from '@/components/SheetAccess';
import { GuideSection } from '@/components/GuideSection';
import { PartyLive } from '@/components/PartyLive';
import { SessionForm } from '@/components/DmForms';
import { createCharacterV2, deleteCharacter } from '../actions';
import type { CharacterRow, Section, SessionRow } from '@/lib/types';

type Props = { params: Promise<{ slug: string; section: string }>; searchParams: Promise<{ race?: string; c?: string }> };

export default async function SectionPage({ params, searchParams }: Props) {
  const { slug, section: sectionSlug } = await params;
  const query = await searchParams;
  const ctx = await getCampaign(slug);
  const section = ctx.sections.find((s) => s.slug === sectionSlug);
  if (!section) notFound();
  switch (section.kind) {
    case 'sheet': return <StandardSheet ctx={ctx} pick={query.c} play={false} />;
    case 'combat': return <StandardSheet ctx={ctx} pick={query.c} play />;
    case 'sessions': return <Sessions ctx={ctx} section={section} />;
    case 'players': return <Players ctx={ctx} section={section} open={query.c} />;
    default: return <>{ctx.sections[0]?.id === section.id ? <div className="cs-guide"><HomeExtras ctx={ctx} /></div> : null}<ContentTab ctx={ctx} section={section} race={query.race} /></>;
  }
}

// ---------------------------------------------------------------- content tabs

async function sectionHtml(ctx: CampaignCtx, section: Section, race?: string) {
  const [rows, lore] = await Promise.all([getContent(ctx, { section: section.slug }), getLore(ctx)]);
  const label = ctx.isDm ? (phase: string | null | undefined) => phaseLabel(ctx.campaign, phase) : undefined;
  const whole = ctx.isDm && section.phase ? `<p class="phase-p phase-tab"><span class="phase-note">${esc(phaseLabel(ctx.campaign, section.phase))}: this whole tab</span></p>` : '';
  return embedVideos(cleanContent(whole + renderSection(rows, lore, { base: '/c/' + ctx.campaign.slug, race, label })));
}

async function ContentTab({ ctx, section, race }: { ctx: CampaignCtx; section: Section; race?: string }) {
  const html = await sectionHtml(ctx, section, race);
  return (
    <div className="cs-guide">
      <GuideSection slug={ctx.campaign.slug} html={html || `<h2>${esc(section.title)}</h2><p class="lede">Nothing here yet.</p>`} />
    </div>
  );
}

// ---------------------------------------------------------------- my character and combat

async function myCharacters(ctx: CampaignCtx) {
  const { data } = await ctx.supabase.from('characters').select('id, owner, campaign_id, data, builder, updated_at')
    .eq('campaign_id', ctx.campaign.id).eq('owner', ctx.user.id).order('updated_at', { ascending: false });
  return (data ?? []) as CharacterRow[];
}

function CharacterPicker({ slug, tab, chars, current }: { slug: string; tab: string; chars: CharacterRow[]; current: CharacterRow }) {
  if (chars.length < 2) return null;
  return (
    <p className="row">
      <span className="who">Your characters here:</span>
      {chars.map((c) => (
        <Link key={c.id} className="fchip" aria-pressed={c.id === current.id} href={`/c/${slug}/${tab}?c=${c.id}`} style={{ textDecoration: 'none' }}>{c.data?.name || 'Unnamed'}</Link>
      ))}
    </p>
  );
}

// The character sheet and its combat view.
async function StandardSheet({ ctx, pick, play }: { ctx: CampaignCtx; pick?: string; play: boolean }) {
  const slug = ctx.campaign.slug;
  const [chars, entities, party] = await Promise.all([myCharacters(ctx), getSheetEntities(ctx, undefined, { liteSpells: true }), ctx.supabase.rpc('party_cards', { c: ctx.campaign.id })]);
  const current = chars.find((c) => c.id === pick) ?? chars[0];
  if (!current) {
    return (
      <div className="cs-guide"><div className="wrap"><h2>{play ? 'Combat' : 'My character'}</h2>
        <div className="plate" style={{ marginTop: 16 }}>
          <h3>You have no character in this campaign yet</h3>
          <p>Pick a race, a class and a background, set your ability scores, and the sheet works out the rest: bonuses, hit points, proficiencies, resources and spell slots.</p>
          <form action={createCharacterV2.bind(null, slug)}><button className="act" type="submit">Create a character</button></form>
        </div>
      </div></div>
    );
  }
  const others = ((party.data ?? []) as any[]).filter((p) => p.id !== current.id);
  return (
    <div className="cs-guide">
      <div className="wrap">
        <CharacterPicker slug={slug} tab={play ? 'combat' : 'sheet'} chars={chars} current={current} />
        <Sheet5e key={current.id} character={{ id: current.id, data: current.data }} entities={entities} play={play} />
        {play ? <p className="row"><Link className="act" href={`/c/${slug}/sheet?c=${current.id}`}>Open the full sheet</Link></p> : (
          <>
            <h2>The party</h2>
            <div className="plate">
              {others.length ? others.map((p) => <div className="party-line" key={p.id}><b>{p.name || 'Unnamed character'}</b><span className="who">Level {p.level} {p.race} {p.cls}{p.player ? `. Played by ${p.player}` : ''}</span></div>) : <p className="who">Nobody else has a character here yet.</p>}
            </div>
            <form action={createCharacterV2.bind(null, slug)} style={{ marginTop: 16 }}><button className="act sm" type="submit">Make another character</button></form>
            <details style={{ marginTop: 30 }}>
              <summary className="who" style={{ cursor: 'pointer' }}>Delete this character</summary>
              <form action={deleteCharacter.bind(null, slug, current.id)} style={{ marginTop: 8 }}>
                <p className="who">This removes {current.data?.name || 'this character'} for good. It cannot be undone.</p>
                <button className="act danger" type="submit">Delete for good</button>
              </form>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- DM: sessions and players

async function Sessions({ ctx, section }: { ctx: CampaignCtx; section: Section }) {
  if (!ctx.isDm) notFound();
  const slug = ctx.campaign.slug;
  const { data } = await ctx.supabase.from('sessions').select('id, number, title, summary, meta, status, content').eq('campaign_id', ctx.campaign.id).order('number');
  const sessions = (data ?? []) as SessionRow[];
  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>{section.title}</h2>
        <p className="lede">Each session has its own page for details and planning notes.</p>
        <div className="grid g2">
          {sessions.map((s) => {
            return (
              <Link key={s.id} className="plate link sess" href={`/c/${slug}/session/${s.number}`}>
                <h3>{s.title}</h3>
                <p className="who">{s.meta}</p>
                <p>{s.summary}</p>
                <p className="kv"><b>Open</b></p>
              </Link>
            );
          })}
        </div>
        {ctx.realDm ? <><h2>Add a session</h2><div className="plate"><SessionForm slug={slug} /></div></> : null}
      </div>
    </div>
  );
}

async function OpenSheet({ ctx, id }: { ctx: CampaignCtx; id: string }) {
  const { data: ch } = await ctx.supabase.from('characters').select('id, owner, campaign_id, data, builder, updated_at').eq('id', id).eq('campaign_id', ctx.campaign.id).maybeSingle();
  if (!ch) return <p className="who">That character is not in this campaign.</p>;
  const back = <p className="row"><Link className="act sm" href={`/c/${ctx.campaign.slug}/players`}>Back to all players</Link></p>;
  const entities = await getSheetEntities(ctx, undefined, { liteSpells: true });
  return <>{back}<SheetAccess name={ch.data?.name || 'this character'} canEdit={ctx.canEdit}><Sheet5e character={{ id: ch.id, data: ch.data }} entities={entities} /></SheetAccess></>;
}

async function Players({ ctx, section, open }: { ctx: CampaignCtx; section: Section; open?: string }) {
  if (!ctx.isDm) notFound();
  if (open && /^[0-9a-f-]{36}$/.test(open)) return <div className="cs-guide"><div className="wrap"><h2>{section.title}</h2><OpenSheet ctx={ctx} id={open} /></div></div>;
  const [{ data: chars }, lore, { data: members }] = await Promise.all([
    ctx.supabase.from('characters').select('id, owner, data').eq('campaign_id', ctx.campaign.id),
    getLore(ctx),
    ctx.supabase.rpc('campaign_members', { c: ctx.campaign.id }),
  ]);
  const names: Record<string, string> = {};
  ((members ?? []) as { user_id: string; display_name: string }[]).forEach((m) => { names[m.user_id] = m.display_name; });
  names[ctx.user.id] = ctx.profile.display_name;
  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>{section.title}</h2>
        <p className="lede">Every character in this campaign, in full.</p>
        <p className="row"><span className="who">Open a sheet (read-only until you choose to edit):</span>{((chars ?? []) as any[]).map((c) => <Link key={c.id} className="fchip" style={{ textDecoration: 'none' }} href={`/c/${ctx.campaign.slug}/players?c=${c.id}`}>{c.data?.name || 'Unnamed'}</Link>)}</p>
        <PartyLive campaignId={ctx.campaign.id} initial={(chars ?? []) as any[]} races={lore.races.map((r: any) => ({ id: r.id, name: r.name }))} names={names} />
      </div>
    </div>
  );
}
