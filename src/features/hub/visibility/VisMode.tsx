'use client';
import { createContext, useContext, type ReactNode } from 'react';

// Whether the new "Who sees this?" picker is in use on this page, and the story beats it can
// offer for "once a story beat happens". The page decides on the server (the hub_v2_visibility
// flag) and hands down the plain answer; nothing here reads a flag.
type Mode = { on: boolean; beats: { id: string; title: string }[] };
const Ctx = createContext<Mode>({ on: false, beats: [] });

export function VisMode({ on, beats = [], children }: { on: boolean; beats?: { id: string; title: string }[]; children: ReactNode }) {
  return <Ctx.Provider value={{ on, beats }}>{children}</Ctx.Provider>;
}
export const useVisMode = () => useContext(Ctx);
