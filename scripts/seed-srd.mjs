// Loads the SRD core set (seed/srd/core.mjs) into the `entities` table as source 'srd'.
// Safe to run again: entries are matched by type and name and updated in place.
//   npm run seed-srd
import { admin } from '../tests/helpers.mjs';
import { SRD_CORE, slugify } from '../seed/srd/core.mjs';

const { data: existing, error: e0 } = await admin.from('entities').select('id, type, slug').eq('source', 'srd').limit(5000);
if (e0) { console.error(e0.message); process.exit(1); }
const have = new Map(existing.map((r) => [r.type + '/' + r.slug, r.id]));
let added = 0, updated = 0;
const fresh = [];
for (const e of SRD_CORE) {
  const slug = slugify(e.name);
  const row = { owner_id: null, source: 'srd', type: e.type, slug, name: e.name, status: 'live', depth: 'advanced', data: e.data };
  const id = have.get(e.type + '/' + slug);
  if (id) { const r = await admin.from('entities').update(row).eq('id', id); if (r.error) throw r.error; updated++; }
  else fresh.push(row);
}
for (let i = 0; i < fresh.length; i += 100) {
  const r = await admin.from('entities').insert(fresh.slice(i, i + 100));
  if (r.error) { console.error(r.error.message); process.exit(1); }
  added += Math.min(100, fresh.length - i);
}
const counts = {};
SRD_CORE.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
console.log(`SRD core set: ${added} added, ${updated} updated.`, JSON.stringify(counts));
