import type { ReactNode } from 'react';
import './hidden.css';

// The one look for anything a player cannot see yet, as a DM sees it: a dashed border, a
// tinted background and a label in words (docs/design/design-system.md). Hidden NPCs, lore,
// map pins, planned timeline events, relationship lines and private rolls all use it.
//
// This is only a look. Whether a player receives the content is decided on the server. Never
// send a player something hidden and wrap it in this: a player's page must not contain it.

export const HIDDEN_FROM_PLAYERS = 'Hidden from players';

// The label on its own, for a card or row that already has its own frame. Always words, since
// the colour and the dashes must never be the only sign: "Hidden from players",
// "Only <player name>", "Reveals at <stage name>".
export function HiddenTag({ children = HIDDEN_FROM_PLAYERS }: { children?: ReactNode }) {
  return <span className="hid-tag">{children}</span>;
}

// A dashed, tinted box around hidden content, with its label first.
export function HiddenBox({ label = HIDDEN_FROM_PLAYERS, className, children }: { label?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={'hid-box' + (className ? ' ' + className : '')}>
      <HiddenTag>{label || HIDDEN_FROM_PLAYERS}</HiddenTag>
      {children}
    </div>
  );
}
