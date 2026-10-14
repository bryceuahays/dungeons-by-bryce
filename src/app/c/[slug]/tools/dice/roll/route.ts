import { NextResponse } from 'next/server';
import { rollInCampaign } from '@/features/dice/server';

// Roll dice in a campaign. The browser says what to roll; the server rolls it and stores it.
// Everything is decided in src/features/dice/server.ts. A request from another site is refused.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== (request.headers.get('x-forwarded-host') ?? request.headers.get('host'))) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 }); }
  const out = await rollInCampaign(slug, body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {});
  return NextResponse.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store' } });
}
