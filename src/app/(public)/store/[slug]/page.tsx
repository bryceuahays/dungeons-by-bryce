/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { storeReader } from '@/lib/store-view';
import { priceFor } from '@/lib/store-price';
import { themeStyle } from '@/lib/theme-style';
import { safeFontHref } from '@/lib/fonts';
import { EntityCard } from '@/components/EntityCard';
import { AttachPackForm } from '@/components/BrewForms';
import { STORE, money } from '@/config/store';
import { FEATURES, FREE_LIMITS } from '@/config/plans';

const COLS = 'id, slug, title, pitch, includes, preview, price_cents, cover, theme, kind, pack_id, edition, full_product';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { db } = await storeReader();
  const { data: p } = await db.from('products').select('title, pitch, cover').eq('slug', slug).eq('status', 'live').maybeSingle();
  if (!p) return { title: 'Store' };
  const description = String(p.pitch).split('\n')[0].slice(0, 200);
  const image = p.cover ? process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/store/' + p.cover : undefined;
  return { title: p.title, description, robots: { index: true, follow: true }, openGraph: { title: p.title, description, type: 'website', ...(image ? { images: [image] } : {}) } };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ pay?: string; problem?: string }> }) {
  const { slug } = await params;
  const { pay, problem } = await searchParams;
  const { db, viewer } = await storeReader();
  const { data } = await db.from('products').select(COLS).eq('slug', slug).eq('status', 'live').maybeSingle();
  const p = data as any;
  if (!p) notFound();
  const isPack = p.kind === 'pack';
  // the other edition of the same campaign, if there is one
  const { data: other } = p.edition === 'framework' && p.full_product ? await db.from('products').select('slug, title, price_cents').eq('id', p.full_product).eq('status', 'live').maybeSingle()
    : p.edition === 'full' ? await db.from('products').select('slug, title, price_cents').eq('full_product', p.id).eq('edition', 'framework').eq('status', 'live').limit(1).maybeSingle() : { data: null };
  const price = viewer ? await priceFor(viewer.supabase, viewer.user.id, p) : { cents: p.price_cents, list: p.price_cents, pro: false, upgradeInto: null, credit: 0 };
  const [{ data: owns }, { data: mine }] = viewer && isPack ? await Promise.all([
    viewer.supabase.rpc('pack_usable', { p: p.pack_id }),
    viewer.supabase.from('campaigns').select('id, title').eq('owner_id', viewer.user.id).order('created_at'),
  ]) : [{ data: false }, { data: [] }];
  const fonts = safeFontHref(p.theme?.fonts?.href);
  const ed = p.edition ? STORE.editions[p.edition as 'framework' | 'full'] : null;
  return (
    <>
      {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
      <p><Link className="button quiet" href="/store">The whole store</Link></p>
      <h1>{p.title}</h1>
      {p.cover ? <img className="product-cover" src={process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/store/' + p.cover} alt="" /> : null}
      <div className="panel">
        {ed ? <p><b>{ed.name}.</b> {ed.what}</p> : null}
        {String(p.pitch).split(/\n{2,}/).map((para: string, i: number) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{para}</p>)}
        <p className="price">
          {money(price.cents)}
          {price.cents !== price.list ? <span className="dim"> (list price {money(price.list)}{price.upgradeInto ? `, less the ${money(price.credit)} you paid for the framework edition` : ''}{price.pro && price.list > 0 ? `, with the ${Math.round(STORE.subscriberDiscount * 100)} percent subscriber discount` : ''})</span> : null}
        </p>
        {!price.pro && p.price_cents > 0 ? <p className="dim">Pro subscribers pay {Math.round(STORE.subscriberDiscount * 100)} percent less.</p> : null}
        {pay === 'off' ? <p className="bad" role="alert">Payments are not switched on yet, so this cannot be bought today. Nothing was charged.</p> : null}
        {problem ? <p className="bad" role="alert">Something went wrong. Nothing was charged. Try again in a moment.</p> : null}
        {isPack && owns ? (
          <>
            <p className="good">This pack is in your account.</p>
            {(mine ?? []).length ? <AttachPackForm packId={p.pack_id} campaigns={(mine ?? []) as any[]} /> : <p className="dim">Create a campaign, then add this pack to it with one click.</p>}
          </>
        ) : (
          <form method="post" action={`/store/${p.slug}/buy`}><button type="submit">{price.upgradeInto ? 'Upgrade my copy to the full edition' : isPack ? (price.cents === 0 ? 'Add this pack to my account' : 'Buy this pack') : price.cents === 0 ? 'Add it to my campaigns' : 'Buy this campaign'}</button></form>
        )}
        {price.upgradeInto ? <p className="dim">You own the framework edition. Upgrading adds the story to the copy you already have. Nothing you have written is overwritten: where you changed something, your version stays and mine is added beside it.</p> : null}
        {other ? <p className="dim">{p.edition === 'framework' ? <>Also available: <Link href={'/store/' + other.slug}>the full edition</Link> ({money(other.price_cents)}), with the whole story. If you start with the framework you can upgrade later for the difference.</> : <>Also available: <Link href={'/store/' + other.slug}>the framework edition</Link> ({money(other.price_cents)}), the structure without the story.</>}</p> : null}
      </div>

      {(p.includes ?? []).length ? <><h2>What is included</h2><div className="panel"><ul className="plain">{(p.includes as string[]).map((x) => <li key={x}>{x}</li>)}</ul></div></> : null}

      <h2>What works on the free plan, and what needs Pro</h2>
      <div className="panel">
        {isPack ? (
          <ul className="plain">
            <li><b>Works on every plan:</b> adding this pack to any campaign you run, and everything in it on your players&apos; sheets.</li>
            <li><b>Does not count against you:</b> entries from a pack never count toward the free plan&apos;s {FREE_LIMITS.homebrew} homebrew entries.</li>
            <li><b>Counts as yours:</b> if you clone an entry to change it, the copy is your own entry and does count.</li>
          </ul>
        ) : (
          <ul className="plain">
            <li><b>Works on every plan:</b> everything delivered in this campaign. Its pages, reveal stages, maps and hidden regions, timeline beats, NPCs and homebrew all work for you and your players, and you can edit all of it.</li>
            <li><b>Does not count against you:</b> a bought campaign is not your free plan&apos;s one campaign, and its homebrew is not counted toward the free limit.</li>
            <li><b>Needs Pro:</b> making new things of a Pro-only kind in it: {[FEATURES.timeline.name.toLowerCase().replace('the ', 'new beats on the '), 'new maps and new hidden regions', 'more reveal stages', 'blocks for named players', 'new world-state entries', `homebrew of your own past the free ${FREE_LIMITS.homebrew}`].join(', ')}. You will see the usual prompt if you try.</li>
            <li><b>Never part of the price:</b> the open fifth edition rules (the SRD). They are free to everyone, and this product only refers to them.</li>
          </ul>
        )}
      </div>

      {(p.preview ?? []).length ? (
        <>
          <h2>Free preview</h2>
          {isPack ? (
            <>
              <p className="dim">One whole entry from the pack, as your players would see it.</p>
              {(p.preview as any[]).map((pg, i) => <div key={i} className="panel">{pg.entity ? <EntityCard type={pg.entity.type} name={pg.entity.name} data={pg.entity.data} /> : null}</div>)}
            </>
          ) : (
            <>
              <p className="dim">These pages are shown as your players would see them.</p>
              <div className="campaign product-preview" style={themeStyle(p.theme)}>
                {(p.preview as any[]).map((pg, i) => <section key={i} className="cs-guide"><div className="wrap"><h2>{pg.title}</h2><div dangerouslySetInnerHTML={{ __html: pg.html }} /></div></section>)}
              </div>
            </>
          )}
        </>
      ) : null}
    </>
  );
}
