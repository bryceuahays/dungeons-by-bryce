import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import { renderSection } from './render';
import { cleanContent } from './sanitize';
import { embedVideos } from './video';

// The store: publishing a campaign as a product, and delivering a copy to a buyer.
//
// A product is a FROZEN snapshot. It is taken once, when the campaign is published, and
// kept where only this server can read it (it includes the DM's secrets). Later changes
// to the original campaign do not change what buyers get until it is published again.
//
// Only the site admin publishes for now. The products table carries a seller and a
// "site cut" so other creators can sell later; nothing on the creator side is built.

const ENTRY_KINDS = ['npc', 'beat', 'map', 'region', 'pin', 'secret', 'clue', 'clock', 'zero'];
const rnd = (n = 4) => crypto.randomBytes(n).toString('hex');

export type PublishInput = { campaignId: string; slug: string; title: string; pitch: string; includes: string[]; previewSections: string[]; priceCents: number; status: 'draft' | 'live'; cover?: string };

// `reader` is the admin's own login (they must be the DM of the campaign, so it reads everything).
export async function publishProduct(reader: SupabaseClient, sellerId: string, input: PublishInput): Promise<{ id?: string; error?: string }> {
  const admin = createAdminClient();
  const c = input.campaignId;
  const { data: campaign } = await reader.from('campaigns').select('id, title, tagline, theme, phases, settings, background, owner_id').eq('id', c).maybeSingle();
  if (!campaign || campaign.owner_id !== sellerId) return { error: 'You can publish campaigns you run.' };
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(input.slug)) return { error: 'The store address can use lowercase letters, numbers and dashes.' };

  // Nothing private may be sold: not the old rule sets, not entries marked private.
  const { data: priv } = await reader.rpc('campaign_private_content', { c });
  const names: string[] = priv?.entries ?? [];
  if (Number(priv?.rules) > 0 || names.length) {
    return { error: `This campaign cannot be published: it contains private content${Number(priv?.rules) > 0 ? ` (${priv.rules} private rules in its own character builder)` : ''}${names.length ? ` (private homebrew: ${names.slice(0, 8).join(', ')})` : ''}. Private content is never sold. Remove it or untick "Private" on entries that are your own original work.` };
  }

  const [faces, sections, content, entries, secrets, attached] = await Promise.all([
    reader.from('campaign_faces').select('phase, slug, title, tagline').eq('campaign_id', c),
    reader.from('sections').select('slug, title, sort, audience, kind, phase, from_stage').eq('campaign_id', c),
    reader.from('content').select('section, kind, key, sort, title, body, visibility, phase, from_stage, hidden').eq('campaign_id', c).limit(5000),
    reader.from('entries').select('id, kind, parent, owner, sort, title, status, data, live, vis, vis_stage, vis_entry').eq('campaign_id', c).in('kind', ENTRY_KINDS).limit(5000),
    reader.from('entry_secrets').select('entry_id, data').eq('campaign_id', c),
    reader.from('campaign_entities').select('vis, vis_stage, entities(id, type, name, slug, source, status, depth, data)').eq('campaign_id', c),
  ]);
  const real = (faces.data ?? []).find((f) => f.phase === '');
  // players' own additions are not part of the product, and the story starts unplayed
  const kept = ((entries.data ?? []) as any[]).filter((e) => !e.owner || e.owner === sellerId).map((e) => {
    if (e.kind === 'beat' && e.status === 'hit') { const { hitAt: _a, hitSession: _b, ...d } = e.data ?? {}; void _a; void _b; return { ...e, status: 'planned', live: false, data: d }; }
    return e;
  });
  const keptIds = new Set(kept.map((e) => e.id));
  const homebrew = ((attached.data ?? []) as any[]).filter((a) => a.entities && a.entities.source === 'homebrew');

  // upsert the product first, so the frozen files have somewhere to live
  const { data: existing } = await admin.from('products').select('id').eq('slug', input.slug).maybeSingle();
  const row = { slug: input.slug, seller_id: sellerId, campaign_id: c, title: input.title.slice(0, 120), pitch: input.pitch.slice(0, 4000), includes: input.includes.slice(0, 20), price_cents: Math.max(0, Math.round(input.priceCents)), status: input.status, theme: campaign.theme, ...(input.cover !== undefined ? { cover: input.cover } : {}) };
  const saved = existing ? await admin.from('products').update(row).eq('id', existing.id).select('id').single() : await admin.from('products').insert(row).select('id').single();
  if (saved.error || !saved.data) return { error: /duplicate|unique/i.test(saved.error?.message || '') ? 'Another product already uses that store address.' : 'The product could not be saved.' };
  const pid = saved.data.id as string;

  // freeze the pictures: copies that no longer depend on the original campaign
  const files: Record<string, string> = {};
  for (const e of kept) {
    const f = String(e.data?.file ?? '');
    if (!f.startsWith(c + '/')) continue;
    const to = `products/${pid}/${f.split('/').pop()}`;
    await admin.storage.from('campaign-files').remove([to]);
    const copy = await admin.storage.from('campaign-files').copy(f, to);
    if (!copy.error) files[f] = to;
  }
  const bg: Record<string, string> = {};
  for (const shape of ['wide', 'tall', 'hero']) {
    const from = `campaign/${c}/${shape}`, to = `product/${pid}/${shape}`;
    await admin.storage.from('backgrounds').remove([to]);
    const copy = await admin.storage.from('backgrounds').copy(from, to);
    if (!copy.error) bg[shape] = to;
  }

  const snapshot = {
    v: 1,
    campaign: { title: real?.title ?? campaign.title, tagline: real?.tagline ?? campaign.tagline, theme: campaign.theme, phases: campaign.phases, settings: { ...(campaign.settings ?? {}), session: 0 }, background: campaign.background },
    faces: (faces.data ?? []).filter((f) => f.phase !== ''),
    sections: sections.data ?? [],
    content: content.data ?? [],
    entries: kept,
    secrets: Object.fromEntries(((secrets.data ?? []) as any[]).filter((s) => keptIds.has(s.entry_id)).map((s) => [s.entry_id, s.data])),
    entities: homebrew.map((a) => ({ ...a.entities, vis: a.vis === 'players' ? 'dm' : a.vis, vis_stage: a.vis_stage })),
    files, bg,
  };

  // free preview pages: built the way a player would receive them at the first stage, and made safe
  const first = ((campaign.phases ?? []) as { id: string }[])[0]?.id ?? '';
  const preview = input.previewSections.map((slug) => {
    const sec = (sections.data ?? []).find((s) => s.slug === slug && s.audience !== 'dm');
    if (!sec) return null;
    const rows = ((content.data ?? []) as any[]).filter((r) => r.section === slug && r.visibility === 'player' && !r.hidden && (!r.phase || r.phase === first) && (!r.from_stage || r.from_stage === first)).sort((a, b) => a.sort - b.sort);
    return { title: sec.title, html: embedVideos(cleanContent(renderSection(rows, { races: [], factions: [] }, { base: '#' }))) };
  }).filter(Boolean);

  const s1 = await admin.from('product_snapshots').upsert({ product_id: pid, data: snapshot, created_at: new Date().toISOString() });
  const s2 = await admin.from('products').update({ preview }).eq('id', pid);
  if (s1.error || s2.error) return { error: 'The product was saved but its contents could not be frozen. Try publishing again.' };
  return { id: pid };
}

