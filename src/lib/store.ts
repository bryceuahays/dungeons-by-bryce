import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import { renderSection } from './render';
import { cleanContent } from './sanitize';
import { embedVideos } from './video';

// The store.
//
// A campaign product is a FROZEN snapshot, taken when it is published and kept where only
// this server can read it (it includes the DM's secrets). It can be sold in two editions:
// a framework (structure, no story) and a full edition. A pack product is a homebrew pack
// the buyer may attach to their campaigns.
//
// The content rule, enforced here: only `srd` and `homebrew` content ever ships. A
// campaign holding private rules or private entries cannot be published live, and a pack
// holding a private entry cannot be published at all.
//
// Only the site admin publishes for now. The products table carries a seller and a
// "site cut" so other creators can sell later; nothing on the creator side is built.

const ENTRY_KINDS = ['npc', 'beat', 'map', 'region', 'pin', 'secret', 'clue', 'clock', 'zero'];
const LEGACY_KINDS = ['sheet-template', 'sheet-slot'];           // the old campaign-specific sheet: tied to private rules
const RACE_KINDS = ['race', 'race-phase', 'race-dm'];
const rnd = (n = 3) => crypto.randomBytes(n).toString('hex');

export type PublishInput = { campaignId: string; slug: string; title: string; pitch: string; includes: string[]; previewSections: string[]; priceCents: number; status: 'draft' | 'live'; cover?: string; edition?: 'full' | 'framework' | null; fullSlug?: string };
type Result = { id?: string; error?: string; note?: string };

async function privateIn(reader: SupabaseClient, c: string): Promise<string> {
  const { data: priv } = await reader.rpc('campaign_private_content', { c });
  const names: string[] = priv?.entries ?? [];
  if (!(Number(priv?.rules) > 0) && !names.length) return '';
  return `it contains private content${Number(priv?.rules) > 0 ? ` (${priv.rules} private rules in its own character builder)` : ''}${names.length ? ` (private homebrew: ${names.slice(0, 8).join(', ')})` : ''}`;
}

// ---------------------------------------------------------------- reading a campaign, whole

async function readCampaign(reader: SupabaseClient, c: string, keepOwner: string) {
  const [faces, sections, content, entries, secrets, attached] = await Promise.all([
    reader.from('campaign_faces').select('phase, slug, title, tagline').eq('campaign_id', c),
    reader.from('sections').select('slug, title, sort, audience, kind, phase, from_stage').eq('campaign_id', c).order('sort'),
    reader.from('content').select('section, kind, key, sort, title, body, visibility, phase, from_stage, hidden').eq('campaign_id', c).order('sort').limit(5000),
    reader.from('entries').select('id, kind, parent, owner, sort, title, status, data, live, vis, vis_stage, vis_entry').eq('campaign_id', c).in('kind', ENTRY_KINDS).limit(5000),
    reader.from('entry_secrets').select('entry_id, data').eq('campaign_id', c),
    reader.from('campaign_entities').select('vis, vis_stage, entities(id, owner_id, type, name, slug, source, status, depth, data)').eq('campaign_id', c),
  ]);
  // players' own additions are not part of a product, and the story starts unplayed
  const kept = ((entries.data ?? []) as any[]).filter((e) => !e.owner || e.owner === keepOwner).map((e) => {
    if (e.kind === 'beat' && e.status === 'hit') { const { hitAt: _a, hitSession: _b, ...d } = e.data ?? {}; void _a; void _b; return { ...e, status: 'planned', live: false, data: d }; }
    return e;
  });
  const ids = new Set(kept.map((e) => e.id));
  return {
    faces: (faces.data ?? []) as any[], sections: (sections.data ?? []) as any[], content: (content.data ?? []) as any[], entries: kept,
    secrets: Object.fromEntries(((secrets.data ?? []) as any[]).filter((s) => ids.has(s.entry_id)).map((s) => [s.entry_id, s.data])) as Record<string, any>,
    homebrew: ((attached.data ?? []) as any[]).filter((a) => a.entities && a.entities.source === 'homebrew'),
  };
}

// ---------------------------------------------------------------- publishing a campaign

