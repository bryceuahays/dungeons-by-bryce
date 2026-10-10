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
import { AvailableList, type AvailRow } from '@/components/AvailableList';
import { CharacterChooser } from '@/components/CharacterChooser';
import { TYPES } from '@/config/homebrew';
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
  const chars = await myCharacters(ctx);
  // what these characters already use stays, even if homebrew has since replaced it
  const used = chars.flatMap((c) => { const d = c.data ?? {}; return [d.raceId, d.clsId, d.subId, d.bgId, ...(d.feats ?? []), ...(d.spells ?? [])].filter(Boolean) as string[]; });
  const [entities, party] = await Promise.all([getSheetEntities(ctx, undefined, { liteSpells: true, keep: used }), ctx.supabase.rpc('party_cards', { c: ctx.campaign.id })]);
  const current = chars.find((c) => c.id === pick) ?? chars[0];
  // characters you made in the other campaigns of this campaign's world, which can be brought in
  const worldId = (ctx.campaign as any).world_id as string | null;
  const [{ data: worldCamps }, { data: worldRow }] = worldId ? await Promise.all([
    ctx.supabase.from('campaigns').select('id, title').eq('world_id', worldId).neq('id', ctx.campaign.id),
    ctx.supabase.from('worlds').select('name').eq('id', worldId).maybeSingle(),
  ]) : [{ data: [] as any[] }, { data: null as any }];
  const { data: elsewhere } = (worldCamps ?? []).length ? await ctx.supabase.from('characters').select('id, campaign_id, data').eq('owner', ctx.user.id).in('campaign_id', (worldCamps ?? []).map((c: any) => c.id)).order('updated_at', { ascending: false }) : { data: [] as any[] };
  const line = (d: any) => [d?.level ? 'Level ' + d.level : '', d?.race, d?.cls].filter(Boolean).join(' ');
  const chooser = (
    <CharacterChooser slug={slug} current={current?.id ?? null} worldName={worldRow?.name ?? ''}
      here={chars.map((c) => ({ id: c.id, name: c.data?.name || 'Unnamed', line: line(c.data) }))}
      world={(elsewhere ?? []).map((c: any) => ({ id: c.id, name: c.data?.name || 'Unnamed', line: line(c.data), campaign: (worldCamps ?? []).find((w: any) => w.id === c.campaign_id)?.title ?? 'another campaign' }))} />
  );
  if (!current) {
    return (
      <div className="cs-guide"><div className="wrap"><h2>{play ? 'Combat' : 'My character'}</h2>
        <div className="plate" style={{ marginTop: 16 }}>
          <h3>You have no character in this campaign yet</h3>
          <p>{(elsewhere ?? []).length ? 'Bring in a character you made in another campaign in this world, or create a new one.' : 'Create one: the character creator walks you through class, background, species, ability scores, equipment and spells.'}</p>
          {chooser}
        </div>
      </div></div>
    );
  }
  const others = ((party.data ?? []) as any[]).filter((p) => p.id !== current.id);
  return (
    <div className="cs-guide">
      <div className="wrap">
        {play ? <CharacterPicker slug={slug} tab="combat" chars={chars} current={current} /> : chooser}
        {!play ? <p className="row"><Link className="act sm" href={`/c/${slug}/create?c=${current.id}`}>{current.data?.built ? 'Change it in the character creator' : 'Continue in the character creator'}</Link></p> : null}
        <Sheet5e key={current.id} character={{ id: current.id, data: current.data }} entities={entities} play={play} />
        {play ? <p className="row"><Link className="act" href={`/c/${slug}/sheet?c=${current.id}`}>Open the full sheet</Link></p> : (
          <>
            <h2>The party</h2>
            <div className="plate">
              {others.length ? others.map((p) => <div className="party-line" key={p.id}><b>{p.name || 'Unnamed character'}</b><span className="who">Level {p.level} {p.race} {p.cls}{p.player ? `. Played by ${p.player}` : ''}</span></div>) : <p className="who">Nobody else has a character here yet.</p>}
            </div>
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

// The Players tab's list of what players can pick (everything a character is made from).
const PICK_TYPES = ['race', 'class', 'subclass', 'background', 'feat', 'spell', 'item'];
const SCHOOL_LEVEL = (l: number) => (Number(l) ? 'Level ' + l : 'Cantrip');
async function Available({ ctx }: { ctx: CampaignCtx }) {
  const all = await getSheetEntities(ctx, PICK_TYPES, { liteSpells: true });
  const rows: AvailRow[] = all.map((e: any) => {
    const d = e.data ?? {};
    const group = e.type === 'subclass' ? String(d.parent ?? '') : e.type === 'feat' ? String(d.category ?? '') : e.type === 'spell' ? SCHOOL_LEVEL(d.level) : e.type === 'item' ? String(d.kind ?? (d.magic ? 'Magic item' : '')) : '';
    const note = e.type === 'class' ? (d.hd ? 'd' + d.hd + ' hit die' : '') : e.type === 'subclass' ? (d.parent ? d.parent + ' subclass' : '') : e.type === 'spell' ? [SCHOOL_LEVEL(d.level), d.school].filter(Boolean).join(' · ') : e.type === 'item' ? [d.kind, d.rarity || d.magic?.rarity].filter((x) => x && x !== 'Standard').join(' · ') : e.type === 'feat' ? (d.category ? d.category + ' feat' : '') : '';
    return { id: e.id, name: e.name, type: e.type, group, note, homebrew: e.source !== 'srd' };
  }).sort((a, b) => Number(b.homebrew) - Number(a.homebrew) || a.name.localeCompare(b.name));
  const hidden = Array.isArray(ctx.campaign.settings?.hidden) ? (ctx.campaign.settings!.hidden as string[]) : [];
  return <AvailableList slug={ctx.campaign.slug} rows={rows} types={PICK_TYPES.map((t) => [t, TYPES[t].plural] as [string, string])} hidden={hidden} />;
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
        <h3 id="available">What&apos;s available</h3>
        <p className="lede">What players can choose from when they make a character: the rules this campaign plays by, plus the homebrew added to it. Untick anything they can&apos;t pick. To change an entry itself, open it under Homebrew.</p>
        <Available ctx={ctx} />
      </div>
    </div>
  );
}
