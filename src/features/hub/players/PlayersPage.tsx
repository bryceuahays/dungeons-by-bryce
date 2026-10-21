'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { SHARED_FIELDS, ago, cardLine, sharesAnything, type Shared } from './model';
import { saveMyNotes, saveShared, sendToDm } from './actions';

export type FullCharacter = {
  id: string; owner: string; name: string; race: string; cls: string; level: number; background: string;
  backstory: string; appearance: string; alignment: string; gear: string; gp: number; features: string[]; spells: string[]; shared: Shared;
};
export type PartyMember = { id: string; owner: string; name: string; race: string; cls: string; level: number; player: string; shared: Shared };
export type Message = { id: string; mine: boolean; body: string; at: string };
type Features = { sheet: boolean; dmnote: boolean; notes: boolean; share: boolean };
type Msg = { error?: string; note?: string } | null;
const Say = ({ m }: { m: Msg }) => (m?.error ? <span className="err" role="alert">{m.error}</span> : m?.note ? <span className="okmsg" role="status">{m.note}</span> : null);

// The Players page (Players.png). Chips for each character; the viewer's own in full (backstory,
// inventory, spells and features, personality) with what they share with the party; anyone else's
// only as their player shared it. Below, a private note to the DM and the player's own notes.
export function PlayersPage({ slug, dm, me, canWrite, features, full, members, notes, messages, sheetTab }: {
  slug: string; dm: boolean; me: string | null; canWrite: boolean; features: Features; full: FullCharacter[]; members: PartyMember[];
  notes: string; messages: Message[]; sheetTab: string;
}) {
  const first = (dm ? full[0]?.id : full.find((c) => c.owner === me)?.id) ?? members[0]?.id ?? null;
  const [pick, setPick] = useState<string | null>(first);
  const chosen = full.find((c) => c.id === pick) ?? null;
  const other = chosen ? null : members.find((m) => m.id === pick) ?? null;
  const card = chosen ?? other;
  const player = members.find((m) => m.id === pick)?.player ?? '';
  const mine = !!chosen && chosen.owner === me && !dm;

  return (
    <div className="wrap pl">
      <header>
        <h1>Players</h1>
        <p className="pl-lede">{dm ? 'Every character in full. Players see their own, and what the others choose to share.' : 'Your character in full, and what you know about your party.'}</p>
      </header>
      {members.length ? (
        <div className="pl-chips" role="group" aria-label="Characters">
          {members.map((m) => <button key={m.id} type="button" aria-pressed={pick === m.id} onClick={() => setPick(m.id)}>{m.name}{m.owner === me && !dm ? ' (you)' : ''}</button>)}
        </div>
      ) : <p className="pl-dim">{dm ? 'Nobody has made a character in this campaign yet.' : 'Nobody has made a character here yet. Make yours from the character sidebar or the Sheet tab.'}</p>}

      {card ? (
        <section className="pl-card pl-head" aria-labelledby="pl-name">
          <span className="pl-face" aria-hidden="true">{card.name.slice(0, 1).toUpperCase()}</span>
          <div className="pl-who">
            <h2 id="pl-name">{card.name}</h2>
            <p className="pl-dim">{cardLine({ race: card.race, cls: card.cls, level: card.level, background: chosen?.background })}</p>
            {player ? <p className="pl-dim">Played by {player}</p> : null}
          </div>
          {chosen && features.sheet && (mine || dm) ? <Link className="act" href={`/c/${slug}/${sheetTab}?c=${chosen.id}`}>{mine ? 'Edit my sheet' : 'Open the full sheet'}</Link> : null}
          {other ? <p className="pl-dim pl-seen">You see what this player chose to share</p> : null}
        </section>
      ) : null}

      {chosen && features.sheet ? (
        <div className="pl-grid">
          <Box title="Backstory" body={chosen.backstory} empty={mine ? 'Write it on your sheet.' : 'Not written yet.'} />
          <Box title="Inventory" body={[chosen.gear, chosen.gp ? `${chosen.gp} gp` : ''].filter(Boolean).join('\n')} empty="Nothing listed yet." />
          <Box title="Spells and features" body={[chosen.features.length ? chosen.features.join(', ') : '', chosen.spells.length ? 'Spells: ' + chosen.spells.join(', ') : ''].filter(Boolean).join('\n\n')} empty="None yet." />
          <Box title="Personality" body={[chosen.alignment ? 'Alignment: ' + chosen.alignment : '', chosen.appearance].filter(Boolean).join('\n')} empty="Not written yet." />
        </div>
      ) : null}

      {other ? (
        features.share && sharesAnything(other.shared) ? (
          <div className="pl-grid">
            {SHARED_FIELDS.map(([k, title]) => (other.shared[k] ? <Box key={k} title={title} body={other.shared[k]} empty="" /> : null))}
          </div>
        ) : <p className="pl-dim">{features.share ? `${other.name}'s player has not shared anything with the party yet.` : 'Sharing with the party is switched off in this campaign.'}</p>
      ) : null}

      {chosen && mine && features.share ? <ShareForm slug={slug} character={chosen} canWrite={canWrite} /> : null}
      {chosen && dm && features.share && sharesAnything(chosen.shared) ? (
        <section className="pl-card"><h2 className="pl-h">What {chosen.name}&apos;s player shares with the party</h2>
          {SHARED_FIELDS.map(([k, title]) => (chosen.shared[k] ? <p key={k}><b>{title}:</b> {chosen.shared[k]}</p> : null))}
        </section>
      ) : null}

      {!dm && me && (features.dmnote || features.notes) ? (
        <div className="pl-pair">
          {features.dmnote ? <DmNote slug={slug} messages={messages} canWrite={canWrite} /> : null}
          {features.notes ? <MyNotes slug={slug} initial={notes} canWrite={canWrite} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Box({ title, body, empty }: { title: string; body: string; empty: string }) {
  return (
    <section className="pl-card pl-box"><h2 className="pl-h">{title}</h2>
      {body ? <p className="pl-text">{body}</p> : <p className="pl-dim">{empty}</p>}
    </section>
  );
}

// What the player shares with the party.
function ShareForm({ slug, character, canWrite }: { slug: string; character: FullCharacter; canWrite: boolean }) {
  const [v, setV] = useState<Shared>(character.shared);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  useEffect(() => { setV(character.shared); setM(null); }, [character.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form className="pl-card pl-share" onSubmit={(e) => { e.preventDefault(); start(async () => setM(await saveShared(slug, character.id, v))); }}>
      <h2 className="pl-h">What the party knows about {character.name}</h2>
      <p className="pl-dim">The rest of the party sees only what you write here, never your sheet. Leave a box empty to share nothing.</p>
      {SHARED_FIELDS.map(([k, title, hint]) => (
        <label key={k} className="f">{title}<textarea rows={3} maxLength={2000} value={v[k]} placeholder={hint} disabled={!canWrite} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
      ))}
      <p className="row"><button className="act" disabled={pending || !canWrite}>{pending ? 'Saving…' : 'Share with the party'}</button><Say m={m} /></p>
    </form>
  );
}

// A private note to the DM, and the conversation so far.
function DmNote({ slug, messages, canWrite }: { slug: string; messages: Message[]; canWrite: boolean }) {
  const [text, setText] = useState('');
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <section className="pl-card pl-dm hid-box" aria-labelledby="pl-dm-h">
      <h2 id="pl-dm-h" className="pl-h2">Private note to the DM</h2>
      <p className="pl-secret">Only the DM sees this. Good for backstory secrets and sneaky plans.</p>
      <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await sendToDm(slug, text); setM(r); if (!r.error) setText(''); }); }}>
        <label className="pl-sr" htmlFor="pl-dm-text">Message to the DM</label>
        <textarea id="pl-dm-text" rows={4} maxLength={2000} value={text} placeholder="What does the DM need to know?" disabled={!canWrite} onChange={(e) => setText(e.target.value)} />
        <p className="row pl-end"><Say m={m} /><button className="pl-send" disabled={pending || !canWrite || !text.trim()}>{pending ? 'Sending…' : 'Send to DM'}</button></p>
      </form>
      {messages.length ? (
        <ul className="pl-thread" aria-label="Your messages with the DM">
          {messages.map((x) => <li key={x.id} className={x.mine ? 'mine' : 'dm'}><small>{x.mine ? 'You' : 'Your DM'} · {ago(x.at)}</small><span>{x.body}</span></li>)}
        </ul>
      ) : null}
    </section>
  );
}

// The player's own notes, saved as they type.
function MyNotes({ slug, initial, canWrite }: { slug: string; initial: string; canWrite: boolean }) {
  const [text, setText] = useState(initial);
  const [m, setM] = useState<Msg>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = (v: string) => {
    setText(v); setM({ note: 'Saving…' });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveMyNotes(slug, v).then(setM); }, 800);
  };
  return (
    <section className="pl-card" aria-labelledby="pl-notes-h">
      <h2 id="pl-notes-h" className="pl-h2">My notes</h2>
      <label className="pl-sr" htmlFor="pl-notes">My notes</label>
      <textarea id="pl-notes" rows={8} maxLength={20000} value={text} placeholder="Names, clues, things to remember…" disabled={!canWrite} onChange={(e) => change(e.target.value)} />
      <p className="pl-dim">Only you can read these. Not even the DM. <Say m={m} /></p>
    </section>
  );
}