// `reader` is the admin's own login (they must run the campaign, so it reads everything).
export async function publishProduct(reader: SupabaseClient, sellerId: string, input: PublishInput): Promise<Result> {
  const admin = createAdminClient();
  const c = input.campaignId;
  const { data: campaign } = await reader.from('campaigns').select('id, title, tagline, theme, phases, settings, background, owner_id, copied_from').eq('id', c).maybeSingle();
  if (!campaign || campaign.owner_id !== sellerId) return { error: 'You can publish campaigns you run.' };
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(input.slug)) return { error: 'The store address can use lowercase letters, numbers and dashes.' };

  // Nothing private may be sold. A draft listing can exist while that is sorted out; it cannot go live.
  const priv = await privateIn(reader, c);
  if (priv && input.status === 'live') {
    return { error: `This campaign cannot be published: ${priv}. Private content is never sold. Use "Make a publishable copy" below (it leaves private content out), check the copy, and publish that.` };
  }

  let fullProduct: string | null = null;
  if (input.edition === 'framework' && input.fullSlug) {
    const { data: full } = await admin.from('products').select('id').eq('slug', input.fullSlug).eq('kind', 'campaign').maybeSingle();
    if (!full) return { error: `There is no campaign product at the store address "${input.fullSlug}" to be this framework's full edition. Create the full edition's listing first (a draft is enough).` };
    fullProduct = full.id;
  }

  const { data: existing } = await admin.from('products').select('id').eq('slug', input.slug).maybeSingle();
  const row = {
    slug: input.slug, seller_id: sellerId, campaign_id: c, kind: 'campaign', title: input.title.slice(0, 120), pitch: input.pitch.slice(0, 4000), includes: input.includes.slice(0, 20),
    price_cents: Math.max(0, Math.round(input.priceCents)), status: input.status, theme: campaign.theme, edition: input.edition ?? null,
    // spoiler protection follows the campaign the story came from, even when this was published from a copy
    spoiler_campaign: campaign.copied_from ?? c,
    ...(fullProduct ? { full_product: fullProduct } : {}), ...(input.cover !== undefined ? { cover: input.cover } : {}),
  };
  const saved = existing ? await admin.from('products').update(row).eq('id', existing.id).select('id').single() : await admin.from('products').insert(row).select('id').single();
  if (saved.error || !saved.data) return { error: /duplicate|unique/i.test(saved.error?.message || '') ? 'Another product already uses that store address.' : 'The product could not be saved.' };
  const pid = saved.data.id as string;
  if (priv) return { id: pid, note: `Saved as a draft. It cannot go live yet: ${priv}.` };

  const src = await readCampaign(reader, c, sellerId);
  const real = src.faces.find((f) => f.phase === '');

  // freeze the pictures: copies that no longer depend on the original campaign
  const files: Record<string, string> = {};
  for (const e of src.entries) {
    const f = String(e.data?.file ?? '');
    if (!f.startsWith(c + '/')) continue;
    const to = `products/${pid}/${f.split('/').pop()}`;
    await admin.storage.from('campaign-files').remove([to]);
    if (!(await admin.storage.from('campaign-files').copy(f, to)).error) files[f] = to;
  }
  const bg: Record<string, string> = {};
  for (const shape of ['wide', 'tall', 'hero']) {
    const to = `product/${pid}/${shape}`;
    await admin.storage.from('backgrounds').remove([to]);
    if (!(await admin.storage.from('backgrounds').copy(`campaign/${c}/${shape}`, to)).error) bg[shape] = to;
  }

  const snapshot = {
    v: 1,
    campaign: { title: real?.title ?? campaign.title, tagline: real?.tagline ?? campaign.tagline, theme: campaign.theme, phases: campaign.phases, settings: { ...(campaign.settings ?? {}), session: 0 }, background: campaign.background },
    faces: src.faces.filter((f) => f.phase !== ''),
    sections: src.sections, content: src.content.filter((r) => !LEGACY_KINDS.includes(r.kind)), entries: src.entries, secrets: src.secrets,
    entities: src.homebrew.map((a) => ({ ...a.entities, vis: a.vis === 'players' ? 'dm' : a.vis, vis_stage: a.vis_stage })),
    files, bg,
  };

  // free preview pages: built the way a player would receive them at the first stage, and made safe
  const first = ((campaign.phases ?? []) as { id: string }[])[0]?.id ?? '';
  const preview = input.previewSections.map((slug) => {
    const sec = src.sections.find((s) => s.slug === slug && s.audience !== 'dm');
    if (!sec) return null;
    const rows = src.content.filter((r) => r.section === slug && r.visibility === 'player' && !r.hidden && (!r.phase || r.phase === first) && (!r.from_stage || r.from_stage === first));
    return { title: sec.title, html: embedVideos(cleanContent(renderSection(rows, { races: [], factions: [] }, { base: '#' }))) };
  }).filter(Boolean);

  const s1 = await admin.from('product_snapshots').upsert({ product_id: pid, data: snapshot, created_at: new Date().toISOString() });
  const s2 = await admin.from('products').update({ preview }).eq('id', pid);
  if (s1.error || s2.error) return { error: 'The product was saved but its contents could not be frozen. Try publishing again.' };
  return { id: pid };
}

