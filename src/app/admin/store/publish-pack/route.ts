import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publishPack } from '@/lib/store';
import { sameSite } from '@/lib/same-site';

// Publishes one of the admin's homebrew packs as a store product (free or paid).
export async function POST(request: Request) {
  const back = (q: string) => NextResponse.redirect(new URL('/admin/business?' + q, request.url), { status: 303 });
  if (!sameSite(request)) return new NextResponse('Forbidden', { status: 403 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ? String(auth.claims.sub) : null;
  const { data: head } = userId ? await supabase.rpc('is_head') : { data: false };
  if (!userId || !head) return new NextResponse('Forbidden', { status: 403 });
  const form = await request.formData();
  const title = String(form.get('title') || '').trim();
  const slug = (String(form.get('slug') || '').trim().toLowerCase() || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 60);
  if (!title) return back('error=' + encodeURIComponent('Give the pack listing a title.'));
  const r = await publishPack(supabase, userId, {
    packId: String(form.get('pack') || ''), slug, title, pitch: String(form.get('pitch') || ''),
    priceCents: Math.round((parseFloat(String(form.get('price') || '0')) || 0) * 100),
    status: form.get('status') === 'live' ? 'live' : 'draft', previewEntity: String(form.get('preview') || ''),
  });
  return back(r.error ? 'error=' + encodeURIComponent(r.error) : 'published=' + encodeURIComponent(slug));
}
