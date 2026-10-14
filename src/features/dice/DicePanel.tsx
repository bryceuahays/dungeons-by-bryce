'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useTransition } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { HiddenTag } from '@/features/hub/ui/Hidden';
import { formatResult } from './notation';
import { PRIVACY_LABEL, seenBy, type DiceRules, type Privacy } from './model';
import { saveDiceRules } from './actions';
import './dice.css';

type Roll = { id: string; user_id: string; who: string; by_dm: boolean; label: string; total: number; privacy: string; shown_to: string[]; blind: boolean; created_at: string; notation?: string; dice?: any[]; modifier?: number };
type Request = { id: string; to_user: string; asked_by: string; label: string; privacy: string; blind: boolean; what: { check?: string; notation?: string } };
type Check = { type: string; label: string; bonus: number; token: string };
type Member = { user_id: string; display_name: string };

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
const signed = (n: number) => (n >= 0 ? '+' : '') + n;

// The dice on a campaign's Dice page: roll, choose who sees the next roll, tap a check to
// roll it, answer a roll the DM asked for, and the log of rolls this viewer may see.
// The DM also asks players for rolls here and sets the campaign's dice rules.
//
// This component never makes a number. It asks the server to roll and shows what comes back.
export function DicePanel(p: {
  slug: string; campaignId: string; me: string | null; dm: boolean; dmSide: boolean; canRoll: boolean;
  rules: DiceRules; choices: Privacy[]; log: boolean; rolls: Roll[]; requests: Request[];
  characters: { id: string; name: string; checks: Check[] }[]; members: Member[]; checkNames: string[];
}) {
  const [rolls, setRolls] = useState<Roll[]>(p.rolls);
  const [requests, setRequests] = useState<Request[]>(p.requests);
  const [privacy, setPrivacy] = useState<Privacy>(p.dm && p.rules.dmHidden ? 'dm' : 'all');
  const [named, setNamed] = useState<string[]>([]);
  const [mode, setMode] = useState<'normal' | 'adv' | 'dis'>('normal');
  const [custom, setCustom] = useState('');
  const [what, setWhat] = useState('');
  const [char, setChar] = useState(p.characters[0]?.id ?? '');
  const [last, setLast] = useState<{ roll?: Roll; note?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const names = Object.fromEntries(p.members.map((m) => [m.user_id, m.display_name || 'Unnamed']));
  const add = (r: Roll) => setRolls((prev) => [r, ...prev.filter((x) => x.id !== r.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40));

  // Live: a new roll arrives the moment it is made. Realtime checks the same read rules as a
  // query, with this viewer's own token, so nothing arrives that they could not have read.
  useEffect(() => {
    const supabase = supabaseBrowser();
    let gone = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const withDice = async (row: Roll, again = true): Promise<void> => {
      const { data } = await supabase.from('roll_details').select('notation, dice, modifier').eq('roll_id', row.id).maybeSingle();
      if (gone) return;
      if (!data && again) { setTimeout(() => { void withDice(row, false); }, 800); }
      add(data ? { ...row, ...data } : row);
    };
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (gone) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (gone) return;
      channel = supabase.channel('dice-' + p.campaignId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rolls', filter: 'campaign_id=eq.' + p.campaignId }, (e: any) => { if (p.log) void withDice(e.new as Roll); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'roll_requests', filter: 'campaign_id=eq.' + p.campaignId }, (e: any) => {
          const q = e.new as (Request & { status: string }) | undefined;
          if (!q?.id) return;
          setRequests((prev) => { const rest = prev.filter((x) => x.id !== q.id); return q.status === 'open' && (p.dm || q.to_user === p.me) ? [...rest, q] : rest; });
        })
        .subscribe();
    })();
    return () => { gone = true; if (channel) supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.campaignId, p.log, p.dm, p.me]);

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`/c/${p.slug}/tools/dice/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return (await res.json().catch(() => ({ error: 'That did not work. Try again.' }))) as any;
  };
  const roll = async (body: Record<string, unknown>) => {
    if (busy || !p.canRoll) return;
    setBusy(true);
    const out = await post('roll', { privacy, players: named, mode, ...body });
    setBusy(false);
    if (out.error) return setLast({ error: out.error });
    if (out.blind) { setLast({ note: `Rolled: ${out.label}. Your DM has the result.` }); if (body.request) setRequests((prev) => prev.filter((q) => q.id !== body.request)); return; }
    setLast({ roll: out.roll });
    if (p.log) add(out.roll);
    if (body.request) setRequests((prev) => prev.filter((q) => q.id !== body.request));
  };
  const checks = p.characters.find((c) => c.id === char)?.checks ?? [];
  const answer = (q: Request) => roll({ request: q.id, check: q.what.check ? checks.find((c) => c.label.toLowerCase() === q.what.check!.toLowerCase())?.token : undefined });
  const mine = requests.filter((q) => q.to_user === p.me);
  const line = (r: Roll) => r.label + (r.dice ? ` (${formatResult({ dice: r.dice, modifier: r.modifier ?? 0 })})` : '');

  return (
    <div className="dice">
      {mine.length ? (
        <section className="dice-card" aria-label="Rolls your DM asked for">
          <h3>Your DM asks for a roll</h3>
          {mine.map((q) => (
            <div key={q.id} className="dice-ask">
              <span><b>{q.label}</b>{q.blind ? <> <HiddenTag>Blind roll: only your DM sees the result</HiddenTag></> : q.privacy === 'dm' ? <> <HiddenTag>Only you and the DM see this</HiddenTag></> : null}</span>
              <button type="button" className="dice-go" disabled={busy || !p.canRoll} onClick={() => answer(q)}>Roll {q.label}</button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="dice-card" aria-label="Roll dice">
        <h3>Roll</h3>
        {p.canRoll ? (
          <>
            <div className="dice-who">
              <span className="dice-eyebrow" id="dice-who-l">Who sees my next roll</span>
              <div className="dice-seg" role="group" aria-labelledby="dice-who-l">
                {p.choices.map((c) => <button key={c} type="button" aria-pressed={privacy === c} className={c === 'all' ? '' : 'priv'} onClick={() => setPrivacy(c)}>{PRIVACY_LABEL[c][p.dm ? 'dm' : 'player']}</button>)}
              </div>
              {privacy === 'players' ? (
                <div className="dice-named">
                  {p.members.length ? p.members.map((m) => (
                    <label key={m.user_id}><input type="checkbox" checked={named.includes(m.user_id)} onChange={(e) => setNamed(e.target.checked ? [...named, m.user_id] : named.filter((x) => x !== m.user_id))} /> {m.display_name || 'Unnamed'}</label>
                  )) : <span className="dice-dim">Nobody has joined this campaign yet.</span>}
                </div>
              ) : null}
            </div>
            <div className="dice-grid">
              {DICE.map((d) => <button key={d} type="button" className="dice-die" disabled={busy} onClick={() => roll({ notation: '1' + d, label: what.trim() })}>{d}</button>)}
            </div>
            <form className="dice-custom" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) void roll({ notation: custom, label: what.trim() }); }}>
              <label>Custom<input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="2d6+3" maxLength={120} autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
              <label>What it is for (optional)<input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Fire damage" maxLength={80} /></label>
              <button type="submit" className="dice-go" disabled={busy || !custom.trim()}>Roll</button>
            </form>
            <p className="dice-dim">Several dice and a modifier (2d6+3), several parts (1d8+1d6+2), advantage (2d20kh1) or disadvantage (2d20kl1).</p>
          </>
        ) : <p className="dice-dim">You cannot roll here right now.</p>}
        <div className="dice-last" role="status" aria-live="polite">
          {last?.error ? <p className="err">{last.error}</p> : null}
          {last?.note ? <p>{last.note}</p> : null}
          {last?.roll ? <p className={last.roll.privacy === 'all' ? '' : 'priv'}><span>{line(last.roll)}</span><b>{last.roll.total}</b></p> : null}
        </div>
      </section>

      {p.characters.length && p.canRoll ? (
        <section className="dice-card" aria-label="Tap to roll">
          <h3>Tap to roll</h3>
          <div className="dice-who">
            {p.characters.length > 1 ? <label className="dice-pick">Character<select value={char} onChange={(e) => setChar(e.target.value)}>{p.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : <span className="dice-eyebrow">{p.characters[0].name}</span>}
            <div className="dice-seg" role="group" aria-label="Advantage or disadvantage">
              {([['normal', 'Normal'], ['adv', 'Advantage'], ['dis', 'Disadvantage']] as const).map(([m, label]) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{label}</button>)}
            </div>
          </div>
          {([['ability', 'Attributes'], ['save', 'Saving throws'], ['skill', 'Skills'], ['initiative', 'Initiative']] as const).map(([type, title]) => {
            const list = checks.filter((c) => c.type === type);
            return list.length ? (
              <div key={type}>
                <span className="dice-eyebrow">{title}</span>
                <div className="dice-checks">
                  {list.map((c) => <button key={c.label} type="button" className="dice-check" disabled={busy} onClick={() => roll({ check: c.token })}><span>{c.label}</span><b>{signed(c.bonus)}</b></button>)}
                </div>
              </div>
            ) : null;
          })}
        </section>
      ) : null}

      {p.log ? (
        <section className="dice-card" aria-label="Party rolls">
          <h3>Party rolls</h3>
          <p className="dice-dim">The latest rolls you can see. Private rolls are marked.</p>
          {rolls.length ? (
            <ol className="dice-log">
              {rolls.map((r) => {
                const seen = seenBy(r, p.me, p.dmSide, names);
                return (
                  <li key={r.id} className={r.privacy === 'all' ? '' : 'priv'}>
                    <span className="dice-roll-what">
                      <small>{r.user_id === p.me ? 'You' : r.who || 'Someone'}{seen ? <> · <HiddenTag>{seen}</HiddenTag></> : null}</small>
                      <span>{line(r)}</span>
                    </span>
                    <b>{r.total}</b>
                  </li>
                );
              })}
            </ol>
          ) : <p className="dice-dim">No rolls yet.</p>}
        </section>
      ) : null}

      {p.dm ? <AskForm slug={p.slug} members={p.members} checkNames={p.checkNames} open={requests} post={post} names={names} onGone={(id) => setRequests((prev) => prev.filter((q) => q.id !== id))} onMade={(made) => setRequests((prev) => [...prev.filter((q) => !made.some((m) => m.id === q.id)), ...made])} /> : null}
      {p.dm ? <RulesForm slug={p.slug} rules={p.rules} checkNames={p.checkNames} /> : null}
    </div>
  );
}

// "Ask for a roll": the DM picks who, what, and who will see it. A blind roll is rolled by
// the player and seen only by the DM.
function AskForm({ slug, members, checkNames, open, post, names, onGone, onMade }: { slug: string; members: Member[]; checkNames: string[]; open: Request[]; post: (path: string, body: Record<string, unknown>) => Promise<any>; names: Record<string, string>; onGone: (id: string) => void; onMade: (made: Request[]) => void }) {
  void slug;
  const [to, setTo] = useState<string[]>([]);
  const [check, setCheck] = useState(checkNames[0] ?? '');
  const [notation, setNotation] = useState('');
  const [see, setSee] = useState<'all' | 'dm' | 'blind'>('all');
  const [msg, setMsg] = useState<{ error?: string; note?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const out = await post('ask', { to, ...(check === '' ? { notation } : { check }), privacy: see === 'all' ? 'all' : 'dm', blind: see === 'blind' });
    setBusy(false);
    if (out.error) return setMsg({ error: out.error });
    onMade(out.requests ?? []);
    setMsg({ note: 'Asked.' });
  };
  return (
    <section className="dice-card" aria-label="Ask for a roll">
      <h3>Ask for a roll</h3>
      {members.length ? (
        <>
          <span className="dice-eyebrow">Who rolls</span>
          <div className="dice-named">{members.map((m) => <label key={m.user_id}><input type="checkbox" checked={to.includes(m.user_id)} onChange={(e) => setTo(e.target.checked ? [...to, m.user_id] : to.filter((x) => x !== m.user_id))} /> {m.display_name || 'Unnamed'}</label>)}</div>
          <div className="dice-custom">
            <label>What they roll<select value={check} onChange={(e) => setCheck(e.target.value)}>{checkNames.map((n) => <option key={n} value={n}>{n}</option>)}<option value="">Something else (write the dice)</option></select></label>
            {check === '' ? <label>The dice<input value={notation} onChange={(e) => setNotation(e.target.value)} placeholder="1d20+2" maxLength={120} /></label> : null}
            <label>Who sees the result<select value={see} onChange={(e) => setSee(e.target.value as any)}><option value="all">Everyone</option><option value="dm">The player and the DM</option><option value="blind">Only the DM (a blind roll)</option></select></label>
            <button type="button" className="dice-go" disabled={busy || !to.length || (check === '' && !notation.trim())} onClick={send}>Ask</button>
          </div>
          {msg?.error ? <p className="err" role="alert">{msg.error}</p> : null}
          {msg?.note ? <p className="okmsg" role="status">{msg.note}</p> : null}
        </>
      ) : <p className="dice-dim">Nobody has joined this campaign yet.</p>}
      {open.length ? (
        <>
          <span className="dice-eyebrow">Waiting for</span>
          {open.map((q) => (
            <div key={q.id} className="dice-ask">
              <span><b>{names[q.to_user] ?? 'A player'}</b>: {q.label}{q.blind ? ' (blind)' : q.privacy === 'dm' ? ' (to you only)' : ''}</span>
              <button type="button" className="dice-quiet" onClick={async () => { const out = await post('ask', { cancel: q.id }); if (!out.error) onGone(q.id); }}>Cancel</button>
            </div>
          ))}
        </>
      ) : null}
    </section>
  );
}

// The campaign's dice rules (Settings.png). Item 7 moves this into Campaign settings.
function RulesForm({ slug, rules, checkNames }: { slug: string; rules: DiceRules; checkNames: string[] }) {
  const [r, setR] = useState<DiceRules>(rules);
  const [msg, setMsg] = useState<{ error?: string; note?: string } | null>(null);
  const [pending, start] = useTransition();
  const tick = (k: 'dmOnly' | 'self' | 'dmHidden' | 'showDice', label: string) => (
    <label key={k} className="dice-rule"><input type="checkbox" checked={r[k]} onChange={(e) => { setMsg(null); setR({ ...r, [k]: e.target.checked }); }} /> <span>{label}</span></label>
  );
  const skills = checkNames.filter((n) => !/ (save|check)$/.test(n) && n !== 'Initiative');
  return (
    <section className="dice-card" aria-label="Dice rules">
      <h3>Dice rules</h3>
      {tick('dmOnly', 'Players can roll to the DM only')}
      {tick('self', 'Players can roll just for themselves')}
      {tick('dmHidden', 'DM rolls are hidden by default')}
      {tick('showDice', 'Show the roll and modifier, not just the total')}
      <span className="dice-eyebrow">Always private (players cannot choose otherwise)</span>
      <div className="dice-named">
        {skills.map((n) => <label key={n}><input type="checkbox" checked={r.alwaysPrivate.includes(n)} onChange={(e) => { setMsg(null); setR({ ...r, alwaysPrivate: e.target.checked ? [...r.alwaysPrivate, n] : r.alwaysPrivate.filter((x) => x !== n) }); }} /> {n}</label>)}
      </div>
      <p className="dice-save">
        <button type="button" className="dice-go" disabled={pending} onClick={() => start(async () => setMsg(await saveDiceRules(slug, r)))}>{pending ? 'Saving' : 'Save dice rules'}</button>
        {msg?.error ? <span className="err" role="alert">{msg.error}</span> : null}
        {msg?.note ? <span className="okmsg" role="status">{msg.note}</span> : null}
      </p>
    </section>
  );
}
