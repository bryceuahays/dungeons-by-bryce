/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import Link from 'next/link';
import { storeReader } from '@/lib/store-view';
import { money } from '@/config/store';

export const metadata = { title: 'Store', description: 'Ready-to-run campaigns and homebrew packs for Dungeons by Bryce. Campaigns are copied into your account to make your own; packs attach to any campaign you run.', robots: { index: true, follow: true } };

export default async function Store() {
  const { db } = await storeReader();
  const { data } = await db.from('products').select('slug, title, pitch, price_cents, cover, theme, kind, edition, full_product').eq('status', 'live').order('created_at', { ascending: false });
  const all = (data ?? []) as any[];
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/store/';
  const packs = all.filter((p) => p.kind === 'pack').sort((a, b) => a.price_cents - b.price_cents);
  const campaigns = all.filter((p) => p.kind !== 'pack');
  const card = (p: any) => (
    <Link key={p.slug} className="ccard product" href={'/store/' + p.slug} style={p.theme?.colors ? { background: p.theme.colors.plate, color: p.theme.colors.vellum, borderColor: p.theme.colors.line } : undefined}>
      {p.cover ? <img src={base + p.cover} alt="" loading="lazy" /> : null}
      <b style={p.theme?.colors ? { color: p.theme.colors.gold } : undefined}>{p.title}</b>
      <span>{String(p.pitch).split('\n')[0].slice(0, 160)}</span>
      <i>{money(p.price_cents)}{p.edition === 'framework' ? ' · framework edition' : p.edition === 'full' ? ' · full edition' : ''}</i>
    </Link>
  );
  return (
    <>
      <h1>Store</h1>
      <div className="panel"><p>The open fifth edition rules (the SRD) are free in every account and are never part of a price. What is sold here is original work: campaigns ready to run, and packs of homebrew.</p></div>

      <h2>Homebrew packs</h2>
      <div className="panel"><p className="dim">A pack is a set of races, classes and other entries. Add one to your account and attach it to any campaign you run; its entries appear on your players&apos; sheets beside the SRD. Pack entries never count toward the free plan&apos;s homebrew limit.</p></div>
      {packs.length ? <div className="cards">{packs.map(card)}</div> : <div className="panel"><p className="dim">No packs yet.</p></div>}

      <h2>Campaigns</h2>
      <div className="panel"><p className="dim">Buy a campaign and an editable copy lands in your account with you as its DM. Some come in two editions: a framework (the structure, for your own story) and a full edition (the whole story, ready to run).</p></div>
      {campaigns.length ? <div className="cards">{campaigns.map(card)}</div> : <div className="panel"><p className="dim">Nothing is on the shelf yet. The first campaigns are on their way.</p></div>}
    </>
  );
}
