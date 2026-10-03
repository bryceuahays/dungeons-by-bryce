'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireDm, requireViewer } from '@/lib/auth';
import { FONT_PAIRS } from '@/lib/fonts';

export type FormState = { error?: string; note?: string } | null;

export async function joinCampaign(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireViewer();
  const code = String(form.get('code') || '').trim();
  if (!code) return { error: 'Enter the invite code your DM gave you.' };
  const { data: slug, error } = await supabase.rpc('join_campaign', { p_code: code });
  if (error || !slug) return { error: 'That code did not work. Check it with your DM: it may have expired or been used up.' };
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

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function createCampaign(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireDm();
  const title = String(form.get('title') || '').trim().slice(0, 80);
  const slug = String(form.get('slug') || '').trim().toLowerCase();
  const tagline = String(form.get('tagline') || '').trim().slice(0, 300);
  if (!title) return { error: 'Give the campaign a title.' };
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) return { error: 'The web address can use lowercase letters, numbers, and dashes, and needs at least two characters.' };

  const colors: Record<string, string> = {};
  for (const k of ['void', 'deep', 'plate', 'plate2', 'line', 'field', 'vellum', 'dim', 'gold', 'ember', 'star', 'verd', 'on-gold']) {
    const v = String(form.get('c-' + k) || '');
    if (HEX.test(v)) colors[k] = v;
  }
  const fonts = FONT_PAIRS.find((f) => f.id === form.get('fonts')) ?? FONT_PAIRS[0];
  const theme = { colors, fonts: { display: fonts.display, body: fonts.body, href: fonts.href }, starfield: form.get('starfield') === 'on' };

  const { data: campaign, error } = await supabase.from('campaigns').insert({ title, slug, tagline, theme }).select('id').single();
  if (error || !campaign) return { error: /duplicate|unique/i.test(error?.message || '') ? 'Another campaign already uses that web address.' : 'The campaign could not be created.' };

  const id = campaign.id;
  await supabase.from('sections').insert([
    { campaign_id: id, slug: 'overview', title: 'Overview', sort: 10, audience: 'all', kind: 'content' },
    { campaign_id: id, slug: 'sheet', title: 'My character', sort: 20, audience: 'player', kind: 'sheet' },
    { campaign_id: id, slug: 'combat', title: 'Combat', sort: 30, audience: 'player', kind: 'combat' },
    { campaign_id: id, slug: 'secrets', title: 'Secrets', sort: 40, audience: 'dm', kind: 'content' },
    { campaign_id: id, slug: 'sessions', title: 'Sessions', sort: 50, audience: 'dm', kind: 'sessions' },
    { campaign_id: id, slug: 'players', title: 'Players', sort: 60, audience: 'dm', kind: 'players' },
  ]);
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  await supabase.from('content').insert([
    { campaign_id: id, section: 'overview', kind: 'hero', key: 'hero', sort: 10, title, visibility: 'player', body: { html: `<h1>${esc(title)}</h1>${tagline ? `<p class="premise">${esc(tagline)}</p>` : ''}` } },
  ]);

  // Optionally start from another campaign's character rules and sheet.
  const from = String(form.get('copy') || '');
  if (from) {
    for (let at = 0; ; at += 1000) {
      const { data: rules } = await supabase.from('rules').select('kind, key, sort, data, phase').eq('campaign_id', from).is('phase', null).range(at, at + 999);
      if (rules?.length) await supabase.from('rules').insert(rules.map((r) => ({ ...r, campaign_id: id })));
      if (!rules || rules.length < 1000) break;
    }
    const { data: tpl } = await supabase.from('content').select('section, kind, key, sort, title, body, visibility').eq('campaign_id', from).eq('kind', 'sheet-template');
    if (tpl?.length) await supabase.from('content').insert(tpl.map((r) => ({ ...r, campaign_id: id })));
  }
  revalidatePath('/campaigns');
  redirect('/c/' + slug + '/manage');
}
