'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiddenTag } from '@/features/hub/ui/Hidden';
import { WHEN, WHO, describe, fromChoice, problem, shortLabel, toChoice, type Choice, type VisValue, type When, type Who } from './model';
import './visibility.css';

type Stage = { id: string; label: string };
type Member = { user_id: string; display_name: string };
type Beat = { id: string; title: string };

// "Who sees this?" (Visibility.png): the one control for visibility on every kind of content.
// It shows the current answer in words and a Change button; the button opens a dialog that
// asks who and when. Nothing changes until Apply.
//
// This only chooses. Whether a player receives something is decided by the database.
export function WhoSees({ value, onChange, stages = [], members = [], beats = [], canName = true, disabled }: {
  value: VisValue; onChange: (v: VisValue) => void; stages?: Stage[]; members?: Member[]; beats?: Beat[]; canName?: boolean; disabled?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [host, setHost] = useState<Element | null>(null);   // set while the dialog is open
  const [draft, setDraft] = useState<Choice>(() => toChoice(value));
  const people = members.map((m) => ({ id: m.user_id, label: m.display_name || 'Unnamed' }));
  const beatNames = beats.map((b) => ({ id: b.id, label: b.title }));

  // The dialog is drawn at the end of the themed page, not here: this control often sits
  // inside a paragraph, where a dialog is not allowed. It still wears the page's theme.
  const open = () => { setDraft(toChoice(value)); setHost(anchor.current?.closest('.campaign, .hub') ?? document.body); };
  useEffect(() => { if (host && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [host]);
  const close = () => setHost(null);

  const set = (patch: Partial<Choice>) => setDraft({ ...draft, ...patch });
  const whoList = WHO.filter(([w]) => w !== 'players' || members.length > 0);
  const whenList = WHEN.filter(([w]) => (w !== 'stage' || stages.length > 0) && (w !== 'entry' || beats.length > 0));
  const stored = fromChoice(draft);
  const why = problem(draft);
  const everyone = value.vis === 'all';

  return (
    <span className="vis2" ref={anchor}>
      <span className="vis2-l">Who sees it</span>
      {everyone ? <span className="vis2-open">Everyone</span> : <HiddenTag>{shortLabel(value, people, stages, beatNames)}</HiddenTag>}
      <button type="button" className="vis2-btn" disabled={disabled} onClick={open}>Change<span className="vis2-sr"> who sees it</span></button>
      {host ? createPortal(
        <dialog ref={dialog} className="vis2-dialog" aria-labelledby={id + 't'} onClose={close} onCancel={close}>
          <h3 id={id + 't'}>Who sees this?</h3>

          <fieldset>
            <legend>Who</legend>
            {whoList.map(([w, label]) => (
              <label key={w} className="vis2-opt">
                <input type="radio" name={id + 'who'} checked={draft.who === w} disabled={w === 'players' && !canName} onChange={() => set({ who: w as Who })} />
                <span>{label}{w === 'players' && !canName ? ' (Pro)' : ''}</span>
              </label>
            ))}
            {draft.who === 'players' ? (
              <div className="vis2-people">
                {members.map((m) => (
                  <label key={m.user_id} className="vis2-opt">
                    <input type="checkbox" checked={draft.players.includes(m.user_id)}
                      onChange={(e) => set({ players: e.target.checked ? [...draft.players, m.user_id] : draft.players.filter((p) => p !== m.user_id) })} />
                    <span>{m.display_name || 'Unnamed'}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>

          <fieldset disabled={draft.who === 'dm'}>
            <legend>When</legend>
            {whenList.map(([w, label]) => (
              <div key={w} className="vis2-when">
                <label className="vis2-opt">
                  <input type="radio" name={id + 'when'} checked={draft.who !== 'dm' && draft.when === w} onChange={() => set({ when: w as When })} />
                  <span>{label}</span>
                </label>
                {w === 'stage' && draft.who !== 'dm' && draft.when === 'stage' ? (
                  <select aria-label="Which stage" value={draft.stage ?? ''} onChange={(e) => set({ stage: e.target.value || null })}>
                    <option value="">Choose a stage</option>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                ) : null}
                {w === 'entry' && draft.who !== 'dm' && draft.when === 'entry' ? (
                  <select aria-label="Which story beat" value={draft.entry ?? ''} onChange={(e) => set({ entry: e.target.value || null })}>
                    <option value="">Choose a beat</option>
                    {beats.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                  </select>
                ) : null}
              </div>
            ))}
          </fieldset>

          <p className={'vis2-sum' + (stored.vis === 'all' ? ' open' : '')} role="status">{why ?? describe(stored, people, stages, beatNames)}</p>

          <p className="vis2-acts">
            <button type="button" className="vis2-btn" onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="button" className="vis2-apply" disabled={!!why} onClick={() => { onChange(stored); dialog.current?.close(); }}>Apply</button>
          </p>
        </dialog>, host) : null}
    </span>
  );
}
