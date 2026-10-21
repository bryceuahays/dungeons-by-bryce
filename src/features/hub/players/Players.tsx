/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from 'next/navigation';
import { getCampaign, getSheetEntities } from '@/lib/campaign';
import { hasFeature, hasPage } from '@/config/hub-features';
import { blankV2, derive, type CharacterV2 } from '@/lib/rules/engine';
import { campaignSheetSystem } from '@/features/systems/data';
import { PlayersPage, type FullCharacter, type PartyMember, type Message } from './PlayersPage';
import { cleanShared } from './model';
import '@/features/hub/ui/hidden.css';
import './players.css';

// The Players page (hub version 2, item 13). A player gets their own characters in full, and of
// everyone else only what that player chose to share (party_shared() in the database). A DM gets
// every character in full. A player's own notes and messages to the DM are read with their login.
export async function Players({ slug }: { slug: string }) {
  const ctx = await getCampaign(slug);
  const settings = ctx.campaign.settings;
  if (!hasPage(settings, 'players')) notFound();
  const dm = ctx.realDm && !ctx.asPlayer;
  const me = ctx.asPlayer ? ctx.viewAs.player : ctx.user.id;
  const features = { sheet: hasFeature(settings, 'players.sheet'), dmnote: hasFeature(settings, 'players.dmnote'), notes: hasFeature(settings, 'players.notes'), share: hasFeature(settings, 'players.share') };

  const [{ data: party }, { data: rows }, system] = await Promise.all([
    ctx.supabase.rpc('party_shared', { c: ctx.campaign.id }),
    dm ? ctx.supabase.from('characters').select('id, owner, data, shared').eq('campaign_id', ctx.campaign.id).order('created_at')
      : me ? ctx.supabase.from('characters').select('id, owner, data, shared').eq('campaign_id', ctx.campaign.id).eq('owner', me).order('created_at') : { data: [] },
    campaignSheetSystem(ctx),
  ]);
  const entities = (rows ?? []).length ? await getSheetEntities(ctx, undefined, { liteSpells: true }) : [];
  const named = new Map((entities as any[]).map((e) => [e.id, e.name]));
  const full: FullCharacter[] = ((rows ?? []) as any[]).map((r) => {
    const c = { ...blankV2(), ...(r.data ?? {}), v: 2 } as CharacterV2;
    const d = derive(c, entities as any, system?.rules);
    return {
      id: r.id, owner: r.owner, name: c.name || 'Unnamed', race: c.race ?? '', cls: c.cls ?? '', level: c.level || 1, background: named.get(c.bgId ?? '') ?? '',
      backstory: c.backstory ?? '', appearance: c.appearance ?? '', alignment: c.alignment ?? '', gear: c.gear ?? '', gp: Number(c.gp) || 0,
      features: d.features.map((f: any) => String(f.name)).filter(Boolean).slice(0, 40),
      spells: [...new Set([...(c.spells ?? []).map((id) => named.get(id)).filter(Boolean), ...d.granted.map((g: any) => g.name)])].slice(0, 60) as string[],
      shared: cleanShared(r.shared),
    };
  });
  const members: PartyMember[] = ((party ?? []) as any[]).map((p) => ({ id: p.id, owner: p.owner, name: p.name || 'Unnamed', race: p.race, cls: p.cls, level: p.level, player: p.player, shared: cleanShared(p.shared) }));

  // the viewer's own notes, and their messages with the DM
  let notes = '', messages: Message[] = [];
  if (!dm && me) {
    const [{ data: n }, { data: m }] = await Promise.all([
      features.notes ? ctx.supabase.from('player_notes').select('body').eq('campaign_id', ctx.campaign.id).eq('user_id', me).eq('kind', 'note').eq('title', 'My notes').limit(1).maybeSingle() : { data: null },
      features.dmnote ? ctx.supabase.from('player_notes').select('id, kind, body, created_at').eq('campaign_id', ctx.campaign.id).eq('user_id', me).in('kind', ['to_dm', 'from_dm']).order('created_at', { ascending: false }).limit(30) : { data: [] },
    ]);
    notes = String(n?.body ?? '');
    messages = ((m ?? []) as any[]).map((x) => ({ id: x.id, mine: x.kind === 'to_dm', body: x.body, at: x.created_at }));
  }
  const sheetTab = ctx.sections.find((s) => s.kind === 'sheet')?.slug ?? 'sheet';
  return (
    <div className="cs-guide">
      <PlayersPage slug={ctx.campaign.slug} dm={dm} me={me} canWrite={!ctx.asPlayer && ctx.access.writable} features={features}
        full={full} members={members} notes={notes} messages={messages} sheetTab={sheetTab} />
    </div>
  );
}
