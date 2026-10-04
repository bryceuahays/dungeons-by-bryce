import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// A person's own hub background. The bucket is private; this signs a link to the file in
// the caller's own folder (storage rules allow nobody else to read it).
export async function GET(_: Request, { params }: { params: Promise<{ shape: string }> }) {
  const { shape } = await params;
  if (shape !== 'wide' && shape !== 'tall') return new NextResponse('Not found', { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return new NextResponse('Not signed in', { status: 401 });
  const { data, error } = await supabase.storage.from('backgrounds').createSignedUrl(`user/${auth.claims.sub}/${shape}`, 86400);
  if (error || !data) return new NextResponse('Not found', { status: 404 });
  // the page asks for ?v=<version>, so this answer can be remembered until the picture changes
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, max-age=43200' } });
}
