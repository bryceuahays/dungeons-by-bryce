'use client';
// The game system a Homebrew editor is building for. Editor parts read its abilities, skills,
// damage types and conditions from here (useRules); with no system set they get fifth edition's.
import { createContext, useContext, type ReactNode } from 'react';
import { ABILITIES as ABILITIES_5E } from '@/lib/rules/engine';
import { DAMAGE_TYPES as DAMAGE_5E, SKILL_NAMES as SKILLS_5E } from '@/config/homebrew';
import { CONDITIONS as CONDITIONS_5E } from '@/lib/spell-rules.mjs';

export type EditorRules = { abilities: [string, string][]; skills: string[]; damage: string[]; conditions: string[]; name: string };
const Ctx = createContext<EditorRules | null>(null);

export function RulesProvider({ value, children }: { value: EditorRules | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// named like the fifth edition lists they replace, so a component can shadow them in one line
export function useRules() {
  const r = useContext(Ctx);
  const ABILITIES = (r?.abilities ?? ABILITIES_5E) as [string, string][];
  return {
    ABILITIES,
    AB: Object.fromEntries(ABILITIES) as Record<string, string>,
    SKILL_NAMES: r?.skills ?? SKILLS_5E,
    DAMAGE_TYPES: r?.damage ?? DAMAGE_5E,
    CONDITIONS: r?.conditions ?? (CONDITIONS_5E as string[]),
    systemName: r?.name ?? '',
  };
}
