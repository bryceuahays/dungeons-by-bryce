import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateEdition } from '@/lib/store';
import { sameSite } from '@/lib/same-site';

// The "generate framework" tool (and its sibling, a publishable copy). Makes a new
// campaign in the admin's account for them to review and edit before publishing.
export async function POST(request: Request) {
  const to = (p: string) => NextResponse.redirect(new URL(p, request.url), { status: 303 });
  if (!sameSite(request)) return new NextResponse('Forbidden', { status: 403 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ? String(auth.claims.sub) : null;
  const { data: head } = userId ? await supabase.rpc('is_head') : { data: false };
  if (!userId || !head) return new NextResponse('Forbidden', { status: 403 });
  const form = await request.formData();
  const r = await generateEdition(supabase, userId, String(form.get('campaign') || ''), form.get('mode') === 'full' ? 'full' : 'framework');
  if (r.error || !r.slug) return to('/admin/business?error=' + encodeURIComponent(r.error ?? 'That did not work.'));
  return to(`/admin/business?made=${encodeURIComponent(r.slug)}&left=${encodeURIComponent((r.left ?? []).join(' | '))}`);
}
