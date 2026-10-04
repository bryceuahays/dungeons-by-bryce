'use server';
import { getViewer } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { mailOwner } from '@/lib/mail';
import { COMMISSION_TIERS } from '@/config/commissions';

export type RequestState = { error?: string; note?: string } | null;

// Saves a request for a custom campaign site and emails it to the site owner.
export async function requestCommission(_: RequestState, form: FormData): Promise<RequestState> {
  if (String(form.get('website') || '')) return { note: 'Thank you. Your request has been sent.' }; // a field people never see; only scripts fill it in
  const get = (k: string, max: number) => String(form.get(k) || '').trim().slice(0, max);
  const row = { name: get('name', 100), email: get('email', 200).toLowerCase(), tier: get('tier', 40), pitch: get('pitch', 4000), tone: get('tone', 1000), refs: get('refs', 2000), players: get('players', 40), deadline: get('deadline', 100) };
  if (!row.name) return { error: 'Tell me your name.' };
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(row.email)) return { error: 'That email address does not look right.' };
  if (!COMMISSION_TIERS.some((t) => t.id === row.tier)) return { error: 'Choose a tier.' };
  if (row.pitch.length < 20) return { error: 'Tell me a little more about your campaign: a few sentences is enough.' };
  const admin = createAdminClient();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const [{ count: same }, { count: all }] = await Promise.all([
    admin.from('commissions').select('id', { count: 'exact', head: true }).eq('email', row.email).gt('created_at', dayAgo),
    admin.from('commissions').select('id', { count: 'exact', head: true }).gt('created_at', dayAgo),
  ]);
  if ((same ?? 0) >= 3 || (all ?? 0) >= 60) return { error: 'There have been a lot of requests today. Please try again tomorrow.' };
  const viewer = await getViewer();
  const { data: saved, error } = await admin.from('commissions').insert({ ...row, user_id: viewer?.user.id ?? null }).select('id').single();
  if (error || !saved) return { error: 'That did not send. Try again in a moment.' };
  const { data: cfg } = await admin.from('app_config').select('value').eq('key', 'dm_email').maybeSingle();
  const tier = COMMISSION_TIERS.find((t) => t.id === row.tier)!;
  if (cfg?.value) {
    const failed = await mailOwner(cfg.value, `Custom campaign site request from ${row.name} (${tier.name})`,
      `Tier: ${tier.name} (${tier.price})\nFrom: ${row.name} <${row.email}>\nPlayers: ${row.players || 'not said'}\nDeadline: ${row.deadline || 'not said'}\n\nPitch:\n${row.pitch}\n\nTone:\n${row.tone || '-'}\n\nReferences:\n${row.refs || '-'}\n\nSee all requests on the Head DM page, under Store and requests.`, row.email);
    if (!failed) await admin.from('commissions').update({ emailed: true }).eq('id', saved.id);
  }
  return { note: 'Thank you. Your request has been sent, and you will hear back by email.' };
}
