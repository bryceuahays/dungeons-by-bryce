import 'server-only';
// Which game system the Homebrew page is showing, remembered in a cookie. New homebrew is made for
// that system (data.system); homebrew from before systems existed counts as the 2024 rules.
import { cookies } from 'next/headers';
import { loadSystem } from './data';
import { editorRules, presetOf } from './model';

export const BREW_COOKIE = 'brew_system';
const ok = (v: unknown): v is string => typeof v === 'string' && (v === '2014' || v === '2024' || /^[0-9a-f-]{36}$/.test(v));

export async function brewSystem(): Promise<string> {
  const v = (await cookies()).get(BREW_COOKIE)?.value;
  return ok(v) ? v : '2024';
}
// the system an entry belongs to
export const systemOfEntry = (data: { system?: unknown } | null | undefined) => (ok(data?.system) ? (data!.system as string) : '2024');

// a new entry's data, made for the system the Homebrew page is showing
export async function withBrewSystem<T extends Record<string, unknown>>(data: T): Promise<T> {
  return ok(data.system) ? data : { ...data, system: await brewSystem() };
}

// What a Homebrew page needs to follow the chosen system: the system, its official rules version,
// which of your entries belong to it (its own, or the rules it is built on), and its names.
export async function brewView(supabase: Parameters<typeof loadSystem>[0], userId: string) {
  const chosen = await brewSystem();
  const custom = await loadSystem(supabase, chosen);
  const own = !!custom && custom.ownerId === userId;
  const sys = own ? custom! : presetOf(chosen);
  const shown = own ? chosen : sys.base;
  const NAMES: Record<string, string> = { race: sys.names.species, class: sys.names.class, subclass: sys.names.subclass, background: sys.names.background, feat: sys.names.feat, spell: sys.names.spell };
  const label = (type: string) => NAMES[type] ?? type;
  return {
    sys, shown, version: sys.base === '2014' ? '5.1' : '5.2',
    mine: (row: { system?: unknown }) => { const t = systemOfEntry(row); return t === shown || t === sys.base; },
    label,
    plural: (type: string) => { const l = label(type); return /y$/i.test(l) && !/[aeiou]y$/i.test(l) ? l.slice(0, -1) + 'ies' : /(s|x|ch|sh)$/i.test(l) ? l + 'es' : l + 's'; },
  };
}

// The rules a Homebrew editor builds for: the entry's own system, or (for a new entry) the one
// chosen on the Homebrew page. Only one of your own systems changes anything.
export async function editorRulesFor(supabase: Parameters<typeof loadSystem>[0], userId: string, tag?: unknown) {
  const chosen = tag === undefined ? await brewSystem() : systemOfEntry({ system: tag });
  const custom = await loadSystem(supabase, chosen);
  return custom && custom.ownerId === userId ? { rules: editorRules(custom), sys: custom } : null;
}
