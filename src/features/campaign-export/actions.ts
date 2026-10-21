'use server';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getCampaign } from '@/lib/campaign';
import { createAdminClient } from '@/lib/supabase/admin';
import { exportFiles, type ExportBundle } from './model';

// Everything in a campaign, for its owner to download before deleting it (or any time). The
// browser builds the .zip (src/features/campaign-export/ExportButton.tsx), since a whole campaign's
// pictures are more than one server response may carry.
//
// Only the campaign's owner gets it. The campaign's own data is read with the owner's login, so it
// is exactly what row-level security already lets them read (a player's private notes are not
// among it). Pictures are handed over as signed links that last an hour, made with the service
// role only after the ownership check.
export async function exportCampaign(slug: string): Promise<ExportBundle | { error: string }> {
  const ctx = await getCampaign(slug);
  if (!ctx.isOwner || ctx.asPlayer) return { error: 'Only the person who created this campaign can download it.' };
  const { supabase, campaign } = ctx;
  const c = campaign.id;
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
  if (!row) return { error: 'Campaign not found.' };

  // the pictures: table tools (maps, painted maps, NPC portraits, lore), page media, backgrounds
  const admin = createAdminClient();
  const stored: { bucket: string; path: string }[] = [];
  const list = async (bucket: string, dir: string) => {
    for (let offset = 0; ; offset += 1000) {
      const { data } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset });
      for (const o of data ?? []) if (o.id) stored.push({ bucket, path: `${dir}/${o.name}` });
      if (!data || data.length < 1000) break;
    }
  };
  await Promise.all([...['maps', 'maps-painted', 'npc', 'lore'].map((d) => list('campaign-files', `${c}/${d}`)), ...['t', 'v'].map((d) => list('campaign-media', `${c}/${d}`))]);
  for (const b of ['wide', 'tall']) stored.push({ bucket: 'backgrounds', path: `campaign/${c}/${b}` });
  const links: { zip: string; url: string }[] = [];
  for (const bucket of [...new Set(stored.map((s) => s.bucket))]) {
    const paths = stored.filter((s) => s.bucket === bucket).map((s) => s.path);
    for (let i = 0; i < paths.length; i += 100) {
      const { data } = await admin.storage.from(bucket).createSignedUrls(paths.slice(i, i + 100), 3600);
      for (const s of data ?? []) if (s.signedUrl && !s.error && s.path) links.push({ zip: `files/${bucket}/${s.path.replace(`campaign/${c}/`, '').replace(`${c}/`, '')}`, url: s.signedUrl });
    }
  }

  return exportFiles({
    campaign: row as any, sections: (sections.data ?? []) as any[], content: (content.data ?? []) as any[], characters: (characters.data ?? []) as any[],
    entries: (entries.data ?? []) as any[], secrets: (secrets.data ?? []) as any[], sessions: (sessions.data ?? []) as any[], attached: (attached.data ?? []) as any[],
    members: (members.data ?? []) as any[], notes: (notes.data ?? []) as any[], faces: (faces.data ?? []) as any[], links,
  });
}
