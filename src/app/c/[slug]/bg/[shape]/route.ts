import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// A campaign's background, uploaded by its DM. Only the DM and the campaign's members can
// read the file (storage rules), so signing it with the caller's own login is the check.
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; shape: string }> }) {
  const { slug, shape } = await params;
  if (shape !== 'wide' && shape !== 'tall') return new NextResponse('Not found', { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return new NextResponse('Not signed in', { status: 401 });
  const { data: campaign } = await supabase.from('campaigns').select('id').eq('slug', slug).maybeSingle();
  if (!campaign) return new NextResponse('Not found', { status: 404 });
  const { data, error } = await supabase.storage.from('backgrounds').createSignedUrl(`campaign/${campaign.id}/${shape}`, 86400);
  if (error || !data) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, max-age=43200' } });
}
