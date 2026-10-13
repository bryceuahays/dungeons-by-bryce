import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getViewer } from './auth';
import { createPublicClient } from './supabase/public';
import { FLAGS, flagOn, flagsFor, withSwitches, type Flag, type FlagViewer } from '@/config/flags';

// Feature flags on the server. The list and the rule are in src/config/flags.ts; which flags
// the Head DM has turned on for everyone is in the database (the feature_flags table, switched
// from /admin/flags).
//
//   a page:           await requireFlag('hub_v2_quests');          // "not found" when it is off
//   a server action:  if (!(await flag('hub_v2_quests'))) return { error: NOT_AVAILABLE };
//   a link or panel:  {(await flag('hub_v2_quests')) ? <Link …/> : null}
//   a client part:    <Thing flags={await myFlags()} />            // plain true/false values
//
// Decide on the server. A flag that is off must not send the feature's text or data to the
// browser at all: do not render it and hide it, and do not ship the check to a client
// component and decide there.

export const NOT_AVAILABLE = 'That is not available yet.';

// A developer running the site on their own machine (`npm run dev`) sees every flag on, and
// so does a Vercel preview deployment, which only the site owner can open. The built site
// that the tests and the live site run (`next start`) goes by the account.
const everythingOn = () => process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';
const anyOff = () => Object.values(FLAGS).some((f) => !f.on);

// The flags the Head DM has turned on for everyone. Read as a signed-out visitor, who is
// allowed to see exactly those rows, so the answer is the same whoever is asking. Read once
// per request. If it cannot be read (the table is not there yet, or the database is down),
// nothing counts as switched on: an unfinished feature stays hidden rather than showing.
const switchedOn = cache(async (): Promise<ReadonlySet<string>> => {
  const { data } = await createPublicClient().from('feature_flags').select('name').eq('is_on', true);
  return new Set((data ?? []).map((r) => String(r.name)));
});

// Who is asking, as far as flags care. The automated tests' accounts carry a mark that only
// the server can set (profiles.always_enforce, put there by tests/helpers.mjs with the
// service key; an account can change only its own display name and background). It is read
// once per request, and not at all once every flag has been released.
const viewerOf = cache(async (): Promise<FlagViewer> => {
  const v = await getViewer();
  if (!v) return null;
  if (v.profile.role === 'head') return { role: 'head' };
  const { data } = await v.supabase.from('profiles').select('always_enforce').eq('id', v.user.id).maybeSingle();
  return { role: v.profile.role, test: data?.always_enforce === true };
});

// Is this flag on for whoever is asking?
export async function flag(name: Flag): Promise<boolean> {
  if (FLAGS[name]?.on || everythingOn()) return true;
  if ((await switchedOn()).has(name)) return true;
  return flagOn(name, await viewerOf());
}

// For a page or a route: answers "not found" unless the flag is on for the viewer.
export async function requireFlag(name: Flag): Promise<void> {
  if (!(await flag(name))) notFound();
}

// Every flag for the viewer, as plain data a client component can be given.
export async function myFlags(): Promise<Record<Flag, boolean>> {
  if (everythingOn() || !anyOff()) return Object.fromEntries(Object.keys(FLAGS).map((n) => [n, true])) as Record<Flag, boolean>;
  return flagsFor(await viewerOf(), withSwitches(await switchedOn()));
}

// For the Head DM's screen: every flag with where its switch stands. Read as the Head DM, the
// only one the database shows the switches that are off. `ready` is false until the
// feature_flags table exists.
export type FlagRow = { name: Flag; what: string; issue: number; fixed: boolean; on: boolean; changed: string | null };
export async function flagSwitches(): Promise<{ ready: boolean; rows: FlagRow[] }> {
  const v = await getViewer();
  if (!v?.isHead) return { ready: false, rows: [] };
  const { data, error } = await v.supabase.from('feature_flags').select('name, is_on, changed_at');
  const saved = new Map((data ?? []).map((r) => [String(r.name), r]));
  const rows = (Object.keys(FLAGS) as Flag[]).map((name) => {
    const def = FLAGS[name] as { what: string; issue: number; on: boolean };
    const row = saved.get(name);
    return { name, what: def.what, issue: def.issue, fixed: def.on, on: def.on || row?.is_on === true, changed: row ? String(row.changed_at) : null };
  });
  return { ready: !error, rows };
}