// ---------------------------------------------------------------- publishing a pack

export async function publishPack(reader: SupabaseClient, sellerId: string, input: { packId: string; slug: string; title: string; pitch: string; priceCents: number; status: 'draft' | 'live'; previewEntity?: string; cover?: string }): Promise<Result> {
  const admin = createAdminClient();
  const { data: pack } = await reader.from('packs').select('id, owner_id, name').eq('id', input.packId).maybeSingle();
  if (!pack || pack.owner_id !== sellerId) return { error: 'You can publish packs you made.' };
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(input.slug)) return { error: 'The store address can use lowercase letters, numbers and dashes.' };
  const { data: items } = await reader.from('pack_entities').select('entities(id, type, name, source, status, data)').eq('pack_id', pack.id);
  const entries = ((items ?? []) as any[]).map((i) => i.entities).filter(Boolean);
  if (!entries.length) return { error: 'That pack is empty.' };
  const priv = entries.filter((e) => e.source !== 'homebrew');
  if (priv.length) return { error: `This pack cannot be published: ${priv.map((e) => e.name).join(', ')} ${priv.length === 1 ? 'is' : 'are'} marked private. Private content is never sold. Take ${priv.length === 1 ? 'it' : 'them'} out of the pack, or untick "Private" on entries that are your own original work.` };
  const drafts = entries.filter((e) => e.status === 'draft');
  if (drafts.length) return { error: `Set these entries to Playtest or Live first (drafts are not delivered): ${drafts.map((e) => e.name).join(', ')}.` };
  const shown = entries.find((e) => e.id === input.previewEntity) ?? entries[0];
  const price = Math.max(0, Math.round(input.priceCents));
  const row = {
    slug: input.slug, seller_id: sellerId, kind: 'pack', pack_id: pack.id, campaign_id: null, title: input.title.slice(0, 120), pitch: input.pitch.slice(0, 4000), price_cents: price, status: input.status,
    includes: [...entries].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)).map((e) => `${e.name} (${e.type})`),
    // the free preview: one whole entry, as a player would see it
    preview: [{ title: shown.name, entity: { type: shown.type, name: shown.name, data: shown.data } }],
    ...(input.cover !== undefined ? { cover: input.cover } : {}),
  };
  const { data: existing } = await admin.from('products').select('id').eq('slug', input.slug).maybeSingle();
  const saved = existing ? await admin.from('products').update(row).eq('id', existing.id).select('id').single() : await admin.from('products').insert(row).select('id').single();
  if (saved.error || !saved.data) return { error: /duplicate|unique/i.test(saved.error?.message || '') ? 'Another product already uses that store address.' : 'The product could not be saved.' };
  // an official pack: free ones are open to every account, paid ones to whoever buys them
  await admin.from('packs').update({ official: true, free: price === 0 && input.status === 'live' }).eq('id', pack.id);
  return { id: saved.data.id };
}

// ---------------------------------------------------------------- copying content into a campaign

async function copyFiles(admin: SupabaseClient, s: any, id: string) {
  const moved: Record<string, string> = {};
  for (const [from, frozen] of Object.entries((s.files ?? {}) as Record<string, string>)) {
    const to = `${id}/${from.split('/')[1] ?? 'files'}/${crypto.randomUUID()}.${String(frozen).split('.').pop()}`;
    if (!(await admin.storage.from('campaign-files').copy(frozen, to)).error) moved[from] = to;
  }
  return moved;
}

