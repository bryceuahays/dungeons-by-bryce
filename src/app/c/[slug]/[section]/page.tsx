/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign, getContent, getLore, getRules, phaseLabel, type CampaignCtx } from '@/lib/campaign';
import { renderSection, esc } from '@/lib/render';
import { GuideSection } from '@/components/GuideSection';
import { SheetIsland, CombatIsland } from '@/components/Islands';
import { PartyLive } from '@/components/PartyLive';
import { SessionForm } from '@/components/DmForms';
import { createBlankCharacter, deleteCharacter } from '../actions';
import type { CharacterRow, Section, SessionRow } from '@/lib/types';

type Props = { params: Promise<{ slug: string; section: string }>; searchParams: Promise<{ race?: string; c?: string }> };

export default async function SectionPage({ params, searchParams }: Props) {
  const { slug, section: sectionSlug } = await params;
  const query = await searchParams;
  const ctx = await getCampaign(slug);
  const section = ctx.sections.find((s) => s.slug === sectionSlug);
  if (!section) notFound();
  switch (section.kind) {
    case 'sheet': return <Sheet ctx={ctx} pick={query.c} />;
    case 'combat': return <Combat ctx={ctx} pick={query.c} />;
    case 'sessions': return <Sessions ctx={ctx} section={section} />;
    case 'players': return <Players ctx={ctx} section={section} />;
    default: return <ContentTab ctx={ctx} section={section} race={query.race} />;
  }
}

// ---------------------------------------------------------------- content tabs

