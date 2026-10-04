import Link from 'next/link';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata = { title: 'Campaigns', description: 'Ready-to-run campaigns for Dungeons by Bryce: pages, NPCs, maps, a story timeline and the DM\'s secrets, copied into your account to make your own.', robots: { index: true, follow: true } };
export const revalidate = 60;

const money = (c: number) => (c === 0 ? 'Free' : '$' + (c / 100).toFixed(c % 100 ? 2 : 0));

export default async function Store() {
  const { data } = await createPublicClient().from('products').select('slug, title, pitch, price_cents, cover, theme').eq('status', 'live').order('created_at', { ascending: false });
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/store/';
  return (
    <>
      <h1>Campaigns</h1>
      <div className="panel"><p>Original campaigns, ready to run. Buy one and an editable copy lands in your account with you as its DM: every page, NPC, map, story beat, reveal stage and secret, yours to change.</p></div>
      {(data ?? []).length ? (
        <div className="cards">
          {data!.map((p) => (
            <Link key={p.slug} className="ccard product" href={'/store/' + p.slug} style={{ background: p.theme?.colors?.plate, color: p.theme?.colors?.vellum, borderColor: p.theme?.colors?.line }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.cover ? <img src={base + p.cover} alt="" loading="lazy" /> : null}
              <b style={{ color: p.theme?.colors?.gold }}>{p.title}</b>
              <span>{String(p.pitch).split('\n')[0].slice(0, 160)}</span>
              <i>{money(p.price_cents)}</i>
            </Link>
          ))}
        </div>
      ) : <div className="panel"><p className="dim">Nothing is on the shelf yet. The first campaigns are on their way.</p></div>}
    </>
  );
}
