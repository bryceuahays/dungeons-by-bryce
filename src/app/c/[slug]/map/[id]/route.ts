import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { VIEW_AS_PLAYER, readViewAs } from '@/lib/campaign';
import { serveMap } from '@/lib/map-image';

// A map picture inside a campaign. The DM gets it as uploaded; everyone else gets a copy
// with the regions still hidden from them painted over on the server (see lib/map-image).
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ? String(auth.claims.sub) : null;
  if (!userId) return new NextResponse('Not signed in', { status: 401 });

  // Row-level security: the campaign only exists for people allowed to see it.
  const { data: campaign } = await supabase.from('campaigns').select('id, phase, phases').eq('slug', slug).maybeSingle();
  if (!campaign) return new NextResponse('Not found', { status: 404 });

  const { data: full } = await supabase.rpc('reads_all', { c: campaign.id });
  const preview = full ? readViewAs((await cookies()).get(VIEW_AS_PLAYER)?.value) : null;
  if (full && !preview) return serveMap(supabase, campaign, id, null);
  const stages = ((campaign.phases ?? []) as { id: string }[]).map((p) => p.id);
  return serveMap(supabase, campaign, id, { player: preview ? preview.player : userId, stage: preview?.stage && stages.includes(preview.stage) ? preview.stage : campaign.phase, stages });
}
