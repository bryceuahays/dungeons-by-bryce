'use server';
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCampaign } from '@/lib/campaign';
import { requireViewer } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { CAMPAIGN_FILE_DIRS } from '@/lib/campaign-admin';
import { exportAccountFiles, exportFiles, type ExportBundle, type ExportInput } from './model';

// Everything in a campaign, for its owner to download before deleting it (or any time), and
// everything an account owns, before deleting the account. The browser builds the .zip
// (ExportButton.tsx), since a whole campaign's pictures are more than one server response may carry.
//
// Data is read with the person's own login, so it is exactly what row-level security already lets
// them read (a player's private notes are never among a DM's). Pictures are handed over as signed
// links that last an hour, made with the service role only after the ownership check.

type Admin = ReturnType<typeof createAdminClient>;

// Signed links for every object under these folders of a bucket, named for the .zip.
async function signFolders(admin: Admin, bucket: string, dirs: string[], zipName: (path: string) => string): Promise<{ zip: string; url: string }[]> {
  const paths: string[] = [];
  for (const dir of dirs) {
    for (let offset = 0; ; offset += 1000) {
      const { data } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset });
      for (const o of data ?? []) if (o.id) paths.push(`${dir}/${o.name}`);
      if (!data || data.length < 1000) break;
    }
  }
  return signPaths(admin, bucket, paths, zipName);
}
async function signPaths(admin: Admin, bucket: string, paths: string[], zipName: (path: string) => string): Promise<{ zip: string; url: string }[]> {
  const out: { zip: string; url: string }[] = [];
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await admin.storage.from(bucket).createSignedUrls(paths.slice(i, i + 100), 3600);
    for (const s of data ?? []) if (s.signedUrl && !s.error && s.path) out.push({ zip: zipName(s.path), url: s.signedUrl });
  }
  return out;
}

// One campaign, read by its owner.
async function gatherCampaign(supabase: SupabaseClient, admin: Admin, c: string): Promise<ExportInput | null> {
  const [{ data: row }, sections, content, characters, entries, secrets, sessions, attached, members, notes, faces] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', c).maybeSingle(),
    supabase.from('sections').select('*').eq('campaign_id', c).order('sort'),
    supabase.from('content').select('*').eq('campaign_id', c).order('section').order('sort'),
    supabase.from('characters').select('*').eq('campaign_id', c),
    supabase.from('entries').select('*').eq('campaign_id', c).order('kind').order('sort'),
    supabase.from('entry_secrets').select('entry_id, data').eq('campaign_id', c),
    supabase.from('sessions').select('*').eq('campaign_id', c).order('number'),
    supabase.from('campaign_entities').select('*, entities(id, type, name, source, status, data)').eq('campaign_id', c),
    supabase.rpc('campaign_members', { c }),
    supabase.from('player_notes').select('*').eq('campaign_id', c).eq('kind', 'secret'),
    supabase.from('campaign_faces').select('*').eq('campaign_id', c),
  ]);
  if (!row) return null;
  // the pictures: table tools (maps, painted maps, NPC portraits, lore), page media, backgrounds and the banner
  const short = (p: string) => p.replace(`campaign/${c}/`, '').replace(`${c}/`, '');
  const links = [
    ...(await signFolders(admin, 'campaign-files', CAMPAIGN_FILE_DIRS.map((d) => `${c}/${d}`), (p) => `files/campaign-files/${short(p)}`)),
    ...(await signFolders(admin, 'campaign-media', ['t', 'v'].map((d) => `${c}/${d}`), (p) => `files/campaign-media/${short(p)}`)),
    ...(await signPaths(admin, 'backgrounds', ['wide', 'tall', 'hero'].map((b) => `campaign/${c}/${b}`), (p) => `files/backgrounds/${short(p)}`)),
  ];
  return {
    campaign: row as any, sections: (sections.data ?? []) as any[], content: (content.data ?? []) as any[], characters: (characters.data ?? []) as any[],
    entries: (entries.data ?? []) as any[], secrets: (secrets.data ?? []) as any[], sessions: (sessions.data ?? []) as any[], attached: (attached.data ?? []) as any[],
    members: (members.data ?? []) as any[], notes: (notes.data ?? []) as any[], faces: (faces.data ?? []) as any[], links,
  };
}

export async function exportCampaign(slug: string): Promise<ExportBundle | { error: string }> {
  const ctx = await getCampaign(slug);
  if (!ctx.isOwner || ctx.asPlayer) return { error: 'Only the person who created this campaign can download it.' };
  const input = await gatherCampaign(ctx.supabase, createAdminClient(), ctx.campaign.id);
  return input ? exportFiles(input) : { error: 'Campaign not found.' };
}

// Everything the signed-in account owns: its campaigns (each laid out as a campaign download),
// its characters wherever they play, its homebrew, game systems and worlds, its own private notes,
// and its pictures.
export async function exportAccount(): Promise<ExportBundle | { error: string }> {
  const { supabase, user, profile } = await requireViewer();
  const admin = createAdminClient();
  const [{ data: owned }, characters, homebrew, systems, worlds, notes] = await Promise.all([
    supabase.from('campaigns').select('id').eq('owner_id', user.id),
    supabase.from('characters').select('*').eq('owner', user.id),
    supabase.from('entities').select('*').eq('owner_id', user.id),
    supabase.from('game_systems').select('*').eq('owner_id', user.id),
    supabase.from('worlds').select('*').eq('owner_id', user.id),
    supabase.from('player_notes').select('*').eq('user_id', user.id).eq('kind', 'note'),
  ]);
  const campaigns: ExportInput[] = [];
  for (const c of owned ?? []) { const x = await gatherCampaign(supabase, admin, c.id); if (x) campaigns.push(x); }
  const files = [
    ...(await signPaths(admin, 'backgrounds', ['wide', 'tall'].map((b) => `user/${user.id}/${b}`), (p) => `files/hub-background/${p.split('/').pop()}`)),
    ...(await signFolders(admin, 'backgrounds', [`user/${user.id}/banners`], (p) => `files/homebrew-banners/${p.split('/').pop()}`)),
  ];
  return exportAccountFiles({
    profile: { name: profile.display_name, email: profile.email },
    campaigns, characters: (characters.data ?? []) as any[], homebrew: (homebrew.data ?? []) as any[], systems: (systems.data ?? []) as any[],
    worlds: (worlds.data ?? []) as any[], notes: (notes.data ?? []) as any[], files,
  });
}