// Copies a product into the buyer's account as a campaign they own and run. Runs with the
// site's own authority (after a confirmed payment, or for a free product).
export async function deliverProduct(productId: string, userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const [{ data: product }, { data: snap }] = await Promise.all([
    admin.from('products').select('id, slug').eq('id', productId).maybeSingle(),
    admin.from('product_snapshots').select('data').eq('product_id', productId).maybeSingle(),
  ]);
  const s = snap?.data as any;
  if (!product || !s) return null;

  const slug = `${String(product.slug).slice(0, 50)}-${rnd(3)}`;
  const phases = (s.campaign.phases ?? []) as { id: string }[];
  const made = await admin.from('campaigns').insert({ owner_id: userId, slug, title: s.campaign.title, tagline: s.campaign.tagline ?? '', theme: s.campaign.theme ?? {}, phases, phase: phases[0]?.id ?? '', settings: s.campaign.settings ?? {}, purchased: true }).select('id').single();
  if (made.error || !made.data) return null;
  const id = made.data.id as string;

  // titles and addresses per stage (each needs an address of its own)
  for (const f of s.faces ?? []) await admin.from('campaign_faces').insert({ campaign_id: id, phase: f.phase, slug: `${String(f.slug).slice(0, 50)}-${rnd(3)}`, title: f.title, tagline: f.tagline ?? '' });
  if ((s.sections ?? []).length) await admin.from('sections').insert(s.sections.map((x: any) => ({ ...x, campaign_id: id })));
  for (let i = 0; i < (s.content ?? []).length; i += 300) await admin.from('content').insert(s.content.slice(i, i + 300).map((x: any) => ({ ...x, campaign_id: id })));

  // pictures
  const moved: Record<string, string> = {};
  for (const [from, frozen] of Object.entries((s.files ?? {}) as Record<string, string>)) {
    const folder = from.split('/')[1] ?? 'files';
    const to = `${id}/${folder}/${crypto.randomUUID()}.${String(frozen).split('.').pop()}`;
    if (!(await admin.storage.from('campaign-files').copy(frozen, to)).error) moved[from] = to;
  }
  const bg: Record<string, boolean | number> = {};
  for (const shape of ['wide', 'tall', 'hero']) if (s.bg?.[shape] && !(await admin.storage.from('backgrounds').copy(s.bg[shape], `campaign/${id}/${shape}`)).error) bg[shape] = true;
  if (bg.wide && bg.tall) await admin.from('campaigns').update({ background: { wide: true, tall: true, v: Date.now() } }).eq('id', id);

  // table tools: parents first, then what hangs off them; links between entries are re-pointed
  const map = new Map<string, string>();
  const all = (s.entries ?? []) as any[];
  const pending = [...all];
  for (let pass = 0; pass < 6 && pending.length; pass++) {
    for (const e of [...pending]) {
      if (e.parent && !map.has(e.parent)) continue;
      const file = e.data?.file ? moved[e.data.file] : undefined;
      const row = { campaign_id: id, kind: e.kind, parent: e.parent ? map.get(e.parent) : null, owner: userId, sort: e.sort, title: e.title, status: e.status, live: e.live, vis: e.vis === 'players' ? 'dm' : e.vis, vis_players: [], vis_stage: e.vis_stage, data: { ...(e.data ?? {}), ...(e.data?.file ? { file } : {}) } };
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
    if (s.secrets?.[e.id]) await admin.from('entry_secrets').insert({ entry_id: nid, campaign_id: id, data: s.secrets[e.id] });
  }

  // the homebrew pack: the buyer gets their own editable copies, attached to the new campaign
  for (const e of (s.entities ?? []) as any[]) {
    const ins = await admin.from('entities').insert({ owner_id: userId, source: 'homebrew', type: e.type, name: e.name, slug: `${String(e.slug).slice(0, 60)}-${rnd(3)}`, status: e.status, depth: e.depth, data: e.data }).select('id').single();
    if (ins.data) await admin.from('campaign_entities').insert({ campaign_id: id, entity_id: ins.data.id, vis: e.vis ?? 'all', vis_stage: e.vis_stage ?? null });
  }
  return slug;
}
