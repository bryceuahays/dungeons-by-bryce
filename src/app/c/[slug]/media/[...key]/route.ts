import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { VIEW_AS_PLAYER } from '@/lib/campaign';

// Hands out a short-lived signed URL for one media file, after checking who is asking
// and which phase the campaign is in. The bucket is private and players have no storage
// access of their own, so this is the only way to reach a file.
//
// The key is phase-neutral (v/aarakocra.mp4). Which file it resolves to is decided here,
// from the campaign's phase. A player cannot ask for the other phase.
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string; key: string[] }> }) {
  const { slug, key } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const user = auth?.claims?.sub ? { id: String(auth.claims.sub) } : null;
  if (!user) return new NextResponse('Not signed in', { status: 401 });

  // RLS: the campaign row only exists for members and the DM.
  const { data: campaign } = await supabase.from('campaigns').select('id, phase').eq('slug', slug).maybeSingle();
  if (!campaign) return new NextResponse('Not found', { status: 404 });

  let phase: string = campaign.phase;
  const asked = request.nextUrl.searchParams.get('phase');
  if (asked && asked !== phase) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const asPlayer = (await cookies()).get(VIEW_AS_PLAYER)?.value === '1';
    if (profile?.role === 'dm' && !asPlayer) phase = asked;
  }

  // RLS again: a player only ever sees media rows for the current phase.
  const { data: rows } = await supabase.from('media').select('path, phase').eq('campaign_id', campaign.id).eq('key', key.join('/'));
  const row = (rows ?? []).find((r) => r.phase === phase) ?? (rows ?? []).find((r) => r.phase === null);
  if (!row) return new NextResponse('Not found', { status: 404 });

  const { data: signed, error } = await createAdminClient().storage.from('campaign-media').createSignedUrl(row.path, 120);
  if (error || !signed) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
}
