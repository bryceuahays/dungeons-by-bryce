import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// A picture attached to a table-tool entry (an NPC portrait, a product cover). The entry
// is looked up with the caller's own login, so the picture is only handed to someone who
// is allowed to see the entry it belongs to. Maps are served by /c/[slug]/map/[id] instead.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('Not found', { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return new NextResponse('Not signed in', { status: 401 });
  const { data: campaign } = await supabase.from('campaigns').select('id').eq('slug', slug).maybeSingle();
  if (!campaign) return new NextResponse('Not found', { status: 404 });
  const { data: entry } = await supabase.from('entries').select('kind, data').eq('id', id).eq('campaign_id', campaign.id).maybeSingle();
  const file = String(entry?.data?.file ?? '');
  if (!entry || entry.kind === 'map' || !file.startsWith(campaign.id + '/')) return new NextResponse('Not found', { status: 404 });
  const { data, error } = await createAdminClient().storage.from('campaign-files').createSignedUrl(file, 3600);
  if (error || !data) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, max-age=1800' } });
}
