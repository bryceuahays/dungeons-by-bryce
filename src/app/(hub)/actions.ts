'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireHead, requireViewer } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCampaignText, MAX_IMPORT_CHARS } from '@/lib/import';
import { insertImported, removeCampaignFiles } from '@/lib/campaign-admin';
import { emailFeedback } from '@/lib/mail';
import { cleanTheme, presetOf } from '@/lib/theme';
import { NEW_CAMPAIGN_RULES } from '@/config/rules';
import { COMMISSION_STATUS, COMMISSION_TIERS } from '@/config/commissions';
import { billingIsOn, createCheckout } from '@/lib/stripe';
import { attachWorldEntries } from '@/lib/worlds';

export type FormState = { error?: string; note?: string } | null;

export async function joinCampaign(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireViewer();
  const code = String(form.get('code') || '').trim();
  if (!code) return { error: 'Enter the invite code your DM gave you.' };
  const { data: slug, error } = await supabase.rpc('join_campaign', { p_code: code });
  if (error || !slug) return { error: /full/i.test(error?.message || '') ? 'That campaign already has as many players as its plan allows. Ask your DM to make room or upgrade.' : 'That code did not work. Check it with your DM: it may have expired or been used up.' };
  revalidatePath('/campaigns');
  redirect('/c/' + slug);
}

export async function updateAccount(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await requireViewer();
  const display_name = String(form.get('display_name') || '').trim().slice(0, 60);
  if (!display_name) return { error: 'Your name cannot be empty.' };
  const { error } = await supabase.from('profiles').update({ display_name }).eq('id', user.id);
  if (error) return { error: 'That did not save. Try again in a moment.' };
  revalidatePath('/', 'layout');
  return { note: 'Saved.' };
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireViewer();
  const password = String(form.get('password') || '');
  if (password.length < 8) return { error: 'Use a password of at least 8 characters.' };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { note: 'Password changed.' };
}

// The browser uploads the two images straight to private storage (it may only write in
// the person's own folder). This records that they exist so the hub starts using them.
export async function setHubBackground(on: boolean): Promise<FormState> {
  const { supabase, user } = await requireViewer();
  if (!on) await supabase.storage.from('backgrounds').remove([`user/${user.id}/wide`, `user/${user.id}/tall`]);
  const { error } = await supabase.from('profiles').update({ hub_bg: on ? { wide: true, tall: true, v: Date.now() } : {} }).eq('id', user.id);
  if (error) return { error: 'That did not save.' };
  revalidatePath('/', 'layout');
  return { note: on ? 'Your background is in place.' : 'Back to the standard background.' };
}