// Table-tool entries: parents first, then what hangs off them; links between entries are re-pointed.
async function copyEntries(admin: SupabaseClient, all: any[], secrets: Record<string, any>, moved: Record<string, string>, id: string, userId: string) {
  const map = new Map<string, string>();
  const pending = [...all];
  for (let pass = 0; pass < 6 && pending.length; pass++) {
    for (const e of [...pending]) {
      if (e.parent && !map.has(e.parent) && all.some((x) => x.id === e.parent)) continue;
      const row = { campaign_id: id, kind: e.kind, parent: e.parent ? map.get(e.parent) ?? null : null, owner: userId, sort: e.sort, title: e.title, status: e.status, live: e.live, vis: e.vis === 'players' ? 'dm' : e.vis, vis_players: [], vis_stage: e.vis_stage, data: { ...(e.data ?? {}), ...(e.data?.file ? { file: moved[e.data.file] } : {}) } };
      const ins = await admin.from('entries').insert(row).select('id').single();
      if (ins.data) map.set(e.id, ins.data.id);
      pending.splice(pending.indexOf(e), 1);
    }
  }
  for (const e of all) {
    const nid = map.get(e.id);
    if (!nid) continue;
    const patch: Record<string, unknown> = {};
    if (e.vis_entry && map.has(e.vis_entry)) patch.vis_entry = map.get(e.vis_entry);
    const d = { ...(e.data ?? {}) };
    let touched = false;
    for (const k of ['beat', 'toMap']) if (d[k] && map.has(d[k])) { d[k] = map.get(d[k]); touched = true; }
    if (touched) { if (d.file) d.file = moved[e.data.file]; patch.data = d; }
    if (Object.keys(patch).length) await admin.from('entries').update(patch).eq('id', nid);
    if (secrets?.[e.id]) await admin.from('entry_secrets').insert({ entry_id: nid, campaign_id: id, data: secrets[e.id] });
  }
}

// The homebrew that comes with a product: the buyer gets their own editable copies,
// marked as having come with a purchase (they never count toward the free limit).
async function copyEntities(admin: SupabaseClient, list: any[], id: string, userId: string) {
  const { data: have } = await admin.from('campaign_entities').select('entities(name, type)').eq('campaign_id', id);
  const names = new Set(((have ?? []) as any[]).map((h) => `${h.entities?.type}/${h.entities?.name}`));
  for (const e of list) {
    if (names.has(`${e.type}/${e.name}`)) continue;
    const ins = await admin.from('entities').insert({ owner_id: userId, source: 'homebrew', origin: 'product', type: e.type, name: e.name, slug: `${String(e.slug).slice(0, 60)}-${rnd()}`, status: e.status, depth: e.depth, data: e.data }).select('id').single();
    if (ins.data) await admin.from('campaign_entities').insert({ campaign_id: id, entity_id: ins.data.id, vis: e.vis ?? 'all', vis_stage: e.vis_stage ?? null });
  }
}

async function snapshotOf(admin: SupabaseClient, productId: string) {
  const [{ data: product }, { data: snap }] = await Promise.all([
    admin.from('products').select('id, slug, kind, pack_id, edition, full_product').eq('id', productId).maybeSingle(),
    admin.from('product_snapshots').select('data').eq('product_id', productId).maybeSingle(),
  ]);
  return { product, s: snap?.data as any };
}

// ---------------------------------------------------------------- delivering

// Copies a campaign product into the buyer's account as a campaign they own and run. Runs
// with the site's own authority (after a confirmed payment, or for a free product).
export async function deliverProduct(productId: string, userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { product, s } = await snapshotOf(admin, productId);
  if (!product) return null;
  if (product.kind === 'pack') {
    if (product.pack_id) await admin.from('pack_owners').upsert({ user_id: userId, pack_id: product.pack_id });
    return product.pack_id ? 'pack:' + product.pack_id : null;
  }
  if (!s) return null;

  const slug = `${String(product.slug).slice(0, 50)}-${rnd()}`;
  const phases = (s.campaign.phases ?? []) as { id: string }[];
  const made = await admin.from('campaigns').insert({ owner_id: userId, slug, title: s.campaign.title, tagline: s.campaign.tagline ?? '', theme: s.campaign.theme ?? {}, phases, phase: phases[0]?.id ?? '', settings: s.campaign.settings ?? {}, purchased: true }).select('id').single();
  if (made.error || !made.data) return null;
  const id = made.data.id as string;

  // titles and addresses per stage (each needs an address of its own)
  for (const f of s.faces ?? []) await admin.from('campaign_faces').insert({ campaign_id: id, phase: f.phase, slug: `${String(f.slug).slice(0, 50)}-${rnd()}`, title: f.title, tagline: f.tagline ?? '' });
  if ((s.sections ?? []).length) await admin.from('sections').insert(s.sections.map((x: any) => ({ ...x, campaign_id: id })));
  for (let i = 0; i < (s.content ?? []).length; i += 300) await admin.from('content').insert(s.content.slice(i, i + 300).map((x: any) => ({ ...x, campaign_id: id })));

  const moved = await copyFiles(admin, s, id);
  const bg: Record<string, boolean> = {};
  for (const shape of ['wide', 'tall', 'hero']) if (s.bg?.[shape] && !(await admin.storage.from('backgrounds').copy(s.bg[shape], `campaign/${id}/${shape}`)).error) bg[shape] = true;
  if (bg.wide && bg.tall) await admin.from('campaigns').update({ background: { wide: true, tall: true, v: Date.now() } }).eq('id', id);
  await copyEntries(admin, s.entries ?? [], s.secrets ?? {}, moved, id, userId);
  await copyEntities(admin, s.entities ?? [], id, userId);
  await admin.from('purchases').update({ campaign_id: id }).eq('user_id', userId).eq('product_id', productId).is('campaign_id', null);
  return slug;
}

