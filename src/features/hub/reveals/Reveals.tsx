/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';
import { getMembers } from '@/lib/entries';
import { campaignCanMake } from '@/lib/entitlements';
import { hasFeature } from '@/config/hub-features';
import type { ContentRow } from '@/lib/types';
import { revealFacts } from './server';
import { schedule, type BlockRow, type BrewRow, type EntryRow } from './schedule';
import { SessionStep } from './SessionStep';
import { BlockWhen, EntryWhen, PlotSecretForm, RevealNowButton } from './RevealsForms';
import '@/features/hub/ui/hidden.css';
import './reveals.css';

// The Reveals page (hub version 2, item 14; "Secrets" in Secrets.png): everything hidden across
// the hub, grouped by when it comes out, with "Reveal now" and "Change when" on each. DM only:
// a player, and a DM previewing as one, get "not found". Everything here is read with the DM's
// own login; nothing on it is ever sent to a player.
//
// The inbox of players' messages ("From your players") waits for player messages, a later item.
export async function Reveals({ slug }: { slug: string }) {
  const ctx = await getCampaign(slug);
  if (!ctx.realDm || ctx.asPlayer) notFound();
  const { campaign, supabase, perms } = ctx;
  const settings = campaign.settings;
  const writable = ctx.access.writable;

  const [{ data: entries }, { data: brew }, { data: blocks }, { data: sessions }, { data: beats }, members, facts] = await Promise.all([
    supabase.from('entries').select('id, kind, title, live, vis, vis_players, vis_stage, vis_entry, data').eq('campaign_id', campaign.id).not('kind', 'in', '(log,encounter,note,zero,beat)').order('kind').order('title'),
    supabase.from('campaign_entities').select('entity_id, vis, vis_players, vis_stage, vis_entry, entities(name, type)').eq('campaign_id', campaign.id),
    supabase.from('content').select('id, section, kind, title, visibility, hidden, phase, from_stage, reveal_when, only_players, sort').eq('campaign_id', campaign.id).eq('visibility', 'player').order('section').order('sort'),
    supabase.from('sessions').select('id, number, status, title').eq('campaign_id', campaign.id).order('number'),
    supabase.from('entries').select('id, title, status').eq('campaign_id', campaign.id).eq('kind', 'beat').order('sort'),
    getMembers(ctx),
    revealFacts(supabase, campaign, campaign.phase),
  ]);
  const chapters = campaign.phases.map((p) => ({ id: p.id, label: p.label }));
  const beatList = (beats ?? []).map((b: any) => ({ id: b.id as string, label: b.title as string }));
  const brewRows: BrewRow[] = (brew ?? []).map((a: any) => ({ entity_id: a.entity_id, vis: a.vis, vis_players: a.vis_players, vis_stage: a.vis_stage, vis_entry: a.vis_entry, name: a.entities?.name ?? '', type: a.entities?.type ?? '' }));
  const groups = hasFeature(settings, 'reveals.schedule') ? schedule({ entries: (entries ?? []) as EntryRow[], brew: brewRows, blocks: (blocks ?? []) as BlockRow[] }, {
    met: facts.met, stage: campaign.phase, chapters, beats: beatList, hitBeats: new Set((beats ?? []).filter((b: any) => b.status === 'hit').map((b: any) => b.id)),
    people: members.map((m) => ({ id: m.user_id, label: m.display_name || 'Unnamed' })),
    sessions: (sessions ?? []).map((s: any) => ({ number: Number(s.number), status: String(s.status), title: String(s.title ?? '') })),
    tabs: ctx.sections.map((s) => ({ id: s.slug, label: s.title })),
  }) : [];

  const entryById = new Map((entries ?? []).map((e: any) => [e.id, e]));
  const brewById = new Map(brewRows.map((a) => [a.entity_id, a]));
  const blockById = new Map((blocks ?? []).map((b: any) => [b.id, b]));
  const visOf = (r: any) => ({ vis: r.vis, vis_players: r.vis_players ?? [], vis_stage: r.vis_stage ?? null, vis_entry: r.vis_entry ?? null });
  const info = { met: [...facts.met], stage: campaign.phase, nextSession: facts.nextSession, beats: (beats ?? []).filter((b: any) => b.status !== 'hit').map((b: any) => ({ id: b.id, title: b.title })) };
  const pickBeats = (beats ?? []).map((b: any) => ({ id: b.id, title: b.title }));
  const canName = campaignCanMake(ctx.access, 'player_secrets');
  // who may do what: the database decides; these only leave out buttons it would refuse
  const may = (type: string) => writable && (type === 'entry' ? perms.reveal : perms.edit);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="cs-guide">
      <div className="wrap rv">
        <header className="rv-top">
          <div>
            <h1>Reveals</h1>
            <p className="rv-lede">Only you can see this page. Everything hidden across the hub, and when it comes out.</p>
          </div>
          {hasFeature(settings, 'reveals.plot') && writable && perms.edit ? <PlotSecretForm slug={campaign.slug} /> : null}
        </header>

        {!hasFeature(settings, 'reveals.schedule') ? <p className="rv-dim">The reveal schedule is switched off for this campaign (Campaign settings, Pages and features).</p>
          : !total ? <p className="rv-empty">Nothing is waiting to be revealed. Everything in this campaign is already out for the players it is meant for.</p> : (
            <p className="rv-dim">{total} {total === 1 ? 'thing is' : 'things are'} hidden. Sessions, chapters and story beats reveal them on their own; you can also reveal any of them now.</p>
          )}

        {groups.map((g) => {
          const s = g.session !== null ? (sessions ?? []).find((x: any) => Number(x.number) === g.session) : null;
          const waiting = { started: g.items.filter((i) => i.key.endsWith(':started')).length, played: g.items.filter((i) => i.key.endsWith(':played')).length };
          return (
            <section key={g.key} className="rv-group" aria-labelledby={'rv-' + g.key.replace(/[^a-z0-9]/gi, '-')}>
              <div className="rv-head">
                <h2 id={'rv-' + g.key.replace(/[^a-z0-9]/gi, '-')}>{g.title}</h2>
                <small>{g.sub}</small>
              </div>
              {s && perms.reveal && writable && s.status !== 'played' ? <SessionStep slug={campaign.slug} id={s.id} number={Number(s.number)} status={String(s.status)} waiting={waiting} /> : null}
              <ul className="rv-list">
                {g.items.map((it) => (
                  <li key={it.ref.type + it.ref.id} className="rv-item hid-box">
                    <div className="rv-what">
                      <span className="rv-type">{it.type}</span>
                      <b className="rv-name">{it.title}</b>
                      {it.note ? <span className="rv-note">{it.note}</span> : null}
                      {it.when ? <span className="rv-note">{it.when}</span> : null}
                    </div>
                    {may(it.ref.type) ? (
                      <div className="rv-acts">
                        {it.ref.type === 'block' ? <BlockWhen slug={campaign.slug} row={blockById.get(it.ref.id) as ContentRow} chapters={chapters} info={info} />
                          : <EntryWhen slug={campaign.slug} item={it.ref} value={visOf(it.ref.type === 'entry' ? entryById.get(it.ref.id) : brewById.get(it.ref.id))}
                              stages={chapters} members={members} beats={pickBeats} nextSession={facts.nextSession} canName={canName} />}
                        <RevealNowButton slug={campaign.slug} item={it.ref} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
