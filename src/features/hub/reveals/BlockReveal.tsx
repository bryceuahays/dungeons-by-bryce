'use client';
import { useState } from 'react';
import type { ContentRow } from '@/lib/types';
import { parseTrigger, triggerKey, triggerWords } from './triggers';
import './reveals.css';

// What the block editor knows about the campaign for reveals (issue 117): the triggers that have
// happened, the chapter it is at, the chapters, its story beats, and the next session's number.
export type RevealInfo = { met: string[]; stage: string | null; beats: { id: string; title: string }[]; nextSession: number };
type Chapter = { id: string; label: string };
type Patch = { hidden?: boolean; reveal_when?: string | null; from_stage?: string | null };
type Auto = 'self' | 'started' | 'played' | 'beat' | 'chapter';

const AUTO: [Auto, string][] = [['self', 'No, I will reveal it myself'], ['started', 'When a session starts'], ['played', 'When a session is marked played'], ['beat', 'Once a story beat happens'], ['chapter', 'When a chapter starts']];

// Is the chapter reached? The first chapter, or none, always is.
const reached = (id: string | null | undefined, chapters: Chapter[], at: string | null) => {
  if (!id) return true;
  const i = chapters.findIndex((c) => c.id === id);
  return i <= 0 || (at !== null && i <= chapters.findIndex((c) => c.id === at));
};

// Can players see this block right now? The same sum as the database's (content_select), for
// the switch. The database still decides what a player is sent.
export function blockSeen(row: Pick<ContentRow, 'visibility' | 'hidden' | 'from_stage' | 'phase'> & { reveal_when?: string | null }, chapters: Chapter[], info: RevealInfo): boolean {
  if (row.visibility !== 'player') return false;
  if (row.phase && row.phase !== info.stage) return false;
  if (row.hidden && !(row.reveal_when && info.met.includes(row.reveal_when))) return false;
  return reached(row.from_stage, chapters, info.stage);
}

// The block's reveal as one sentence, for the editor and the block's label.
export function blockRevealWords(row: Pick<ContentRow, 'visibility' | 'hidden' | 'from_stage' | 'phase'> & { reveal_when?: string | null }, chapters: Chapter[], info: RevealInfo): string {
  const names = { chapters, beats: info.beats.map((b) => ({ id: b.id, label: b.title })) };
  if (row.visibility !== 'player') return 'Only DMs see this block.';
  const seen = blockSeen(row, chapters, info);
  if (row.hidden && row.reveal_when) return seen ? `Players can see this. It was revealed when ${past(triggerWords(row.reveal_when, names))}.` : `Hidden. It reveals itself when ${triggerWords(row.reveal_when, names)}.`;
  if (row.hidden) return 'Hidden. Players see it when you reveal it.';
  if (!seen && row.from_stage) return `Hidden. It reveals itself when ${triggerWords('chapter:' + row.from_stage, names)}.`;
  if (!seen) return 'Hidden: players only see this during another chapter.';
  return 'Players can see this.';
}
const past = (s: string) => s.replace(/ starts$/, ' started').replace(/ is marked played$/, ' was marked played').replace(/ happens$/, ' happened');

// The reveal controls on a page block: one switch for "players can see this", and when it is off,
// whether it reveals itself, and when.
export function BlockReveal({ row, chapters, info, pending, save }: {
  row: ContentRow & { reveal_when?: string | null }; chapters: Chapter[]; info: RevealInfo; pending: boolean; save: (p: Patch) => void;
}) {
  const seen = blockSeen(row, chapters, info);
  const t = parseTrigger(row.reveal_when);
  const auto: Auto = row.hidden ? (t?.kind === 'session' ? t.when : t?.kind === 'beat' ? 'beat' : t?.kind === 'chapter' ? 'chapter' : 'self')
    : !reached(row.from_stage, chapters, info.stage) ? 'chapter' : 'self';
  const [session, setSession] = useState<number>(t?.kind === 'session' ? t.n : info.nextSession);
  const later = chapters.slice(1);
  const options = AUTO.filter(([a]) => (a !== 'beat' || info.beats.length > 0 || auto === 'beat') && (a !== 'chapter' || later.length > 0));

  // "reveal now" clears whatever it was waiting for; "hide" keeps nothing waiting either
  const flip = () => save(seen ? { hidden: true, reveal_when: null, from_stage: reached(row.from_stage, chapters, info.stage) ? row.from_stage ?? null : null }
    : { hidden: false, reveal_when: null, from_stage: reached(row.from_stage, chapters, info.stage) ? row.from_stage ?? null : null });
  const choose = (a: Auto, n = session) => {
    if (a === 'self') save({ hidden: true, reveal_when: null, from_stage: null });
    else if (a === 'started' || a === 'played') save({ hidden: true, reveal_when: triggerKey({ kind: 'session', n, when: a }), from_stage: null });
    else if (a === 'beat') save({ hidden: true, reveal_when: info.beats[0] ? 'beat:' + info.beats[0].id : null, from_stage: null });
    else save({ hidden: false, reveal_when: null, from_stage: later[0]?.id ?? null });
  };
  const okSession = (n: number) => Number.isInteger(n) && n >= 1 && n <= 999;

  if (row.phase) return <p className="br-note">Players see this only during {chapters.find((c) => c.id === row.phase)?.label ?? 'one chapter'}. Choose “Always” under When to reveal it another way.</p>;

  return (
    <div className="br">
      <button type="button" role="switch" aria-checked={seen} className={'br-switch' + (seen ? ' on' : '')} disabled={pending} onClick={flip}>
        <span className="br-knob" aria-hidden="true" />
        <span>{seen ? 'Players can see this' : 'Hidden from players'}</span>
      </button>
      {!seen ? (
        <div className="br-auto">
          <label>Reveal it automatically?
            <select value={auto} disabled={pending} onChange={(e) => choose(e.target.value as Auto)}>
              {options.map(([a, label]) => <option key={a} value={a}>{label}</option>)}
            </select>
          </label>
          {auto === 'started' || auto === 'played' ? (
            <label>Session
              <input type="number" min={1} max={999} inputMode="numeric" value={session || ''} disabled={pending}
                onChange={(e) => setSession(Math.trunc(Number(e.target.value)))}
                onBlur={() => { if (okSession(session) && session !== (t?.kind === 'session' ? t.n : 0)) choose(auto, session); }} />
            </label>
          ) : null}
          {auto === 'beat' ? (
            <label>Which beat
              <select value={t?.kind === 'beat' ? t.id : ''} disabled={pending} onChange={(e) => save({ hidden: true, reveal_when: e.target.value ? 'beat:' + e.target.value : null })}>
                {t?.kind === 'beat' && !info.beats.some((b) => b.id === t.id) ? <option value={t.id}>A beat that is gone</option> : null}
                {info.beats.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            </label>
          ) : null}
          {auto === 'chapter' ? (
            <label>Which chapter
              <select value={row.from_stage ?? ''} disabled={pending} onChange={(e) => save({ hidden: false, reveal_when: null, from_stage: e.target.value || null })}>
                {later.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      <p className="br-note" role="status">{blockRevealWords(row, chapters, info)}</p>
    </div>
  );
}