// Upgrade a framework copy to the full edition, in place. Nothing the buyer wrote is
// overwritten: a slot they left as it came is filled in; anything they changed is kept,
// and the full edition's version is added alongside it.
export async function upgradeCopy(campaignId: string, fullProductId: string, userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: mine } = await admin.from('campaigns').select('id, slug, owner_id').eq('id', campaignId).maybeSingle();
  if (!mine || mine.owner_id !== userId) return null;
  const { s: full } = await snapshotOf(admin, fullProductId);
  const { data: fw } = await admin.from('products').select('id').eq('full_product', fullProductId).eq('edition', 'framework').limit(1).maybeSingle();
  const framework = fw ? (await snapshotOf(admin, fw.id)).s : null;
  if (!full) return null;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const ident = (r: any) => [r.section, r.kind, r.key, r.visibility, r.phase ?? ''].join('|');

  // tabs the full edition has and this copy does not
  const { data: tabs } = await admin.from('sections').select('slug').eq('campaign_id', campaignId);
  const haveTabs = new Set((tabs ?? []).map((t) => t.slug));
  const newTabs = (full.sections ?? []).filter((x: any) => !haveTabs.has(x.slug));
  if (newTabs.length) await admin.from('sections').insert(newTabs.map((x: any) => ({ ...x, campaign_id: campaignId })));

  // pages
  const { data: rows } = await admin.from('content').select('id, section, kind, key, sort, title, body, visibility, phase').eq('campaign_id', campaignId).limit(5000);
  const mineBy = new Map(((rows ?? []) as any[]).map((r) => [ident(r), r]));
  const cameWith = new Map(((framework?.content ?? []) as any[]).map((r) => [ident(r), r]));
  const add: any[] = [];
  let filled = 0, alongside = 0;
  for (const r of (full.content ?? []) as any[]) {
    const has = mineBy.get(ident(r));
    if (!has) { add.push({ ...r, campaign_id: campaignId }); continue; }
    if (same(has.body, r.body)) continue;
    const untouched = cameWith.get(ident(r));
    if (untouched && same(has.body, untouched.body)) { await admin.from('content').update({ body: r.body, title: r.title }).eq('id', has.id); filled++; }
    else { add.push({ ...r, campaign_id: campaignId, key: `${r.key}-full`, sort: r.sort + 1, title: `${r.title} (from the full edition)`.slice(0, 120), visibility: 'dm' }); alongside++; }
  }
  // empty slots that came with the framework, were never touched, and have no counterpart in the full edition
  const fullIds = new Set(((full.content ?? []) as any[]).map(ident));
  for (const [k, r] of mineBy) { const u = cameWith.get(k); if (u && !fullIds.has(k) && same(r.body, u.body) && /\[[^\]]+\]/.test(JSON.stringify(r.body))) await admin.from('content').delete().eq('id', r.id); }
  for (let i = 0; i < add.length; i += 300) await admin.from('content').insert(add.slice(i, i + 300));

  // table tools: unused placeholders go; the full edition's entries arrive beside whatever the buyer made
  const { data: mineEntries } = await admin.from('entries').select('id, kind, title, data').eq('campaign_id', campaignId);
  for (const e of (mineEntries ?? []) as any[]) {
    if (((framework?.entries ?? []) as any[]).some((f) => f.kind === e.kind && f.title === e.title && same(f.data, e.data)) && /^\[/.test(e.title)) await admin.from('entries').delete().eq('id', e.id);
  }
  const left = new Set(((await admin.from('entries').select('kind, title').eq('campaign_id', campaignId)).data ?? []).map((e: any) => `${e.kind}/${e.title}`));
  const incoming = ((full.entries ?? []) as any[]).filter((e) => !left.has(`${e.kind}/${e.title}`));
  const moved = await copyFiles(admin, { files: Object.fromEntries(Object.entries(full.files ?? {}).filter(([from]) => incoming.some((e) => e.data?.file === from))) }, campaignId);
  await copyEntries(admin, incoming, full.secrets ?? {}, moved, campaignId, userId);
  await copyEntities(admin, full.entities ?? [], campaignId, userId);

  // titles per stage that the framework did not have
  const { data: faces } = await admin.from('campaign_faces').select('phase').eq('campaign_id', campaignId);
  const haveFaces = new Set((faces ?? []).map((f) => f.phase));
  for (const f of (full.faces ?? []) as any[]) if (!haveFaces.has(f.phase)) await admin.from('campaign_faces').insert({ campaign_id: campaignId, phase: f.phase, slug: `${String(f.slug).slice(0, 50)}-${rnd()}`, title: f.title, tagline: f.tagline ?? '' });

  await admin.from('entries').insert({ campaign_id: campaignId, kind: 'log', owner: null, title: `Upgraded to the full edition: ${filled} empty slots filled, ${add.length - alongside} blocks added, ${alongside} added beside your own version (marked DM only for you to merge).`, live: false, vis: 'dm', data: { kind: 'upgrade' } });
  return mine.slug as string;
}

