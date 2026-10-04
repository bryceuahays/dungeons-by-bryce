/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { requireHead } from '@/lib/auth';
import { COMMISSION_STATUS, COMMISSION_TIERS } from '@/config/commissions';
import { CommissionRow, TransferForm } from '@/components/BusinessForms';

export const metadata = { title: 'Store and requests' };

export default async function Business({ searchParams }: { searchParams: Promise<{ error?: string; published?: string }> }) {
  const { error, published } = await searchParams;
  const { supabase, user } = await requireHead();
  const [{ data: requests }, { data: mine }, { data: faces }, { data: products }, { data: sections }, { data: sales }] = await Promise.all([
    supabase.from('commissions').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('campaigns').select('id, title, slug').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''),
    supabase.from('products').select('id, slug, title, status, price_cents, campaign_id, updated_at').order('created_at', { ascending: false }),
    supabase.from('sections').select('campaign_id, slug, title, audience, kind, sort').neq('audience', 'dm').eq('kind', 'content').order('sort'),
    supabase.from('purchases').select('product_id, amount_cents').eq('kind', 'product'),
  ]);
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f.title]));
  const campaigns = (mine ?? []).map((c) => ({ id: c.id as string, title: (real.get(c.id) ?? c.title) as string }));
  const day = (s: string) => new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <>
      <h1>Store and requests</h1>
      <p><Link className="button quiet" href="/admin">Back to Head DM</Link></p>
      {error ? <div className="panel"><p className="bad" role="alert">{error}</p></div> : null}
      {published ? <div className="panel"><p className="good" role="status">Published. <Link href={'/store/' + published}>See it in the store</Link> (drafts do not show there).</p></div> : null}

      <h2>Custom site requests</h2>
      <div className="panel">
        {(requests ?? []).length ? (
          <ul className="list">
            {(requests as any[]).map((r) => (
              <li key={r.id} style={{ alignItems: 'flex-start' }}>
                <span style={{ flex: '1 1 320px' }}>
                  <b>{r.name}</b> <span className="dim">{r.email} · {COMMISSION_TIERS.find((t) => t.id === r.tier)?.name ?? r.tier} · {day(r.created_at)}{r.emailed ? ' · emailed to you' : ''}</span>
                  <span style={{ display: 'block', whiteSpace: 'pre-wrap', marginTop: 4 }}>{r.pitch}</span>
                  {r.tone ? <span className="dim" style={{ display: 'block' }}>Tone: {r.tone}</span> : null}
                  {r.refs ? <span className="dim" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>References: {r.refs}</span> : null}
                  <span className="dim" style={{ display: 'block' }}>{r.players ? `Players: ${r.players}. ` : ''}{r.deadline ? `Needed by: ${r.deadline}.` : ''}</span>
                </span>
                <CommissionRow id={r.id} status={r.status} notes={r.notes} options={COMMISSION_STATUS} />
              </li>
            ))}
          </ul>
        ) : <p className="dim">No requests yet. The form is at <Link href="/custom">/custom</Link>.</p>}
      </div>

      <h2>Hand a campaign to a client</h2>
      <div className="panel">
        <p className="dim">Build the campaign in your own account, then hand it over. The client must already have an account (free is fine). They become its DM; you no longer see it. It does not count toward their free plan&apos;s one campaign.</p>
        <TransferForm campaigns={campaigns} />
      </div>

      <h2>Store</h2>
      <div className="panel">
        {(products ?? []).length ? (
          <ul className="list">
            {(products as any[]).map((p) => {
              const sold = (sales ?? []).filter((s) => s.product_id === p.id);
              return <li key={p.id}><span><b>{p.title}</b> <span className="dim">{p.status} · {p.price_cents ? '$' + (p.price_cents / 100).toFixed(2) : 'free'} · {sold.length} cop{sold.length === 1 ? 'y' : 'ies'} delivered · frozen {day(p.updated_at)}</span></span>{p.status === 'live' ? <Link href={'/store/' + p.slug}>View</Link> : null}</li>;
            })}
          </ul>
        ) : <p className="dim">Nothing published yet.</p>}
      </div>

      <h2>Publish a campaign as a product</h2>
      <div className="panel">
        <p className="dim">This takes a frozen copy of the campaign as it is now: pages, NPCs, timeline, maps, homebrew, theme, reveal stages, and your DM secrets. Buyers get their own editable copy. Publishing again under the same store address replaces the frozen copy. A campaign that contains private content cannot be published.</p>
        <form method="post" action="/admin/store/publish">
          <label>Campaign<select name="campaign" required defaultValue="">{[<option key="" value="">Choose one of your campaigns</option>, ...campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)]}</select></label>
          <div className="fieldrow">
            <label>Product title<input name="title" required maxLength={120} /></label>
            <label>Store address (lowercase, dashes)<input name="slug" pattern="[a-z0-9][a-z0-9\-]{1,60}" placeholder="the-lantern-beneath" /></label>
            <label>Price in dollars (0 for free)<input name="price" type="number" min={0} step="0.01" defaultValue="0" /></label>
          </div>
          <label>The pitch<textarea name="pitch" rows={4} maxLength={4000} /></label>
          <label>What is included, one line each<textarea name="includes" rows={4} placeholder={'12 pages of lore\n9 NPCs with secrets\n2 maps with hidden regions'} /></label>
          <fieldset className="multi">
            <legend>Free preview pages (shown on the store page as a player would see them)</legend>
            {campaigns.map((c) => {
              const tabs = (sections ?? []).filter((s) => s.campaign_id === c.id);
              return tabs.length ? <p key={c.id} className="dim" style={{ margin: '4px 0' }}>{c.title}: {tabs.map((s) => <label key={s.slug} className="ckrow" style={{ display: 'inline-flex', marginRight: 12 }}><input type="checkbox" name="preview" value={s.slug} /> {s.title}</label>)}</p> : null;
            })}
          </fieldset>
          <label>Status<select name="status" defaultValue="draft"><option value="draft">Draft (not in the store)</option><option value="live">Live (in the store)</option></select></label>
          <button type="submit">Freeze and publish</button>
        </form>
      </div>
    </>
  );
}
