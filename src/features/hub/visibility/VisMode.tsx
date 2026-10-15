'use client';
import { createContext, useContext, type ReactNode } from 'react';

// Whether the new "Who sees this?" picker is in use on this page, the story beats it can offer
// for "once a story beat happens", and the campaign's visibility defaults (Campaign settings).
// The page decides on the server (the hub_v2_visibility flag) and hands down plain answers;
// nothing here reads a flag.
type Defaults = { newVis: 'dm' | 'all'; npcReveal: 'all' | 'portrait' | 'name'; named: boolean };
// `nextSession` is where a "when a session starts" choice begins (issue 117).
type Mode = { on: boolean; beats: { id: string; title: string }[]; defaults: Defaults; nextSession?: number };
const DEFAULTS: Defaults = { newVis: 'dm', npcReveal: 'all', named: true };
const Ctx = createContext<Mode>({ on: false, beats: [], defaults: DEFAULTS });

export function VisMode({ on, beats = [], defaults = DEFAULTS, nextSession, children }: { on: boolean; beats?: { id: string; title: string }[]; defaults?: Defaults; nextSession?: number; children: ReactNode }) {
  return <Ctx.Provider value={{ on, beats, defaults, nextSession }}>{children}</Ctx.Provider>;
}
export const useVisMode = () => useContext(Ctx);
