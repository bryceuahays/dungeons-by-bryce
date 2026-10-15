import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { metKeys, triggerKey } from './triggers';

// What has happened in a campaign, for applying reveal triggers in code: a DM previewing as a
// player (whose own login reads everything), and pictures painted on the server. `reader` must
// be able to read the campaign's sessions and beats (the DM's own login, or the service role).
export async function revealKeys(reader: SupabaseClient, campaign: { id: string; phases: { id: string }[] }, stage: string | null): Promise<Set<string>> {
  return (await revealFacts(reader, campaign, stage)).met;
}

// The same, and the number a new "when a session starts" begins at: the session after the last
// one that has started.
export async function revealFacts(reader: SupabaseClient, campaign: { id: string; phases: { id: string }[] }, stage: string | null): Promise<{ met: Set<string>; nextSession: number }> {
  const [{ data: sessions }, { data: beats }] = await Promise.all([
    reader.from('sessions').select('number, status').eq('campaign_id', campaign.id),
    reader.from('entries').select('id').eq('campaign_id', campaign.id).eq('kind', 'beat').eq('status', 'hit'),
  ]);
  const all = (sessions ?? []).map((s) => ({ number: Number(s.number), status: String(s.status) }));
  const started = all.filter((s) => s.status === 'running' || s.status === 'played').map((s) => s.number);
  return {
    met: metKeys({ sessions: all, hitBeats: (beats ?? []).map((b) => String(b.id)), stages: campaign.phases.map((p) => p.id), stage }),
    nextSession: started.length ? Math.max(...started) + 1 : 1,
  };
}

// How many things wait for each of these sessions to start, and to be marked played: entries and
// attached homebrew with a session trigger, and hidden page blocks. `reader` reads them all (a DM).
export async function sessionWaiting(reader: SupabaseClient, campaignId: string, numbers: number[]): Promise<Map<number, { started: number; played: number }>> {
  const keys = numbers.flatMap((n) => [triggerKey({ kind: 'session', n, when: 'started' }), triggerKey({ kind: 'session', n, when: 'played' })]);
  const out = new Map(numbers.map((n) => [n, { started: 0, played: 0 }]));
  if (!keys.length) return out;
  const [{ data: entries }, { data: brew }, { data: blocks }] = await Promise.all([
    reader.from('entries').select('vis_stage').eq('campaign_id', campaignId).in('vis', ['when', 'players_when']).in('vis_stage', keys),
    reader.from('campaign_entities').select('vis_stage').eq('campaign_id', campaignId).in('vis', ['when', 'players_when']).in('vis_stage', keys),
    reader.from('content').select('reveal_when').eq('campaign_id', campaignId).eq('hidden', true).eq('visibility', 'player').in('reveal_when', keys),
  ]);
  for (const k of [...(entries ?? []), ...(brew ?? [])].map((r) => r.vis_stage as string).concat((blocks ?? []).map((r) => r.reveal_when as string))) {
    const [, n, when] = k.split(':');
    const w = out.get(Number(n));
    if (w) w[when === 'played' ? 'played' : 'started'] += 1;
  }
  return out;
}
