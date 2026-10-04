/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { requireHead } from '@/lib/auth';
import { COMMISSIONS, COMMISSION_STATUS, COMMISSION_TIERS, tierPrice } from '@/config/commissions';
import { STORE, money } from '@/config/store';
import { CommissionRow, TransferForm } from '@/components/BusinessForms';

export const metadata = { title: 'Store and requests' };

export default async function Business({ searchParams }: { searchParams: Promise<{ error?: string; published?: string; note?: string; made?: string; left?: string }> }) {
  const { error, published, note, made, left } = await searchParams;
  const { supabase, user } = await requireHead();
  const [{ data: requests }, { data: mine }, { data: faces }, { data: products }, { data: sections }, { data: sales }, { data: packs }, { data: packItems }] = await Promise.all([
    supabase.from('commissions').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('campaigns').select('id, title, slug, copied_from').eq('owner_id', user.id).order('created_at'),
    supabase.from('campaign_faces').select('campaign_id, title').eq('phase', ''),
    supabase.from('products').select('id, slug, title, status, price_cents, campaign_id, kind, edition, updated_at').order('created_at', { ascending: false }),
    supabase.from('sections').select('campaign_id, slug, title, audience, kind, sort').neq('audience', 'dm').eq('kind', 'content').order('sort'),
    supabase.from('purchases').select('product_id, amount_cents').eq('kind', 'product'),
    supabase.from('packs').select('id, name').eq('owner_id', user.id).order('created_at'),
    supabase.from('pack_entities').select('pack_id, entities(id, name)'),
  ]);
  const real = new Map((faces ?? []).map((f) => [f.campaign_id, f.title]));
  const campaigns = (mine ?? []).map((c) => ({ id: c.id as string, title: (real.get(c.id) ?? c.title) as string, copy: !!c.copied_from }));
  const day = (s: string) => new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const open = ((requests ?? []) as any[]).filter((r) => !['delivered', 'declined'].includes(r.status));
  const closed = ((requests ?? []) as any[]).filter((r) => ['delivered', 'declined'].includes(r.status));
  const request = (r: any) => {
    const tier = COMMISSION_TIERS.find((t) => t.id === r.tier);
    return (
      <li key={r.id} style={{ alignItems: 'flex-start' }}>
        <span style={{ flex: '1 1 320px' }}>
          <b>{r.name}</b> <span className="dim">{r.email} · {tier?.name ?? r.tier} · {money(r.price_cents)} · {day(r.created_at)}{r.emailed ? ' · emailed to you' : ''}{r.paid_at ? ` · paid ${day(r.paid_at)}` : ''}</span>
          <span style={{ display: 'block', whiteSpace: 'pre-wrap', marginTop: 4 }}>{r.pitch}</span>
          {r.tone ? <span className="dim" style={{ display: 'block' }}>Tone: {r.tone}</span> : null}
          {r.refs ? <span className="dim" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>References: {r.refs}</span> : null}
          {r.material ? <span className="dim" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>Material so far: {r.material}</span> : null}
          <span className="dim" style={{ display: 'block' }}>{r.players ? `Players: ${r.players}. ` : ''}{r.deadline ? `Needed by: ${r.deadline}. ` : ''}{r.pro_months ? `Includes ${r.pro_months} months of Pro.` : ''}</span>
        </span>
        <CommissionRow job={{ id: r.id, status: r.status, notes: r.notes, revisions_used: r.revisions_used, revisions_included: r.revisions_included, pay_url: r.pay_url, pro_months: r.pro_months }} options={COMMISSION_STATUS} campaigns={campaigns} />
      </li>
    );
  };
  return (
    <>
      <h1>Store and requests</h1>
      <p><Link className="button quiet" href="/admin">Back to Head DM</Link></p>
      {error ? <div className="panel"><p className="bad" role="alert">{error}</p></div> : null}
      {note ? <div className="panel"><p className="good" role="status">{note}</p></div> : null}
      {published ? <div className="panel"><p className="good" role="status">Saved. <Link href={'/store/' + published}>See it in the store</Link> (drafts do not show there).</p></div> : null}
      {made ? (
        <div className="panel">
          <p className="good" role="status">The copy is ready: <Link href={`/c/${made}/manage`}>open it</Link>, read it through, edit it, then publish it below.</p>
          {left ? <><p>Left out or changed:</p><ul className="plain">{left.split(' | ').filter(Boolean).map((x) => <li key={x}>{x}</li>)}</ul></> : null}
        </div>
      ) : null}

      <h2>Custom campaign requests</h2>
      <div className="panel">
        <p className="dim">The public page is <Link href="/custom">Have Bryce build it</Link>. {COMMISSIONS.open ? 'Requests are open.' : 'Requests are closed (the switch is in src/config/commissions.ts).'} Accept a request, send the client the payment link, build the campaign in your own account, then deliver it: that hands it to their account and starts their Pro months.</p>
        {open.length ? <ul className="list">{open.map(request)}</ul> : <p className="dim">No open requests.</p>}
        {closed.length ? <details><summary>Delivered and declined ({closed.length})</summary><ul className="list">{closed.map(request)}</ul></details> : null}
        <p className="dim">Tiers: {COMMISSION_TIERS.map((t) => `${t.name} ${tierPrice(t)}`).join(', ')}.</p>
      </div>

      <h2>Hand a campaign to another account</h2>
      <div className="panel">
        <p className="dim">For anything outside a request. The other person must already have an account (free is fine). They become its DM; you no longer see it. It does not count toward their free plan&apos;s one campaign.</p>
        <TransferForm campaigns={campaigns} />
      </div>

      <h2>Store</h2>
      <div className="panel">
        {(products ?? []).length ? (
          <ul className="list">
            {(products as any[]).map((p) => {
              const sold = (sales ?? []).filter((s) => s.product_id === p.id);
              return <li key={p.id}><span><b>{p.title}</b> <span className="dim">{p.kind === 'pack' ? 'pack' : p.edition ? `campaign, ${p.edition} edition` : 'campaign'} · {p.status} · {money(p.price_cents)} · {sold.length} sold or claimed · saved {day(p.updated_at)} · /store/{p.slug}</span></span>{p.status === 'live' ? <Link href={'/store/' + p.slug}>View</Link> : null}</li>;
            })}
          </ul>
        ) : <p className="dim">Nothing published yet.</p>}
        <p className="dim">A listing made from a campaign is never shown to that campaign&apos;s players, and is hidden from signed-out visitors while the campaign has players.</p>
      </div>

      <h2>Make a product-ready copy of a campaign</h2>
      <div className="panel">
        <p className="dim">Both buttons make a new campaign in your account for you to read through and edit. Neither changes the original, and neither publishes anything.</p>
        <form method="post" action="/admin/store/generate">
          <label>Campaign<select name="campaign" required defaultValue="">{[<option key="" value="">Choose one of your campaigns</option>, ...campaigns.filter((c) => !c.copy).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)]}</select></label>
          <p className="inline">
            <button type="submit" name="mode" value="framework">Generate a framework</button>
            <button type="submit" name="mode" value="full" className="quiet">Make a publishable copy</button>
          </p>
        </form>
        <ul className="plain dim">
          <li><b>Framework:</b> the tabs, theme, reveal stages and custom resources stay. Every piece of story becomes a labelled empty slot saying what goes there. For the {STORE.editions.framework.name.toLowerCase()}.</li>
          <li><b>Publishable copy:</b> the whole campaign, minus anything private (old rule sets, races from published material). For the {STORE.editions.full.name.toLowerCase()} of a campaign that holds private content.</li>
        </ul>
      </div>

      <h2>Publish a campaign as a product</h2>
      <div className="panel">
        <p className="dim">This takes a frozen copy of the campaign as it is now. Buyers get their own editable copy. Publishing again under the same store address replaces the frozen copy. A campaign that holds private content can be saved as a draft listing but cannot go live.</p>
        <form method="post" action="/admin/store/publish">
          <label>Campaign<select name="campaign" required defaultValue="">{[<option key="" value="">Choose one of your campaigns</option>, ...campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)]}</select></label>
          <div className="fieldrow">
            <label>Edition<select name="edition" defaultValue=""><option value="">One edition only</option><option value="full">Full edition (starts at {money(STORE.editions.full.cents)})</option><option value="framework">Framework edition (starts at {money(STORE.editions.framework.cents)})</option></select></label>
            <label>For a framework: the store address of its full edition<input name="full_slug" pattern="[a-z0-9][a-z0-9\-]{1,60}" placeholder="the full edition's address" /></label>
          </div>
          <div className="fieldrow">
            <label>Product title<input name="title" required maxLength={120} /></label>
            <label>Store address (lowercase, dashes)<input name="slug" pattern="[a-z0-9][a-z0-9\-]{1,60}" placeholder="the-lantern-beneath" /></label>
            <label>Price in dollars (0 for free)<input name="price" type="number" min={0} step="0.01" defaultValue="0" /></label>
          </div>
          <label>The pitch<textarea name="pitch" rows={4} maxLength={4000} /></label>
          <label>What is included, one line each<textarea name="includes" rows={4} placeholder={'12 pages of lore\n9 NPCs with secrets\n2 maps with hidden regions'} /></label>
          <fieldset className="multi">
            <legend>Free preview: the tabs anyone can read on the listing (as a player would see them)</legend>
            {campaigns.map((c) => {
              const tabs = (sections ?? []).filter((s) => s.campaign_id === c.id);
              return tabs.length ? <p key={c.id} className="dim" style={{ margin: '4px 0' }}>{c.title}: {tabs.map((s) => <label key={s.slug} className="ckrow" style={{ display: 'inline-flex', marginRight: 12 }}><input type="checkbox" name="preview" value={s.slug} /> {s.title}</label>)}</p> : null;
            })}
          </fieldset>
          <label>Status<select name="status" defaultValue="draft"><option value="draft">Draft (not in the store)</option><option value="live">Live (in the store)</option></select></label>
          <button type="submit">Freeze and publish</button>
        </form>
        <p className="dim">Subscribers pay {Math.round(STORE.subscriberDiscount * 100)} percent less. Someone who owns a framework pays the difference for its full edition. Both are set in src/config/store.ts.</p>
      </div>

      <h2>Publish a homebrew pack</h2>
      <div className="panel">
        <p className="dim">Sell a pack of your races, classes and other entries for a one-time price, or give it away. Buyers attach it to any campaign they run. Make the pack under <Link href="/homebrew">Homebrew</Link> first. A pack with a private entry in it cannot be published.</p>
        <form method="post" action="/admin/store/publish-pack">
          <label>Pack<select name="pack" required defaultValue="">{[<option key="" value="">Choose one of your packs</option>, ...(packs ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)]}</select></label>
          <div className="fieldrow">
            <label>Listing title<input name="title" required maxLength={120} /></label>
            <label>Store address (lowercase, dashes)<input name="slug" pattern="[a-z0-9][a-z0-9\-]{1,60}" /></label>
            <label>Price in dollars (0 for free)<input name="price" type="number" min={0} step="0.01" defaultValue="0" /></label>
          </div>
          <label>The pitch<textarea name="pitch" rows={3} maxLength={4000} /></label>
          <label>The one entry shown in full as the free preview<select name="preview" defaultValue="">{[<option key="" value="">The first entry</option>, ...((packItems ?? []) as any[]).filter((i) => i.entities && (packs ?? []).some((p) => p.id === i.pack_id)).map((i) => <option key={i.pack_id + i.entities.id} value={i.entities.id}>{(packs ?? []).find((p) => p.id === i.pack_id)?.name}: {i.entities.name}</option>)]}</select></label>
          <label>Status<select name="status" defaultValue="draft"><option value="draft">Draft (not in the store)</option><option value="live">Live (in the store)</option></select></label>
          <button type="submit">Publish pack</button>
        </form>
      </div>
    </>
  );
}