// ---------------------------------------------------------------- the framework generator, and a publishable copy

const slot = (what: string) => `<p><em>[${what}]</em></p>`;
function placeholder(r: any, stageLabel: (id: string | null) => string): any | null {
  const who = r.visibility === 'dm' ? 'only you, the DM, see this' : 'your players see this';
  const when = r.phase ? `, only while the campaign is at "${stageLabel(r.phase)}"` : r.from_stage ? `, from "${stageLabel(r.from_stage)}" onward` : '';
  const b = r.body ?? {};
  switch (r.kind) {
    case 'hero': return { ...r, title: 'Page header', body: { html: `<h1>[Your campaign's title]</h1><p class="premise">[One or two sentences that sell the campaign to your players.]</p>` } };
    case 'heading': return { ...r, title: 'Heading', body: { text: '[Heading]', level: b.level ?? 2 } };
    case 'html': return { ...r, title: 'Text', body: { html: slot(`Your text goes here: ${who}${when}`) } };
    case 'plate': return { ...r, title: 'Card', body: { html: `<h3>[Card title]</h3>${slot(`A short card (a place, a faction, a hook): ${who}${when}`)}`, grid: b.grid ?? 'g2', group: b.group } };
    case 'secret': return { ...r, title: 'Secret', body: { tag: 'DM only', html: slot(`A secret: the truth behind this page. Only you see it${when}`) } };
    case 'table': { const head = /<tr[^>]*>[\s\S]*?<\/tr>/i.exec(String(b.html ?? ''))?.[0] ?? '<tr><th>Column</th><th>Column</th></tr>'; const cells = (head.match(/<t[hd]/gi) ?? []).length || 2; return { ...r, title: 'Table', body: { html: `<table>${head}<tr>${'<td>[…]</td>'.repeat(cells)}</tr></table>` } }; }
    case 'checklist': return { ...r, title: 'Checklist', body: { items: [{ text: '[Something to do, find or prepare]', done: false }] } };
    case 'video': return { ...r, title: 'Video', body: { url: '', caption: '[A trailer or a recap video: paste a link]' } };
    case 'faction': case 'faction-dm': return { ...r, title: 'Faction', body: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === 'string' ? (k === 'n' ? '[Faction name]' : `[${k}]`) : Array.isArray(v) ? ['[…]'] : v])) };
    default: return RACE_KINDS.includes(r.kind) || LEGACY_KINDS.includes(r.kind) ? null : r;   // automatic blocks stay as they are
  }
}

