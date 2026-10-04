/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createPublicClient } from '@/lib/supabase/public';
import { themeStyle } from '@/lib/theme-style';
import { safeFontHref } from '@/lib/fonts';

const money = (c: number) => (c === 0 ? 'Free' : '$' + (c / 100).toFixed(c % 100 ? 2 : 0));
const load = async (slug: string) => (await createPublicClient().from('products').select('slug, title, pitch, includes, preview, price_cents, cover, theme').eq('slug', slug).eq('status', 'live').maybeSingle()).data;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return { title: 'Campaigns' };
  const description = String(p.pitch).split('\n')[0].slice(0, 200);
  const image = p.cover ? process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/store/' + p.cover : undefined;
  return { title: p.title, description, robots: { index: true, follow: true }, openGraph: { title: p.title, description, type: 'website', ...(image ? { images: [image] } : {}) } };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ pay?: string; problem?: string }> }) {
  const { slug } = await params;
  const { pay, problem } = await searchParams;
  const p = await load(slug);
  if (!p) notFound();
  const fonts = safeFontHref(p.theme?.fonts?.href);
  return (
    <>
      {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
      <p><Link className="button quiet" href="/store">All campaigns</Link></p>
      <h1>{p.title}</h1>
      {p.cover ? <img className="product-cover" src={process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/store/' + p.cover} alt="" /> : null}
      <div className="panel">
        {String(p.pitch).split(/\n{2,}/).map((para: string, i: number) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{para}</p>)}
        <p className="price">{money(p.price_cents)}</p>
        {pay === 'off' ? <p className="bad" role="alert">Payments are not switched on yet, so this cannot be bought today. Nothing was charged.</p> : null}
        {problem ? <p className="bad" role="alert">Something went wrong. Nothing was charged. Try again in a moment.</p> : null}
        <form method="post" action={`/store/${p.slug}/buy`}><button type="submit">{p.price_cents === 0 ? 'Add it to my campaigns' : 'Buy this campaign'}</button></form>
        <p className="dim">You get an editable copy in your own account, with you as the DM. It does not count toward the free plan&apos;s one campaign, and it comes with every tool it was built with.</p>
      </div>
      {(p.includes ?? []).length ? <><h2>What is included</h2><div className="panel"><ul className="plain">{(p.includes as string[]).map((x) => <li key={x}>{x}</li>)}</ul></div></> : null}
      {(p.preview ?? []).length ? (
        <>
          <h2>Free preview</h2>
          <p className="dim">These pages are shown as your players would see them.</p>
          <div className="campaign product-preview" style={themeStyle(p.theme)}>
            {(p.preview as any[]).map((pg, i) => (
              <section key={i} className="cs-guide"><div className="wrap"><h2>{pg.title}</h2><div dangerouslySetInnerHTML={{ __html: pg.html }} /></div></section>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