async function sectionHtml(ctx: CampaignCtx, section: Section, race?: string) {
  const [rows, lore] = await Promise.all([getContent(ctx, { section: section.slug }), getLore(ctx)]);
  const label = ctx.isDm ? (phase: string | null | undefined) => phaseLabel(ctx.campaign, phase) : undefined;
  const whole = ctx.isDm && section.phase ? `<p class="phase-p phase-tab"><span class="phase-note">${esc(phaseLabel(ctx.campaign, section.phase))}: this whole tab</span></p>` : '';
  return whole + renderSection(rows, lore, { base: '/c/' + ctx.campaign.slug, race, label });
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

function NoCharacter({ slug }: { slug: string }) {
  return (
    <div className="plate" style={{ marginTop: 16 }}>
      <h3>You have no character in this campaign yet</h3>
      <p>The builder walks you through your people, class, abilities, skills, gear, and spells, and fills in your sheet and combat page.</p>
      <div className="row">
        <Link className="act" href={`/c/${slug}/builder`}>Build your character</Link>
        <form action={createBlankCharacter.bind(null, slug)}><button className="act" type="submit">Start with a blank sheet</button></form>
      </div>
      <p className="who" style={{ marginTop: 12 }}>Have a character code from the old builder? Start with a blank sheet, then paste the code at the bottom of the page.</p>
    </div>
  );
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

async function Sheet({ ctx, pick }: { ctx: CampaignCtx; pick?: string }) {
  const slug = ctx.campaign.slug;
  const chars = await myCharacters(ctx);
  const current = chars.find((c) => c.id === pick) ?? chars[0];
  if (!current) {
    return <div className="cs-guide"><div className="wrap"><section id="sheet"><h2>My character</h2><NoCharacter slug={slug} /></section></div></div>;
  }
  const [form, lore, rules, party, stored] = await Promise.all([
    getContent(ctx, { section: 'sheet', kinds: ['sheet-template', 'sheet-slot'] }),
    getLore(ctx),
    getRules(ctx, ['divine', 'sheet-private']),
    ctx.supabase.rpc('party_cards', { c: ctx.campaign.id }),
    ctx.supabase.from('character_private').select('data').eq('character_id', current.id).maybeSingle(),
  ]);
  const divine: Record<string, any> = {};
  (rules.divine ?? []).forEach((r) => { divine[r.key] = r.data.v; });
  // Parts of the form that belong to a later phase are separate rows. The ones this
  // viewer may have are put back in their places; the rest never leave the database.
  const slots = new Map(form.filter((r) => r.kind === 'sheet-slot').map((r) => [r.key, r.body?.html ?? '']));
  const template = String(form.find((r) => r.kind === 'sheet-template')?.body?.html ?? '').replace(/<!--slot:([a-z0-9-]+)-->/g, (_, k) => slots.get(k) ?? '');
  // The same goes for the private fields of the sheet itself.
  const privateKeys: string[] = rules['sheet-private']?.[0]?.data.v ?? [];
  const sheetData = { ...current.data };
  privateKeys.forEach((k) => { if (stored.data?.data && k in stored.data.data) sheetData[k] = stored.data.data[k]; });
  const building = !current.data?.t && current.builder;
  const html = `<section id="sheet">
  <p class="lede">Only you and your DM can see what you enter here. <span id="saveState"></span></p>
  ${template || '<p class="who">This campaign has no character sheet set up yet.</p>'}
  <div class="plate" style="margin-top:16px">
    <h3>Paste a character code</h3>
    <p class="who">If you built a character before this site existed, your old code still works. Importing replaces this sheet.</p>
    <label class="f">Character code<textarea id="impCode" rows="3" autocomplete="off" spellcheck="false" placeholder="TBG1:..."></textarea></label>
    <p style="margin-top:10px"><button class="act" id="impBtn">Import and replace this sheet</button> <span class="who" id="impMsg"></span></p>
  </div>
</section>`;
  const others = ((party.data ?? []) as any[]).filter((p) => p.id !== current.id);
  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>My character</h2>
        <CharacterPicker slug={slug} tab="sheet" chars={chars} current={current} />
        {building ? <p className="who">This character is still being built. Finish and save it in the builder to fill in this sheet.</p> : null}
        <p className="row">
          <Link className="act" href={`/c/${slug}/builder?c=${current.id}`}>{current.builder ? 'Open in the builder' : 'Rebuild in the builder'}</Link>
          <Link className="act" href={`/c/${slug}/combat?c=${current.id}`}>Go to the combat page</Link>
          <Link className="act" href={`/c/${slug}/builder`}>Build another character</Link>
        </p>
        <SheetIsland html={html} character={{ id: current.id, data: sheetData }} races={lore.races.map(({ id, name, traits, up }: any) => ({ id, name, traits, up }))} divine={divine} divineBy={Object.keys(divine).length ? 'tier' : ''} privateKeys={privateKeys} />
        <h2>The party</h2>
        <div className="plate">
          {others.length ? others.map((p) => {
            const race = lore.races.find((r: any) => r.id === p.race);
            return <div className="party-line" key={p.id}><b>{p.name || 'Unnamed character'}</b><span className="who">Level {p.level} {race ? race.name : p.race} {p.cls}{p.player ? `. Played by ${p.player}` : ''}</span></div>;
          }) : <p className="who">Nobody else has a character here yet.</p>}
        </div>
        <details style={{ marginTop: 30 }}>
          <summary className="who" style={{ cursor: 'pointer' }}>Delete this character</summary>
          <form action={deleteCharacter.bind(null, slug, current.id)} style={{ marginTop: 8 }}>
            <p className="who">This removes {current.data?.name || 'this character'} for good. It cannot be undone.</p>
            <button className="act danger" type="submit">Delete for good</button>
          </form>
        </details>
      </div>
    </div>
  );
}

async function Combat({ ctx, pick }: { ctx: CampaignCtx; pick?: string }) {
  const slug = ctx.campaign.slug;
  const chars = await myCharacters(ctx);
  const current = chars.find((c) => c.id === pick) ?? chars[0];
  if (!current) {
    return <div className="cs-guide"><div className="wrap"><h2>Combat</h2><NoCharacter slug={slug} /></div></div>;
  }
  const lore = await getLore(ctx);
  return (
    <div className="cs-guide">
      <div className="wrap">
        {chars.length > 1 ? <div style={{ marginTop: 20 }}><CharacterPicker slug={slug} tab="combat" chars={chars} current={current} /></div> : null}
        <CombatIsland character={{ id: current.id, data: current.data }} races={lore.races.map((r: any) => ({ id: r.id, name: r.name }))} sheetHref={`/c/${slug}/sheet?c=${current.id}`} />
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
        <p className="lede">Each session has its own run sheet.</p>
        <div className="grid g2">
          {sessions.map((s) => {
            const ready = Array.isArray(s.content?.beats);
            return (
              <Link key={s.id} className="plate link sess" href={`/c/${slug}/session/${s.number}`}>
                <h3 style={ready ? { color: 'var(--gold)' } : undefined}>{s.title}</h3>
                <p className="who">{s.meta}</p>
                <p>{s.summary}</p>
                <p className="kv"><b>{ready ? 'Open the run sheet' : 'Open'}</b></p>
              </Link>
            );
          })}
        </div>
        <h2>Add a session</h2>
        <div className="plate"><SessionForm slug={slug} /></div>
      </div>
    </div>
  );
}

async function Players({ ctx, section }: { ctx: CampaignCtx; section: Section }) {
  if (!ctx.isDm) notFound();
  const [{ data: chars }, lore, { data: members }, { data: stored }, { data: labelRows }] = await Promise.all([
    ctx.supabase.from('characters').select('id, owner, data').eq('campaign_id', ctx.campaign.id),
    getLore(ctx),
    ctx.supabase.from('profiles').select('id, display_name'),
    ctx.supabase.from('character_private').select('character_id, data'),
    ctx.supabase.from('rules').select('data').eq('campaign_id', ctx.campaign.id).eq('kind', 'party-labels').limit(1),
  ]);
  const priv: Record<string, any> = {};
  (stored ?? []).forEach((p) => { priv[p.character_id] = p.data; });
  const names: Record<string, string> = {};
  (members ?? []).forEach((m) => { names[m.id] = m.display_name; });
  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>{section.title}</h2>
        <p className="lede">Every character in this campaign, in full.</p>
        <PartyLive campaignId={ctx.campaign.id} initial={(chars ?? []) as any[]} initialPrivate={priv} labels={labelRows?.[0]?.data ?? null} races={lore.races.map((r: any) => ({ id: r.id, name: r.name }))} names={names} />
      </div>
    </div>
  );
}
