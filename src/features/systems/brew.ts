import 'server-only';
// Which game system the Homebrew page is showing, remembered in a cookie. New homebrew is made for
// that system (data.system); homebrew from before systems existed counts as the 2024 rules.
import { cookies } from 'next/headers';

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
