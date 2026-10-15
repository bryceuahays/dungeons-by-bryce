'use client';
import { useState, useTransition } from 'react';
import { ConfirmButton } from '@/components/ConfirmButton';
import { stepSession } from './actions';

const things = (n: number) => (n === 1 ? '1 thing is' : `${n} things are`);

// "Start session" and "Mark played" (issue 117), saying first what each one reveals.
// `waiting` is how many things wait for this session to start, and to be marked played.
export function SessionStep({ slug, id, number, status, waiting }: { slug: string; id: string; number: number; status: string; waiting: { started: number; played: number } }) {
  const [msg, setMsg] = useState<{ error?: string; note?: string } | null>(null);
  const [pending, start] = useTransition();
  const go = (to: 'running' | 'played') => start(async () => setMsg(await stepSession(slug, id, to)));
  const say = msg?.error ? <span className="err" role="alert">{msg.error}</span> : msg?.note ? <span className="okmsg" role="status">{msg.note}</span> : null;

  if (status === 'played') return <p className="row muted">Session {number} has been played. {say}</p>;
  const to = status === 'running' ? 'played' : 'running';
  const label = to === 'running' ? 'Start session' : 'Mark played';
  // starting reveals what waits for the start; marking played reveals what waits for the end (and the start, if it never started)
  const n = to === 'running' ? waiting.started : waiting.played + (status === 'running' ? 0 : waiting.started);
  return (
    <p className="row">
      {n ? <ConfirmButton className="act" disabled={pending} ask={`${things(n)} revealed to players when you do. Go ahead?`} yes={label} onConfirm={() => go(to)}>{label}</ConfirmButton>
        : <button type="button" className="act" disabled={pending} onClick={() => go(to)}>{label}</button>}
      <span className="muted">{status === 'running' ? `Session ${number} is under way.` : ''}{n ? ` ${things(n)} waiting for this.` : ''}</span>
      {say}
    </p>
  );
}
