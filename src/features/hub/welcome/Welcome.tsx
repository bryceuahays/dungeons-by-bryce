/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { getCampaign } from '@/lib/campaign';
import { getEntries } from '@/lib/entries';
import { flag } from '@/lib/flags';
import { hasFeature } from '@/config/hub-features';
import { HiddenBox, HiddenTag } from '@/features/hub/ui/Hidden';
import { readQuests } from '@/features/hub/quests/server';
import { byOrder, progress, welcomeQuests } from '@/features/hub/quests/model';
import { KIND_NAMES, REVEAL_LINKS, welcomeOf } from './model';
import { NextForm, RecapForm, RevealNowButton } from './WelcomeForms';
import './welcome.css';

// The Welcome page (Welcome.png, WelcomeDM.png): the campaign's banner and pitch, the last
// session's recap, the next session, and what has newly been revealed. The DM also writes the
// recap, sets the next session, and sees what waits for the next stage, with "Reveal now".
//
// Everything a player gets is read as them: the recap and next session are in the campaign's
// settings (only published things go there), and "newly revealed" is the reveal log, which the
// database filters per line. The DM's parts are not rendered for a player at all.
export async function Welcome({ slug }: { slug: string }) {
  const ctx = await getCampaign(slug);
  const { campaign } = ctx;
  const settings = campaign.settings;
  const base = '/c/' + campaign.slug;
  const on = (f: 'banner' | 'recap' | 'next' | 'revealed') => hasFeature(settings, `welcome.${f}`);
  const w = welcomeOf(settings);
  const dm = ctx.realDm && !ctx.asPlayer;
  const reveals = dm && (await flag('hub_v2_reveals'));
  const session = Number(settings?.session) || 0;

  // newly revealed: the latest lines of the reveal log that this viewer may read and that the
  // campaign shows players (the log's "newly revealed" feed)
  // active quests (item 17): the ones this person tracks, or the main quest first
  const quests = hasFeature(settings, 'welcome.quests') && (await flag('hub_v2_quests')) ? await readQuests(ctx) : null;
  const tracks = quests ? welcomeQuests(quests.quests, new Set(quests.tracked), hasFeature(settings, 'quests.track')) : [];

  const revealed = on('revealed') ? (await getEntries(ctx, ['log'])).filter((r) => r.live).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5) : [];

  // the DM's side: the recap draft, and what waits for the next stage
  let draft = '', recapFor = Math.max(1, session || (w.recaps[0]?.session ?? 0) + 1);
  let waiting: { id: string; kind: string; title: string; vis: string }[] = [];
  const order = campaign.phases.map((p) => p.id);
  const next = campaign.phases[order.indexOf(campaign.phase) + 1] ?? null;
  if (dm) {
    const { data: s } = await ctx.supabase.from('sessions').select('number, summary').eq('campaign_id', campaign.id).eq('number', recapFor).maybeSingle();
    draft = String(s?.summary ?? '') || (w.recaps.find((r) => r.session === recapFor)?.text ?? '');
    if (next) {
      const { data } = await ctx.supabase.from('entries').select('id, kind, title, vis').eq('campaign_id', campaign.id).in('vis', ['stage', 'players_stage']).eq('vis_stage', next.id).neq('kind', 'log').order('kind').limit(30);
      waiting = (data ?? []) as any[];
    }
  }
  const latest = w.recaps[0] ?? null;
  const day = (s: string) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

  return (
    <div className="cs-guide">
      <div className="wrap wl">
        {on('banner') ? (
          <section className="wl-card wl-banner" aria-labelledby="wl-title">
            <span className="wl-eyebrow">Welcome to</span>
            <h1 id="wl-title">{campaign.title}</h1>
            {campaign.tagline ? <p className="wl-pitch">{campaign.tagline}</p> : null}
            {typeof settings?.video === 'string' && /^https:\/\//.test(settings.video) ? <p><a href={settings.video} target="_blank" rel="noreferrer">Watch the intro</a> (opens in a new tab)</p> : null}
            {dm ? <p className="wl-acts"><Link className="wl-btn" href={`${base}/manage`}>Edit welcome section</Link><span className="wl-dim">The name, pitch and intro video are set on Manage.</span></p> : null}
          </section>
        ) : null}

        {dm && on('recap') ? (
          <section className="wl-card" aria-labelledby="wl-write">
            <h2 id="wl-write">Write the Session {recapFor} recap</h2>
            <p className="wl-dim">Players see it on this page once you publish it. Until then the draft is kept on your Sessions tab, where only DMs can read it.</p>
            <RecapForm slug={campaign.slug} session={recapFor} draft={draft} published={w.recaps.some((r) => r.session === recapFor)} />
          </section>
        ) : null}

        <div className="wl-grid">
          {on('recap') ? (
            <section className="wl-card" aria-labelledby="wl-prev">
              <div className="wl-head"><h2 id="wl-prev">Previously on…</h2>{latest ? <small>Session {latest.session}{latest.at ? ' · ' + day(latest.at) : ''}</small> : null}</div>
              {latest ? <p className="wl-text">{latest.text}</p> : <p className="wl-dim">{dm ? 'No recap published yet.' : 'Your DM has not written a recap yet.'}</p>}
              {w.recaps.length > 1 ? (
                <details className="wl-more"><summary>Read every recap</summary>
                  {w.recaps.slice(1).map((r) => <div key={r.session}><h3>Session {r.session}</h3><p className="wl-text">{r.text}</p></div>)}
                </details>
              ) : null}
            </section>
          ) : null}

          {on('next') ? (
            <section className="wl-card" aria-labelledby="wl-next">
              <div className="wl-head"><h2 id="wl-next">Next session</h2>{session ? <small>Session {session + 1}</small> : null}</div>
              {w.next.when ? <p className="wl-when">{w.next.when}</p> : <p className="wl-dim">{dm ? 'Not set yet.' : 'Your DM has not set the next session yet.'}</p>}
              {w.next.where ? <p>Where we left off: {w.next.where}</p> : null}
              {dm ? <NextForm slug={campaign.slug} when={w.next.when} where={w.next.where} /> : null}
            </section>
          ) : null}

          {dm && next ? (
            <HiddenBox label={`Hidden from players until ${next.label}`} className="wl-card wl-waiting">
              <h2>Goes live when {next.label} starts</h2>
              {waiting.length ? (
                <ul className="wl-list">
                  {waiting.map((e) => (
                    <li key={e.id}>
                      <span><small>{KIND_NAMES[e.kind] ?? e.kind}{e.vis === 'players_stage' ? ' · named players' : ''}</small>{e.title || 'Untitled'}</span>
                      <RevealNowButton slug={campaign.slug} id={e.id} title={e.title} />
                    </li>
                  ))}
                </ul>
              ) : <p className="wl-dim">Nothing in the table tools is waiting for {next.label}.</p>}
              <p className="wl-dim">{reveals ? <>Everything else that is hidden, including what waits for a session or a story beat, is on <Link href={`${base}/hub/reveals`}>Reveals</Link>.</> : 'Tabs and blocks set to appear from a chapter change with the chapter; they are on each page.'}</p>
            </HiddenBox>
          ) : null}

          {on('revealed') ? (
            <section className="wl-card" aria-labelledby="wl-new">
              <h2 id="wl-new">Newly revealed</h2>
              {revealed.length ? (
                <ul className="wl-list">
                  {revealed.map((r) => {
                    const link = REVEAL_LINKS[String(r.data?.kind ?? '')];
                    return (
                      <li key={r.id}>
                        <span><small>{link?.label ?? 'Newly revealed'}</small>{r.title}</span>
                        {link ? <Link href={`${base}/${link.page}`}>{link.where} →</Link> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="wl-dim">{dm && !settings?.feed ? <>Nothing yet. Players only see this once the &quot;newly revealed&quot; feed is on, in the <Link href={`${base}/tools/log`}>Reveal log</Link>. <HiddenTag>Only you see this note</HiddenTag></> : 'Nothing new yet.'}</p>}
            </section>
          ) : null}
          {quests ? (
            <section className="wl-card" aria-labelledby="wl-quests">
              <div className="wl-head"><h2 id="wl-quests">Active quests</h2><Link href={`${base}/hub/quests`}>Quest log →</Link></div>
              {tracks.length ? (
                <ul className="wl-quests">
                  {tracks.map((q) => {
                    const n = progress(quests.objectives.filter((o) => o.parent === q.id).sort(byOrder), quests.hidden[q.id] ?? 0);
                    return (
                      <li key={q.id} className={q.data.main ? 'main' : ''}>
                        <span className="wl-qname">{q.title}</span>
                        <small>{n.line}</small>
                        <span className="wl-bar" role="img" aria-label={n.line}><span style={{ width: (n.total ? Math.round((n.done / n.total) * 100) : 0) + '%' }} /></span>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="wl-dim">{dm ? 'No active quests yet. Add them on the Quest log.' : 'No quests yet.'}</p>}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
