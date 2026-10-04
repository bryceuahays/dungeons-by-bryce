// Creates the store listing for "To be a god" as two UNPUBLISHED drafts: a framework
// edition and a full edition, linked, at the starting prices in src/config/store.ts.
// Nothing is frozen and nothing is for sale: drafts are visible to the site admin only.
// Publishing is done by hand, later, from Head DM > Store and requests.
//
//   node scripts/seed-tbg-listing.mjs        (safe to run again)

import { admin, campaign } from '../tests/helpers.mjs';
import { STORE } from '../src/config/store.ts';

const C = await campaign();
const { data: face } = await admin.from('campaign_faces').select('title, tagline, slug').eq('campaign_id', C.id).eq('phase', '').single();
const base = { seller_id: C.owner_id, kind: 'campaign', campaign_id: C.id, spoiler_campaign: C.id, status: 'draft', theme: C.theme };
async function upsert(row) {
  const { data: was } = await admin.from('products').select('id, status').eq('slug', row.slug).maybeSingle();
  if (was?.status === 'live') { console.log(`${row.slug} is already live: left alone.`); return was.id; }
  const r = was ? await admin.from('products').update(row).eq('id', was.id).select('id').single() : await admin.from('products').insert(row).select('id').single();
  if (r.error) { console.error(r.error.message); process.exit(1); }
  return r.data.id;
}
const full = await upsert({ ...base, slug: face.slug, title: face.title, edition: 'full', price_cents: STORE.editions.full.cents, pitch: face.tagline || '[Write the pitch before publishing.]', includes: [] });
await upsert({ ...base, slug: face.slug + '-framework', title: `${face.title}: framework`, edition: 'framework', full_product: full, price_cents: STORE.editions.framework.cents, pitch: '[Write the pitch for the framework edition before publishing.]', includes: [] });
console.log('Two draft listings are in place (framework and full). Neither is published.');
