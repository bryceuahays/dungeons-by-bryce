'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { HiddenTag } from '@/features/hub/ui/Hidden';
import { formatResult } from '@/features/dice/notation';
import { PRIVACY_LABEL, seenBy, type Privacy } from '@/features/dice/model';
import { signed } from './model';

type Roll = { id: string; user_id: string; who: string; by_dm: boolean; label: string; total: number; privacy: string; shown_to: string[]; blind: boolean; created_at: string; dice?: any[]; modifier?: number };
type Data = {
  dm: boolean; me: string | null; canRoll: boolean; characters: { id: string; name: string; player: string }[];
  sheet: null | { id: string; name: string; line: string; hp: number; hpMax: number; ac: number; speed: string; init: number; initToken: string | null; prof: number;
    abilities: { key: string; abbr: string; label: string; score: number; mod: number; token: string | null }[] | null;
    saves: { label: string; bonus: number; proficient: boolean; token: string | null }[] | null;
    skills: { name: string; bonus: number; proficient: boolean; expert: boolean; token: string | null }[] | null };
  log: Roll[] | null; choices: Privacy[]; startPrivacy: Privacy;
};
const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

// The character sidebar (Sidebar.png): the viewer's character, read through the rules engine
// with the campaign's system on the server; tap a score or skill to roll it; the party's latest
// rolls; the dice; and who sees the next roll. Every roll is made on the server.
export function Sidebar({ slug, campaignId }: { slug: string; campaignId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [char, setChar] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<Privacy>('all');
  const [log, setLog] = useState<Roll[]>([]);
  const [last, setLast] = useState<{ text?: string; total?: number; priv?: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState<string | null>(null);

  const load = useCallback(async (c: string | null) => {
    try {
      const res = await fetch(`/c/${slug}/sidebar${c ? '?c=' + c : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as Data;
      setData(d); setLog(d.log ?? []); setFailed(false);
      setPrivacy((p) => (d.choices.includes(p) ? p : d.startPrivacy));
    } catch { setFailed(true); }
  }, [slug]);
  useEffect(() => { void load(char); }, [load, char]);
  useEffect(() => { if (data) setPrivacy(data.startPrivacy); }, [data?.startPrivacy]); // eslint-disable-line react-hooks/exhaustive-deps

  // the party's rolls, live: Realtime checks the same read rules, with this viewer's own token
  const logOn = !!data && data.log !== null;
  useEffect(() => {
    if (!logOn) return;
    const supabase = supabaseBrowser();
    let gone = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (gone) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (gone) return;
      channel = supabase.channel('side-' + campaignId).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rolls', filter: 'campaign_id=eq.' + campaignId }, async (e: any) => {
        const row = e.new as Roll;
        const { data: d } = await supabase.from('roll_details').select('dice, modifier').eq('roll_id', row.id).maybeSingle();
        if (!gone) setLog((prev) => [{ ...row, ...(d ?? {}) }, ...prev.filter((x) => x.id !== row.id)].slice(0, 8));
      }).subscribe();
    })();
    return () => { gone = true; if (channel) supabase.removeChannel(channel); };
  }, [logOn, campaignId]);

  const roll = async (body: Record<string, unknown>) => {
    if (busy || !data?.canRoll) return;
    setBusy(true);
    try {
      const res = await fetch(`/c/${slug}/tools/dice/roll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ privacy, ...body }) });
      const out = await res.json();
      if (out.error) setLast({ error: out.error });
      else if (out.blind) setLast({ text: `Rolled: ${out.label}. Your DM has the result.` });
      else {
        const r = out.roll as Roll;
        setLast({ text: r.label + (r.dice ? ` (${formatResult({ dice: r.dice, modifier: r.modifier ?? 0 })})` : ''), total: r.total, priv: r.privacy !== 'all' });
        if (logOn) setLog((prev) => [r, ...prev.filter((x) => x.id !== r.id)].slice(0, 8));
      }
    } catch { setLast({ error: 'That did not work. Try again.' }); }
    setBusy(false);
  };

  if (failed) return <div className="sb"><p className="sb-dim">The character sidebar could not load. Reload the page to try again.</p></div>;
  if (!data) return <div className="sb" aria-busy="true"><p className="sb-dim">Loading your character…</p></div>;
  const s = data.sheet;
  const tap = (token: string | null, children: React.ReactNode, className: string, label: string) => (token ? <button type="button" className={className} disabled={busy} onClick={() => roll({ check: token })} aria-label={'Roll ' + label}>{children}</button> : <div className={className}>{children}</div>);

  return (
    <div className="sb">
      {data.dm && data.characters.length ? (
        <label className="sb-pick">DM: viewing sheet for
          <select value={s?.id ?? ''} onChange={(e) => setChar(e.target.value)}>{data.characters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.player ? ` (${c.player})` : ''}</option>)}</select>
        </label>
      ) : null}
      {!data.dm && data.characters.length > 1 ? (
        <label className="sb-pick">Character
          <select value={s?.id ?? ''} onChange={(e) => setChar(e.target.value)}>{data.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
      ) : null}

      {s ? (
        <>
          <div className="sb-who"><span className="sb-face" aria-hidden="true">{s.name.slice(0, 1).toUpperCase()}</span><span><b>{s.name}</b><small>{s.line}</small></span></div>
          <div className="sb-hp"><span>Hit points</span><b>{s.hp} / {s.hpMax}</b></div>
          <div className="sb-bar" role="img" aria-label={`${s.hp} of ${s.hpMax} hit points`}><i style={{ width: Math.max(0, Math.min(100, (s.hp / Math.max(1, s.hpMax)) * 100)) + '%' }} className={s.hp * 2 < s.hpMax ? 'low' : ''} /></div>
          <div className="sb-tiles">
            <div className="sb-tile"><small>AC</small><b>{s.ac}</b></div>
            <div className="sb-tile"><small>Speed</small><b>{s.speed || '—'}</b></div>
            {tap(s.initToken, <><small>Init</small><b>{signed(s.init)}</b></>, 'sb-tile', 'initiative')}
          </div>
          {s.abilities ? (
            <>
              <h3 className="sb-h">Attributes {data.canRoll && s.abilities.some((a) => a.token) ? <small>Tap to roll</small> : null}</h3>
              <div className="sb-abs">{s.abilities.map((a) => tap(a.token, <><small>{a.abbr}</small><b>{signed(a.mod)}</b><span>{a.score}</span></>, 'sb-ab', `${a.label} check`))}</div>
            </>
          ) : null}
          {s.skills ? (
            <>
              <h3 className="sb-h">Skills <small>Prof. {signed(s.prof)}</small></h3>
              <div className="sb-skills">{s.skills.map((k) => tap(k.token, <><i className={k.proficient ? 'yes' : ''} aria-label={k.proficient ? (k.expert ? 'expertise' : 'proficient') : undefined} /><span>{k.name}</span><b>{signed(k.bonus)}</b></>, 'sb-skill', k.name))}</div>
            </>
          ) : null}
        </>
      ) : <p className="sb-dim">{data.dm ? 'Nobody has made a character in this campaign yet.' : 'You have no character in this campaign yet.'}</p>}

      {data.log ? (
        <>
          <h3 className="sb-h">Party rolls <small>Private rolls are marked</small></h3>
          {log.length ? (
            <ol className="sb-log">
              {log.map((r) => {
                const seen = seenBy(r, data.me, data.dm, {});
                return (
                  <li key={r.id} className={r.privacy === 'all' ? '' : 'priv'}>
                    <span><small>{r.user_id === data.me ? 'You' : r.who || 'Someone'}{seen ? <> · <HiddenTag>{seen}</HiddenTag></> : null}</small>{r.label}{r.dice ? ` (${formatResult({ dice: r.dice, modifier: r.modifier ?? 0 })})` : ''}</span>
                    <b>{r.total}</b>
                  </li>
                );
              })}
            </ol>
          ) : <p className="sb-dim">No rolls yet.</p>}
        </>
      ) : null}

      {data.canRoll ? (
        <>
          <div className="sb-dice">
            {DICE.map((d) => <button key={d} type="button" disabled={busy} onClick={() => roll({ notation: '1' + d })}>{d}</button>)}
            <button type="button" aria-expanded={custom !== null} onClick={() => setCustom(custom === null ? '' : null)}>Custom</button>
          </div>
          {custom !== null ? (
            <form className="sb-custom" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) void roll({ notation: custom }); }}>
              <label className="sb-sr" htmlFor="sb-custom-in">Dice to roll</label>
              <input id="sb-custom-in" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="2d6+3" maxLength={120} autoCapitalize="off" spellCheck={false} />
              <button type="submit" disabled={busy || !custom.trim()}>Roll</button>
            </form>
          ) : null}
          {last ? <p className={'sb-last' + (last.error ? ' err' : last.priv ? ' priv' : '')} role="status">{last.error ?? last.text}{last.total !== undefined ? <b>{last.total}</b> : null}</p> : null}
          <span className="sb-h" id="sb-who-l">Who sees my next roll</span>
          <div className="sb-seg" role="group" aria-labelledby="sb-who-l">
            {data.choices.map((c) => <button key={c} type="button" aria-pressed={privacy === c} className={c === 'all' ? '' : 'priv'} onClick={() => setPrivacy(c)}>{PRIVACY_LABEL[c][data.dm ? 'dm' : 'player']}</button>)}
          </div>
        </>
      ) : null}
    </div>
  );
}