// Makes a new campaign in the admin's account from one they run.
//   'framework'  the structure with the story stripped out and labelled empty slots left in its place
//   'full'       everything, except private content (so it can be published)
// The result is an ordinary campaign: review it, edit it, then publish it as a product.
export async function generateEdition(reader: SupabaseClient, sellerId: string, campaignId: string, mode: 'framework' | 'full'): Promise<{ slug?: string; error?: string; left?: string[] }> {
  const admin = createAdminClient();
  const { data: campaign } = await reader.from('campaigns').select('id, slug, title, tagline, theme, phases, settings, owner_id').eq('id', campaignId).maybeSingle();
  if (!campaign || campaign.owner_id !== sellerId) return { error: 'You can only do this with a campaign you run.' };
  const src = await readCampaign(reader, campaignId, sellerId);
  const real = src.faces.find((f) => f.phase === '');
  const realTitle = String(real?.title ?? campaign.title);
  const phases = (campaign.phases ?? []) as { id: string; label: string }[];
  const stageLabel = (id: string | null) => phases.find((p) => p.id === id)?.label ?? String(id ?? '');
  const left: string[] = [];

  const slug = `${String(real?.slug ?? campaign.slug).slice(0, 40)}-${mode === 'framework' ? 'framework' : 'copy'}-${rnd()}`;
  const made = await admin.from('campaigns').insert({
    owner_id: sellerId, slug, title: mode === 'framework' ? `${realTitle}: framework` : `${realTitle}: publishable copy`, tagline: mode === 'framework' ? '[One line about your campaign.]' : real?.tagline ?? campaign.tagline ?? '',
    theme: campaign.theme, phases, phase: phases[0]?.id ?? '', settings: { ...(campaign.settings ?? {}), session: 0, video: mode === 'framework' ? '' : campaign.settings?.video ?? '' }, copied_from: campaignId,
  }).select('id').single();
  if (made.error || !made.data) return { error: 'The copy could not be made.' };
  const id = made.data.id as string;
  if (src.sections.length) await admin.from('sections').insert(src.sections.map((x) => ({ ...x, campaign_id: id })));

  // ---- pages
  const { data: orig } = await admin.from('packs').select('id, pack_entities(entities(name))').eq('official', true).eq('free', true);
  const originals = new Set(((orig ?? []) as any[]).flatMap((p) => (p.pack_entities ?? []).map((x: any) => String(x.entities?.name ?? '').toLowerCase())));
  let rows: any[];
  if (mode === 'full') {
    rows = src.content.filter((r) => {
      if (LEGACY_KINDS.includes(r.kind)) return false;
      if (RACE_KINDS.includes(r.kind) && !originals.has(String(r.body?.name ?? r.key).toLowerCase()) && !originals.has(String(r.key).toLowerCase())) { if (r.kind === 'race') left.push(`The race "${r.body?.name ?? r.key}" (it comes from published material)`); return false; }
      return true;
    });
    if (src.content.some((r) => LEGACY_KINDS.includes(r.kind))) left.push('The campaign\'s own character sheet and builder (they run on private rules). Buyers get the standard sheet.');
  } else {
    rows = [];
    let last: any = null;
    for (const r of src.content) {
      const p = placeholder(r, stageLabel);
      if (!p) continue;
      // a run of the same kind of slot, for the same people at the same stage, becomes one slot
      if (last && last.section === p.section && last.kind === p.kind && last.visibility === p.visibility && last.phase === p.phase && last.from_stage === p.from_stage && JSON.stringify(last.body) === JSON.stringify(p.body)) continue;
      rows.push(p); last = p;
    }
  }
  for (let i = 0; i < rows.length; i += 300) await admin.from('content').insert(rows.slice(i, i + 300).map((x) => ({ ...x, campaign_id: id, only_players: null })));

  // ---- table tools
  if (mode === 'full') {
    for (const f of src.faces.filter((x) => x.phase !== '')) await admin.from('campaign_faces').insert({ campaign_id: id, phase: f.phase, slug: `${String(f.slug).slice(0, 44)}-copy-${rnd()}`, title: f.title, tagline: f.tagline ?? '' });
    const files: Record<string, string> = {};
    for (const e of src.entries) { const f = String(e.data?.file ?? ''); if (f.startsWith(campaignId + '/')) files[f] = f; }
    const moved = await copyFiles(admin, { files }, id);
    await copyEntries(admin, src.entries, src.secrets, moved, id, sellerId);
  } else {
    const kinds = new Set(src.entries.map((e) => e.kind));
    const stage2 = phases[1]?.id ?? null;
    const slots: any[] = [];
    if (kinds.has('npc')) slots.push({ kind: 'npc', title: '[An NPC]', status: 'alive', vis: 'dm', data: { location: '[Where they are found]', faction: '[Their faction]', known: '[What the players know about them.]' }, secret: { wants: '[What they want.]', relations: '[Who they are tied to.]', secret: '[What they are hiding.]' } });
    if (kinds.has('beat')) { slots.push({ kind: 'beat', title: '[An opening beat: how the story starts]', status: 'planned', live: false, vis: 'all', sort: 10, data: { key: true, note: '[What happens.]' } }); slots.push({ kind: 'beat', title: '[A turning point: the reveal]', status: 'planned', live: false, vis: 'all', sort: 20, data: { key: true, note: '[What the players learn.]', ...(stage2 ? { stage: stage2 } : {}) } }); }
    if (kinds.has('clock')) slots.push({ kind: 'clock', title: '[A faction]', vis: 'dm', data: { goal: '[What they are working toward]', segments: '6', filled: 0 }, secret: { onFill: '[What happens when the clock fills.]' } });
    if (kinds.has('secret')) slots.push({ kind: 'secret', title: '[A secret the players could uncover]', vis: 'dm', data: {}, secret: { detail: '[The truth.]' }, clues: ['[A first clue, and where it is found]', '[A second clue]', '[A third clue]'] });
    if (kinds.has('zero')) slots.push({ kind: 'zero', title: 'Session zero', vis: 'all', data: { tone: '[The tone of this campaign.]', lines: '', veils: '', table: '', house: '[House rules.]' } });
    for (const sl of slots) {
      const { secret, clues, ...row } = sl;
      const ins = await admin.from('entries').insert({ campaign_id: id, owner: sellerId, live: row.live ?? true, ...row }).select('id').single();
      if (ins.data && secret) await admin.from('entry_secrets').insert({ entry_id: ins.data.id, campaign_id: id, data: secret });
      if (ins.data && clues) for (const c of clues) await admin.from('entries').insert({ campaign_id: id, owner: sellerId, kind: 'clue', parent: ins.data.id, title: c, vis: 'dm', data: { where: '[Where it is found]' } });
    }
    if (kinds.has('map')) left.push('Maps: upload your own on the Maps tool (a framework has no map pictures).');
  }

  // ---- homebrew: the seller's own, attached by reference (it is theirs, so nothing is duplicated)
  const mineBrew = src.homebrew.filter((a) => a.entities.owner_id === sellerId);
  if (mineBrew.length) await admin.from('campaign_entities').insert(mineBrew.map((a) => ({ campaign_id: id, entity_id: a.entities.id, vis: a.vis === 'players' ? 'dm' : a.vis, vis_stage: a.vis_stage })));

  // ---- custom resources kept in the old rule set become homebrew of the seller's own, so the mechanics travel
  const { data: divine } = await reader.from('rules').select('key, data').eq('campaign_id', campaignId).eq('kind', 'divine');
  for (const d of (divine ?? []) as any[]) {
    const list = ((d.data?.v ?? []) as any[]).filter((x) => x?.name);
    if (!list.length) continue;
    const isBase = d.key === 'all';
    const name = isBase ? 'Divinity' : String(d.key);
    const entSlug = `divinity-${String(d.key).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const data = isBase
      ? { max: 'prof', recharge: 'long', unit: 'point', desc: `The pool every character with divinity can spend from. Set how many each character has.\n\n${list.map((x) => `${x.name}: ${x.desc}`).join('\n\n')}` }
      : { prereq: 'Granted by the DM', desc: `What a character gains at this tier of divinity.`, features: list.map((x) => ({ level: 1, name: x.name, text: [x.cost ? `${x.cost}.` : '', x.desc].filter(Boolean).join(' ') })) };
    const { data: was } = await admin.from('entities').select('id').eq('owner_id', sellerId).eq('slug', entSlug).maybeSingle();
    const ent = was ?? (await admin.from('entities').insert({ owner_id: sellerId, source: 'homebrew', type: isBase ? 'resource' : 'feat', slug: entSlug, name, status: 'live', depth: 'advanced', data }).select('id').single()).data;
    if (ent) await admin.from('campaign_entities').upsert({ campaign_id: id, entity_id: ent.id, vis: 'dm' });
  }
  if ((divine ?? []).length) left.push('The divinity rules were turned into homebrew entries of your own (a "Divinity" resource and one entry per tier), attached as DM only. Check them under Homebrew.');
  return { slug, left };
}
