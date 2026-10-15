import { NextResponse } from 'next/server';
import { getCampaign } from '@/lib/campaign';
import { flag, NOT_AVAILABLE } from '@/lib/flags';
import { sidebarData } from '@/features/hub/shell/data';

// The character sidebar's data (src/features/hub/shell/data.ts), fetched after the page has
// loaded so the sidebar never slows a page down. Read as the viewer: it only ever holds what
// they may read. Behind the hub_v2_shell flag.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await flag('hub_v2_shell'))) return NextResponse.json({ error: NOT_AVAILABLE }, { status: 404 });
  const ctx = await getCampaign(slug);
  const wanted = new URL(request.url).searchParams.get('c');
  const data = await sidebarData(ctx, wanted && /^[0-9a-f-]{36}$/.test(wanted) ? wanted : null);
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
