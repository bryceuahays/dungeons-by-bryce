import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import type { Imported } from './import';

// Writes pasted tabs and blocks into a campaign, as the signed-in user (so row-level
// security decides whether they may). New tabs are placed after `startSort`.
export async function insertImported(supabase: SupabaseClient, campaignId: string, imported: Imported, startSort: number) {
  const { data: existing } = await supabase.from('sections').select('slug').eq('campaign_id', campaignId);
  const taken = new Set((existing ?? []).map((s) => s.slug as string));
  let tabs = 0, blocks = 0, sort = startSort;
  for (const tab of imported.tabs) {
    let slug = tab.slug;
    // text for a tab that already exists (for example Overview) is added to it
    if (!taken.has(slug)) {
      const { error } = await supabase.from('sections').insert({ campaign_id: campaignId, slug, title: tab.title, audience: tab.audience, kind: 'content', sort });
      if (error) { for (let n = 2; n < 50; n++) { slug = tab.slug + '-' + n; if (!taken.has(slug) && !(await supabase.from('sections').insert({ campaign_id: campaignId, slug, title: tab.title, audience: tab.audience, kind: 'content', sort })).error) break; } }
      taken.add(slug);
      tabs++;
      sort += 10;
    }
    const { data: last } = await supabase.from('content').select('sort').eq('campaign_id', campaignId).eq('section', slug).lt('sort', 1000).order('sort', { ascending: false }).limit(1);
    let at = (last?.[0]?.sort ?? 0) + 10;
    const stamp = Date.now().toString(36);
    const rows = tab.blocks.map((b, i) => ({
      campaign_id: campaignId, section: slug, kind: b.kind, key: `${b.kind}-${stamp}-${i}`, sort: (at += 1) * 1, title: b.title || b.kind, body: b.body, visibility: b.visibility,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from('content').insert(rows.slice(i, i + 200));
      if (!error) blocks += Math.min(200, rows.length - i);
    }
  }
  return { tabs, blocks };
}

// After a campaign row is deleted, its files have no owner. Remove them from both buckets.
export async function removeCampaignFiles(campaignId: string) {
  if (!/^[0-9a-f-]{36}$/.test(campaignId)) return;
  const admin = createAdminClient();
  for (const dir of ['t', 'v']) {
    const { data } = await admin.storage.from('campaign-media').list(`${campaignId}/${dir}`, { limit: 1000 });
    if (data?.length) await admin.storage.from('campaign-media').remove(data.map((o) => `${campaignId}/${dir}/${o.name}`));
  }
  await admin.storage.from('backgrounds').remove([`campaign/${campaignId}/wide`, `campaign/${campaignId}/tall`]);
}
