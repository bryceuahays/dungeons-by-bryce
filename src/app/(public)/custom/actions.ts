'use server';
import { getViewer } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { mailOwner } from '@/lib/mail';
import { COMMISSIONS, COMMISSION_TIERS, tierPrice } from '@/config/commissions';

export type RequestState = { error?: string; note?: string; tier?: string } | null;

// Saves a request for a custom campaign and emails it to the site owner. Nothing is
// charged here: payment happens after the request is accepted.
export async function requestCommission(_: RequestState, form: FormData): Promise<RequestState> {
  if (!COMMISSIONS.open) return { error: 'Requests are closed for now.' };
  if (String(form.get('website') || '')) return { note: 'sent' }; // a field people never see; only scripts fill it in
  const get = (k: string, max: number) => String(form.get(k) || '').trim().slice(0, max);
  const tier = COMMISSION_TIERS.find((t) => t.id === get('tier', 40));
  if (!tier) return { error: 'Choose a tier.' };
  const row = { name: get('name', 100), email: get('email', 200).toLowerCase(), tier: tier.id, pitch: get('pitch', 4000), tone: get('tone', 1000), refs: get('refs', 2000), players: get('players', 40), material: get('material', 2000), deadline: get('deadline', 100) };
  if (!row.name) return { error: 'Tell me your name.' };
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(row.email)) return { error: 'That email address does not look right.' };
  if (row.pitch.length < 20) return { error: 'Tell me a little more about your campaign: a few sentences is enough.' };
  const admin = createAdminClient();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const [{ count: same }, { count: all }] = await Promise.all([
    admin.from('commissions').select('id', { count: 'exact', head: true }).eq('email', row.email).gt('created_at', dayAgo),
    admin.from('commissions').select('id', { count: 'exact', head: true }).gt('created_at', dayAgo),
  ]);
  if ((same ?? 0) >= 3 || (all ?? 0) >= 60) return { error: 'There have been a lot of requests today. Please try again tomorrow.' };
  const viewer = await getViewer();
  // the price and what the tier includes are fixed at the moment of the request
  const { data: saved, error } = await admin.from('commissions').insert({ ...row, user_id: viewer?.user.id ?? null, status: 'requested', price_cents: tier.cents, pro_months: tier.proMonths, revisions_included: tier.revisions }).select('id').single();
  if (error || !saved) return { error: 'That did not send. Try again in a moment.' };
  const { data: cfg } = await admin.from('app_config').select('value').eq('key', 'dm_email').maybeSingle();
  if (cfg?.value) {
    const failed = await mailOwner(cfg.value, `Custom campaign request from ${row.name} (${tier.name}, ${tierPrice(tier)})`,
      `Tier: ${tier.name} (${tierPrice(tier)})\nFrom: ${row.name} <${row.email}>\nPlayers: ${row.players || 'not said'}\nDeadline: ${row.deadline || 'not said'}\n\nPitch:\n${row.pitch}\n\nTone:\n${row.tone || '-'}\n\nReference images and links:\n${row.refs || '-'}\n\nMaterial that already exists:\n${row.material || '-'}\n\nAccept or decline it on the Head DM page, under Store and requests.`, row.email);
    if (!failed) await admin.from('commissions').update({ emailed: true }).eq('id', saved.id);
  }
  return { note: 'sent', tier: tier.name };
}
