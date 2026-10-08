import type { SupabaseClient } from '@supabase/supabase-js';

// Give campaigns a world's homebrew (all of it, or just these entries). Entries a campaign
// already has keep who can see them.
export async function attachWorldEntries(supabase: SupabaseClient, worldId: string, campaignIds: string[], entityIds?: string[]) {
  const ids = entityIds ?? ((await supabase.from('world_entities').select('entity_id').eq('world_id', worldId)).data ?? []).map((r) => r.entity_id as string);
  const rows = campaignIds.flatMap((campaign_id) => ids.map((entity_id) => ({ campaign_id, entity_id, vis: 'all' })));
  if (rows.length) await supabase.from('campaign_entities').upsert(rows, { onConflict: 'campaign_id,entity_id', ignoreDuplicates: true });
}