export async function deleteMyCharacter(characterId: string): Promise<FormState> {
  const { supabase } = await requireViewer();
  // row-level security: only the character's owner (or that campaign's DM) can delete it
  const { data, error } = await supabase.from('characters').delete().eq('id', characterId).select('id');
  if (error || !data?.length) return { error: 'That character could not be deleted.' };
  revalidatePath('/', 'layout');
  return { note: 'Deleted.' };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

// Anyone can create a campaign. Whoever creates it is its DM.
export async function createCampaign(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireViewer();
  const pasted = String(form.get('paste') || '').slice(0, MAX_IMPORT_CHARS);
  const imported = pasted.trim() ? parseCampaignText(pasted) : null;
  const title = (String(form.get('title') || '').trim() || imported?.title || '').slice(0, 80);
  const tagline = (String(form.get('tagline') || '').trim() || imported?.tagline || '').slice(0, 300);
  const slug = (String(form.get('slug') || '').trim().toLowerCase() || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 60);
  if (!title) return { error: 'Give the campaign a title (or start your pasted text with a line like "# My campaign").' };
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) return { error: 'The web address can use lowercase letters, numbers, and dashes, and needs at least two characters.' };

  // the look: a preset as it is, or (on Pro) the editor's own colours and fonts. A free
  // account that sends anything else is given the default theme by the database.
  let chosen: unknown = null;
  try { chosen = JSON.parse(String(form.get('theme') || 'null')); } catch { chosen = null; }
  const theme = presetOf(chosen)?.theme ?? cleanTheme(chosen ?? { preset: 'slate' });

  const rules = form.get('rules') === '2014' || form.get('rules') === 'both' ? String(form.get('rules')) : NEW_CAMPAIGN_RULES;
  // started from a world's page: the campaign goes in that world (the database checks it is yours)
  const world = String(form.get('world') || '');
  const worldId = /^[0-9a-f-]{36}$/.test(world) ? world : null;
  const { data: campaign, error } = await supabase.from('campaigns').insert({ title, slug, tagline, theme, settings: { rules }, ...(worldId ? { world_id: worldId } : {}) }).select('id').single();
  if (error || !campaign) {
    if (/upgrade:/i.test(error?.message || '')) return { error: 'The free plan runs one campaign, and you already have one. Pro runs as many as you like: see Plans in the bar above. Nothing you have made is affected.' };
    return { error: /duplicate|unique/i.test(error?.message || '') ? 'Another campaign already uses that web address. Choose a different one.' : 'The campaign could not be created.' };
  }
  const id = campaign.id as string;

  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const hasOverview = imported?.tabs.some((t) => t.slug === 'overview');
  // the built-in tabs every campaign has; pasted tabs go between the header and these
  const base = [
    ...(hasOverview ? [] : [{ slug: 'overview', title: 'Overview', audience: 'all', kind: 'content', sort: 10 }]),
    ...(imported ? [] : [{ slug: 'secrets', title: 'Secrets', audience: 'dm', kind: 'content', sort: 800 }]),
    { slug: 'sheet', title: 'My character', audience: 'player', kind: 'sheet', sort: 900 },
    { slug: 'combat', title: 'Combat', audience: 'player', kind: 'combat', sort: 910 },
    { slug: 'sessions', title: 'Sessions', audience: 'dm', kind: 'sessions', sort: 920 },
    { slug: 'players', title: 'Players', audience: 'dm', kind: 'players', sort: 930 },
  ];
  await supabase.from('sections').insert(base.map((s) => ({ ...s, campaign_id: id })));
  await supabase.from('content').insert({
    campaign_id: id, section: 'overview', kind: 'hero', key: 'hero', sort: 1, title, visibility: 'player',
    body: { html: `<h1>${esc(title)}</h1>${tagline ? `<p class="premise">${esc(tagline)}</p>` : ''}` },
  });
  let note = '';
  if (imported) {
    const r = await insertImported(supabase, id, imported, 20);
    note = `?imported=${r.tabs}-${r.blocks}`;
  }

  if (worldId) await attachWorldEntries(supabase, worldId, [id]);

  // packs ticked on the form (the database checks the account may use each one)
  for (const p of form.getAll('pack').map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 10)) await supabase.rpc('attach_pack', { p, c: id });

  // Optionally start from another campaign's character rules and sheet.
  const from = String(form.get('copy') || '');
  if (from) await supabase.rpc('copy_campaign_rules', { src: from, dst: id });

  revalidatePath('/campaigns');
  redirect('/c/' + slug + '/manage' + note);
}

// ---------------------------------------------------------------- feedback

async function feedbackTo(admin: ReturnType<typeof createAdminClient>) {
  const { data: cfg } = await admin.from('app_config').select('value').eq('key', 'dm_email').maybeSingle();
  return (Object.entries(process.env).find(([k]) => k.toUpperCase() === 'FEEDBACK_TO')?.[1] || cfg?.value || '') as string;
}

export async function submitFeedback(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, profile } = await requireViewer();
  const message = String(form.get('message') || '').trim();
  if (message.length < 5) return { error: 'Write a sentence or two about what you would like to see.' };
  if (message.length > 4000) return { error: 'That is a bit long. Keep it under 4,000 characters.' };
  const { data: id, error } = await supabase.rpc('submit_feedback', { p_message: message });
  if (error || !id) return { error: /too many/i.test(error?.message || '') ? 'You have sent several notes in the last hour. Try again a little later.' : 'That did not send. Try again in a moment.' };

  // The note is saved either way. If email is set up, it is also sent to the site owner.
  const admin = createAdminClient();
  const to = await feedbackTo(admin);
  const failed = to ? await emailFeedback(to, { name: profile.display_name, email: profile.email }, message) : 'No address to send to.';
  await admin.from('feedback').update({ emailed: !failed, email_error: failed }).eq('id', id);
  revalidatePath('/admin');
  return { note: 'Thank you. Your note has been sent.' };
}

// ---------------------------------------------------------------- Head DM

export async function feedbackSetDone(id: string, done: boolean) {
  const { supabase } = await requireHead();
  await supabase.from('feedback').update({ done }).eq('id', id);
  revalidatePath('/admin');
}

// Email the notes that have not been emailed yet (for example ones sent before email was switched on).
export async function feedbackEmailWaiting(): Promise<FormState> {
  const { supabase } = await requireHead();
  const { data: waiting } = await supabase.from('feedback').select('id, name, email, message').eq('emailed', false).order('created_at').limit(20);
  if (!waiting?.length) return { note: 'Nothing is waiting.' };
  const admin = createAdminClient();
  const to = await feedbackTo(admin);
  let sent = 0, reason = to ? '' : 'No address to send to.';
  for (const n of to ? waiting : []) {
    const failed = await emailFeedback(to, { name: n.name, email: n.email }, n.message);
    await supabase.from('feedback').update({ emailed: !failed, email_error: failed }).eq('id', n.id);
    if (failed) { reason = failed; break; }
    sent++;
  }
  revalidatePath('/admin');
  return reason ? { error: `${sent} sent. Then: ${reason}` } : { note: `${sent} note${sent === 1 ? '' : 's'} emailed to ${to}.` };
}

