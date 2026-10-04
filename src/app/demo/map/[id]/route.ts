import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';
import { serveMap } from '@/lib/map-image';

// A map of the demo campaign, for a visitor with no login. Always the painted copy: a
// guest is nobody in particular, so only regions that are open to the whole table show.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createPublicClient();
  const { data: campaign } = await supabase.from('campaigns').select('id, phase, phases').eq('is_demo', true).order('created_at').limit(1).maybeSingle();
  if (!campaign) return new NextResponse('Not found', { status: 404 });
  return serveMap(supabase, campaign, id, { player: null, stage: campaign.phase, stages: ((campaign.phases ?? []) as { id: string }[]).map((p) => p.id) });
}
