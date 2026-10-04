import 'server-only';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import { entryOpen, type Entry, type Viewer } from './entry-types';

// Hands out a map picture.
//
// The DM gets the picture as uploaded. Anyone else gets a copy on which every region
// that is still hidden FROM THEM has been painted over, on the server, before the
// picture leaves it. A player's browser never receives the covered part of the map, so
// there is nothing to uncover by looking at the page source or the network tab.
//
// Painted copies are kept (named by which regions they cover) so each is made once.
//
// `reader` is the caller's own database client: the map row is looked up with it, so the
// map only exists for people allowed to see it. `viewer` is null for the DM's full view.
export async function serveMap(reader: SupabaseClient, campaign: { id: string }, mapId: string, viewer: Viewer | null): Promise<NextResponse> {
  const missing = () => new NextResponse('Not found', { status: 404 });
  if (!/^[0-9a-f-]{36}$/.test(mapId)) return missing();
  const { data: map } = await reader.from('entries').select('id, data, campaign_id').eq('id', mapId).eq('campaign_id', campaign.id).eq('kind', 'map').maybeSingle();
  const file = String(map?.data?.file ?? '');
  if (!map || !file.startsWith(campaign.id + '/')) return missing();

  const admin = createAdminClient();
  const sign = async (path: string) => {
    const { data, error } = await admin.storage.from('campaign-files').createSignedUrl(path, 600);
    return error || !data ? null : NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, max-age=300' } });
  };
  if (!viewer) return (await sign(file)) ?? missing();

  // Which regions are still hidden from this viewer? Worked out with the service role,
  // because a player's own login cannot (and must not) read hidden regions at all.
  const [{ data: regions }, { data: beats }] = await Promise.all([
    admin.from('entries').select('id, live, vis, vis_players, vis_stage, vis_entry, data').eq('campaign_id', campaign.id).eq('kind', 'region').eq('parent', mapId),
    admin.from('entries').select('id').eq('campaign_id', campaign.id).eq('kind', 'beat').eq('status', 'hit'),
  ]);
  const hit = new Set((beats ?? []).map((b) => b.id as string));
  const hidden = ((regions ?? []) as Entry[]).filter((r) => !(r.live && entryOpen(r, viewer, hit)) && Array.isArray(r.data?.pts) && r.data.pts.length >= 3);
  if (!hidden.length) return (await sign(file)) ?? missing();

  const key = crypto.createHash('sha256').update(file + '|' + hidden.map((r) => r.id + ':' + JSON.stringify(r.data.pts)).sort().join('|')).digest('hex').slice(0, 24);
  const painted = `${campaign.id}/maps-painted/${mapId}-${key}.webp`;
  const ready = await sign(painted);
  if (ready) return ready;

  const { data: original, error } = await admin.storage.from('campaign-files').download(file);
  if (error || !original) return missing();
  const input = sharp(Buffer.from(await original.arrayBuffer()));
  const meta = await input.metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) return missing();
  const polys = hidden.map((r) => `<polygon points="${(r.data.pts as number[][]).map(([x, y]) => `${Math.round(Math.max(0, Math.min(1, Number(x))) * w)},${Math.round(Math.max(0, Math.min(1, Number(y))) * h)}`).join(' ')}"/>`).join('');
  const cover = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g fill="#0c0c10" stroke="#0c0c10" stroke-width="${Math.max(2, Math.round(w / 400))}" stroke-linejoin="round">${polys}</g></svg>`);
  const out = await input.composite([{ input: cover, top: 0, left: 0 }]).webp({ quality: 84 }).toBuffer();
  await admin.storage.from('campaign-files').upload(painted, out, { contentType: 'image/webp', upsert: true });
  return (await sign(painted)) ?? new NextResponse(new Uint8Array(out), { headers: { 'content-type': 'image/webp', 'Cache-Control': 'private, max-age=300' } });
}
