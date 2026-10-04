import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { VIEW_AS_PLAYER, readViewAs } from '@/lib/campaign';
import { entryOpen, type Entry } from '@/lib/entry-types';

// Hands out a map picture.
//
// The DM gets the picture as uploaded. Anyone else gets a copy on which every region
// that is still hidden FROM THEM has been painted over, on the server, before the
// picture leaves it. A player's browser never receives the covered part of the map, so
// there is nothing to uncover by looking at the page source or the network tab.
//
// Painted copies are kept (named by which regions they cover) so each is made once.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('Not found', { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ? String(auth.claims.sub) : null;
  if (!userId) return new NextResponse('Not signed in', { status: 401 });

  // Row-level security: the campaign and the map only exist for people allowed to see them.
  const { data: campaign } = await supabase.from('campaigns').select('id, phase, phases').eq('slug', slug).maybeSingle();
  if (!campaign) return new NextResponse('Not found', { status: 404 });
  const { data: map } = await supabase.from('entries').select('id, data, campaign_id').eq('id', id).eq('campaign_id', campaign.id).eq('kind', 'map').maybeSingle();
  const file = String(map?.data?.file ?? '');
  if (!map || !file.startsWith(campaign.id + '/')) return new NextResponse('Not found', { status: 404 });

  const admin = createAdminClient();
  const sign = async (path: string) => {
    const { data, error } = await admin.storage.from('campaign-files').createSignedUrl(path, 600);
    return error || !data ? null : NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, max-age=300' } });
  };

  const { data: full } = await supabase.rpc('reads_all', { c: campaign.id });
  const preview = full ? readViewAs((await cookies()).get(VIEW_AS_PLAYER)?.value) : null;
  if (full && !preview) return (await sign(file)) ?? new NextResponse('Not found', { status: 404 });

  // Which regions are still hidden from this viewer? Worked out with the service role,
  // because a player's own login cannot (and must not) read hidden regions at all.
  const stages = ((campaign.phases ?? []) as { id: string }[]).map((p) => p.id);
  const viewer = { player: preview ? preview.player : userId, stage: preview?.stage && stages.includes(preview.stage) ? preview.stage : campaign.phase, stages };
  const [{ data: regions }, { data: beats }] = await Promise.all([
    admin.from('entries').select('id, live, vis, vis_players, vis_stage, vis_entry, data').eq('campaign_id', campaign.id).eq('kind', 'region').eq('parent', id),
    admin.from('entries').select('id').eq('campaign_id', campaign.id).eq('kind', 'beat').eq('status', 'hit'),
  ]);
  const hit = new Set((beats ?? []).map((b) => b.id as string));
  const hidden = ((regions ?? []) as Entry[]).filter((r) => !(r.live && entryOpen(r, viewer, hit)) && Array.isArray(r.data?.pts) && r.data.pts.length >= 3);
  if (!hidden.length) return (await sign(file)) ?? new NextResponse('Not found', { status: 404 });

  const key = crypto.createHash('sha256').update(file + '|' + hidden.map((r) => r.id + ':' + JSON.stringify(r.data.pts)).sort().join('|')).digest('hex').slice(0, 24);
  const painted = `${campaign.id}/maps-painted/${id}-${key}.webp`;
  const ready = await sign(painted);
  if (ready) return ready;

  const { data: original, error } = await admin.storage.from('campaign-files').download(file);
  if (error || !original) return new NextResponse('Not found', { status: 404 });
  const input = sharp(Buffer.from(await original.arrayBuffer()));
  const meta = await input.metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) return new NextResponse('Not found', { status: 404 });
  const polys = hidden.map((r) => `<polygon points="${(r.data.pts as number[][]).map(([x, y]) => `${Math.round(Math.max(0, Math.min(1, Number(x))) * w)},${Math.round(Math.max(0, Math.min(1, Number(y))) * h)}`).join(' ')}"/>`).join('');
  const cover = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g fill="#0c0c10" stroke="#0c0c10" stroke-width="${Math.max(2, Math.round(w / 400))}" stroke-linejoin="round">${polys}</g></svg>`);
  const out = await input.composite([{ input: cover, top: 0, left: 0 }]).webp({ quality: 84 }).toBuffer();
  await admin.storage.from('campaign-files').upload(painted, out, { contentType: 'image/webp', upsert: true });
  return (await sign(painted)) ?? new NextResponse(new Uint8Array(out), { headers: { 'content-type': 'image/webp', 'Cache-Control': 'private, max-age=300' } });
}