// Unhide (or hide again) a campaign someone else runs. Until it is unhidden, nothing
// about it is sent to the Head DM; the database enforces that, not this page.
export async function headReveal(id: string, on: boolean) {
  const { supabase } = await requireHead();
  if (on) await supabase.from('head_reveals').upsert({ campaign_id: id });
  else await supabase.from('head_reveals').delete().eq('campaign_id', id);
  revalidatePath('/', 'layout');
  if (!on) redirect('/admin');
}

// Give an account full access without paying (for friends), or take it back.
export async function setComp(userId: string, on: boolean) {
  const { supabase } = await requireHead();
  await supabase.rpc('set_comp', { p_user: userId, on_: on });
  revalidatePath('/admin');
}

// The commission workflow: accept or decline, payment link, paid, status, revisions, delivery.
export async function setCommission(id: string, patch: { status?: string; notes?: string; revisions?: number }) {
  const { supabase } = await requireHead();
  const p: Record<string, unknown> = {};
  if (patch.status && COMMISSION_STATUS.some(([s]) => s === patch.status)) { p.status = patch.status; if (patch.status === 'paid') p.paid_at = new Date().toISOString(); }
  if (patch.notes !== undefined) p.notes = patch.notes.slice(0, 4000);
  if (patch.revisions !== undefined) p.revisions_used = Math.max(0, Math.min(99, Math.round(patch.revisions)));
  await supabase.from('commissions').update(p).eq('id', id);
  revalidatePath('/admin/business');
}

// A Stripe payment link (test mode) for an accepted request, for you to send to the client.
export async function commissionPayLink(id: string): Promise<FormState> {
  const { supabase } = await requireHead();
  const { data: job } = await supabase.from('commissions').select('id, email, tier, price_cents, user_id, status').eq('id', id).maybeSingle();
  if (!job) return { error: 'Request not found.' };
  if (!billingIsOn()) return { error: 'Payments are not switched on yet (no Stripe test key). You can still mark the request as paid by hand.' };
  const tier = COMMISSION_TIERS.find((t) => t.id === job.tier);
  try {
    const url = await createCheckout({ userId: job.user_id ?? '', email: job.email, kind: 'commission', name: `Dungeons by Bryce: custom campaign, ${tier?.name ?? job.tier}`, cents: job.price_cents, interval: null, meta: { commission_id: job.id }, success: '/custom?paid=1', cancel: '/custom' });
    await supabase.from('commissions').update({ pay_url: url, ...(job.status === 'requested' ? { status: 'accepted' } : {}) }).eq('id', id);
  } catch (e) { return { error: e instanceof Error ? e.message : 'The payment link could not be made.' }; }
  revalidatePath('/admin/business');
  return { note: 'Payment link made. Copy it and send it to the client. It expires after a day; make a new one if needed.' };
}

// Hand the finished campaign to the client. Their included Pro months start now.
export async function deliverCommission(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireHead();
  if (form.get('confirm') !== 'DELIVER') return { error: 'Type DELIVER to confirm.' };
  const { data: name, error } = await supabase.rpc('deliver_commission', { p_id: id, c: String(form.get('campaign') || '') });
  if (error) return { error: /no account/.test(error.message) ? 'The client has no account with that email yet. Ask them to sign up (it is free), then deliver.' : 'That could not be delivered. Choose the campaign you built for them.' };
  revalidatePath('/', 'layout');
  return { note: `Delivered. ${name || 'The client'} now owns the campaign, and any Pro months in their tier have started.` };
}

// Hand a finished campaign to a client's account.
export async function transferCampaign(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireHead();
  if (form.get('confirm') !== 'HAND OVER') return { error: 'Type HAND OVER to confirm.' };
  const { data: name, error } = await supabase.rpc('transfer_campaign', { c: String(form.get('campaign') || ''), to_email: String(form.get('email') || '') });
  if (error) return { error: /no account/.test(error.message) ? 'There is no account with that email yet. Ask the client to sign up first (it is free), then try again.' : 'That campaign could not be handed over.' };
  revalidatePath('/', 'layout');
  return { note: `Done. ${name || 'The client'} now runs that campaign.` };
}

export async function feedbackDelete(id: string) {
  const { supabase } = await requireHead();
  await supabase.from('feedback').delete().eq('id', id);
  revalidatePath('/admin');
}

export async function adminDeleteCampaign(id: string, _: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireHead();
  if (form.get('confirm') !== 'DELETE') return { error: 'Type DELETE to confirm.' };
  const { error } = await supabase.rpc('delete_campaign', { c: id });
  if (error) return { error: 'That campaign could not be deleted.' };
  await removeCampaignFiles(id);
  revalidatePath('/', 'layout');
  return { note: 'Campaign deleted.' };
}
